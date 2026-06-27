"""Authentication helpers for proxy (/v1/*) and admin (/admin/*) endpoints."""

from __future__ import annotations

from fastapi import HTTPException, Request, status


def _extract_bearer(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    return None


def require_admin(request: Request) -> None:
    """FastAPI dependency: enforce the admin API key on /admin/* endpoints."""
    config = request.app.state.config
    expected = config.app.admin_api_key
    if not expected:
        # No admin key configured -> admin endpoints are effectively locked.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Admin API key is not configured on the server.",
        )
    token = _extract_bearer(request)
    if token != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing admin credentials.",
            headers={"WWW-Authenticate": "Bearer"},
        )


def require_proxy(request: Request) -> None:
    """FastAPI dependency: enforce the optional proxy key on /v1/* endpoints.

    If no proxy key is configured, the endpoints are open (local-use default).
    """
    config = request.app.state.config
    expected = config.app.proxy_api_key
    if not expected:
        return  # proxy auth disabled
    token = _extract_bearer(request)
    if token != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing proxy credentials.",
            headers={"WWW-Authenticate": "Bearer"},
        )
