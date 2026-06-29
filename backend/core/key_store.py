"""
Runtime key store for NexusLLM.

Persists provider API keys, custom OpenAI-compatible providers, per-provider
enable/disable overrides, and the unified proxy key — all in SQLite so they
survive restarts and can be managed live from the Keys UI.

Multi-tenant: every row is scoped to a ``user_id`` (a "workspace"). Each
signed-in account (Firebase uid) gets its own fully-isolated set of keys,
custom providers, overrides and unified key. The default single-admin
deployment uses the reserved workspace id ``"default"`` so existing behaviour
is preserved when no per-user auth is in play.

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

DEFAULT_WORKSPACE = "default"


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
    """SQLite-backed, per-workspace storage for keys, custom providers, and
    the unified key."""

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
                    last_checked TEXT,
                    user_id TEXT NOT NULL DEFAULT 'default'
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
                    created_at TEXT NOT NULL,
                    last_status TEXT,
                    last_latency_ms REAL,
                    last_checked TEXT,
                    user_id TEXT NOT NULL DEFAULT 'default'
                )
                """
            )
            await db.execute(
                """
                CREATE TABLE IF NOT EXISTS provider_overrides (
                    user_id TEXT NOT NULL DEFAULT 'default',
                    provider_id TEXT NOT NULL,
                    enabled INTEGER NOT NULL,
                    PRIMARY KEY (user_id, provider_id)
                )
                """
            )
            await db.execute(
                """
                CREATE TABLE IF NOT EXISTS model_overrides (
                    user_id TEXT NOT NULL DEFAULT 'default',
                    provider_id TEXT NOT NULL,
                    model_id TEXT NOT NULL,
                    enabled INTEGER NOT NULL,
                    PRIMARY KEY (user_id, provider_id, model_id)
                )
                """
            )
            await db.execute(
                "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)"
            )
            await db.execute(
                """
                CREATE TABLE IF NOT EXISTS hidden_providers (
                    user_id TEXT NOT NULL DEFAULT 'default',
                    provider_id TEXT NOT NULL,
                    PRIMARY KEY (user_id, provider_id)
                )
                """
            )
            await self._migrate(db)
            await db.commit()

    # -- migrations ---------------------------------------------------------

    async def _migrate(self, db: aiosqlite.Connection) -> None:
        """Bring older databases up to the multi-tenant schema in place."""
        # 1) Add late columns to provider_keys / custom_providers.
        async with db.execute("PRAGMA table_info(provider_keys)") as cur:
            pcols = {row[1] for row in await cur.fetchall()}
        for col, ddl in (
            ("last_status", "TEXT"),
            ("last_latency_ms", "REAL"),
            ("last_checked", "TEXT"),
            ("user_id", "TEXT NOT NULL DEFAULT 'default'"),
        ):
            if col not in pcols:
                await db.execute(
                    f"ALTER TABLE provider_keys ADD COLUMN {col} {ddl}"
                )

        async with db.execute("PRAGMA table_info(custom_providers)") as cur:
            ccols = {row[1] for row in await cur.fetchall()}
        for col, ddl in (
            ("last_status", "TEXT"),
            ("last_latency_ms", "REAL"),
            ("last_checked", "TEXT"),
            ("user_id", "TEXT NOT NULL DEFAULT 'default'"),
        ):
            if col not in ccols:
                await db.execute(
                    f"ALTER TABLE custom_providers ADD COLUMN {col} {ddl}"
                )

        # 2) provider_overrides / hidden_providers / model_overrides may exist
        #    with the OLD single-tenant primary keys. Rebuild them with the
        #    composite (user_id, ...) PK, copying existing rows into 'default'.
        await self._rebuild_if_legacy(
            db,
            table="provider_overrides",
            pk_marker="user_id",
            create="""
                CREATE TABLE provider_overrides (
                    user_id TEXT NOT NULL DEFAULT 'default',
                    provider_id TEXT NOT NULL,
                    enabled INTEGER NOT NULL,
                    PRIMARY KEY (user_id, provider_id)
                )
            """,
            copy="INSERT INTO provider_overrides (user_id, provider_id, enabled) "
                 "SELECT 'default', provider_id, enabled FROM _old_provider_overrides",
        )
        await self._rebuild_if_legacy(
            db,
            table="hidden_providers",
            pk_marker="user_id",
            create="""
                CREATE TABLE hidden_providers (
                    user_id TEXT NOT NULL DEFAULT 'default',
                    provider_id TEXT NOT NULL,
                    PRIMARY KEY (user_id, provider_id)
                )
            """,
            copy="INSERT INTO hidden_providers (user_id, provider_id) "
                 "SELECT 'default', provider_id FROM _old_hidden_providers",
        )
        await self._rebuild_if_legacy(
            db,
            table="model_overrides",
            pk_marker="user_id",
            create="""
                CREATE TABLE model_overrides (
                    user_id TEXT NOT NULL DEFAULT 'default',
                    provider_id TEXT NOT NULL,
                    model_id TEXT NOT NULL,
                    enabled INTEGER NOT NULL,
                    PRIMARY KEY (user_id, provider_id, model_id)
                )
            """,
            copy="INSERT INTO model_overrides (user_id, provider_id, model_id, enabled) "
                 "SELECT 'default', provider_id, model_id, enabled FROM _old_model_overrides",
        )

        # 3) Legacy single unified key -> default workspace's key.
        async with db.execute(
            "SELECT value FROM meta WHERE key='unified_key'"
        ) as cur:
            row = await cur.fetchone()
        if row:
            await db.execute(
                "INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)",
                (f"unified_key:{DEFAULT_WORKSPACE}", row[0]),
            )
            await db.execute("DELETE FROM meta WHERE key='unified_key'")

    @staticmethod
    async def _rebuild_if_legacy(
        db: aiosqlite.Connection, *, table: str, pk_marker: str,
        create: str, copy: str,
    ) -> None:
        """If ``table`` lacks the ``pk_marker`` column, rebuild it via the given
        DDL and copy statement (legacy single-tenant -> multi-tenant)."""
        async with db.execute(f"PRAGMA table_info({table})") as cur:
            cols = {row[1] for row in await cur.fetchall()}
        if pk_marker in cols:
            return
        await db.execute(f"ALTER TABLE {table} RENAME TO _old_{table}")
        await db.execute(create)
        await db.execute(copy)
        await db.execute(f"DROP TABLE _old_{table}")

    # -- seeding ------------------------------------------------------------

    async def seed_from_config(
        self, providers, user_id: str = DEFAULT_WORKSPACE
    ) -> None:
        """Import any non-empty env-derived keys from config (deduped) into the
        given workspace (the admin/default workspace by default)."""
        async with aiosqlite.connect(self._db_path) as db:
            for p in providers:
                for raw in p.api_keys:
                    if not raw:
                        continue
                    async with db.execute(
                        "SELECT 1 FROM provider_keys "
                        "WHERE provider_id=? AND api_key=? AND user_id=?",
                        (p.id, raw, user_id),
                    ) as cur:
                        if await cur.fetchone():
                            continue
                    await db.execute(
                        """
                        INSERT INTO provider_keys
                        (id, provider_id, api_key, label, enabled, created_at, user_id)
                        VALUES (?, ?, ?, ?, 1, ?, ?)
                        """,
                        (uuid.uuid4().hex[:12], p.id, raw, "from .env", _now(), user_id),
                    )
            await db.commit()

    # -- unified key --------------------------------------------------------

    async def get_unified_key(self, user_id: str = DEFAULT_WORKSPACE) -> str:
        meta_key = f"unified_key:{user_id}"
        async with aiosqlite.connect(self._db_path) as db:
            async with db.execute(
                "SELECT value FROM meta WHERE key=?", (meta_key,)
            ) as cur:
                row = await cur.fetchone()
            if row:
                return row[0]
            key = self._generate_unified_key()
            await db.execute(
                "INSERT INTO meta (key, value) VALUES (?, ?)", (meta_key, key)
            )
            await db.commit()
            return key

    async def regenerate_unified_key(self, user_id: str = DEFAULT_WORKSPACE) -> str:
        meta_key = f"unified_key:{user_id}"
        key = self._generate_unified_key()
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                "INSERT INTO meta (key, value) VALUES (?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (meta_key, key),
            )
            await db.commit()
        return key

    async def user_for_unified_key(self, key: str) -> str | None:
        """Reverse-lookup: which workspace owns this unified key? Returns the
        workspace id, or None if the key is unknown."""
        if not key:
            return None
        async with aiosqlite.connect(self._db_path) as db:
            async with db.execute(
                "SELECT key FROM meta WHERE key LIKE 'unified_key:%' AND value=?",
                (key,),
            ) as cur:
                row = await cur.fetchone()
        if not row:
            return None
        return row[0].split(":", 1)[1]

    # -- generic meta key/value (global; used for routing strategy) ---------

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
        self, provider_id: str, api_key: str, label: str = "",
        user_id: str = DEFAULT_WORKSPACE,
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
                (id, provider_id, api_key, label, enabled, created_at, user_id)
                VALUES (?, ?, ?, ?, 1, ?, ?)
                """,
                (entry.id, provider_id, api_key, entry.label, entry.created_at, user_id),
            )
            await db.commit()
        return entry

    async def update_label(
        self, key_id: str, label: str, user_id: str = DEFAULT_WORKSPACE
    ) -> bool:
        async with aiosqlite.connect(self._db_path) as db:
            cur = await db.execute(
                "UPDATE provider_keys SET label=? WHERE id=? AND user_id=?",
                (label, key_id, user_id),
            )
            await db.commit()
            return cur.rowcount > 0

    async def update_key(
        self, key_id: str, api_key: str | None = None, label: str | None = None,
        user_id: str = DEFAULT_WORKSPACE,
    ) -> bool:
        """Update a key's secret value and/or its label (whichever is given)."""
        sets: list[str] = []
        params: list = []
        if api_key is not None:
            sets.append("api_key=?")
            params.append(api_key)
        if label is not None:
            sets.append("label=?")
            params.append(label)
        if not sets:
            return False
        params.extend([key_id, user_id])
        async with aiosqlite.connect(self._db_path) as db:
            cur = await db.execute(
                f"UPDATE provider_keys SET {', '.join(sets)} "
                "WHERE id=? AND user_id=?",
                params,
            )
            await db.commit()
            return cur.rowcount > 0

    async def set_key_enabled(
        self, key_id: str, enabled: bool, user_id: str = DEFAULT_WORKSPACE
    ) -> bool:
        async with aiosqlite.connect(self._db_path) as db:
            cur = await db.execute(
                "UPDATE provider_keys SET enabled=? WHERE id=? AND user_id=?",
                (1 if enabled else 0, key_id, user_id),
            )
            await db.commit()
            return cur.rowcount > 0

    async def delete_key(
        self, key_id: str, user_id: str = DEFAULT_WORKSPACE
    ) -> bool:
        async with aiosqlite.connect(self._db_path) as db:
            cur = await db.execute(
                "DELETE FROM provider_keys WHERE id=? AND user_id=?",
                (key_id, user_id),
            )
            await db.commit()
            return cur.rowcount > 0

    async def record_health(
        self, key_id: str, status: str, latency_ms: float | None,
        user_id: str | None = None,
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

    async def get_key(
        self, key_id: str, user_id: str | None = None
    ) -> KeyEntry | None:
        query = "SELECT * FROM provider_keys WHERE id=?"
        params: tuple = (key_id,)
        if user_id is not None:
            query += " AND user_id=?"
            params = (key_id, user_id)
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(query, params) as cur:
                row = await cur.fetchone()
        return self._row_to_entry(row) if row else None

    async def list_keys(
        self, provider_id: str | None = None, user_id: str = DEFAULT_WORKSPACE
    ) -> list[KeyEntry]:
        query = "SELECT * FROM provider_keys WHERE user_id=?"
        params: list = [user_id]
        if provider_id:
            query += " AND provider_id=?"
            params.append(provider_id)
        query += " ORDER BY created_at ASC"
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(query, params) as cur:
                rows = await cur.fetchall()
        return [self._row_to_entry(r) for r in rows]

    async def enabled_keys(
        self, provider_id: str, user_id: str = DEFAULT_WORKSPACE
    ) -> list[KeyEntry]:
        return [k for k in await self.list_keys(provider_id, user_id) if k.enabled]

    async def any_enabled_key(self, provider_id: str) -> KeyEntry | None:
        """First enabled key for a provider across ALL workspaces.

        Model catalogues are provider-global (the same regardless of which
        key is used), so discovery can use any workspace's key to list a
        provider's models. Per-request ROUTING still uses only the requesting
        workspace's own keys, preserving isolation."""
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM provider_keys "
                "WHERE provider_id=? AND enabled=1 ORDER BY created_at ASC LIMIT 1",
                (provider_id,),
            ) as cur:
                row = await cur.fetchone()
        return self._row_to_entry(row) if row else None

    async def providers_with_any_key(self) -> set[str]:
        """Provider ids that have at least one enabled key in ANY workspace."""
        async with aiosqlite.connect(self._db_path) as db:
            async with db.execute(
                "SELECT DISTINCT provider_id FROM provider_keys WHERE enabled=1"
            ) as cur:
                rows = await cur.fetchall()
        return {r[0] for r in rows}

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

    async def set_provider_enabled(
        self, provider_id: str, enabled: bool, user_id: str = DEFAULT_WORKSPACE
    ) -> None:
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                """
                INSERT INTO provider_overrides (user_id, provider_id, enabled)
                VALUES (?, ?, ?)
                ON CONFLICT(user_id, provider_id) DO UPDATE SET enabled=excluded.enabled
                """,
                (user_id, provider_id, 1 if enabled else 0),
            )
            await db.commit()

    async def provider_overrides(
        self, user_id: str = DEFAULT_WORKSPACE
    ) -> dict[str, bool]:
        async with aiosqlite.connect(self._db_path) as db:
            async with db.execute(
                "SELECT provider_id, enabled FROM provider_overrides WHERE user_id=?",
                (user_id,),
            ) as cur:
                rows = await cur.fetchall()
        return {r[0]: bool(r[1]) for r in rows}

    # -- hidden (fully removed) providers ----------------------------------

    async def set_provider_hidden(
        self, provider_id: str, hidden: bool, user_id: str = DEFAULT_WORKSPACE
    ) -> None:
        async with aiosqlite.connect(self._db_path) as db:
            if hidden:
                await db.execute(
                    "INSERT OR IGNORE INTO hidden_providers (user_id, provider_id) "
                    "VALUES (?, ?)",
                    (user_id, provider_id),
                )
            else:
                await db.execute(
                    "DELETE FROM hidden_providers WHERE user_id=? AND provider_id=?",
                    (user_id, provider_id),
                )
            await db.commit()

    async def hidden_providers(self, user_id: str = DEFAULT_WORKSPACE) -> set[str]:
        async with aiosqlite.connect(self._db_path) as db:
            async with db.execute(
                "SELECT provider_id FROM hidden_providers WHERE user_id=?",
                (user_id,),
            ) as cur:
                rows = await cur.fetchall()
        return {r[0] for r in rows}

    # -- per-model enable/disable ------------------------------------------

    async def set_model_enabled(
        self, provider_id: str, model_id: str, enabled: bool,
        user_id: str = DEFAULT_WORKSPACE,
    ) -> None:
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                """
                INSERT INTO model_overrides (user_id, provider_id, model_id, enabled)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id, provider_id, model_id)
                DO UPDATE SET enabled=excluded.enabled
                """,
                (user_id, provider_id, model_id, 1 if enabled else 0),
            )
            await db.commit()

    async def model_overrides(
        self, user_id: str = DEFAULT_WORKSPACE
    ) -> dict[tuple[str, str], bool]:
        async with aiosqlite.connect(self._db_path) as db:
            async with db.execute(
                "SELECT provider_id, model_id, enabled FROM model_overrides "
                "WHERE user_id=?",
                (user_id,),
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
        user_id: str = DEFAULT_WORKSPACE,
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
                (id, name, base_url, models_json, api_key, enabled, created_at, user_id)
                VALUES (?, ?, ?, ?, ?, 1, ?, ?)
                """,
                (cp.id, cp.name, cp.base_url, json.dumps(cp.models),
                 cp.api_key, cp.created_at, user_id),
            )
            await db.commit()
        return cp

    async def list_custom_providers(
        self, user_id: str = DEFAULT_WORKSPACE
    ) -> list[CustomProvider]:
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM custom_providers WHERE user_id=? ORDER BY created_at ASC",
                (user_id,),
            ) as cur:
                rows = await cur.fetchall()
        return [self._row_to_custom(r) for r in rows]

    async def all_custom_providers(self) -> list[CustomProvider]:
        """Every custom provider across ALL workspaces (used at startup to load
        them into the live config + registry)."""
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM custom_providers ORDER BY created_at ASC"
            ) as cur:
                rows = await cur.fetchall()
        return [self._row_to_custom(r) for r in rows]

    @staticmethod
    def _row_to_custom(r) -> CustomProvider:
        return CustomProvider(
            id=r["id"], name=r["name"], base_url=r["base_url"],
            models=json.loads(r["models_json"]),
            api_key=r["api_key"] or "", enabled=bool(r["enabled"]),
            created_at=r["created_at"],
            last_status=r["last_status"] if "last_status" in r.keys() else None,
            last_latency_ms=r["last_latency_ms"] if "last_latency_ms" in r.keys() else None,
            last_checked=r["last_checked"] if "last_checked" in r.keys() else None,
        )

    async def record_custom_health(
        self, cp_id: str, status: str, latency_ms: float | None,
        user_id: str | None = None,
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

    async def set_custom_provider_enabled(
        self, cp_id: str, enabled: bool, user_id: str = DEFAULT_WORKSPACE
    ) -> bool:
        async with aiosqlite.connect(self._db_path) as db:
            cur = await db.execute(
                "UPDATE custom_providers SET enabled=? WHERE id=? AND user_id=?",
                (1 if enabled else 0, cp_id, user_id),
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
        user_id: str = DEFAULT_WORKSPACE,
    ) -> "CustomProvider | None":
        """Edit a custom provider in place. Any field left as None is kept;
        an empty-string api_key means 'no key'. Returns the updated provider."""
        existing = next(
            (c for c in await self.list_custom_providers(user_id) if c.id == cp_id),
            None,
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
                WHERE id=? AND user_id=?
                """,
                (new_name, new_base, json.dumps(new_models), new_key, cp_id, user_id),
            )
            await db.commit()
        existing.name = new_name
        existing.base_url = new_base
        existing.models = new_models
        existing.api_key = new_key
        return existing

    async def delete_custom_provider(
        self, cp_id: str, user_id: str = DEFAULT_WORKSPACE
    ) -> bool:
        async with aiosqlite.connect(self._db_path) as db:
            cur = await db.execute(
                "DELETE FROM custom_providers WHERE id=? AND user_id=?",
                (cp_id, user_id),
            )
            await db.commit()
            return cur.rowcount > 0
