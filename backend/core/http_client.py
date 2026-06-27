"""
Pooled async HTTP client management for NexusLLM.

`HTTPClientManager` owns one long-lived ``httpx.AsyncClient`` per provider so
connection pools and keep-alive sockets are reused across requests. Clients are
created lazily on first use and during :meth:`startup`, and torn down cleanly in
:meth:`shutdown` (wired into the FastAPI ``lifespan``).

API keys are never logged in full: see :func:`mask_api_key`.
"""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

import httpx

if TYPE_CHECKING:  # avoid an import cycle at runtime; only needed for typing.
    from core.config import NexusLLMConfig, ProviderConfig

logger = logging.getLogger("nexusllm.http_client")


def mask_api_key(key: str) -> str:
    """Return a log-safe representation of an API key.

    Shows a fixed ``sk-***`` prefix plus the last 4 characters so that
    different keys remain distinguishable in logs without ever exposing the
    secret. Very short or empty keys are fully masked.
    """
    if not key:
        return "sk-***(empty)"
    if len(key) <= 4:
        return "sk-***"
    return f"sk-***...{key[-4:]}"


class HTTPClientManager:
    """Manages one pooled ``httpx.AsyncClient`` per provider."""

    def __init__(
        self,
        config: "NexusLLMConfig",
        *,
        max_connections: int = 50,
        max_keepalive_connections: int = 20,
    ) -> None:
        self._config = config
        self._limits = httpx.Limits(
            max_connections=max_connections,
            max_keepalive_connections=max_keepalive_connections,
        )
        # Per-attempt timeout from routing config drives the read timeout.
        read_timeout = config.routing.per_attempt_timeout_seconds
        self._timeout = httpx.Timeout(
            connect=5.0,
            read=read_timeout,
            write=10.0,
            pool=2.0,
        )
        self._clients: dict[str, httpx.AsyncClient] = {}
        self._lock = asyncio.Lock()

    # -- lifecycle ----------------------------------------------------------

    async def startup(self) -> None:
        """Eagerly create clients for every enabled provider."""
        for provider in self._config.enabled_providers():
            await self._ensure_client(provider)
        logger.info(
            "HTTPClientManager initialized %d provider client(s).",
            len(self._clients),
        )

    async def shutdown(self) -> None:
        """Close all open clients and clear the pool."""
        async with self._lock:
            clients = list(self._clients.items())
            self._clients.clear()
        for provider_id, client in clients:
            try:
                await client.aclose()
            except Exception as exc:  # pragma: no cover - defensive cleanup.
                logger.warning(
                    "Error closing client for provider %s: %s", provider_id, exc
                )
        logger.info("HTTPClientManager shut down %d client(s).", len(clients))

    # -- accessors ----------------------------------------------------------

    async def get_client(self, provider_id: str) -> httpx.AsyncClient:
        """Return the pooled client for a provider, creating it if needed.

        Raises:
            KeyError: If the provider id is unknown or not enabled.
        """
        if (client := self._clients.get(provider_id)) is not None:
            return client

        provider = self._config.get_provider(provider_id)
        if provider is None:
            raise KeyError(f"unknown provider id: {provider_id!r}")
        if not provider.enabled:
            raise KeyError(f"provider is disabled: {provider_id!r}")
        return await self._ensure_client(provider)

    # -- internals ----------------------------------------------------------

    async def _ensure_client(self, provider: "ProviderConfig") -> httpx.AsyncClient:
        """Create (once) and cache a client for the given provider."""
        async with self._lock:
            if (existing := self._clients.get(provider.id)) is not None:
                return existing

            client = httpx.AsyncClient(
                base_url=provider.base_url,
                limits=self._limits,
                timeout=self._timeout,
                follow_redirects=True,
                headers={"User-Agent": "NexusLLM/1.0"},
            )
            self._clients[provider.id] = client
            masked = [mask_api_key(k) for k in provider.api_keys]
            logger.info(
                "Created HTTP client for provider %s (%s) base_url=%s keys=%s",
                provider.id,
                provider.name,
                provider.base_url,
                masked or "(none)",
            )
            return client
