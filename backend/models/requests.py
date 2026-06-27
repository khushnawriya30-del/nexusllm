"""Incoming request body models (OpenAI-compatible, permissive passthrough)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class ChatMessage(BaseModel):
    """A single chat message. Extra fields (e.g. tool_calls) are preserved."""

    model_config = ConfigDict(extra="allow")

    role: str
    content: Any = None


class ChatCompletionRequest(BaseModel):
    """Body for POST /v1/chat/completions.

    Unknown fields are allowed and forwarded unchanged to the upstream provider
    so newer OpenAI parameters work without code changes.
    """

    model_config = ConfigDict(extra="allow")

    model: str
    messages: list[ChatMessage]
    stream: bool = False
    temperature: float | None = None
    top_p: float | None = None
    max_tokens: int | None = None
    n: int | None = None
    stop: Any = None
    presence_penalty: float | None = None
    frequency_penalty: float | None = None
    seed: int | None = None
    response_format: dict[str, Any] | None = None
    tools: list[dict[str, Any]] | None = None
    tool_choice: Any = None

    def upstream_payload(self, model_id: str) -> dict[str, Any]:
        """Serialize for the upstream provider, swapping in the real model id."""
        data = self.model_dump(exclude_none=True)
        data["model"] = model_id
        return data


class EmbeddingsRequest(BaseModel):
    """Body for POST /v1/embeddings."""

    model_config = ConfigDict(extra="allow")

    model: str
    input: Any
    encoding_format: Literal["float", "base64"] | None = None

    def upstream_payload(self, model_id: str) -> dict[str, Any]:
        data = self.model_dump(exclude_none=True)
        data["model"] = model_id
        return data


class CompletionsRequest(BaseModel):
    """Body for the legacy POST /v1/completions endpoint."""

    model_config = ConfigDict(extra="allow")

    model: str
    prompt: Any
    stream: bool = False
    max_tokens: int | None = None
    temperature: float | None = None
    top_p: float | None = None
    stop: Any = None

    def upstream_payload(self, model_id: str) -> dict[str, Any]:
        data = self.model_dump(exclude_none=True)
        data["model"] = model_id
        return data
