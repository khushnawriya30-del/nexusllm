"""Fusion (model ensembling): ask a panel of models in parallel, then have a
judge model synthesize their answers into one stronger final response.

Two modes:

* ``stream_fusion`` — the live path used by the Playground. It streams every
  panel member in parallel over a custom SSE protocol (``data: {"fusion": ...}``
  events), automatically falling back to the next available model whenever a
  panel slot fails (rate-limit 413/429, balance, network), and finally streams
  the judge's synthesized answer as normal OpenAI chunks.

* ``build_fusion_request`` — the non-streaming path. Runs the panel (with
  per-slot fallback), then returns a judge ``ChatCompletionRequest`` the caller
  routes normally.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import TYPE_CHECKING, AsyncIterator, Awaitable, Callable

from models.requests import ChatCompletionRequest, ChatMessage

if TYPE_CHECKING:
    from core.routing import RoutingEngine
    from models.responses import RouteResult

logger = logging.getLogger("nexusllm.fusion")

DEFAULT_PANEL_SIZE = 4

_JUDGE_SYSTEM = (
    "You are the synthesis step of NexusLLM's 'Fusion' mode. Several AI models "
    "independently answered the same user request. Read every candidate answer, "
    "keep the most correct and useful points from each, resolve any "
    "contradictions using your own knowledge, and produce ONE single, "
    "comprehensive, accurate final answer. Normally do not mention that multiple "
    "models were used or that you are synthesizing — just give the best possible "
    "answer directly.\n\n"
    "IMPORTANT exception — identity questions: if the user asks which model or AI "
    "you are, which company made/created/trained you, your name, or your "
    "version, do NOT claim to be any single specific model or vendor (e.g. do "
    "not say 'I am Mistral/GPT/Claude…'). Instead briefly and politely explain "
    "that they are using Fusion mode, which blends the answers of several "
    "different AI models into one, so this response cannot be attributed to a "
    "single model — and offer to switch to a specific model if they want a "
    "definite identity."
)


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------


def _sse(obj: dict) -> bytes:
    return f"data: {json.dumps(obj, ensure_ascii=False)}\n\n".encode("utf-8")


def _content_of(body: dict | None) -> str | None:
    if not body or not isinstance(body, dict):
        return None
    try:
        msg = (body.get("choices") or [{}])[0].get("message") or {}
        content = msg.get("content")
        return content.strip() if isinstance(content, str) and content.strip() else None
    except Exception:
        return None


def _last_user_text(messages: list) -> str:
    for m in reversed(messages):
        role = getattr(m, "role", None) or (m.get("role") if isinstance(m, dict) else None)
        if role == "user":
            content = getattr(m, "content", None) or (
                m.get("content") if isinstance(m, dict) else None
            )
            if isinstance(content, str):
                return content
            if isinstance(content, list):  # multimodal: join text parts
                return " ".join(
                    p.get("text", "") for p in content if isinstance(p, dict)
                )
    return ""


def _iter_deltas(chunk: bytes) -> list[str]:
    """Extract visible content deltas from a block of upstream SSE bytes."""
    out: list[str] = []
    try:
        text = chunk.decode("utf-8", "replace")
    except Exception:
        return out
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
        try:
            delta = (obj.get("choices") or [{}])[0].get("delta") or {}
        except Exception:
            continue
        piece = delta.get("content")
        if isinstance(piece, str) and piece:
            out.append(piece)
    return out


def _build_judge_messages(
    req: ChatCompletionRequest, answers: list[tuple[str, str]]
) -> list[ChatMessage]:
    question = _last_user_text(req.messages)
    # Keep the judge prompt compact so it stays under provider token-per-minute
    # limits: cap the question and each candidate answer.
    if len(question) > 4000:
        question = question[:4000] + " …(truncated)"
    blocks = []
    for i, (mid, content) in enumerate(answers, start=1):
        snippet = content if len(content) <= 3000 else content[:3000] + " …(truncated)"
        blocks.append(f"[Answer {i} — {mid}]\n{snippet}")
    judge_user = (
        f"User request:\n{question}\n\n"
        f"Here are {len(answers)} candidate answers from different models:\n\n"
        + "\n\n".join(blocks)
        + "\n\nNow write the single best, most accurate and complete final answer."
    )
    return [
        ChatMessage(role="system", content=_JUDGE_SYSTEM),
        ChatMessage(role="user", content=judge_user),
    ]


def _content_chunks(text: str, size: int = 80) -> list[str]:
    """Split text into small pieces so a fallback answer can be 'streamed'."""
    return [text[i:i + size] for i in range(0, len(text), size)] or [text]


# --------------------------------------------------------------------------
# streaming fusion (live panel + fallback + judge)
# --------------------------------------------------------------------------


async def stream_fusion(
    engine: "RoutingEngine",
    req: ChatCompletionRequest,
    *,
    request_id: str | None = None,
    panel_size: int = DEFAULT_PANEL_SIZE,
    log_cb: "Callable[[RouteResult], Awaitable[None]] | None" = None,
) -> AsyncIterator[bytes]:
    """Stream a full Fusion run as SSE bytes.

    Custom events (all framed as ``data: {json}``):
      * ``{"fusion": {"type": "panel_init", "models": [{slot, model, provider}]}}``
      * ``{"fusion": {"type": "delta", "slot", "model", "content"}}``
      * ``{"fusion": {"type": "model_done", "slot", "model", "provider"}}``
      * ``{"fusion": {"type": "model_error", "slot", "model", "provider", "error"}}``
      * ``{"fusion": {"type": "fallback", "slot", "from", "to", "to_provider"}}``
      * ``{"fusion": {"type": "judge_start", "contributors": [...]}}``
    followed by normal OpenAI ``data: {choices:[{delta:{content}}]}`` chunks for
    the synthesized answer, then ``data: [DONE]``.
    """
    routable = engine._registry.routable_models()
    panel = engine.pick_panel_models(panel_size)
    if not panel:
        yield _sse({"error": {"message": "Fusion: no routable models available.",
                              "type": "fusion_error"}})
        yield b"data: [DONE]\n\n"
        return

    # Candidates not in the initial panel, used to replace failed slots.
    pool: list[tuple[str, str]] = [c for c in routable if c not in panel]
    pool_lock = asyncio.Lock()
    queue: asyncio.Queue = asyncio.Queue()
    ordered_results: list[tuple[str, str]] = []  # (model_id, content) in finish order

    # Reasoning-capable panel members need a bigger budget (reasoning tokens
    # count toward completion); plain members stay capped for speed.
    thinking_on = bool(getattr(req, "thinking_enabled", False))
    panel_cap = 4096 if thinking_on else 1536

    async def take_next(used: set) -> tuple[str, str] | None:
        async with pool_lock:
            while pool:
                cand = pool.pop(0)
                if cand not in used:
                    return cand
        return None

    async def slot_worker(idx: int, cand: tuple[str, str]) -> None:
        used: set = set()
        while cand is not None:
            pid, mid = cand
            used.add(cand)
            payload = req.upstream_payload(mid)
            # Cap panel responses — they're intermediate inputs to the judge,
            # so a smaller budget keeps requests under provider TPM limits
            # (fewer 413s) while still capturing each model's take. Reasoning
            # members get a larger cap so their thinking can complete.
            payload["max_tokens"] = min(payload.get("max_tokens") or panel_cap, panel_cap)
            gen, err = await engine.stream_one(
                pid, mid, payload,
                request_id=f"{request_id}:fusion:{mid}" if request_id else None,
            )
            if gen is None:
                await queue.put({"fusion": {"type": "model_error", "slot": idx,
                                            "model": mid, "provider": pid,
                                            "error": err or "failed to start"}})
                nxt = await take_next(used)
                if nxt is not None:
                    await queue.put({"fusion": {"type": "fallback", "slot": idx,
                                                "from": mid, "to": nxt[1],
                                                "to_provider": nxt[0]}})
                cand = nxt
                continue

            content_acc = ""
            try:
                async for chunk in gen:
                    for piece in _iter_deltas(chunk):
                        content_acc += piece
                        await queue.put({"fusion": {"type": "delta", "slot": idx,
                                                    "model": mid, "content": piece}})
            except Exception as exc:  # pragma: no cover - defensive
                logger.warning("fusion slot %s (%s) stream error: %s", idx, mid, exc)

            if content_acc.strip():
                ordered_results.append((mid, content_acc))
                await queue.put({"fusion": {"type": "model_done", "slot": idx,
                                            "model": mid, "provider": pid}})
                return

            # Empty response — treat as failure and try to fall back.
            await queue.put({"fusion": {"type": "model_error", "slot": idx,
                                        "model": mid, "provider": pid,
                                        "error": "empty response"}})
            nxt = await take_next(used)
            if nxt is not None:
                await queue.put({"fusion": {"type": "fallback", "slot": idx,
                                            "from": mid, "to": nxt[1],
                                            "to_provider": nxt[0]}})
            cand = nxt

    async def wrapped(idx: int, cand: tuple[str, str]) -> None:
        try:
            await slot_worker(idx, cand)
        finally:
            await queue.put({"_end": idx})

    # Announce the initial panel.
    yield _sse({"fusion": {"type": "panel_init",
                           "models": [{"slot": i, "model": m, "provider": p}
                                      for i, (p, m) in enumerate(panel)]}})

    tasks = [asyncio.create_task(wrapped(i, panel[i])) for i in range(len(panel))]

    ended = 0
    while ended < len(tasks):
        ev = await queue.get()
        if "_end" in ev:
            ended += 1
            continue
        yield _sse(ev)

    # Ensure all tasks fully settled.
    await asyncio.gather(*tasks, return_exceptions=True)

    if not ordered_results:
        yield _sse({"error": {"message": "Fusion: every panel model failed.",
                              "type": "fusion_error"}})
        yield b"data: [DONE]\n\n"
        return

    contributors = [mid for mid, _ in ordered_results]
    yield _sse({"fusion": {"type": "judge_start", "contributors": contributors}})

    judge_req = req.model_copy(update={
        "model": "auto",
        "messages": _build_judge_messages(req, ordered_results),
        "stream": True,
        # A synthesis doesn't need a huge budget; capping it keeps the judge
        # request under provider token-per-minute limits.
        "max_tokens": min(req.max_tokens or 4096, 4096),
    })

    result, gen = await engine.stream_chat(judge_req, request_id=request_id)
    if gen is None or not result.success:
        # Judge failed (e.g. every provider rate-limited): gracefully fall back
        # to the strongest panel answer so the user still gets a real result.
        best_model, best_answer = max(ordered_results, key=lambda x: len(x[1]))
        logger.warning(
            "fusion judge failed (%s); falling back to best panel answer from %s",
            result.error_reason, best_model,
        )
        yield _sse({"fusion": {"type": "judge_model",
                               "provider": "fusion", "model": best_model}})
        for piece in _content_chunks(best_answer):
            yield _sse({"choices": [{"index": 0, "delta": {"content": piece}}]})
        yield b"data: [DONE]\n\n"
        return

    # Tell the client which model actually synthesized the answer.
    yield _sse({"fusion": {"type": "judge_model",
                           "provider": result.final_provider,
                           "model": result.final_model}})

    import time
    started = time.perf_counter()
    try:
        async for chunk in gen:
            yield chunk
    finally:
        result.total_latency_ms = (time.perf_counter() - started) * 1000
        if log_cb is not None:
            try:
                await log_cb(result)
            except Exception as exc:  # pragma: no cover
                logger.warning("fusion judge log failed: %s", exc)
    yield b"data: [DONE]\n\n"


# --------------------------------------------------------------------------
# non-streaming fusion (panel with fallback -> judge request)
# --------------------------------------------------------------------------


async def build_fusion_request(
    engine: "RoutingEngine",
    req: ChatCompletionRequest,
    *,
    request_id: str | None = None,
    panel_size: int = DEFAULT_PANEL_SIZE,
) -> "tuple[ChatCompletionRequest | None, list[dict]]":
    """Run the panel (with per-slot fallback) and return a judge request.

    Returns ``(judge_request, panel_meta)``; ``judge_request`` is None if no
    panel slot produced an answer.
    """
    routable = engine._registry.routable_models()
    panel = engine.pick_panel_models(panel_size)
    if not panel:
        return None, []

    pool: list[tuple[str, str]] = [c for c in routable if c not in panel]
    pool_lock = asyncio.Lock()
    panel_meta: list[dict] = []
    meta_lock = asyncio.Lock()

    async def take_next(used: set) -> tuple[str, str] | None:
        async with pool_lock:
            while pool:
                cand = pool.pop(0)
                if cand not in used:
                    return cand
        return None

    def _payload_builder():
        def build(model_id: str) -> dict:
            data = req.upstream_payload(model_id)
            data["stream"] = False
            return data
        return build

    builder = _payload_builder()

    async def _ask(slot: int, cand: tuple[str, str]) -> tuple[str, str] | None:
        used: set = set()
        while cand is not None:
            pid, mid = cand
            used.add(cand)
            try:
                result = await engine.route(
                    mid, builder, path="/chat/completions",
                    request_id=f"{request_id}:panel:{mid}" if request_id else None,
                )
                content = _content_of(result.body) if result.success else None
            except Exception as exc:  # pragma: no cover - defensive
                logger.warning("fusion panel %s/%s failed: %s", pid, mid, exc)
                content = None
            if content:
                async with meta_lock:
                    panel_meta.append({"model": mid, "provider": pid,
                                       "content": content, "ok": True})
                return (mid, content)
            async with meta_lock:
                panel_meta.append({"model": mid, "provider": pid,
                                   "content": None, "ok": False})
            cand = await take_next(used)
        return None

    gathered = await asyncio.gather(*[_ask(i, panel[i]) for i in range(len(panel))])
    answers = [a for a in gathered if a]

    if not answers:
        return None, panel_meta

    judge_req = req.model_copy(update={
        "model": "auto",
        "messages": _build_judge_messages(req, answers),
    })
    return judge_req, panel_meta
