"""Tests for the routing engine fallback chain and failure classification."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from core.circuit_breaker import CircuitBreakerConfig, CircuitBreakerRegistry
from core.config import NexusLLMConfig
from core.registry import ModelRegistry, RegisteredModel
from core.routing import FailureClass, RoutingEngine, SendOutcome, classify_status
from models.requests import ChatCompletionRequest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def build_config() -> NexusLLMConfig:
    """A small config with three keyed providers and one alias."""
    return NexusLLMConfig.model_validate(
        {
            "app": {"data_dir": "data"},
            "routing": {
                "max_fallback_attempts": 10,
                "retry_base_delay_seconds": 0,  # no real sleeping in tests
                "retry_max_delay_seconds": 0,
                "circuit_breaker_failure_threshold": 2,
                "circuit_breaker_open_duration_seconds": 30,
            },
            "model_aliases": [
                {
                    "alias": "fast",
                    "models": ["model-a", "model-b"],
                }
            ],
            "default_fallback_model": "fast",
            "providers": [
                {
                    "id": "groq", "name": "Groq",
                    "base_url": "https://groq.test",
                    "api_keys": ["gk1", "gk2"], "priority": 1,
                },
                {
                    "id": "nvidia", "name": "NVIDIA",
                    "base_url": "https://nvidia.test",
                    "api_keys": ["nk1"], "priority": 2,
                },
                {
                    "id": "openrouter", "name": "OpenRouter",
                    "base_url": "https://or.test",
                    "api_keys": ["ok1"], "priority": 3,
                },
            ],
        }
    )


def build_registry(config: NexusLLMConfig) -> ModelRegistry:
    """Registry pre-populated so model->provider resolution works offline."""
    reg = ModelRegistry(config, http=None)  # http unused with a fake sender
    now = datetime.now(timezone.utc)
    entries = [
        ("groq", "model-a"),
        ("nvidia", "model-a"),
        ("openrouter", "model-b"),
    ]
    for pid, mid in entries:
        reg._models[(pid, mid)] = RegisteredModel(
            model_id=mid, provider_id=pid, status="active", last_verified=now,
            canonical_aliases=["fast"],
        )
    return reg


class FakeSender:
    """Programmable send_func keyed by provider id.

    Each provider maps to a list of SendOutcome objects consumed in order;
    when exhausted the last one repeats.
    """

    def __init__(self, outcomes: dict[str, list[SendOutcome]]) -> None:
        self._outcomes = outcomes
        self.calls: list[tuple[str, str, int]] = []  # (provider, model, _)

    async def __call__(self, *, provider_id, api_key, payload, path, timeout):
        self.calls.append((provider_id, payload.get("model"), 0))
        queue = self._outcomes.get(provider_id, [])
        if not queue:
            return SendOutcome(status_code=500, body=None, latency_ms=1.0)
        outcome = queue.pop(0) if len(queue) > 1 else queue[0]
        return outcome


def make_engine(config, registry, sender, cb_threshold=2):
    breakers = CircuitBreakerRegistry(
        CircuitBreakerConfig(failure_threshold=cb_threshold, open_duration_seconds=30)
    )
    return RoutingEngine(config, registry, breakers, http=None, send_func=sender), breakers


def chat_req(model="fast"):
    return ChatCompletionRequest(
        model=model, messages=[{"role": "user", "content": "hi"}]
    )


def ok(latency=10.0):
    return SendOutcome(
        status_code=200,
        body={
            "id": "x", "choices": [{"message": {"content": "hello"}}],
            "usage": {"prompt_tokens": 3, "completion_tokens": 2},
        },
        latency_ms=latency,
    )


# ---------------------------------------------------------------------------
# classify_status
# ---------------------------------------------------------------------------


def test_classify_status():
    assert classify_status(200) is None
    assert classify_status(400) is FailureClass.IMMEDIATE_RETURN
    assert classify_status(422) is FailureClass.IMMEDIATE_RETURN
    assert classify_status(429) is FailureClass.RETRY_NEXT_KEY
    assert classify_status(401) is FailureClass.RETRY_NEXT_KEY
    assert classify_status(403) is FailureClass.RETRY_NEXT_KEY
    assert classify_status(503) is FailureClass.RETRY_NEXT_PROVIDER
    assert classify_status(502) is FailureClass.RETRY_NEXT_PROVIDER


# ---------------------------------------------------------------------------
# routing
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_success_first_provider():
    cfg = build_config()
    reg = build_registry(cfg)
    sender = FakeSender({"groq": [ok()]})
    engine, _ = make_engine(cfg, reg, sender)

    result = await engine.route_chat(chat_req())
    assert result.success is True
    assert result.final_provider == "groq"
    assert result.final_model == "model-a"
    assert result.fallback_count == 0
    assert result.prompt_tokens == 3
    assert result.completion_tokens == 2


@pytest.mark.asyncio
async def test_fallback_to_next_provider_on_429():
    cfg = build_config()
    reg = build_registry(cfg)
    # groq has 2 keys; both 429, then nvidia (also serves model-a) succeeds.
    sender = FakeSender({
        "groq": [SendOutcome(status_code=429, body={"error": "rate"}, latency_ms=5.0)],
        "nvidia": [ok()],
    })
    engine, _ = make_engine(cfg, reg, sender)

    result = await engine.route_chat(chat_req())
    assert result.success is True
    assert result.final_provider == "nvidia"
    # groq key1 + groq key2 failed before nvidia succeeded.
    assert result.fallback_count >= 1
    providers_tried = [a.provider for a in result.attempts]
    assert "groq" in providers_tried and "nvidia" in providers_tried


@pytest.mark.asyncio
async def test_immediate_return_on_400():
    cfg = build_config()
    reg = build_registry(cfg)
    sender = FakeSender({
        "groq": [SendOutcome(status_code=400, body={"error": "bad request"}, latency_ms=2.0)],
        "nvidia": [ok()],
    })
    engine, _ = make_engine(cfg, reg, sender)

    result = await engine.route_chat(chat_req())
    assert result.success is False
    assert result.status_code == 400
    # Must NOT have tried nvidia after a client error.
    assert all(a.provider == "groq" for a in result.attempts)
    assert len(sender.calls) == 1


@pytest.mark.asyncio
async def test_503_skips_remaining_keys_for_provider():
    cfg = build_config()
    reg = build_registry(cfg)
    sender = FakeSender({
        "groq": [SendOutcome(status_code=503, body=None, latency_ms=2.0)],
        "nvidia": [ok()],
    })
    engine, _ = make_engine(cfg, reg, sender)

    result = await engine.route_chat(chat_req())
    assert result.success is True
    assert result.final_provider == "nvidia"
    # groq should have been tried only once (5xx breaks the key loop).
    groq_calls = [c for c in sender.calls if c[0] == "groq"]
    assert len(groq_calls) == 1


@pytest.mark.asyncio
async def test_network_error_then_success():
    cfg = build_config()
    reg = build_registry(cfg)
    sender = FakeSender({
        "groq": [SendOutcome(status_code=None, body=None, latency_ms=1.0, error="timeout")],
        "nvidia": [ok()],
    })
    engine, _ = make_engine(cfg, reg, sender)

    result = await engine.route_chat(chat_req())
    assert result.success is True
    assert result.final_provider == "nvidia"
    assert any(a.failure_class == FailureClass.NETWORK_ERROR.value for a in result.attempts)


@pytest.mark.asyncio
async def test_all_providers_fail_returns_502():
    cfg = build_config()
    reg = build_registry(cfg)
    sender = FakeSender({
        "groq": [SendOutcome(status_code=429, body=None, latency_ms=1.0)],
        "nvidia": [SendOutcome(status_code=503, body=None, latency_ms=1.0)],
        "openrouter": [SendOutcome(status_code=429, body=None, latency_ms=1.0)],
    })
    engine, _ = make_engine(cfg, reg, sender)

    result = await engine.route_chat(chat_req())
    assert result.success is False
    assert result.status_code == 502
    assert result.error_reason is not None


@pytest.mark.asyncio
async def test_circuit_breaker_opens_and_skips():
    cfg = build_config()
    reg = build_registry(cfg)
    # nvidia always 503; threshold is 2 so its single key opens after 2 fails.
    sender = FakeSender({
        "groq": [SendOutcome(status_code=429, body=None, latency_ms=1.0)],
        "nvidia": [SendOutcome(status_code=503, body=None, latency_ms=1.0)],
        "openrouter": [SendOutcome(status_code=429, body=None, latency_ms=1.0)],
    })
    engine, breakers = make_engine(cfg, reg, sender, cb_threshold=1)

    # First request trips nvidia's breaker (1 failure -> open).
    await engine.route_chat(chat_req())
    nvidia_breaker = await breakers.get("nvidia", "0")
    from core.circuit_breaker import CircuitState
    assert nvidia_breaker.state is CircuitState.OPEN

    # Second request: nvidia should be skipped via circuit_open.
    sender.calls.clear()
    result = await engine.route_chat(chat_req())
    nvidia_calls = [c for c in sender.calls if c[0] == "nvidia"]
    assert len(nvidia_calls) == 0
    assert any(a.failure_class == "circuit_open" for a in result.attempts)


@pytest.mark.asyncio
async def test_no_candidates_returns_502():
    cfg = build_config()
    reg = ModelRegistry(cfg, http=None)  # empty registry: nothing discovered
    sender = FakeSender({})
    engine, _ = make_engine(cfg, reg, sender)

    result = await engine.route_chat(chat_req("unknown-model"))
    assert result.success is False
    assert result.status_code == 502
    assert "No available provider" in (result.error_reason or "")


@pytest.mark.asyncio
async def test_round_robin_key_order():
    cfg = build_config()
    reg = build_registry(cfg)
    sender = FakeSender({"groq": [ok()]})
    engine, _ = make_engine(cfg, reg, sender)

    first = engine._ordered_keys("groq", 2)
    second = engine._ordered_keys("groq", 2)
    assert first[0] == 0
    assert second[0] == 1  # cursor advanced
