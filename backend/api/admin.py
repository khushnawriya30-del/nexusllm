"""Admin + health endpoints: providers, models, reload, circuit reset, metrics, logs."""

from __future__ import annotations

import json
import logging
import time

from fastapi import APIRouter, Depends, HTTPException, Request

from core.circuit_breaker import CircuitBreakerRegistry
from core.config import ConfigError, load_config
from core.registry import ModelRegistry
from middleware.auth import require_admin

logger = logging.getLogger("nexusllm.api.admin")

router = APIRouter(tags=["admin"])

PROVIDER_COLORS = [
    "#6366f1", "#10b981", "#f59e0b", "#ef4444",
    "#8b5cf6", "#06b6d4", "#f97316", "#ec4899",
    "#14b8a6", "#84cc16", "#a855f7", "#3b82f6",
]


def color_for(provider_id: str) -> str:
    """Deterministic color assignment by provider id."""
    return PROVIDER_COLORS[sum(ord(c) for c in provider_id) % len(PROVIDER_COLORS)]


def _provider_weight(provider) -> float:
    """Resource weight for the dashboard bar (see UI spec F1)."""
    rl = provider.rate_limits
    keys = max(len(provider.api_keys), 1)
    if rl.tokens_per_day:
        return rl.tokens_per_day * keys
    if rl.tokens_per_minute:
        return rl.tokens_per_minute * 60 * 24 * keys
    if rl.requests_per_day:
        return rl.requests_per_day * 2000 * keys
    if rl.requests_per_minute:
        return rl.requests_per_minute * 60 * 24 * 2000 * keys
    return float(keys)


# ---------------------------------------------------------------------------
# Health (no auth)
# ---------------------------------------------------------------------------


@router.get("/health")
async def health(request: Request) -> dict:
    config = request.app.state.config
    started_at = getattr(request.app.state, "started_at", time.time())
    return {
        "status": "healthy",
        "uptime_seconds": round(time.time() - started_at, 1),
        "providers_enabled": len(config.enabled_providers()),
        "providers_total": len(config.providers),
        "alias_groups": len(config.model_aliases),
        "models_known": len(request.app.state.registry.all_models()),
    }


# ---------------------------------------------------------------------------
# Admin (auth required)
# ---------------------------------------------------------------------------


@router.get("/admin/providers", dependencies=[Depends(require_admin)])
async def providers(request: Request) -> dict:
    config = request.app.state.config
    registry: ModelRegistry = request.app.state.registry
    breakers: CircuitBreakerRegistry = request.app.state.breakers

    enabled = config.enabled_providers()
    weights = {p.id: _provider_weight(p) for p in enabled}
    keystore = request.app.state.keystore
    enabled_key_counts = {
        p.id: len(await keystore.enabled_keys(p.id)) for p in enabled
    }
    total = sum(weights.values()) or 1.0

    result = []
    for p in enabled:
        # Keyless providers (e.g. OVH) and custom providers (key in config)
        # surface models without a key-store entry.
        has_keys = (
            enabled_key_counts.get(p.id, 0) > 0
            or bool(p.api_keys)
            or not p.requires_key
        )
        models = registry.models_for_provider(p.id) if has_keys else []
        models = [m for m in models if m.status == "active"]
        latencies = [m.avg_latency_ms for m in models if m.avg_latency_ms]
        avg_latency = round(sum(latencies) / len(latencies), 1) if latencies else None
        result.append(
            {
                "id": p.id,
                "name": p.name,
                "category": p.category,
                "enabled": p.enabled,
                "key_count": enabled_key_counts.get(p.id, 0),
                "circuit_state": breakers.provider_state(p.id).value,
                "model_count": len(models),
                "models": [
                    {
                        "model_id": m.model_id,
                        "context_window": m.context_window,
                        "capabilities": m.capabilities,
                        "status": m.status,
                        "enabled": registry.is_enabled(p.id, m.model_id),
                        "avg_latency_ms": m.avg_latency_ms,
                        "rate_limits": m.rate_limits.model_dump(exclude_none=True)
                        if m.rate_limits
                        else None,
                    }
                    for m in models
                ],
                "daily_token_budget": p.rate_limits.tokens_per_day,
                "daily_request_budget": p.rate_limits.requests_per_day,
                "avg_latency_ms": avg_latency,
                "last_health_check": None,
                "color": color_for(p.id),
                "weight_percent": round(100 * weights[p.id] / total, 2),
                "tags": p.tags,
            }
        )
    return {"providers": result}


@router.get("/admin/models", dependencies=[Depends(require_admin)])
async def models(request: Request) -> dict:
    registry: ModelRegistry = request.app.state.registry
    return {
        "models": [m.model_dump(mode="json") for m in registry.all_models()],
    }


@router.patch("/admin/models/enabled", dependencies=[Depends(require_admin)])
async def set_model_enabled(request: Request) -> dict:
    """Enable/disable a single model. Disabled models are dropped from routing,
    /v1/models (Playground/API), and the token budget — but stay listed in the
    routing table so they can be toggled back on."""
    registry: ModelRegistry = request.app.state.registry
    body = await request.json()
    provider_id = body.get("provider_id")
    model_id = body.get("model_id")
    enabled = bool(body.get("enabled"))
    if not provider_id or not model_id:
        raise HTTPException(400, "provider_id and model_id are required")
    await registry.set_model_enabled(provider_id, model_id, enabled)
    return {"status": "ok", "provider_id": provider_id, "model_id": model_id,
            "enabled": enabled}


@router.get("/admin/routing-strategy", dependencies=[Depends(require_admin)])
async def get_routing_strategy(request: Request) -> dict:
    """Return the saved Auto routing strategy (persisted across restarts)."""
    keystore = request.app.state.keystore
    raw = await keystore.get_meta("routing_strategy")
    if not raw:
        return {"strategy": "Balanced", "weights": {"r": 50, "s": 25, "i": 25},
                "order": []}
    try:
        data = json.loads(raw)
    except Exception:
        data = {}
    return {
        "strategy": data.get("strategy", "Balanced"),
        "weights": data.get("weights", {"r": 50, "s": 25, "i": 25}),
        "order": data.get("order", []),
    }


@router.put("/admin/routing-strategy", dependencies=[Depends(require_admin)])
async def set_routing_strategy(request: Request) -> dict:
    """Persist the Auto routing strategy and apply its model order to routing.

    Body: {strategy, weights:{r,s,i}, order:[model_id,...]}. The ``order`` list
    is the exact sequence Auto/fallback (and Fusion's panel) will follow.
    """
    registry: ModelRegistry = request.app.state.registry
    keystore = request.app.state.keystore
    body = await request.json()
    strategy = body.get("strategy", "Balanced")
    weights = body.get("weights", {"r": 50, "s": 25, "i": 25})
    order = body.get("order", [])
    if not isinstance(order, list):
        raise HTTPException(400, "order must be a list of model ids")
    order = [str(m) for m in order if isinstance(m, str)]
    registry.set_auto_order(order)
    await keystore.set_meta(
        "routing_strategy",
        json.dumps({"strategy": strategy, "weights": weights, "order": order}),
    )
    return {"status": "ok", "strategy": strategy, "count": len(order)}


@router.post("/admin/reload", dependencies=[Depends(require_admin)])
async def reload_config(request: Request) -> dict:
    """Hot-reload config from disk and re-run model discovery."""
    try:
        new_config = load_config("config.yaml")
    except ConfigError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    request.app.state.config = new_config
    # Re-point dependent components at the new config.
    request.app.state.registry._config = new_config
    request.app.state.engine._config = new_config
    request.app.state.http._config = new_config
    await request.app.state.registry.discover_all()
    logger.info("Config hot-reloaded: %d providers.", len(new_config.providers))
    return {
        "status": "reloaded",
        "providers": len(new_config.providers),
        "enabled": len(new_config.enabled_providers()),
    }


@router.post("/admin/providers/{provider_id}/reset", dependencies=[Depends(require_admin)])
async def reset_circuit(provider_id: str, request: Request) -> dict:
    breakers: CircuitBreakerRegistry = request.app.state.breakers
    config = request.app.state.config
    if config.get_provider(provider_id) is None:
        raise HTTPException(status_code=404, detail=f"unknown provider {provider_id!r}")
    count = await breakers.reset(provider_id)
    return {"status": "reset", "provider": provider_id, "breakers_reset": count}


@router.get("/admin/metrics", dependencies=[Depends(require_admin)])
async def metrics(request: Request) -> dict:
    return request.app.state.metrics.snapshot()


@router.get("/admin/logs", dependencies=[Depends(require_admin)])
async def logs(request: Request, limit: int = 100, search: str | None = None) -> dict:
    store = getattr(request.app.state, "request_log", None)
    if store is None:
        return {"logs": []}
    entries = await store.recent(limit=min(limit, 1000), search=search)
    return {"logs": entries}


@router.get("/admin/circuit-breakers", dependencies=[Depends(require_admin)])
async def circuit_breakers(request: Request) -> dict:
    breakers: CircuitBreakerRegistry = request.app.state.breakers
    states = await breakers.get_all_states()
    return {
        "breakers": [
            {
                "provider_id": s.provider_id,
                "key_index": s.key_index,
                "state": s.state.value,
                "failure_count": s.failure_count,
                "consecutive_open_trips": s.consecutive_open_trips,
                "seconds_until_half_open": s.seconds_until_half_open,
            }
            for s in states
        ]
    }
