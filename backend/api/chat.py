"""POST /v1/chat/completions — streaming and non-streaming."""

from __future__ import annotations

import logging
import time

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, StreamingResponse

from core.routing import RoutingEngine
from middleware.auth import require_proxy
from models.requests import ChatCompletionRequest, ChatMessage
from models.responses import error_body
from utils.streaming import sse_error_stream

logger = logging.getLogger("nexusllm.api.chat")

router = APIRouter(prefix="/v1", tags=["chat"])

# Platform-aware guidance injected for the special routing modes so models give
# an intelligent identity answer (not hardcoded) when asked "which model are
# you?". The model uses its own words; we only give it the context.
_AUTO_IDENTITY_NOTE = (
    "You are being accessed through NexusLLM, a gateway that AUTOMATICALLY "
    "routes each message to one of several different AI models (the underlying "
    "model can change from request to request). The user has NOT selected a "
    "specific model. Answer every normal question helpfully and directly.\n\n"
    "IMPORTANT exception — identity questions: if the user asks which model or "
    "AI you are, which company made/created/trained you, your name, or your "
    "version, do NOT claim to be a single specific model or vendor. Instead "
    "briefly and politely explain that they are using an automatic multi-model "
    "routing mode, so the underlying model varies per request and this answer "
    "cannot be attributed to one specific model — and offer that they can pick "
    "a specific model if they want a definite identity."
)


@router.post("/chat/completions", dependencies=[Depends(require_proxy)])
async def chat_completions(req: ChatCompletionRequest, request: Request):
    """Route a chat completion through the fallback engine."""
    engine: RoutingEngine = request.app.state.engine
    request_id = getattr(request.state, "request_id", None)

    # Fusion: ask a panel of models in parallel, then synthesize via a judge.
    if req.model == "fusion":
        from core.fusion import build_fusion_request, stream_fusion

        # Streaming fusion: emit a custom SSE protocol with live per-model
        # panel streaming + auto-fallback, then the synthesized judge answer.
        if req.stream:
            async def _judge_log(result):
                await _log(request, result, is_stream=True)

            return StreamingResponse(
                stream_fusion(engine, req, request_id=request_id,
                              log_cb=_judge_log),
                media_type="text/event-stream",
            )

        # Non-streaming fusion: run the panel, then route the judge normally.
        judge_req, _panel = await build_fusion_request(
            engine, req, request_id=request_id
        )
        if judge_req is None:
            msg = "Fusion failed: no panel model returned an answer."
            return JSONResponse(
                content={"error": {"message": msg, "type": "fusion_error"}},
                status_code=502,
            )
        req = judge_req

    # Auto / fallback modes: no single model is chosen, so prepend platform
    # context guiding the model to answer identity questions intelligently.
    if req.model in ("auto", "fallback"):
        req = req.model_copy(update={
            "messages": [
                ChatMessage(role="system", content=_AUTO_IDENTITY_NOTE),
                *req.messages,
            ]
        })

    if req.stream:
        result, gen = await engine.stream_chat(req, request_id=request_id)
        if gen is None or not result.success:
            await _log(request, result, is_stream=True)
            return StreamingResponse(
                sse_error_stream(result.error_reason or "no provider available"),
                media_type="text/event-stream",
                status_code=result.status_code,
                headers=result.response_headers(),
            )

        # Log AFTER the stream completes so real token usage (captured from the
        # trailing usage chunk) and total latency are persisted, not zeros.
        async def _logged_stream():
            started = time.perf_counter()
            try:
                async for chunk in gen:
                    yield chunk
            finally:
                result.total_latency_ms = (time.perf_counter() - started) * 1000
                await _log(request, result, is_stream=True)

        return StreamingResponse(
            _logged_stream(),
            media_type="text/event-stream",
            headers=result.response_headers(),
        )

    result = await engine.route_chat(req, request_id=request_id)
    await _log(request, result, is_stream=False)

    if result.success:
        return JSONResponse(
            content=result.body,
            status_code=result.status_code,
            headers=result.response_headers(),
        )

    body = result.body if result.body else error_body(result)
    return JSONResponse(
        content=body,
        status_code=result.status_code,
        headers=result.response_headers(),
    )


async def _log(request: Request, result, *, is_stream: bool) -> None:
    """Persist the routing decision if request logging is enabled."""
    store = getattr(request.app.state, "request_log", None)
    config = request.app.state.config
    if store is not None and config.app.enable_request_logging:
        try:
            await store.record(result, is_stream=is_stream, request_type="chat")
        except Exception as exc:  # pragma: no cover - logging must not break requests.
            logger.warning("Failed to persist request log: %s", exc)
    logger.info("route: %s", result.log_dict())
