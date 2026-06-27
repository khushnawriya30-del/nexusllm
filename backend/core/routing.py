"""
Routing engine for NexusLLM — the intelligent fallback core.

Given a requested model (alias or concrete id), the engine builds an ordered
list of candidate ``(provider, model_id)`` attempts and walks them, trying each
provider's API keys in round-robin order while respecting circuit breakers.
Failures are classified to decide whether to retry the next key, the next
provider, or to return immediately (client errors).

The engine is transport-agnostic: the actual HTTP call is performed by a
``send_func`` so the routing logic can be unit-tested without network access.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import uuid
from dataclasses import dataclass
from enum import Enum
from typing import TYPE_CHECKING, Any, AsyncIterator, Awaitable, Callable

import httpx

from core.circuit_breaker import CircuitBreakerRegistry, CircuitState
from models.requests import ChatCompletionRequest
from models.responses import RouteAttempt, RouteResult
from utils.masking import mask_api_key
from utils.retry import calculate_backoff

if TYPE_CHECKING:
    from core.config import NexusLLMConfig
    from core.http_client import HTTPClientManager
    from core.registry import ModelRegistry
    from utils.metrics import Metrics

logger = logging.getLogger("nexusllm.routing")


class FailureClass(str, Enum):
    """How a failed attempt should influence the fallback walk."""

    IMMEDIATE_RETURN = "immediate_return"   # 400, 422 — client's fault
    RETRY_NEXT_KEY = "retry_next_key"       # 429, 401, 403 — key-specific
    RETRY_NEXT_PROVIDER = "retry_provider"  # 503, 502 — provider down
    NETWORK_ERROR = "network_error"         # timeout, DNS, connect


def classify_status(status: int) -> FailureClass | None:
    """Classify an HTTP status. Returns None for success (2xx)."""
    if 200 <= status < 300:
        return None
    if status in (400, 422):
        return FailureClass.IMMEDIATE_RETURN
    if status in (429, 401, 403):
        return FailureClass.RETRY_NEXT_KEY
    if status in (502, 503, 500, 504):
        return FailureClass.RETRY_NEXT_PROVIDER
    # Any other 4xx is treated as a client error; other 5xx as provider error.
    if 400 <= status < 500:
        return FailureClass.IMMEDIATE_RETURN
    return FailureClass.RETRY_NEXT_PROVIDER


@dataclass
class SendOutcome:
    """Result of a single upstream HTTP send."""

    status_code: int | None
    body: dict[str, Any] | None
    latency_ms: float
    error: str | None = None
    # Present only for streaming sends: a live response context to iterate.
    stream_response: httpx.Response | None = None


# A send function performs one upstream call. Signature kept explicit so it can
# be swapped in tests.
SendFunc = Callable[..., Awaitable[SendOutcome]]


@dataclass
class _Candidate:
    provider_id: str
    model_id: str
    priority: int


class RoutingEngine:
    """Resolves models to providers and executes requests with fallback."""

    def __init__(
        self,
        config: "NexusLLMConfig",
        registry: "ModelRegistry",
        breakers: CircuitBreakerRegistry,
        http: "HTTPClientManager",
        metrics: "Metrics | None" = None,
        send_func: SendFunc | None = None,
        keystore=None,
    ) -> None:
        self._config = config
        self._registry = registry
        self._breakers = breakers
        self._http = http
        self._metrics = metrics
        self._keystore = keystore
        self._send = send_func or self._default_send
        # Round-robin cursor per provider.
        self._rr_cursor: dict[str, int] = {}

    async def _keys_for(self, provider) -> list[tuple[int, str, str]]:
        """Return enabled keys as (position, key_id, api_key) for a provider.

        Uses the runtime key store when available so keys added/removed in the
        UI take effect immediately; otherwise falls back to the static config
        api_keys (used by unit tests).
        """
        if self._keystore is not None:
            entries = await self._keystore.enabled_keys(provider.id)
            keys = [(i, e.id, e.api_key) for i, e in enumerate(entries)]
        else:
            keys = [(i, str(i), k) for i, k in enumerate(provider.api_keys)]
        # Fall back to config-level keys (custom providers carry their key here,
        # not in the key store).
        if not keys and provider.api_keys:
            keys = [(i, f"cfg{i}", k) for i, k in enumerate(provider.api_keys)]
        # Keyless providers (e.g. OVH free tier) still get one attempt with an
        # empty key so the request is sent without an Authorization header.
        if not keys and not getattr(provider, "requires_key", True):
            keys = [(0, "keyless", "")]
        return keys

    def _rotate(self, provider_id: str, items: list) -> list:
        """Round-robin rotate a provider's key list using the per-provider cursor."""
        if not items:
            return items
        start = self._rr_cursor.get(provider_id, 0) % len(items)
        self._rr_cursor[provider_id] = (start + 1) % len(items)
        return items[start:] + items[:start]

    # -- candidate resolution ----------------------------------------------

    def pick_panel_models(self, n: int = 4) -> list[tuple[str, str]]:
        """Pick up to n diverse models (one per provider first) for a Fusion
        panel, ordered by provider priority."""
        routable = self._registry.routable_models()
        panel: list[tuple[str, str]] = []
        seen_prov: set[str] = set()
        for pid, mid in routable:
            if pid not in seen_prov:
                panel.append((pid, mid))
                seen_prov.add(pid)
            if len(panel) >= n:
                break
        for pid, mid in routable:  # fill if fewer providers than n
            if len(panel) >= n:
                break
            if (pid, mid) not in panel:
                panel.append((pid, mid))
        return panel[:n]

    def _candidates_for(self, model: str) -> "list[_Candidate]":
        """Build the ordered candidate list, honouring the fallback policy.

        - "auto"/"fallback": the full routable-models chain (try until one
          works) — this is the only mode that crosses between models.
        - any other model (concrete or alias): ONLY that model's own
          candidates. No global fallback, so an explicit single model that
          fails surfaces its real error instead of silently switching models.
        """
        if model in ("auto", "fallback"):
            priority = {p.id: p.priority for p in self._config.enabled_providers()}
            return [
                _Candidate(pid, mid, priority.get(pid, 9999))
                for pid, mid in self._registry.routable_models()
            ]
        return self._resolve_candidates(model)

    def _resolve_candidates(self, model: str) -> list[_Candidate]:
        """Build the ordered candidate list for a requested model.

        Alias -> ordered model ids; each model id -> providers serving it,
        sorted by config priority. Concrete model ids without a known provider
        fall back to *every* enabled provider that has the model in its config
        alias groups is not applicable, so we use registry knowledge.
        """
        candidates: list[_Candidate] = []
        seen: set[tuple[str, str]] = set()
        priority = {p.id: p.priority for p in self._config.enabled_providers()}

        for model_id in self._config.resolve_alias(model):
            provider_ids = self._registry.providers_for_model(model_id)
            for pid in provider_ids:
                if (pid, model_id) in seen:
                    continue
                seen.add((pid, model_id))
                candidates.append(
                    _Candidate(pid, model_id, priority.get(pid, 9999))
                )
        return candidates

    def _ordered_keys(self, provider_id: str, key_count: int) -> list[int]:
        """Return key indices in round-robin order starting at the cursor."""
        if key_count == 0:
            return []
        start = self._rr_cursor.get(provider_id, 0) % key_count
        self._rr_cursor[provider_id] = (start + 1) % key_count
        return [(start + i) % key_count for i in range(key_count)]

    # -- default HTTP send --------------------------------------------------

    async def _default_send(
        self,
        *,
        provider_id: str,
        api_key: str,
        payload: dict[str, Any],
        path: str,
        timeout: float,
    ) -> SendOutcome:
        """Perform one upstream, non-streaming request via the pooled client."""
        loop = asyncio.get_event_loop()
        started = loop.time()
        try:
            client = await self._http.get_client(provider_id)
            resp = await client.post(
                path,
                json=payload,
                headers=(
                    {"Authorization": f"Bearer {api_key}"} if api_key else {}
                ),
                timeout=timeout,
            )
            latency_ms = (loop.time() - started) * 1000
            body: dict[str, Any] | None
            try:
                body = resp.json()
            except Exception:
                body = None
            return SendOutcome(
                status_code=resp.status_code,
                body=body,
                latency_ms=latency_ms,
            )
        except (httpx.TimeoutException, httpx.TransportError, httpx.ReadError) as exc:
            latency_ms = (loop.time() - started) * 1000
            return SendOutcome(
                status_code=None,
                body=None,
                latency_ms=latency_ms,
                error=f"{type(exc).__name__}: {exc}",
            )
        except Exception as exc:  # pragma: no cover - unexpected.
            latency_ms = (loop.time() - started) * 1000
            return SendOutcome(
                status_code=None, body=None, latency_ms=latency_ms,
                error=f"{type(exc).__name__}: {exc}",
            )

    # -- core fallback walk -------------------------------------------------

    async def route(
        self,
        model: str,
        payload_builder: Callable[[str], dict[str, Any]],
        *,
        path: str = "/chat/completions",
        request_id: str | None = None,
    ) -> RouteResult:
        """Execute a non-streaming request with the full fallback chain.

        Args:
            model: The requested model (alias or concrete id).
            payload_builder: Given a concrete model id, returns the upstream
                JSON payload (so the model field is swapped per candidate).
            path: Upstream path appended to the provider base url.
            request_id: Optional caller-supplied id; generated if absent.
        """
        rid = request_id or str(uuid.uuid4())
        result = RouteResult(request_id=rid, model_requested=model)
        routing_cfg = self._config.routing

        candidates = self._candidates_for(model)

        if not candidates:
            result.error_reason = (
                f"No available provider serves model {model!r}. "
                "Ensure provider keys are configured and models discovered."
            )
            result.status_code = 502
            return result

        attempt_budget = routing_cfg.max_fallback_attempts
        global_attempt = 0

        for candidate in candidates:
            provider = self._config.get_provider(candidate.provider_id)
            if provider is None or not provider.enabled:
                continue
            keys = self._rotate(
                candidate.provider_id, await self._keys_for(provider)
            )

            for position, key_id, api_key in keys:
                if global_attempt >= attempt_budget:
                    result.error_reason = "Exhausted max_fallback_attempts."
                    return self._finalize(result)

                breaker = await self._breakers.get(candidate.provider_id, key_id)
                if not await breaker.allow_request():
                    # Circuit OPEN: skip, log, continue.
                    result.attempts.append(
                        RouteAttempt(
                            provider=candidate.provider_id,
                            key_index=position,
                            model=candidate.model_id,
                            status=None,
                            failure_class="circuit_open",
                            error="circuit breaker open",
                        )
                    )
                    logger.info(
                        "[%s] circuit open: %s key %s — skipping",
                        rid, candidate.provider_id, key_id,
                    )
                    continue

                global_attempt += 1
                payload = self._adapt_payload(
                    candidate.provider_id, payload_builder(candidate.model_id)
                )
                outcome = await self._send(
                    provider_id=candidate.provider_id,
                    api_key=api_key,
                    payload=payload,
                    path=path,
                    timeout=routing_cfg.per_attempt_timeout_seconds,
                )

                attempt = RouteAttempt(
                    provider=candidate.provider_id,
                    key_index=position,
                    model=candidate.model_id,
                    status=outcome.status_code,
                    latency_ms=outcome.latency_ms,
                )

                # Network error.
                if outcome.status_code is None:
                    attempt.failure_class = FailureClass.NETWORK_ERROR.value
                    attempt.error = outcome.error
                    result.attempts.append(attempt)
                    await breaker.record_failure()
                    if self._metrics:
                        self._metrics.record_provider_attempt(
                            candidate.provider_id, success=False,
                            latency_ms=outcome.latency_ms,
                        )
                    logger.warning(
                        "[%s] network error %s key %s: %s",
                        rid, candidate.provider_id,
                        mask_api_key(api_key), outcome.error,
                    )
                    await self._backoff(global_attempt)
                    continue

                failure = classify_status(outcome.status_code)

                # Success.
                if failure is None:
                    attempt.failure_class = None
                    result.attempts.append(attempt)
                    await breaker.record_success()
                    result.success = True
                    result.status_code = outcome.status_code
                    result.final_provider = candidate.provider_id
                    result.final_model = candidate.model_id
                    result.final_key_index = position
                    result.body = outcome.body
                    self._extract_usage(result, outcome.body)
                    await self._registry.record_latency(
                        candidate.provider_id, candidate.model_id,
                        outcome.latency_ms,
                    )
                    if self._metrics:
                        self._metrics.record_provider_attempt(
                            candidate.provider_id, success=True,
                            latency_ms=outcome.latency_ms,
                        )
                    logger.info(
                        "[%s] success via %s/%s (%d ms, %d fallback(s))",
                        rid, candidate.provider_id, candidate.model_id,
                        int(outcome.latency_ms), result.fallback_count,
                    )
                    return self._finalize(result)

                attempt.failure_class = failure.value
                if outcome.body and isinstance(outcome.body, dict):
                    attempt.error = str(outcome.body.get("error", ""))[:300] or None
                result.attempts.append(attempt)

                if self._metrics:
                    self._metrics.record_provider_attempt(
                        candidate.provider_id, success=False,
                        latency_ms=outcome.latency_ms,
                    )

                # Client error: do not retry, return immediately.
                if failure is FailureClass.IMMEDIATE_RETURN:
                    result.status_code = outcome.status_code
                    result.body = outcome.body
                    result.error_reason = (
                        f"Client error {outcome.status_code} from "
                        f"{candidate.provider_id}; not retrying."
                    )
                    logger.info(
                        "[%s] client error %d from %s — returning",
                        rid, outcome.status_code, candidate.provider_id,
                    )
                    return self._finalize(result)

                # Key/provider failure: record, backoff, continue.
                await breaker.record_failure()
                logger.warning(
                    "[%s] %s from %s key %s (%s) — retrying",
                    rid, outcome.status_code, candidate.provider_id,
                    mask_api_key(api_key), failure.value,
                )
                await self._backoff(global_attempt)

                # 5xx provider-down: stop trying further keys for this provider.
                if failure is FailureClass.RETRY_NEXT_PROVIDER:
                    break

        # All candidates exhausted.
        result.status_code = 502
        result.error_reason = result.error_reason or (
            f"All {len(result.attempts)} attempt(s) failed for model {model!r}."
        )
        return self._finalize(result)

    async def route_chat(
        self, req: ChatCompletionRequest, request_id: str | None = None
    ) -> RouteResult:
        """Convenience wrapper for chat completions."""
        return await self.route(
            req.model,
            req.upstream_payload,
            path="/chat/completions",
            request_id=request_id,
        )

    # -- streaming ----------------------------------------------------------

    async def stream_chat(
        self, req: ChatCompletionRequest, request_id: str | None = None
    ) -> tuple[RouteResult, AsyncIterator[bytes] | None]:
        """Resolve a streaming chat request to the first usable provider.

        Returns the partially-populated RouteResult plus an async byte iterator
        of SSE chunks (or None if no provider could be reached). Mid-stream
        failures are not retried (would duplicate content); the generator emits
        a final ``data: [DONE]`` and stops.
        """
        rid = request_id or str(uuid.uuid4())
        result = RouteResult(request_id=rid, model_requested=req.model)
        routing_cfg = self._config.routing

        candidates = self._candidates_for(req.model)

        last_error: str | None = None
        for candidate in candidates:
            provider = self._config.get_provider(candidate.provider_id)
            if provider is None or not provider.enabled:
                continue
            keys = self._rotate(
                candidate.provider_id, await self._keys_for(provider)
            )
            if not keys:
                last_error = (
                    f"No API key configured for {candidate.provider_id}."
                )
                continue
            for position, key_id, api_key in keys:
                breaker = await self._breakers.get(candidate.provider_id, key_id)
                if not await breaker.allow_request():
                    last_error = (
                        f"{candidate.provider_id} circuit breaker is open "
                        "(too many recent failures)."
                    )
                    continue
                payload = req.upstream_payload(candidate.model_id)
                payload["stream"] = True
                # Ask the provider to emit a final usage chunk so we can record
                # real token counts for analytics (OpenAI-compatible standard).
                payload["stream_options"] = {"include_usage": True}
                payload = self._adapt_payload(candidate.provider_id, payload)

                gen, err = await self._open_stream(
                    candidate.provider_id, api_key, payload,
                    # Allow a generous first-token window for slow reasoning
                    # models; chunk-to-chunk gaps after that are usually small.
                    timeout=max(routing_cfg.per_attempt_timeout_seconds, 120.0),
                )
                if gen is None:
                    await breaker.record_failure()
                    status = err[0] if err else None
                    msg = err[1] if err else "failed to open stream"
                    last_error = (
                        f"{candidate.provider_id} ({candidate.model_id}) "
                        f"returned {status if status else 'a connection error'}: {msg}"
                    )
                    result.attempts.append(
                        RouteAttempt(
                            provider=candidate.provider_id,
                            key_index=position,
                            model=candidate.model_id,
                            status=status,
                            failure_class=classify_status(status).value
                            if status else FailureClass.NETWORK_ERROR.value,
                            error=msg,
                        )
                    )
                    # 4xx client errors won't be fixed by retrying elsewhere.
                    if status in (400, 422):
                        break
                    continue

                await breaker.record_success()
                result.success = True
                result.status_code = 200
                result.final_provider = candidate.provider_id
                result.final_model = candidate.model_id
                result.final_key_index = position
                result.attempts.append(
                    RouteAttempt(
                        provider=candidate.provider_id,
                        key_index=position,
                        model=candidate.model_id,
                        status=200,
                    )
                )
                return result, self._capture_stream_usage(result, gen)

        result.status_code = 502
        result.error_reason = last_error or (
            f"No provider could stream model {req.model!r}."
        )
        return result, None

    async def stream_one(
        self,
        provider_id: str,
        model_id: str,
        payload: dict[str, Any],
        *,
        request_id: str | None = None,
    ) -> "tuple[AsyncIterator[bytes] | None, str | None]":
        """Open a streaming SSE connection to ONE specific (provider, model).

        Used by Fusion to stream each panel member independently. Tries the
        provider's keys in round-robin order, respecting circuit breakers.
        Returns ``(byte_generator, None)`` on success or ``(None, error_msg)``
        so the caller (fusion) can fall back to a different model.
        """
        provider = self._config.get_provider(provider_id)
        if provider is None or not provider.enabled:
            return None, f"{provider_id} is unavailable"
        keys = self._rotate(provider_id, await self._keys_for(provider))
        if not keys:
            return None, f"no API key for {provider_id}"

        routing_cfg = self._config.routing
        last_error = "no usable key"
        for position, key_id, api_key in keys:
            breaker = await self._breakers.get(provider_id, key_id)
            if not await breaker.allow_request():
                last_error = f"{provider_id} circuit breaker is open"
                continue
            p = dict(payload)
            p["model"] = model_id
            p["stream"] = True
            p["stream_options"] = {"include_usage": True}
            p = self._adapt_payload(provider_id, p)
            gen, err = await self._open_stream(
                provider_id, api_key, p,
                timeout=max(routing_cfg.per_attempt_timeout_seconds, 120.0),
            )
            if gen is None:
                await breaker.record_failure()
                status = err[0] if err else None
                msg = err[1] if err else "failed to open stream"
                last_error = (
                    f"{status if status else 'connection error'}: {msg}"
                    if msg else (str(status) if status else "connection error")
                )
                # 4xx client errors won't be fixed by another key.
                if status in (400, 422):
                    return None, last_error
                continue
            await breaker.record_success()
            return gen, None
        return None, last_error

    async def _open_stream(
        self, provider_id: str, api_key: str, payload: dict, timeout: float
    ) -> "tuple[AsyncIterator[bytes] | None, tuple[int | None, str] | None]":
        """Open an upstream SSE stream.

        Returns ``(generator, None)`` on success, or ``(None, (status, message))``
        on failure so the caller can surface a meaningful error to the client.
        """
        client = await self._http.get_client(provider_id)
        try:
            cm = client.stream(
                "POST",
                "/chat/completions",
                json=payload,
                headers=(
                    {"Authorization": f"Bearer {api_key}"} if api_key else {}
                ),
                # Granular timeout: connect fast (so dead providers fail
                # quickly), but allow a long read window for the *first* token —
                # reasoning/"thinking" models (e.g. z.ai GLM flash, DeepSeek R1)
                # can take 30-90s of internal reasoning before the first chunk.
                timeout=httpx.Timeout(
                    connect=10.0, read=timeout, write=15.0, pool=5.0
                ),
            )
            resp = await cm.__aenter__()
            if resp.status_code >= 400:
                # Read the (small) error body for a useful message.
                try:
                    raw = await resp.aread()
                    msg = raw.decode("utf-8", "replace")[:300]
                except Exception:
                    msg = ""
                await cm.__aexit__(None, None, None)
                logger.warning(
                    "[stream] %s returned %d: %s", provider_id, resp.status_code, msg
                )
                return None, (resp.status_code, msg)
        except Exception as exc:
            logger.warning("[stream] failed to open %s: %s", provider_id, exc)
            return None, (None, f"{type(exc).__name__}: {exc}")

        async def _forward() -> AsyncIterator[bytes]:
            try:
                async for chunk in resp.aiter_bytes():
                    if chunk:
                        yield chunk
            except Exception as exc:  # mid-stream failure: close cleanly.
                logger.warning("[stream] mid-stream error %s: %s", provider_id, exc)
                yield b"\ndata: [DONE]\n\n"
            finally:
                await cm.__aexit__(None, None, None)

        return _forward(), None

    # -- helpers ------------------------------------------------------------

    async def _backoff(self, attempt: int) -> None:
        cfg = self._config.routing
        delay = calculate_backoff(
            attempt - 1,
            cfg.retry_base_delay_seconds,
            cfg.retry_max_delay_seconds,
            cfg.retry_jitter_percent,
        )
        if delay > 0:
            await asyncio.sleep(delay)

    # Per-provider request quirks. Some OpenAI-compatible providers reject
    # values the OpenAI spec allows (e.g. z.ai/Zhipu only accepts
    # temperature in [0,1], whereas OpenAI allows up to 2).
    _PARAM_LIMITS: dict[str, dict[str, tuple[float, float]]] = {
        "zai": {"temperature": (0.0, 1.0), "top_p": (0.01, 1.0)},
    }

    # Intensity -> provider budget/effort maps for extended thinking.
    # Map "max" to OpenAI's top "xhigh" (extra-high) effort — supported by
    # GPT-5.x / Codex reasoning models (gateway-confirmed values:
    # none/minimal/low/medium/high/xhigh). Providers that only accept up to
    # "high" will reject "xhigh" with a clear error for that specific model.
    _THINK_BUDGET = {"low": 1024, "medium": 4096, "high": 10000, "max": 24000}
    _THINK_EFFORT = {"low": "low", "medium": "medium", "high": "high", "max": "xhigh"}

    # Model families that genuinely support reasoning/thinking. Only these get
    # thinking params injected; everything else answers normally (important for
    # Fusion, where a mixed panel of reasoning + non-reasoning models is used).
    _REASONING_RE = re.compile(
        r"gpt-?5|(^|[/_-])o[1345]([/_.-]|$)|claude.*(opus|sonnet)|"
        r"deepseek.*(r1|reason|v[45])|\bqwq\b|qwen-?3|glm-?[45]|"
        r"grok-?[345]|gemini.*(think|2\.[05]|3)|magistral|minimax-?m[23]|"
        r"reason|reasoner|thinking",
        re.I,
    )

    def _apply_thinking(self, payload: dict) -> dict:
        """Map abstract thinking flags to provider-specific reasoning params.

        The frontend sends ``thinking_enabled`` + ``thinking_intensity``; we
        translate them based on the concrete model being called and strip the
        abstract keys so upstream providers never receive unknown fields.

        Only reasoning-capable models get thinking params — non-reasoning models
        answer normally. This makes Fusion correct: a thinking-capable panel
        member reasons, a plain model just answers.

          * Anthropic (Claude): ``thinking={"type":"enabled","budget_tokens":N}``
          * OpenAI o-series / GPT-5 / Codex: ``reasoning_effort`` (incl. xhigh).
        """
        enabled = payload.pop("thinking_enabled", None)
        intensity = payload.pop("thinking_intensity", None)
        if not enabled:
            return payload
        model = str(payload.get("model") or "").lower()
        # Non-reasoning models answer normally — never inject thinking params.
        if not self._REASONING_RE.search(model):
            return payload
        lvl = intensity if intensity in self._THINK_BUDGET else "medium"

        if "claude" in model or "anthropic" in model:
            budget = self._THINK_BUDGET[lvl]
            payload["thinking"] = {"type": "enabled", "budget_tokens": budget}
            mt = payload.get("max_tokens") or 0
            if mt <= budget:
                payload["max_tokens"] = budget + 4096
            # Anthropic disallows custom sampling with extended thinking.
            payload.pop("temperature", None)
            payload.pop("top_p", None)
        else:
            # reasoning_effort path (OpenAI-style). "xhigh" (extra-high) is only
            # accepted by GPT-5.x / Codex reasoning models; other reasoning
            # models (qwen/glm/deepseek/etc.) typically top out at "high", so
            # cap "max" to "high" for them to avoid 400s.
            effort = self._THINK_EFFORT[lvl]
            supports_xhigh = bool(re.search(r"gpt-?5|codex|o[1345]", model))
            if effort == "xhigh" and not supports_xhigh:
                effort = "high"
            payload["reasoning_effort"] = effort
        return payload

    def _flatten_images_if_no_vision(self, provider_id: str, payload: dict) -> dict:
        """Models without vision can't accept multimodal (image_url) content and
        would error if it's sent — which happens when a conversation has an
        earlier image and the user switches to a non-vision model. So for such
        models, downgrade any list-style message content to plain text (keep the
        text parts, drop the images). Vision models keep their images intact.
        """
        model = payload.get("model")
        if not model or (
            self._registry and self._registry.supports_vision(provider_id, model)
        ):
            return payload
        msgs = payload.get("messages")
        if not isinstance(msgs, list):
            return payload
        for m in msgs:
            content = m.get("content") if isinstance(m, dict) else None
            if isinstance(content, list):
                texts = [
                    p.get("text", "")
                    for p in content
                    if isinstance(p, dict) and p.get("type") == "text"
                ]
                m["content"] = " ".join(t for t in texts if t)
        return payload

    def _adapt_payload(self, provider_id: str, payload: dict) -> dict:
        """Clamp/adjust request params to a provider's accepted ranges."""
        payload = self._apply_thinking(payload)
        payload = self._flatten_images_if_no_vision(provider_id, payload)
        limits = self._PARAM_LIMITS.get(provider_id)
        if not limits:
            return payload
        for field, (lo, hi) in limits.items():
            val = payload.get(field)
            if val is not None:
                try:
                    payload[field] = max(lo, min(float(val), hi))
                except (TypeError, ValueError):
                    pass
        return payload

    @staticmethod
    def _extract_usage(result: RouteResult, body: dict | None) -> None:
        if not body or not isinstance(body, dict):
            return
        usage = body.get("usage") or {}
        result.prompt_tokens = usage.get("prompt_tokens", 0) or 0
        result.completion_tokens = usage.get("completion_tokens", 0) or 0

    async def _capture_stream_usage(
        self, result: RouteResult, gen: "AsyncIterator[bytes]"
    ) -> "AsyncIterator[bytes]":
        """Pass through SSE chunks while scanning for the final usage block.

        Streaming providers emit token usage in a trailing chunk (when
        ``stream_options.include_usage`` is set). We tee the stream so the
        client still gets every byte, but the backend captures real token
        counts into ``result`` for analytics logging once the stream ends.
        """
        async for chunk in gen:
            if chunk:
                self._scan_usage_chunk(result, chunk)
            yield chunk

    @staticmethod
    def _scan_usage_chunk(result: RouteResult, chunk: bytes) -> None:
        """Parse SSE ``data:`` lines in a chunk and capture usage if present."""
        try:
            text = chunk.decode("utf-8", "replace")
        except Exception:
            return
        for line in text.splitlines():
            line = line.strip()
            if not line.startswith("data:"):
                continue
            data = line[5:].strip()
            if not data or data == "[DONE]":
                continue
            try:
                obj = json.loads(data)
            except Exception:
                continue
            if not isinstance(obj, dict):
                continue
            usage = obj.get("usage")
            if usage and isinstance(usage, dict):
                pt = usage.get("prompt_tokens")
                ct = usage.get("completion_tokens")
                if pt is not None:
                    result.prompt_tokens = int(pt)
                if ct is not None:
                    result.completion_tokens = int(ct)

    def _finalize(self, result: RouteResult) -> RouteResult:
        result.total_latency_ms = sum(a.latency_ms for a in result.attempts)
        if self._metrics:
            self._metrics.record_request(
                provider_id=result.final_provider,
                success=result.success,
                latency_ms=result.total_latency_ms,
                fallback_count=result.fallback_count,
                tokens=result.prompt_tokens + result.completion_tokens,
            )
        return result

    def circuit_state_for(self, provider_id: str) -> CircuitState:
        return self._breakers.provider_state(provider_id)
