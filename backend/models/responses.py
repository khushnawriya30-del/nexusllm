"""Outgoing response models and routing result types."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class RouteAttempt:
    """A single attempt against one provider/key in the fallback chain."""

    provider: str
    key_index: int
    model: str
    status: int | None = None
    latency_ms: float = 0.0
    failure_class: str | None = None
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "provider": self.provider,
            "key_index": self.key_index,
            "model": self.model,
            "status": self.status,
            "latency_ms": round(self.latency_ms, 1),
            "failure_class": self.failure_class,
            "error": self.error,
        }


@dataclass
class RouteResult:
    """The outcome of a full routing operation."""

    request_id: str
    model_requested: str
    attempts: list[RouteAttempt] = field(default_factory=list)
    success: bool = False
    final_provider: str | None = None
    final_model: str | None = None
    final_key_index: int | None = None
    status_code: int = 502
    total_latency_ms: float = 0.0
    # For non-streaming success, the parsed JSON body. For streaming, None
    # (the caller consumes the live stream instead).
    body: dict[str, Any] | None = None
    error_reason: str | None = None
    prompt_tokens: int = 0
    completion_tokens: int = 0

    @property
    def fallback_count(self) -> int:
        """Number of failed attempts before the successful one (or total)."""
        return max(0, len(self.attempts) - 1)

    def log_dict(self) -> dict[str, Any]:
        """Structured routing decision for logging."""
        return {
            "request_id": self.request_id,
            "model_requested": self.model_requested,
            "attempts": [a.to_dict() for a in self.attempts],
            "final_provider": self.final_provider,
            "final_model": self.final_model,
            "total_latency_ms": round(self.total_latency_ms, 1),
            "fallback_count": self.fallback_count,
            "success": self.success,
        }

    def response_headers(self) -> dict[str, str]:
        """Custom NexusLLM headers for the client."""
        headers = {
            "X-NexusLLM-Request-ID": self.request_id,
            "X-NexusLLM-Fallback-Count": str(self.fallback_count),
        }
        if self.final_provider:
            headers["X-NexusLLM-Provider"] = self.final_provider
        if self.final_model:
            headers["X-NexusLLM-Model"] = self.final_model
        return headers


def error_body(result: RouteResult) -> dict[str, Any]:
    """Build a detailed OpenAI-style error body when all options fail."""
    return {
        "error": {
            "message": result.error_reason
            or "All providers failed to handle the request.",
            "type": "nexusllm_upstream_error",
            "code": "all_providers_failed",
            "request_id": result.request_id,
            "model_requested": result.model_requested,
            "attempts": [a.to_dict() for a in result.attempts],
        }
    }
