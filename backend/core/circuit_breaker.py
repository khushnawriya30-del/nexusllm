"""
Circuit breaker for NexusLLM.

One :class:`CircuitBreaker` instance guards a single ``(provider_id, key_index)``
pair. The breaker prevents hammering an upstream key that is failing (rate
limited, auth error, provider outage) by tripping OPEN after a burst of
failures, then probing with a single request after a cool-down.

State machine
-------------
::

    CLOSED ──(failures >= threshold within window)──► OPEN
    OPEN   ──(open_duration elapsed)───────────────► HALF_OPEN
    HALF_OPEN ──(success_threshold successes)──────► CLOSED
    HALF_OPEN ──(any failure)──────────────────────► OPEN (duration doubled)

The breaker is in-memory only and thread-safe via ``asyncio.Lock``. State is
intentionally not persisted: a process restart resets all breakers, which is
the desired behavior for a stateless gateway.
"""

from __future__ import annotations

import asyncio
import time
from collections import deque
from dataclasses import dataclass, field
from enum import Enum


class CircuitState(str, Enum):
    """Lifecycle states of a circuit breaker."""

    CLOSED = "CLOSED"        # healthy: requests flow normally
    OPEN = "OPEN"            # tripped: requests are rejected immediately
    HALF_OPEN = "HALF_OPEN"  # probing: a limited number of trial requests allowed


@dataclass
class CircuitBreakerConfig:
    """Tunables for a circuit breaker."""

    failure_threshold: int = 4
    failure_window_seconds: float = 60.0
    open_duration_seconds: float = 90.0
    success_threshold_half_open: int = 1
    max_open_duration_seconds: float = 900.0


@dataclass
class CircuitBreakerState:
    """Serializable snapshot of a breaker for the admin API."""

    provider_id: str
    key_index: int
    state: CircuitState
    failure_count: int
    success_count_half_open: int
    consecutive_open_trips: int
    opened_at: float | None
    seconds_until_half_open: float | None
    current_open_duration: float


@dataclass
class _Internal:
    """Mutable internal counters kept off the public snapshot."""

    state: CircuitState = CircuitState.CLOSED
    failure_timestamps: deque[float] = field(default_factory=deque)
    success_count_half_open: int = 0
    consecutive_open_trips: int = 0
    opened_at: float | None = None
    half_open_probe_in_flight: bool = False


class CircuitBreaker:
    """Guards one ``(provider_id, key_index)`` pair."""

    def __init__(
        self,
        provider_id: str,
        key_index: int,
        config: CircuitBreakerConfig | None = None,
        *,
        time_func=time.monotonic,
    ) -> None:
        self.provider_id = provider_id
        self.key_index = key_index
        self.config = config or CircuitBreakerConfig()
        self._now = time_func
        self._lock = asyncio.Lock()
        self._s = _Internal()

    # -- duration helpers ---------------------------------------------------

    def _current_open_duration(self) -> float:
        """Open duration with exponential backoff, capped at the max."""
        trips = max(self._s.consecutive_open_trips, 1)
        duration = self.config.open_duration_seconds * (2 ** (trips - 1))
        return min(duration, self.config.max_open_duration_seconds)

    def _prune_failures(self, now: float) -> None:
        """Drop failure timestamps that fell outside the rolling window."""
        window = self.config.failure_window_seconds
        ts = self._s.failure_timestamps
        while ts and (now - ts[0]) > window:
            ts.popleft()

    def _maybe_transition_to_half_open(self, now: float) -> None:
        """Move OPEN -> HALF_OPEN if the cool-down has elapsed."""
        if self._s.state is not CircuitState.OPEN or self._s.opened_at is None:
            return
        if (now - self._s.opened_at) >= self._current_open_duration():
            self._s.state = CircuitState.HALF_OPEN
            self._s.success_count_half_open = 0
            self._s.half_open_probe_in_flight = False

    # -- public API ---------------------------------------------------------

    async def allow_request(self) -> bool:
        """Return True if a request may proceed under the current state.

        Side effects (under lock):
          * Lazily promotes OPEN -> HALF_OPEN when the cool-down elapsed.
          * In HALF_OPEN, allows exactly one probe at a time.
        """
        async with self._lock:
            now = self._now()
            self._maybe_transition_to_half_open(now)

            match self._s.state:
                case CircuitState.CLOSED:
                    return True
                case CircuitState.OPEN:
                    return False
                case CircuitState.HALF_OPEN:
                    if self._s.half_open_probe_in_flight:
                        return False
                    self._s.half_open_probe_in_flight = True
                    return True
        return False  # pragma: no cover - unreachable

    async def record_success(self) -> None:
        """Record a successful request and update state accordingly."""
        async with self._lock:
            match self._s.state:
                case CircuitState.HALF_OPEN:
                    self._s.success_count_half_open += 1
                    self._s.half_open_probe_in_flight = False
                    if (
                        self._s.success_count_half_open
                        >= self.config.success_threshold_half_open
                    ):
                        self._close()
                case CircuitState.CLOSED:
                    # Healthy traffic clears stale failures.
                    self._s.failure_timestamps.clear()
                case CircuitState.OPEN:
                    # A success while OPEN (e.g. race) is treated as a probe.
                    self._close()

    async def record_failure(self) -> None:
        """Record a failed request and trip/keep the breaker open as needed."""
        async with self._lock:
            now = self._now()
            match self._s.state:
                case CircuitState.HALF_OPEN:
                    # Probe failed: re-open with a longer cool-down.
                    self._open(now)
                case CircuitState.CLOSED:
                    self._s.failure_timestamps.append(now)
                    self._prune_failures(now)
                    if len(self._s.failure_timestamps) >= self.config.failure_threshold:
                        self._open(now)
                case CircuitState.OPEN:
                    # Already open; nothing to escalate until half-open probe.
                    pass

    def _open(self, now: float) -> None:
        self._s.state = CircuitState.OPEN
        self._s.opened_at = now
        self._s.consecutive_open_trips += 1
        self._s.failure_timestamps.clear()
        self._s.success_count_half_open = 0
        self._s.half_open_probe_in_flight = False

    def _close(self) -> None:
        self._s.state = CircuitState.CLOSED
        self._s.opened_at = None
        self._s.consecutive_open_trips = 0
        self._s.failure_timestamps.clear()
        self._s.success_count_half_open = 0
        self._s.half_open_probe_in_flight = False

    async def reset(self) -> None:
        """Force the breaker back to a clean CLOSED state (admin action)."""
        async with self._lock:
            self._s = _Internal()

    async def get_state(self) -> CircuitBreakerState:
        """Return a snapshot of the current breaker state."""
        async with self._lock:
            now = self._now()
            self._maybe_transition_to_half_open(now)
            seconds_until_half_open: float | None = None
            if self._s.state is CircuitState.OPEN and self._s.opened_at is not None:
                elapsed = now - self._s.opened_at
                seconds_until_half_open = max(
                    0.0, self._current_open_duration() - elapsed
                )
            return CircuitBreakerState(
                provider_id=self.provider_id,
                key_index=self.key_index,
                state=self._s.state,
                failure_count=len(self._s.failure_timestamps),
                success_count_half_open=self._s.success_count_half_open,
                consecutive_open_trips=self._s.consecutive_open_trips,
                opened_at=self._s.opened_at,
                seconds_until_half_open=seconds_until_half_open,
                current_open_duration=self._current_open_duration(),
            )

    @property
    def state(self) -> CircuitState:
        """Best-effort current state without lock (for quick checks/logs)."""
        return self._s.state


class CircuitBreakerRegistry:
    """Singleton-style registry managing one breaker per (provider, key)."""

    def __init__(self, config: CircuitBreakerConfig | None = None) -> None:
        self._config = config or CircuitBreakerConfig()
        self._breakers: dict[tuple[str, int], CircuitBreaker] = {}
        self._lock = asyncio.Lock()

    async def get(self, provider_id: str, key_index: int) -> CircuitBreaker:
        """Return (creating if needed) the breaker for a provider/key pair."""
        key = (provider_id, key_index)
        if (breaker := self._breakers.get(key)) is not None:
            return breaker
        async with self._lock:
            if (breaker := self._breakers.get(key)) is not None:
                return breaker
            breaker = CircuitBreaker(provider_id, key_index, self._config)
            self._breakers[key] = breaker
            return breaker

    async def reset(self, provider_id: str, key_index: int | None = None) -> int:
        """Reset breakers for a provider.

        If ``key_index`` is None, reset every breaker belonging to the
        provider. Returns the number of breakers reset.
        """
        targets = [
            b
            for (pid, idx), b in self._breakers.items()
            if pid == provider_id and (key_index is None or idx == key_index)
        ]
        for breaker in targets:
            await breaker.reset()
        return len(targets)

    async def reset_all(self) -> int:
        """Reset every breaker. Returns the number reset."""
        breakers = list(self._breakers.values())
        for breaker in breakers:
            await breaker.reset()
        return len(breakers)

    async def get_all_states(self) -> list[CircuitBreakerState]:
        """Return snapshots of every known breaker."""
        return [await b.get_state() for b in self._breakers.values()]

    def provider_state(self, provider_id: str) -> CircuitState:
        """Aggregate state for a provider across its keys.

        OPEN if every known key is OPEN, HALF_OPEN if any is probing, else
        CLOSED. Providers with no breakers yet are considered CLOSED.
        """
        states = [
            b.state for (pid, _), b in self._breakers.items() if pid == provider_id
        ]
        if not states:
            return CircuitState.CLOSED
        if all(s is CircuitState.OPEN for s in states):
            return CircuitState.OPEN
        if any(s is CircuitState.HALF_OPEN for s in states):
            return CircuitState.HALF_OPEN
        return CircuitState.CLOSED
