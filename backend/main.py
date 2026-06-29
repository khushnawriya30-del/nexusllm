"""
NexusLLM FastAPI application entrypoint.

Wires together every component built across phases 1-5:

  * Config loading + env expansion          (core.config)
  * Pooled HTTP clients per provider         (core.http_client)
  * Circuit breaker registry                 (core.circuit_breaker)
  * Model registry + discovery + refresh     (core.registry)
  * Routing engine with intelligent fallback (core.routing)
  * Request log + in-memory metrics          (core.request_log, utils.metrics)
  * OpenAI-compatible + admin API routers     (api.*)

Run locally:  python main.py   ->  http://localhost:8080
"""

from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from api import admin, analytics, chat, completions, embeddings, keys, models
from core.circuit_breaker import CircuitBreakerConfig, CircuitBreakerRegistry
from core.config import ConfigError, NexusLLMConfig, load_config
from core.http_client import HTTPClientManager
from core.key_store import KeyStore
from core.registry import ModelRegistry
from core.request_log import RequestLogStore
from core.routing import RoutingEngine
from middleware.logging import AccessLogMiddleware
from utils.metrics import Metrics

logger = logging.getLogger("nexusllm")

# Load config once at import so CORS can be configured before the app serves.
try:
    _CONFIG: NexusLLMConfig = load_config("config.yaml")
except ConfigError as exc:  # pragma: no cover - surfaced at startup.
    logging.basicConfig(level="ERROR")
    logger.error("Failed to load config:\n%s", exc)
    raise


def _breaker_config(config: NexusLLMConfig) -> CircuitBreakerConfig:
    r = config.routing
    return CircuitBreakerConfig(
        failure_threshold=r.circuit_breaker_failure_threshold,
        failure_window_seconds=r.circuit_breaker_failure_window_seconds,
        open_duration_seconds=r.circuit_breaker_open_duration_seconds,
        success_threshold_half_open=r.circuit_breaker_success_threshold_half_open,
        max_open_duration_seconds=r.circuit_breaker_max_open_duration_seconds,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Build the component graph on startup, tear it down on shutdown."""
    logging.basicConfig(
        level=_CONFIG.app.log_level,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    http = HTTPClientManager(_CONFIG)
    await http.startup()

    breakers = CircuitBreakerRegistry(_breaker_config(_CONFIG))

    # Runtime key store: source of truth for keys at request time.
    # Prefer PERSISTENT Firestore when a Firebase service account is configured
    # (per-account keys then survive restarts/redeploys forever); otherwise use
    # local SQLite (ephemeral on Render's free tier).
    keystore = None
    keystore_backend = "sqlite"
    keystore_error = None
    from core.firestore_key_store import load_service_account

    sa = load_service_account()
    sa_detected = bool(sa)
    if sa:
        try:
            from core.firestore_key_store import FirestoreKeyStore

            fs = FirestoreKeyStore(sa, _CONFIG.app.firebase_project_id or None)
            await fs.init_db()
            keystore = fs
            keystore_backend = "firestore"
            logger.info("Using Firestore (persistent) key store.")
        except Exception as exc:
            keystore_error = f"{type(exc).__name__}: {exc}"[:300]
            logger.error(
                "Firestore key store init failed (%s); falling back to SQLite.",
                exc,
            )
            keystore = None
    if keystore is None:
        keystore = KeyStore(f"{_CONFIG.app.data_dir}/nexusllm.db")
        await keystore.init_db()
    await keystore.seed_from_config(_CONFIG.providers)
    # Apply persisted provider enable/disable overrides onto the live config.
    for pid, enabled in (await keystore.provider_overrides()).items():
        if (p := _CONFIG.get_provider(pid)) is not None:
            p.enabled = enabled

    registry = ModelRegistry(_CONFIG, http, keystore)
    metrics = Metrics()
    request_log = RequestLogStore(
        f"{_CONFIG.app.data_dir}/nexusllm.db",
        max_entries=_CONFIG.app.max_request_log_entries,
    )
    engine = RoutingEngine(
        _CONFIG, registry, breakers, http, metrics, keystore=keystore
    )

    await request_log.init_db()
    await registry.startup()  # init db, load, discover, start background refresh

    # Load user-defined custom providers into the live config + registry so
    # their models route and appear in /v1/models like built-in providers.
    from core.config import make_custom_provider_config

    try:
        customs = await keystore.all_custom_providers()
        base_prio = max((p.priority for p in _CONFIG.providers), default=0)
        for i, cp in enumerate(customs):
            if not cp.enabled:
                continue
            if _CONFIG.get_provider(cp.id) is None:
                try:
                    _CONFIG.providers.append(
                        make_custom_provider_config(
                            id=cp.id, name=cp.name, base_url=cp.base_url,
                            api_key=cp.api_key, enabled=cp.enabled,
                            priority=base_prio + 1 + i,
                        )
                    )
                except Exception as exc:
                    logger.warning("skip custom provider %s: %s", cp.id, exc)
                    continue
            await registry.register_custom_models(cp.id, cp.models)
    except Exception as exc:
        logger.warning("custom provider load failed: %s", exc)

    # Restore the saved Auto routing strategy order so it persists across
    # restarts and the playground's Auto mode follows it immediately.
    try:
        import json as _json
        raw = await keystore.get_meta("routing_strategy")
        if raw:
            order = (_json.loads(raw) or {}).get("order", [])
            if isinstance(order, list):
                registry.set_auto_order([m for m in order if isinstance(m, str)])
    except Exception as exc:
        logger.warning("routing strategy load failed: %s", exc)

    app.state.config = _CONFIG
    app.state.http = http
    app.state.breakers = breakers
    app.state.registry = registry
    app.state.metrics = metrics
    app.state.request_log = request_log
    app.state.keystore = keystore
    app.state.keystore_backend = keystore_backend
    app.state.keystore_error = keystore_error
    app.state.sa_detected = sa_detected
    app.state.engine = engine
    app.state.started_at = time.time()

    logger.info("NexusLLM ready on http://%s:%d", _CONFIG.app.host, _CONFIG.app.port)
    try:
        yield
    finally:
        await registry.shutdown()
        await http.shutdown()


app = FastAPI(
    title="NexusLLM",
    description="Free LLM API Manager, Gateway & Chat Playground",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(AccessLogMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in _CONFIG.app.cors_allowed_origins if o and o.strip()],
    # Allow any Vercel deployment (preview + production, incl. custom-named
    # projects like nexusllm.vercel.app) so the browser playground can stream
    # from the backend cross-origin without per-URL config.
    allow_origin_regex=r"https://([a-z0-9-]+\.)*vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "X-NexusLLM-Provider",
        "X-NexusLLM-Model",
        "X-NexusLLM-Fallback-Count",
        "X-NexusLLM-Request-ID",
    ],
)

# Routers.
app.include_router(chat.router)
app.include_router(models.router)
app.include_router(embeddings.router)
app.include_router(completions.router)
app.include_router(keys.router)
app.include_router(analytics.router)
app.include_router(admin.router)


@app.get("/")
async def root() -> dict:
    """Service info and endpoint index."""
    return {
        "service": "NexusLLM",
        "version": "0.1.0",
        "status": "ok",
        "docs": "/docs",
        "endpoints": {
            "health": "/health",
            "chat": "/v1/chat/completions",
            "models": "/v1/models",
            "embeddings": "/v1/embeddings",
            "completions": "/v1/completions",
            "admin_providers": "/admin/providers",
            "admin_metrics": "/admin/metrics",
            "admin_logs": "/admin/logs",
        },
    }


if __name__ == "__main__":  # pragma: no cover - convenience runner.
    import uvicorn

    uvicorn.run(
        "main:app",
        host=_CONFIG.app.host,
        port=_CONFIG.app.port,
        reload=False,
    )
