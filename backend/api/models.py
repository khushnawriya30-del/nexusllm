"""GET /v1/models — unified, alias-based model list in OpenAI format."""

from __future__ import annotations

import time

from fastapi import APIRouter, Depends, Request

from core.registry import ModelRegistry
from middleware.firebase_auth import resolve_proxy_workspace

router = APIRouter(prefix="/v1", tags=["models"])


@router.get("/models")
async def list_models(
    request: Request,
    user_id: str = Depends(resolve_proxy_workspace),
) -> dict:
    """List models, restricted to providers the caller's workspace can use.

    A workspace only sees models for providers it has its own enabled key for
    (or keyless providers). With no keys this returns an empty list — models
    only appear after the workspace adds a key and that provider is discovered.
    """
    config = request.app.state.config
    registry: ModelRegistry = request.app.state.registry
    keystore = request.app.state.keystore
    created = int(getattr(request.app.state, "started_at", time.time()))

    # Providers usable by THIS workspace: its own key-store key, or a keyless
    # built-in provider. Custom providers are visible only to the workspace
    # that created them.
    own_custom_ids = {c.id for c in await keystore.list_custom_providers(user_id)}
    keyed_providers: set[str] = set()
    for p in config.enabled_providers():
        if "custom" in (p.tags or []):
            if p.id in own_custom_ids:
                keyed_providers.add(p.id)
            continue
        if await keystore.enabled_keys(p.id, user_id) or not p.requires_key:
            keyed_providers.add(p.id)

    # Active, key-backed concrete models only (no stale/mock entries).
    active_models = [
        m
        for m in registry.all_models()
        if m.status == "active"
        and m.provider_id in keyed_providers
        and registry.is_enabled(m.provider_id, m.model_id)
    ]
    available_ids = {m.model_id for m in active_models}

    data = []

    # 0) Special routing modes — exposed so any OpenAI-compatible client (other
    # agents/IDEs) lists them and can route through them, just like a model.
    # Only when at least one real model is usable.
    if active_models:
        data.append({
            "id": "auto",
            "object": "model",
            "created": created,
            "owned_by": "nexusllm",
            "x-nexusllm": {
                "description": "Auto — routes to the best available model and "
                "fails over automatically if one errors.",
                "providers": [],
                "capabilities": ["chat"],
                "context_window": None,
                "rate_limits": None,
            },
        })
        data.append({
            "id": "fusion",
            "object": "model",
            "created": created,
            "owned_by": "nexusllm",
            "x-nexusllm": {
                "description": "Fusion — queries several models in parallel and "
                "synthesizes their answers into one.",
                "providers": [],
                "capabilities": ["chat"],
                "context_window": None,
                "rate_limits": None,
            },
        })

    # 1) Alias entries — only when at least one underlying model is available.
    for group in config.model_aliases:
        served = [mid for mid in group.models if mid in available_ids]
        if not served:
            continue
        providers: list[str] = []
        capabilities: set[str] = set()
        context_window = None
        for mid in served:
            for pid in registry.providers_for_model(mid):
                if pid in keyed_providers:
                    providers.append(pid)
            rec = next((m for m in active_models if m.model_id == mid), None)
            if rec:
                capabilities.update(rec.capabilities)
                context_window = context_window or rec.context_window
        data.append(
            {
                "id": group.alias,
                "object": "model",
                "created": created,
                "owned_by": "nexusllm",
                "x-nexusllm": {
                    "description": group.description,
                    "providers": sorted(set(providers)),
                    "underlying_models": served,
                    "capabilities": sorted(capabilities) or ["chat"],
                    "context_window": context_window,
                    "rate_limits": None,
                },
            }
        )

    # 2) Concrete discovered models from key-backed providers.
    for rec in active_models:
        data.append(
            {
                "id": rec.model_id,
                "object": "model",
                "created": created,
                "owned_by": rec.provider_id,
                "x-nexusllm": {
                    "providers": [rec.provider_id],
                    "capabilities": rec.capabilities,
                    "context_window": rec.context_window,
                    "rate_limits": rec.rate_limits.model_dump(exclude_none=True)
                    if rec.rate_limits
                    else None,
                },
            }
        )

    return {"object": "list", "data": data}
