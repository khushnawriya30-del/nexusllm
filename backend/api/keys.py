"""Key management API: unified key, provider keys, custom providers, health."""

from __future__ import annotations

import logging
import time

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from core.providers_catalog import get_key_url
from middleware.auth import require_admin
from utils.masking import mask_api_key

logger = logging.getLogger("nexusllm.api.keys")

router = APIRouter(prefix="/admin", tags=["keys"], dependencies=[Depends(require_admin)])


# ---------------------------------------------------------------------------
# Request bodies
# ---------------------------------------------------------------------------


class AddKeyBody(BaseModel):
    provider_id: str
    api_key: str
    label: str = ""


class EditLabelBody(BaseModel):
    label: str


class ToggleBody(BaseModel):
    enabled: bool


class CustomProviderBody(BaseModel):
    base_url: str
    models: list[str]
    name: str = ""
    api_key: str = ""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _display_mask(api_key: str) -> str:
    """Short display mask like 'AQ…RhZA' for the configured list."""
    if not api_key:
        return "—"
    if len(api_key) <= 6:
        return "•" * len(api_key)
    return f"{api_key[:2]}…{api_key[-4:]}"


async def _check_key(base_url: str, api_key: str, timeout: float = 10.0) -> tuple[str, float | None]:
    """Ping a provider's /models endpoint; return (status, latency_ms)."""
    url = base_url.rstrip("/") + "/models"
    started = time.perf_counter()
    try:
        headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(url, headers=headers)
        latency = (time.perf_counter() - started) * 1000
        if resp.status_code < 400:
            return "healthy", round(latency, 1)
        if resp.status_code in (401, 403):
            return "unauthorized", round(latency, 1)
        if resp.status_code == 429:
            return "rate_limited", round(latency, 1)
        return "unhealthy", round(latency, 1)
    except Exception as exc:
        logger.info("health check failed for %s: %s", base_url, exc)
        return "unreachable", None


def _base_url_for(request: Request, provider_id: str) -> str | None:
    cfg = request.app.state.config
    p = cfg.get_provider(provider_id)
    return p.base_url if p else None


async def _rediscover(request: Request) -> None:
    """Re-run model discovery in the background so new keys surface models
    without blocking the API response (large catalogues take time to validate)."""
    import asyncio

    try:
        asyncio.create_task(request.app.state.registry.discover_all())
    except Exception as exc:  # pragma: no cover - non-fatal.
        logger.warning("scheduling re-discovery failed: %s", exc)


async def _sync_custom_into_config(request: Request, cp) -> None:
    """Register a custom provider as a live ProviderConfig + its models so it
    routes and shows up in /v1/models like any built-in provider."""
    from core.config import make_custom_provider_config

    cfg = request.app.state.config
    registry = request.app.state.registry
    existing = cfg.get_provider(cp.id)
    if existing is None:
        max_prio = max((p.priority for p in cfg.providers), default=0)
        try:
            pc = make_custom_provider_config(
                id=cp.id, name=cp.name, base_url=cp.base_url,
                api_key=cp.api_key, enabled=cp.enabled, priority=max_prio + 1,
            )
        except Exception as exc:
            logger.warning("invalid custom provider %s: %s", cp.id, exc)
            return
        cfg.providers.append(pc)
    else:
        existing.name = cp.name
        existing.base_url = cp.base_url.rstrip("/")
        existing.api_keys = [cp.api_key] if cp.api_key else []
        existing.requires_key = bool(cp.api_key)
        existing.enabled = cp.enabled
    await registry.register_custom_models(cp.id, cp.models)


async def _unsync_custom(request: Request, cp_id: str) -> None:
    cfg = request.app.state.config
    cfg.providers = [p for p in cfg.providers if p.id != cp_id]
    await request.app.state.registry.unregister_provider_models(cp_id)


# ---------------------------------------------------------------------------
# Unified key
# ---------------------------------------------------------------------------


@router.get("/unified-key")
async def unified_key(request: Request) -> dict:
    store = request.app.state.keystore
    cfg = request.app.state.config
    key = await store.get_unified_key()
    host = cfg.app.host if cfg.app.host not in ("0.0.0.0", "") else "localhost"
    return {
        "key": key,
        "base_url": f"http://{host}:{cfg.app.port}/v1",
        "endpoints": {
            "chat": "/v1/chat/completions",
            "completions": "/v1/completions",
            "embeddings": "/v1/embeddings",
            "models": "/v1/models",
        },
    }


@router.post("/unified-key/regenerate")
async def regenerate_unified_key(request: Request) -> dict:
    store = request.app.state.keystore
    key = await store.regenerate_unified_key()
    return {"key": key}


# ---------------------------------------------------------------------------
# Supported providers (for the dropdown)
# ---------------------------------------------------------------------------


@router.get("/supported-providers")
async def supported_providers(request: Request) -> dict:
    cfg = request.app.state.config
    return {
        "providers": [
            {
                "id": p.id,
                "name": p.name,
                "category": p.category,
                "requires_key": p.requires_key,
                "key_free": p.key_free,
                "get_key_url": get_key_url(p.id),
            }
            for p in cfg.providers
            if "custom" not in p.tags
        ]
    }


# ---------------------------------------------------------------------------
# Configured keys (grouped)
# ---------------------------------------------------------------------------


@router.get("/keys")
async def list_keys(request: Request) -> dict:
    store = request.app.state.keystore
    cfg = request.app.state.config

    groups = []
    # Built-in providers (custom ones are listed separately below).
    for p in cfg.providers:
        if "custom" in p.tags:
            continue
        keys = await store.list_keys(p.id)
        # Show a group if it has keys, OR if it's a keyless provider (so the
        # user can see it's active without any setup).
        if not keys and p.requires_key:
            continue
        groups.append(
            {
                "provider_id": p.id,
                "name": p.name,
                "enabled": p.enabled,
                "is_custom": False,
                "requires_key": p.requires_key,
                "key_free": p.key_free,
                "get_key_url": get_key_url(p.id),
                "key_count": len(keys),
                "keys": [
                    {
                        "id": k.id,
                        "masked": _display_mask(k.api_key),
                        "label": k.label,
                        "enabled": k.enabled,
                        "status": k.last_status,
                        "latency_ms": k.last_latency_ms,
                        "last_checked": k.last_checked,
                    }
                    for k in keys
                ],
            }
        )

    # Custom providers.
    for cp in await store.list_custom_providers():
        groups.append(
            {
                "provider_id": cp.id,
                "name": cp.name,
                "enabled": cp.enabled,
                "is_custom": True,
                "get_key_url": None,
                "base_url": cp.base_url,
                "models": cp.models,
                "key_count": 1,
                "keys": [
                    {
                        "id": cp.id,
                        "masked": _display_mask(cp.api_key) if cp.api_key else "no key",
                        "label": "custom endpoint",
                        "enabled": cp.enabled,
                        "status": cp.last_status,
                        "latency_ms": cp.last_latency_ms,
                        "last_checked": cp.last_checked,
                    }
                ],
            }
        )

    return {"groups": groups}


@router.post("/keys")
async def add_key(body: AddKeyBody, request: Request) -> dict:
    store = request.app.state.keystore
    cfg = request.app.state.config
    if cfg.get_provider(body.provider_id) is None:
        raise HTTPException(404, f"unknown provider {body.provider_id!r}")
    if not body.api_key.strip():
        raise HTTPException(400, "api_key must not be empty")

    entry = await store.add_key(body.provider_id, body.api_key.strip(), body.label)
    # Ensure the provider is enabled when a key is added.
    provider = cfg.get_provider(body.provider_id)
    if provider and not provider.enabled:
        provider.enabled = True
        await store.set_provider_enabled(body.provider_id, True)
    await _rediscover(request)
    return {"id": entry.id, "status": "added"}


@router.patch("/keys/{key_id}")
async def edit_label(key_id: str, body: EditLabelBody, request: Request) -> dict:
    # STRICT: only the label is editable, never the key itself.
    store = request.app.state.keystore
    ok = await store.update_label(key_id, body.label)
    if not ok:
        raise HTTPException(404, "key not found")
    return {"status": "updated"}


@router.patch("/keys/{key_id}/enabled")
async def toggle_key(key_id: str, body: ToggleBody, request: Request) -> dict:
    store = request.app.state.keystore
    ok = await store.set_key_enabled(key_id, body.enabled)
    if not ok:
        raise HTTPException(404, "key not found")
    return {"status": "ok"}


@router.delete("/keys/{key_id}")
async def remove_key(key_id: str, request: Request) -> dict:
    store = request.app.state.keystore
    ok = await store.delete_key(key_id)
    if not ok:
        raise HTTPException(404, "key not found")
    await _rediscover(request)
    return {"status": "removed"}


@router.post("/keys/{key_id}/check")
async def check_key(key_id: str, request: Request) -> dict:
    store = request.app.state.keystore
    entry = await store.get_key(key_id)
    if entry is None:
        raise HTTPException(404, "key not found")
    base_url = _base_url_for(request, entry.provider_id)
    if not base_url:
        raise HTTPException(400, "provider base_url unknown")
    status, latency = await _check_key(base_url, entry.api_key)
    await store.record_health(key_id, status, latency)
    return {"id": key_id, "status": status, "latency_ms": latency}


@router.post("/keys/check-all")
async def check_all(request: Request) -> dict:
    store = request.app.state.keystore
    results = []
    for entry in await store.list_keys():
        base_url = _base_url_for(request, entry.provider_id)
        if not base_url:
            continue
        status, latency = await _check_key(base_url, entry.api_key)
        await store.record_health(entry.id, status, latency)
        results.append({"id": entry.id, "status": status, "latency_ms": latency})
    # Also check custom providers.
    for cp in await store.list_custom_providers():
        status, latency = await _check_key(cp.base_url, cp.api_key)
        await store.record_custom_health(cp.id, status, latency)
        results.append({"id": cp.id, "status": status, "latency_ms": latency})
    return {"checked": len(results), "results": results}


# ---------------------------------------------------------------------------
# Provider enable/disable
# ---------------------------------------------------------------------------


@router.patch("/providers/{provider_id}/enabled")
async def set_provider_enabled(provider_id: str, body: ToggleBody, request: Request) -> dict:
    store = request.app.state.keystore
    cfg = request.app.state.config
    provider = cfg.get_provider(provider_id)
    if provider is None:
        raise HTTPException(404, f"unknown provider {provider_id!r}")
    provider.enabled = body.enabled
    await store.set_provider_enabled(provider_id, body.enabled)
    if body.enabled:
        await _rediscover(request)
    return {"status": "ok", "enabled": body.enabled}


# ---------------------------------------------------------------------------
# Custom providers
# ---------------------------------------------------------------------------


@router.post("/custom-providers")
async def add_custom_provider(body: CustomProviderBody, request: Request) -> dict:
    store = request.app.state.keystore
    if not body.base_url.strip():
        raise HTTPException(400, "base_url is required")
    models = [m.strip() for m in body.models if m and m.strip()]
    if not models:
        raise HTTPException(400, "at least one model is required")
    cp = await store.add_custom_provider(
        body.name.strip(), body.base_url.strip(), models, body.api_key.strip()
    )
    await _sync_custom_into_config(request, cp)
    return {"id": cp.id, "status": "added"}


@router.patch("/custom-providers/{cp_id}/enabled")
async def toggle_custom_provider(cp_id: str, body: ToggleBody, request: Request) -> dict:
    store = request.app.state.keystore
    ok = await store.set_custom_provider_enabled(cp_id, body.enabled)
    if not ok:
        raise HTTPException(404, "custom provider not found")
    cp = next(
        (c for c in await store.list_custom_providers() if c.id == cp_id), None
    )
    if cp is not None:
        await _sync_custom_into_config(request, cp)
    return {"status": "ok"}


@router.delete("/custom-providers/{cp_id}")
async def remove_custom_provider(cp_id: str, request: Request) -> dict:
    store = request.app.state.keystore
    ok = await store.delete_custom_provider(cp_id)
    if not ok:
        raise HTTPException(404, "custom provider not found")
    await _unsync_custom(request, cp_id)
    return {"status": "removed"}


@router.post("/custom-providers/{cp_id}/check")
async def check_custom_provider(cp_id: str, request: Request) -> dict:
    """Health-check a custom OpenAI-compatible endpoint by pinging /models."""
    store = request.app.state.keystore
    cp = next(
        (c for c in await store.list_custom_providers() if c.id == cp_id), None
    )
    if cp is None:
        raise HTTPException(404, "custom provider not found")
    status, latency = await _check_key(cp.base_url, cp.api_key)
    await store.record_custom_health(cp_id, status, latency)
    return {"id": cp_id, "status": status, "latency_ms": latency}
