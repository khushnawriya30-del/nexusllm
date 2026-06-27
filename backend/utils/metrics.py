"""In-memory metrics tracker (reset on process restart)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date


@dataclass
class ProviderStats:
    """Per-provider counters."""

    successes: int = 0
    failures: int = 0
    total_latency_ms: float = 0.0
    latency_samples: int = 0

    @property
    def avg_latency_ms(self) -> float | None:
        if self.latency_samples == 0:
            return None
        return round(self.total_latency_ms / self.latency_samples, 1)


@dataclass
class Metrics:
    """Aggregate, in-memory request metrics."""

    total_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    total_fallbacks: int = 0
    tokens_used_today: int = 0
    requests_today: int = 0
    provider_stats: dict[str, ProviderStats] = field(default_factory=dict)
    _today: date = field(default_factory=date.today)

    def _roll_day(self) -> None:
        today = date.today()
        if today != self._today:
            self._today = today
            self.tokens_used_today = 0
            self.requests_today = 0

    def record_request(
        self,
        *,
        provider_id: str | None,
        success: bool,
        latency_ms: float,
        fallback_count: int,
        tokens: int = 0,
    ) -> None:
        """Record a completed routing attempt's outcome."""
        self._roll_day()
        self.total_requests += 1
        self.requests_today += 1
        self.total_fallbacks += fallback_count
        self.tokens_used_today += tokens
        if success:
            self.successful_requests += 1
        else:
            self.failed_requests += 1

        if provider_id:
            stats = self.provider_stats.setdefault(provider_id, ProviderStats())
            if success:
                stats.successes += 1
                stats.total_latency_ms += latency_ms
                stats.latency_samples += 1
            else:
                stats.failures += 1

    def record_provider_attempt(
        self, provider_id: str, *, success: bool, latency_ms: float
    ) -> None:
        """Record an individual provider attempt (used for per-provider stats)."""
        stats = self.provider_stats.setdefault(provider_id, ProviderStats())
        if success:
            stats.successes += 1
            stats.total_latency_ms += latency_ms
            stats.latency_samples += 1
        else:
            stats.failures += 1

    @property
    def success_rate(self) -> float:
        if self.total_requests == 0:
            return 0.0
        return round(100 * self.successful_requests / self.total_requests, 2)

    def snapshot(self) -> dict:
        """Return a JSON-serializable view for the admin metrics endpoint."""
        self._roll_day()
        return {
            "total_requests": self.total_requests,
            "successful_requests": self.successful_requests,
            "failed_requests": self.failed_requests,
            "total_fallbacks": self.total_fallbacks,
            "success_rate": self.success_rate,
            "tokens_used_today": self.tokens_used_today,
            "requests_today": self.requests_today,
            "provider_stats": {
                pid: {
                    "successes": s.successes,
                    "failures": s.failures,
                    "avg_latency_ms": s.avg_latency_ms,
                }
                for pid, s in self.provider_stats.items()
            },
        }
