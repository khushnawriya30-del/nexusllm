"""POST /v1/completions — legacy text completions passthrough."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from core.routing import RoutingEngine
from middleware.firebase_auth import resolve_proxy_workspace
from models.requests import CompletionsRequest
from models.responses import error_body

router = APIRouter(prefix="/v1", tags=["completions"])


@router.post("/completions")
async def completions(
    req: CompletionsRequest,
    request: Request,
    user_id: str = Depends(resolve_proxy_workspace),
):
    """Route a legacy completion request through the fallback engine."""
    engine: RoutingEngine = request.app.state.engine
    request_id = getattr(request.state, "request_id", None)

    result = await engine.route(
        req.model,
        req.upstream_payload,
        path="/completions",
        request_id=request_id,
        user_id=user_id,
    )

    store = getattr(request.app.state, "request_log", None)
    if store is not None and request.app.state.config.app.enable_request_logging:
        await store.record(result, is_stream=False, request_type="completions")

    body = result.body if result.success else (result.body or error_body(result))
    return JSONResponse(
        content=body,
        status_code=result.status_code,
        headers=result.response_headers(),
    )
