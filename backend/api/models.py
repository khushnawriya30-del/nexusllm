"""GET /v1/models — unified, alias-based model list in OpenAI format."""

from __future__ import annotations

import time

from fastapi import APIRouter, Depends, Request

from core.registry import ModelRegistry
from middleware.auth import require_proxy

router = APIRouter(prefix="/v1", tags=["models"])


@router.get("/models", dependencies=[Depends(require_proxy)])
async def list_models(request: Request) -> dict:
    """List models, restricted to providers that currently have enabled keys.

    With no keys configured this returns an empty list — models only appear
    after a key is added and the system discovers that provider's catalogue.
    """
    config = request.app.state.config
    registry: ModelRegistry = request.app.state.registry
    keystore = request.app.state.keystore
    created = int(getattr(request.app.state, "started_at", time.time()))

    # Providers usable right now: a key-store key, a config key (custom
    # providers carry theirs there), or no key needed at all.
    keyed_providers: set[str] = set()
    for p in config.enabled_providers():
        if (
            await keystore.enabled_keys(p.id)
            or p.api_keys
            or not p.requires_key
        ):
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
