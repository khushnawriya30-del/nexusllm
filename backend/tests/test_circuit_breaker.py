"""Tests for the circuit breaker state machine and registry."""

from __future__ import annotations

import pytest

from core.circuit_breaker import (
    CircuitBreaker,
    CircuitBreakerConfig,
    CircuitBreakerRegistry,
    CircuitState,
)


class FakeClock:
    """Controllable monotonic clock for deterministic timing tests."""

    def __init__(self, start: float = 1000.0) -> None:
        self.t = start

    def __call__(self) -> float:
        return self.t

    def advance(self, seconds: float) -> None:
        self.t += seconds


def make_breaker(clock: FakeClock | None = None, **overrides) -> CircuitBreaker:
    cfg = CircuitBreakerConfig(
        failure_threshold=overrides.pop("failure_threshold", 3),
        failure_window_seconds=overrides.pop("failure_window_seconds", 60.0),
        open_duration_seconds=overrides.pop("open_duration_seconds", 30.0),
        success_threshold_half_open=overrides.pop("success_threshold_half_open", 1),
        max_open_duration_seconds=overrides.pop("max_open_duration_seconds", 300.0),
    )
    return CircuitBreaker(
        "groq", 0, cfg, time_func=clock or FakeClock()
    )


@pytest.mark.asyncio
async def test_starts_closed_and_allows_requests():
    cb = make_breaker()
    assert cb.state is CircuitState.CLOSED
    assert await cb.allow_request() is True


@pytest.mark.asyncio
async def test_trips_open_after_threshold_failures():
    cb = make_breaker(failure_threshold=3)
    for _ in range(2):
        await cb.record_failure()
    assert cb.state is CircuitState.CLOSED
    await cb.record_failure()  # third failure trips it
    assert cb.state is CircuitState.OPEN
    assert await cb.allow_request() is False


@pytest.mark.asyncio
async def test_failures_outside_window_do_not_trip():
    clock = FakeClock()
    cb = make_breaker(clock=clock, failure_threshold=3, failure_window_seconds=60.0)
    await cb.record_failure()
    await cb.record_failure()
    clock.advance(61)  # first two failures now expire from the window
    await cb.record_failure()
    assert cb.state is CircuitState.CLOSED


@pytest.mark.asyncio
async def test_open_transitions_to_half_open_after_cooldown():
    clock = FakeClock()
    cb = make_breaker(clock=clock, failure_threshold=1, open_duration_seconds=30.0)
    await cb.record_failure()
    assert cb.state is CircuitState.OPEN
    assert await cb.allow_request() is False

    clock.advance(30)
    # First allow_request after cool-down promotes to HALF_OPEN and permits one probe.
    assert await cb.allow_request() is True
    snapshot = await cb.get_state()
    assert snapshot.state is CircuitState.HALF_OPEN


@pytest.mark.asyncio
async def test_half_open_allows_single_probe():
    clock = FakeClock()
    cb = make_breaker(clock=clock, failure_threshold=1, open_duration_seconds=10.0)
    await cb.record_failure()
    clock.advance(10)
    assert await cb.allow_request() is True   # probe granted
    assert await cb.allow_request() is False  # second probe blocked


@pytest.mark.asyncio
async def test_half_open_success_closes():
    clock = FakeClock()
    cb = make_breaker(
        clock=clock,
        failure_threshold=1,
        open_duration_seconds=10.0,
        success_threshold_half_open=2,
    )
    await cb.record_failure()
    clock.advance(10)
    await cb.allow_request()
    await cb.record_success()
    assert cb.state is CircuitState.HALF_OPEN  # needs 2 successes
    await cb.allow_request()
    await cb.record_success()
    assert cb.state is CircuitState.CLOSED


@pytest.mark.asyncio
async def test_half_open_failure_reopens_with_doubled_duration():
    clock = FakeClock()
    cb = make_breaker(clock=clock, failure_threshold=1, open_duration_seconds=10.0)
    await cb.record_failure()             # trip #1, duration 10
    clock.advance(10)
    await cb.allow_request()              # -> HALF_OPEN
    await cb.record_failure()             # probe fails -> trip #2, duration 20
    assert cb.state is CircuitState.OPEN

    clock.advance(10)
    assert await cb.allow_request() is False  # still open (needs 20s now)
    clock.advance(10)
    assert await cb.allow_request() is True   # 20s elapsed -> HALF_OPEN probe


@pytest.mark.asyncio
async def test_open_duration_capped_at_max():
    clock = FakeClock()
    cb = make_breaker(
        clock=clock,
        failure_threshold=1,
        open_duration_seconds=10.0,
        max_open_duration_seconds=25.0,
    )
    # Trip several times to push exponential backoff past the cap.
    for _ in range(5):
        await cb.record_failure()
        snap = await cb.get_state()
        if snap.state is CircuitState.OPEN:
            clock.advance(snap.current_open_duration)
            await cb.allow_request()  # promote to half-open for next probe
    final = await cb.get_state()
    assert final.current_open_duration <= 25.0


@pytest.mark.asyncio
async def test_reset_returns_to_closed():
    cb = make_breaker(failure_threshold=1)
    await cb.record_failure()
    assert cb.state is CircuitState.OPEN
    await cb.reset()
    assert cb.state is CircuitState.CLOSED
    assert await cb.allow_request() is True


@pytest.mark.asyncio
async def test_success_in_closed_clears_failures():
    cb = make_breaker(failure_threshold=3)
    await cb.record_failure()
    await cb.record_failure()
    await cb.record_success()  # clears the two pending failures
    await cb.record_failure()
    await cb.record_failure()
    assert cb.state is CircuitState.CLOSED  # only 2 since the reset


# -- registry ---------------------------------------------------------------


@pytest.mark.asyncio
async def test_registry_returns_same_instance_per_key():
    reg = CircuitBreakerRegistry(CircuitBreakerConfig(failure_threshold=2))
    a = await reg.get("groq", 0)
    b = await reg.get("groq", 0)
    c = await reg.get("groq", 1)
    assert a is b
    assert a is not c


@pytest.mark.asyncio
async def test_registry_reset_provider():
    reg = CircuitBreakerRegistry(CircuitBreakerConfig(failure_threshold=1))
    cb0 = await reg.get("groq", 0)
    cb1 = await reg.get("groq", 1)
    await cb0.record_failure()
    await cb1.record_failure()
    count = await reg.reset("groq")
    assert count == 2
    assert cb0.state is CircuitState.CLOSED
    assert cb1.state is CircuitState.CLOSED


@pytest.mark.asyncio
async def test_registry_provider_state_aggregation():
    reg = CircuitBreakerRegistry(CircuitBreakerConfig(failure_threshold=1))
    cb0 = await reg.get("nvidia", 0)
    cb1 = await reg.get("nvidia", 1)
    assert reg.provider_state("nvidia") is CircuitState.CLOSED
    await cb0.record_failure()
    # one open, one closed -> not all open, none half-open -> CLOSED
    assert reg.provider_state("nvidia") is CircuitState.CLOSED
    await cb1.record_failure()
    assert reg.provider_state("nvidia") is CircuitState.OPEN


@pytest.mark.asyncio
async def test_registry_get_all_states():
    reg = CircuitBreakerRegistry()
    await reg.get("groq", 0)
    await reg.get("nvidia", 0)
    states = await reg.get_all_states()
    assert len(states) == 2
    ids = {(s.provider_id, s.key_index) for s in states}
    assert ids == {("groq", 0), ("nvidia", 0)}
