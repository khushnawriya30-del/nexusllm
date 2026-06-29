"""
Runtime key store for NexusLLM.

Persists provider API keys, custom OpenAI-compatible providers, per-provider
enable/disable overrides, and the unified proxy key — all in SQLite so they
survive restarts and can be managed live from the Keys UI.

The routing engine and model registry read keys from here (not from static
config) so adding/removing a key takes effect immediately.
"""

from __future__ import annotations

import json
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import aiosqlite


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class KeyEntry:
    id: str
    provider_id: str
    api_key: str
    label: str
    enabled: bool
    created_at: str
    last_status: str | None  # "healthy" | "unhealthy" | None (unchecked)
    last_latency_ms: float | None
    last_checked: str | None


@dataclass
class CustomProvider:
    id: str
    name: str
    base_url: str
    models: list[str]
    api_key: str
    enabled: bool
    created_at: str
    last_status: str | None = None
    last_latency_ms: float | None = None
    last_checked: str | None = None


class KeyStore:
    """SQLite-backed storage for keys, custom providers, and the unified key."""

    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)

    async def init_db(self) -> None:
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                """
                CREATE TABLE IF NOT EXISTS provider_keys (
                    id TEXT PRIMARY KEY,
                    provider_id TEXT NOT NULL,
                    api_key TEXT NOT NULL,
                    label TEXT,
                    enabled INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    last_status TEXT,
                    last_latency_ms REAL,
                    last_checked TEXT
                )
                """
            )
            await db.execute(
                """
                CREATE TABLE IF NOT EXISTS custom_providers (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    base_url TEXT NOT NULL,
                    models_json TEXT NOT NULL,
                    api_key TEXT,
                    enabled INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL
                )
                """
            )
            await db.execute(
                """
                CREATE TABLE IF NOT EXISTS provider_overrides (
                    provider_id TEXT PRIMARY KEY,
                    enabled INTEGER NOT NULL
                )
                """
            )
            await db.execute(
                """
                CREATE TABLE IF NOT EXISTS model_overrides (
                    provider_id TEXT NOT NULL,
                    model_id TEXT NOT NULL,
                    enabled INTEGER NOT NULL,
                    PRIMARY KEY (provider_id, model_id)
                )
                """
            )
            await db.execute(
                "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)"
            )
            # Migration: persist custom-provider health so the status survives
            # page navigations (no need to re-click Check every time).
            async with db.execute("PRAGMA table_info(custom_providers)") as cur:
                ccols = {row[1] for row in await cur.fetchall()}
            for col, ddl in (
                ("last_status", "TEXT"),
                ("last_latency_ms", "REAL"),
                ("last_checked", "TEXT"),
            ):
                if col not in ccols:
                    await db.execute(
                        f"ALTER TABLE custom_providers ADD COLUMN {col} {ddl}"
                    )
            await db.commit()

    # -- seeding ------------------------------------------------------------

    async def seed_from_config(self, providers) -> None:
        """Import any non-empty env-derived keys from config (deduped)."""
        async with aiosqlite.connect(self._db_path) as db:
            for p in providers:
                for raw in p.api_keys:
                    if not raw:
                        continue
                    async with db.execute(
                        "SELECT 1 FROM provider_keys WHERE provider_id=? AND api_key=?",
                        (p.id, raw),
                    ) as cur:
                        if await cur.fetchone():
                            continue
                    await db.execute(
                        """
                        INSERT INTO provider_keys
                        (id, provider_id, api_key, label, enabled, created_at)
                        VALUES (?, ?, ?, ?, 1, ?)
                        """,
                        (uuid.uuid4().hex[:12], p.id, raw, "from .env", _now()),
                    )
            await db.commit()

    # -- unified key --------------------------------------------------------

    async def get_unified_key(self) -> str:
        async with aiosqlite.connect(self._db_path) as db:
            async with db.execute(
                "SELECT value FROM meta WHERE key='unified_key'"
            ) as cur:
                row = await cur.fetchone()
            if row:
                return row[0]
            key = self._generate_unified_key()
            await db.execute(
                "INSERT INTO meta (key, value) VALUES ('unified_key', ?)", (key,)
            )
            await db.commit()
            return key

    async def regenerate_unified_key(self) -> str:
        key = self._generate_unified_key()
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                "INSERT INTO meta (key, value) VALUES ('unified_key', ?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (key,),
            )
            await db.commit()
        return key

    # -- generic meta key/value (used for routing strategy persistence) -----

    async def get_meta(self, key: str) -> str | None:
        async with aiosqlite.connect(self._db_path) as db:
            async with db.execute(
                "SELECT value FROM meta WHERE key=?", (key,)
            ) as cur:
                row = await cur.fetchone()
        return row[0] if row else None

    async def set_meta(self, key: str, value: str) -> None:
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                "INSERT INTO meta (key, value) VALUES (?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (key, value),
            )
            await db.commit()


    @staticmethod
    def _generate_unified_key() -> str:
        return "nexus-" + secrets.token_hex(20)

    # -- provider keys ------------------------------------------------------

    async def add_key(
        self, provider_id: str, api_key: str, label: str = ""
    ) -> KeyEntry:
        entry = KeyEntry(
            id=uuid.uuid4().hex[:12],
            provider_id=provider_id,
            api_key=api_key,
            label=label or "",
            enabled=True,
            created_at=_now(),
            last_status=None,
            last_latency_ms=None,
            last_checked=None,
        )
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                """
                INSERT INTO provider_keys
                (id, provider_id, api_key, label, enabled, created_at)
                VALUES (?, ?, ?, ?, 1, ?)
                """,
                (entry.id, provider_id, api_key, entry.label, entry.created_at),
            )
            await db.commit()
        return entry

    async def update_label(self, key_id: str, label: str) -> bool:
        async with aiosqlite.connect(self._db_path) as db:
            cur = await db.execute(
                "UPDATE provider_keys SET label=? WHERE id=?", (label, key_id)
            )
            await db.commit()
            return cur.rowcount > 0

    async def set_key_enabled(self, key_id: str, enabled: bool) -> bool:
        async with aiosqlite.connect(self._db_path) as db:
            cur = await db.execute(
                "UPDATE provider_keys SET enabled=? WHERE id=?",
                (1 if enabled else 0, key_id),
            )
            await db.commit()
            return cur.rowcount > 0

    async def delete_key(self, key_id: str) -> bool:
        async with aiosqlite.connect(self._db_path) as db:
            cur = await db.execute(
                "DELETE FROM provider_keys WHERE id=?", (key_id,)
            )
            await db.commit()
            return cur.rowcount > 0

    async def record_health(
        self, key_id: str, status: str, latency_ms: float | None
    ) -> None:
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                """
                UPDATE provider_keys
                SET last_status=?, last_latency_ms=?, last_checked=?
                WHERE id=?
                """,
                (status, latency_ms, _now(), key_id),
            )
            await db.commit()

    async def get_key(self, key_id: str) -> KeyEntry | None:
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM provider_keys WHERE id=?", (key_id,)
            ) as cur:
                row = await cur.fetchone()
        return self._row_to_entry(row) if row else None

    async def list_keys(self, provider_id: str | None = None) -> list[KeyEntry]:
        query = "SELECT * FROM provider_keys"
        params: tuple = ()
        if provider_id:
            query += " WHERE provider_id=?"
            params = (provider_id,)
        query += " ORDER BY created_at ASC"
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(query, params) as cur:
                rows = await cur.fetchall()
        return [self._row_to_entry(r) for r in rows]

    async def enabled_keys(self, provider_id: str) -> list[KeyEntry]:
        return [k for k in await self.list_keys(provider_id) if k.enabled]

    @staticmethod
    def _row_to_entry(row) -> KeyEntry:
        return KeyEntry(
            id=row["id"],
            provider_id=row["provider_id"],
            api_key=row["api_key"],
            label=row["label"] or "",
            enabled=bool(row["enabled"]),
            created_at=row["created_at"],
            last_status=row["last_status"],
            last_latency_ms=row["last_latency_ms"],
            last_checked=row["last_checked"],
        )

    # -- provider enable/disable -------------------------------------------

    async def set_provider_enabled(self, provider_id: str, enabled: bool) -> None:
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                """
                INSERT INTO provider_overrides (provider_id, enabled)
                VALUES (?, ?)
                ON CONFLICT(provider_id) DO UPDATE SET enabled=excluded.enabled
                """,
                (provider_id, 1 if enabled else 0),
            )
            await db.commit()

    async def provider_overrides(self) -> dict[str, bool]:
        async with aiosqlite.connect(self._db_path) as db:
            async with db.execute(
                "SELECT provider_id, enabled FROM provider_overrides"
            ) as cur:
                rows = await cur.fetchall()
        return {r[0]: bool(r[1]) for r in rows}

    # -- per-model enable/disable ------------------------------------------

    async def set_model_enabled(
        self, provider_id: str, model_id: str, enabled: bool
    ) -> None:
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                """
                INSERT INTO model_overrides (provider_id, model_id, enabled)
                VALUES (?, ?, ?)
                ON CONFLICT(provider_id, model_id) DO UPDATE SET enabled=excluded.enabled
                """,
                (provider_id, model_id, 1 if enabled else 0),
            )
            await db.commit()

    async def model_overrides(self) -> dict[tuple[str, str], bool]:
        async with aiosqlite.connect(self._db_path) as db:
            async with db.execute(
                "SELECT provider_id, model_id, enabled FROM model_overrides"
            ) as cur:
                rows = await cur.fetchall()
        return {(r[0], r[1]): bool(r[2]) for r in rows}

    # -- custom providers ---------------------------------------------------

    async def add_custom_provider(
        self,
        name: str,
        base_url: str,
        models: list[str],
        api_key: str = "",
    ) -> CustomProvider:
        cp = CustomProvider(
            id="custom_" + uuid.uuid4().hex[:8],
            name=name or base_url,
            base_url=base_url.rstrip("/"),
            models=models,
            api_key=api_key or "",
            enabled=True,
            created_at=_now(),
        )
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                """
                INSERT INTO custom_providers
                (id, name, base_url, models_json, api_key, enabled, created_at)
                VALUES (?, ?, ?, ?, ?, 1, ?)
                """,
                (cp.id, cp.name, cp.base_url, json.dumps(cp.models),
                 cp.api_key, cp.created_at),
            )
            await db.commit()
        return cp

    async def list_custom_providers(self) -> list[CustomProvider]:
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM custom_providers ORDER BY created_at ASC"
            ) as cur:
                rows = await cur.fetchall()
        return [
            CustomProvider(
                id=r["id"], name=r["name"], base_url=r["base_url"],
                models=json.loads(r["models_json"]),
                api_key=r["api_key"] or "", enabled=bool(r["enabled"]),
                created_at=r["created_at"],
                last_status=r["last_status"] if "last_status" in r.keys() else None,
                last_latency_ms=r["last_latency_ms"] if "last_latency_ms" in r.keys() else None,
                last_checked=r["last_checked"] if "last_checked" in r.keys() else None,
            )
            for r in rows
        ]

    async def record_custom_health(
        self, cp_id: str, status: str, latency_ms: float | None
    ) -> None:
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                """
                UPDATE custom_providers
                SET last_status=?, last_latency_ms=?, last_checked=?
                WHERE id=?
                """,
                (status, latency_ms, _now(), cp_id),
            )
            await db.commit()

    async def set_custom_provider_enabled(self, cp_id: str, enabled: bool) -> bool:
        async with aiosqlite.connect(self._db_path) as db:
            cur = await db.execute(
                "UPDATE custom_providers SET enabled=? WHERE id=?",
                (1 if enabled else 0, cp_id),
            )
            await db.commit()
            return cur.rowcount > 0

    async def update_custom_provider(
        self,
        cp_id: str,
        name: str | None = None,
        base_url: str | None = None,
        models: list[str] | None = None,
        api_key: str | None = None,
    ) -> "CustomProvider | None":
        """Edit a custom provider in place. Any field left as None is kept;
        an empty-string api_key means 'no key'. Returns the updated provider."""
        existing = next(
            (c for c in await self.list_custom_providers() if c.id == cp_id), None
        )
        if existing is None:
            return None
        new_name = name if name is not None else existing.name
        new_base = base_url.rstrip("/") if base_url else existing.base_url
        new_models = models if models is not None else existing.models
        new_key = api_key if api_key is not None else existing.api_key
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                """
                UPDATE custom_providers
                SET name=?, base_url=?, models_json=?, api_key=?
                WHERE id=?
                """,
                (new_name, new_base, json.dumps(new_models), new_key, cp_id),
            )
            await db.commit()
        existing.name = new_name
        existing.base_url = new_base
        existing.models = new_models
        existing.api_key = new_key
        return existing

    async def delete_custom_provider(self, cp_id: str) -> bool:
        async with aiosqlite.connect(self._db_path) as db:
            cur = await db.execute(
                "DELETE FROM custom_providers WHERE id=?", (cp_id,)
            )
            await db.commit()
            return cur.rowcount > 0
