"""Structured request/response logging middleware.

Implemented as a *pure ASGI* middleware rather than Starlette's
``BaseHTTPMiddleware``. ``BaseHTTPMiddleware`` pulls the full response body
through an internal buffer before forwarding it, which breaks Server-Sent
Events: every streamed chunk is held back and flushed only when the response
finishes. That makes live token/`reasoning` streaming look like it arrives all
at once at the end. A raw ASGI middleware forwards each ``http.response.body``
event untouched, so SSE chunks reach the browser the instant they are produced.
"""

from __future__ import annotations

import logging
import time
import uuid

from starlette.types import ASGIApp, Message, Receive, Scope, Send

logger = logging.getLogger("nexusllm.access")


class AccessLogMiddleware:
    """Logs each HTTP request with a generated request id and latency.

    Streams responses through verbatim — chunks are never buffered — so SSE
    (live thinking/token streaming) is delivered to the client in real time.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Resolve/propagate a request id and stash it where handlers can read it
        # via ``request.state.request_id``.
        headers = dict(scope.get("headers") or [])
        request_id = (
            headers.get(b"x-request-id", b"").decode("latin-1") or str(uuid.uuid4())
        )
        scope.setdefault("state", {})["request_id"] = request_id

        started = time.perf_counter()
        status_code = 0

        async def send_wrapper(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
                # Inject X-Request-ID without disturbing the streamed body.
                raw_headers = list(message.get("headers") or [])
                if not any(k.lower() == b"x-request-id" for k, _ in raw_headers):
                    raw_headers.append(
                        (b"x-request-id", request_id.encode("latin-1"))
                    )
                message = {**message, "headers": raw_headers}
            # Each body chunk is forwarded immediately — no buffering.
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            elapsed_ms = (time.perf_counter() - started) * 1000
            logger.info(
                "%s %s -> %d (%.0f ms) rid=%s",
                scope.get("method", "-"),
                scope.get("path", "-"),
                status_code,
                elapsed_ms,
                request_id,
            )
