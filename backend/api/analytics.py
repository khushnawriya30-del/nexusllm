"""Analytics endpoints: aggregated metrics, charts, errors, and request log.

All endpoints require admin Bearer auth (same as the other /admin/* routes)
and aggregate the persisted `request_logs` via core.analytics.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from core import analytics
from middleware.firebase_auth import require_identity as require_admin

router = APIRouter(prefix="/admin/analytics", tags=["analytics"], dependencies=[Depends(require_admin)])

_VALID_STATUS = {"success", "failed"}
_VALID_TYPES = {"chat", "embeddings", "completions"}


def _validate(status: str | None, request_type: str | None) -> None:
    if status is not None and status not in _VALID_STATUS:
        raise HTTPException(422, f"invalid status {status!r}; expected success|failed")
    if request_type is not None and request_type not in _VALID_TYPES:
        raise HTTPException(
            422, f"invalid request_type {request_type!r}; expected chat|embeddings|completions"
        )


@router.get("")
async def analytics_overview(
    request: Request,
    range: str = "24h",
    provider: str | None = None,
    model: str | None = None,
    status: str | None = None,
    request_type: str | None = None,
    min_tokens: int | None = None,
    max_tokens: int | None = None,
) -> dict:
    """Combined analytics payload for the dashboard (cards, charts, errors)."""
    _validate(status, request_type)
    store = getattr(request.app.state, "request_log", None)
    if store is None:
        return {"overview": analytics.compute_overview([]), "providers": [],
                "models": [], "series": analytics.compute_series([], *analytics.parse_range(range)),
                "errors": [], "range": range}

    start, end = analytics.parse_range(range)
    rows = await store.all_rows()
    filtered = analytics.filter_rows(
        rows, start=start, end=end, provider=provider, model=model,
        status=status, request_type=request_type,
        min_tokens=min_tokens, max_tokens=max_tokens,
    )
    return {
        "range": range,
        "overview": analytics.compute_overview(filtered),
        "providers": analytics.compute_providers(filtered),
        "models": analytics.compute_models(filtered),
        "series": analytics.compute_series(filtered, start, end),
        "errors": analytics.recent_errors(filtered, limit=20),
    }


@router.get("/requests")
async def analytics_requests(
    request: Request,
    range: str = "24h",
    provider: str | None = None,
    model: str | None = None,
    status: str | None = None,
    request_type: str | None = None,
    min_tokens: int | None = None,
    max_tokens: int | None = None,
    search: str | None = None,
    sort: str = "timestamp",
    direction: str = "desc",
    page: int = 1,
    page_size: int = 25,
) -> dict:
    """Filtered/searched/sorted/paginated recent-requests table data."""
    _validate(status, request_type)
    store = getattr(request.app.state, "request_log", None)
    if store is None:
        return {"items": [], "total": 0, "page": page, "page_size": page_size}

    start, end = analytics.parse_range(range)
    rows = await store.all_rows()
    filtered = analytics.filter_rows(
        rows, start=start, end=end, provider=provider, model=model,
        status=status, request_type=request_type,
        min_tokens=min_tokens, max_tokens=max_tokens, search=search,
    )
    return analytics.query_requests(
        filtered, sort=sort, direction=direction, page=page, page_size=page_size
    )
