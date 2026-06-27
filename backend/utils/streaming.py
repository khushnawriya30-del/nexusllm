"""SSE streaming helpers."""

from __future__ import annotations

import json
from typing import AsyncIterator


async def sse_error_stream(message: str) -> AsyncIterator[bytes]:
    """Yield a single OpenAI-style error chunk followed by [DONE]."""
    payload = {
        "error": {
            "message": message,
            "type": "nexusllm_upstream_error",
            "code": "all_providers_failed",
        }
    }
    yield f"data: {json.dumps(payload)}\n\n".encode("utf-8")
    yield b"data: [DONE]\n\n"
