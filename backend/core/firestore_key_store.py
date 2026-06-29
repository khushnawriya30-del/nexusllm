"""
Firestore-backed key store — PERSISTENT per-account storage.

Drop-in replacement for the SQLite ``KeyStore`` so per-account keys, custom
providers, overrides and the unified key survive forever (server restarts,
redeploys, logout/login, days later) — solving Render's ephemeral-disk wipe.

Each workspace (Firebase uid, or ``"default"`` for the admin) is one Firestore
document at ``workspaces/{uid}`` holding all of that account's data. A tiny
top-level ``unified_keys/{key}`` collection maps a unified key back to its
owning workspace for O(1) /v1 proxy resolution.

Enabled only when a Firebase service account is configured
(``FIREBASE_SERVICE_ACCOUNT_JSON``); otherwise the app falls back to SQLite.
"""

from __future__ import annotations

import json
import os
import secrets
import uuid
from datetime import datetime, timezone

from core.key_store import CustomProvider, KeyEntry, DEFAULT_WORKSPACE


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_service_account() -> dict | None:
    """Read the Firebase service account from env (JSON string or file path).

    Supports ``FIREBASE_SERVICE_ACCOUNT_JSON`` (the JSON itself) or
    ``GOOGLE_APPLICATION_CREDENTIALS`` (a path to the JSON file). Returns the
    parsed dict, or None when not configured."""
    raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()
    if raw:
        try:
            return json.loads(raw)
        except Exception:
            return None
    path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
    if path and os.path.isfile(path):
        try:
            with open(path, "r", encoding="utf-8") as fh:
                return json.load(fh)
        except Exception:
            return None
    return None


class FirestoreKeyStore:
    """Persistent, per-workspace store mirroring the SQLite KeyStore API."""

    def __init__(self, service_account: dict, project_id: str | None = None) -> None:
        from google.cloud import firestore
        from google.oauth2 import service_account as sa

        creds = sa.Credentials.from_service_account_info(service_account)
        pid = project_id or service_account.get("project_id")
        self._db = firestore.AsyncClient(project=pid, credentials=creds)
        self._project_id = pid

    # -- workspace document helpers ----------------------------------------

    def _ws_ref(self, user_id: str):
        return self._db.collection("workspaces").document(user_id or DEFAULT_WORKSPACE)

    async def _load(self, user_id: str) -> dict:
        snap = await self._ws_ref(user_id).get()
        data = snap.to_dict() if snap and snap.exists else None
        if not data:
            data = {}
        data.setdefault("provider_keys", [])
        data.setdefault("custom_providers", [])
        data.setdefault("provider_overrides", {})
        data.setdefault("hidden_providers", [])
        data.setdefault("model_overrides", {})
        data.setdefault("unified_key", None)
        return data

    async def _save(self, user_id: str, data: dict) -> None:
        await self._ws_ref(user_id).set(data)

    # -- init / connectivity ------------------------------------------------

    async def init_db(self) -> None:
        # Schemaless — just verify connectivity so startup can fall back to
        # SQLite if Firestore is misconfigured.
        await self._db.collection("workspaces").document("__ping__").get()

    async def seed_from_config(
        self, providers, user_id: str = DEFAULT_WORKSPACE
    ) -> None:
        data = await self._load(user_id)
        existing = {(k["provider_id"], k["api_key"]) for k in data["provider_keys"]}
        changed = False
        for p in providers:
            for raw in p.api_keys:
                if not raw or (p.id, raw) in existing:
                    continue
                data["provider_keys"].append(self._new_key_dict(p.id, raw, "from .env"))
                existing.add((p.id, raw))
                changed = True
        if changed:
            await self._save(user_id, data)

    # -- unified key --------------------------------------------------------

    async def get_unified_key(self, user_id: str = DEFAULT_WORKSPACE) -> str:
        data = await self._load(user_id)
        if data.get("unified_key"):
            return data["unified_key"]
        key = self._generate_unified_key()
        data["unified_key"] = key
        await self._save(user_id, data)
        await self._db.collection("unified_keys").document(key).set({"uid": user_id})
        return key

    async def regenerate_unified_key(self, user_id: str = DEFAULT_WORKSPACE) -> str:
        data = await self._load(user_id)
        old = data.get("unified_key")
        key = self._generate_unified_key()
        data["unified_key"] = key
        await self._save(user_id, data)
        if old:
            try:
                await self._db.collection("unified_keys").document(old).delete()
            except Exception:
                pass
        await self._db.collection("unified_keys").document(key).set({"uid": user_id})
        return key

    async def user_for_unified_key(self, key: str) -> str | None:
        if not key:
            return None
        snap = await self._db.collection("unified_keys").document(key).get()
        if snap and snap.exists:
            return (snap.to_dict() or {}).get("uid")
        return None

    # -- generic meta (global; routing strategy) ---------------------------

    async def get_meta(self, key: str) -> str | None:
        snap = await self._db.collection("meta").document(key).get()
        if snap and snap.exists:
            return (snap.to_dict() or {}).get("value")
        return None

    async def set_meta(self, key: str, value: str) -> None:
        await self._db.collection("meta").document(key).set({"value": value})

    @staticmethod
    def _generate_unified_key() -> str:
        return "nexus-" + secrets.token_hex(20)

    # -- provider keys ------------------------------------------------------

    @staticmethod
    def _new_key_dict(provider_id: str, api_key: str, label: str) -> dict:
        return {
            "id": uuid.uuid4().hex[:12],
            "provider_id": provider_id,
            "api_key": api_key,
            "label": label or "",
            "enabled": True,
            "created_at": _now(),
            "last_status": None,
            "last_latency_ms": None,
            "last_checked": None,
        }

    @staticmethod
    def _key_entry(d: dict) -> KeyEntry:
        return KeyEntry(
            id=d["id"], provider_id=d["provider_id"], api_key=d["api_key"],
            label=d.get("label", ""), enabled=bool(d.get("enabled", True)),
            created_at=d.get("created_at", ""), last_status=d.get("last_status"),
            last_latency_ms=d.get("last_latency_ms"), last_checked=d.get("last_checked"),
        )

    async def add_key(
        self, provider_id: str, api_key: str, label: str = "",
        user_id: str = DEFAULT_WORKSPACE,
    ) -> KeyEntry:
        data = await self._load(user_id)
        d = self._new_key_dict(provider_id, api_key, label)
        data["provider_keys"].append(d)
        await self._save(user_id, data)
        return self._key_entry(d)

    async def update_label(
        self, key_id: str, label: str, user_id: str = DEFAULT_WORKSPACE
    ) -> bool:
        return await self.update_key(key_id, label=label, user_id=user_id)

    async def update_key(
        self, key_id: str, api_key: str | None = None, label: str | None = None,
        user_id: str = DEFAULT_WORKSPACE,
    ) -> bool:
        data = await self._load(user_id)
        found = False
        for k in data["provider_keys"]:
            if k["id"] == key_id:
                if api_key is not None:
                    k["api_key"] = api_key
                if label is not None:
                    k["label"] = label
                found = True
                break
        if found:
            await self._save(user_id, data)
        return found

    async def set_key_enabled(
        self, key_id: str, enabled: bool, user_id: str = DEFAULT_WORKSPACE
    ) -> bool:
        data = await self._load(user_id)
        found = False
        for k in data["provider_keys"]:
            if k["id"] == key_id:
                k["enabled"] = bool(enabled)
                found = True
                break
        if found:
            await self._save(user_id, data)
        return found

    async def delete_key(
        self, key_id: str, user_id: str = DEFAULT_WORKSPACE
    ) -> bool:
        data = await self._load(user_id)
        before = len(data["provider_keys"])
        data["provider_keys"] = [k for k in data["provider_keys"] if k["id"] != key_id]
        if len(data["provider_keys"]) == before:
            return False
        await self._save(user_id, data)
        return True

    async def record_health(
        self, key_id: str, status: str, latency_ms: float | None,
        user_id: str | None = None,
    ) -> None:
        if user_id is None:
            return  # Firestore needs the workspace; callers pass it.
        data = await self._load(user_id)
        for k in data["provider_keys"]:
            if k["id"] == key_id:
                k["last_status"] = status
                k["last_latency_ms"] = latency_ms
                k["last_checked"] = _now()
                await self._save(user_id, data)
                return

    async def get_key(
        self, key_id: str, user_id: str | None = None
    ) -> KeyEntry | None:
        if user_id is None:
            return None
        data = await self._load(user_id)
        for k in data["provider_keys"]:
            if k["id"] == key_id:
                return self._key_entry(k)
        return None

    async def list_keys(
        self, provider_id: str | None = None, user_id: str = DEFAULT_WORKSPACE
    ) -> list[KeyEntry]:
        data = await self._load(user_id)
        keys = data["provider_keys"]
        if provider_id:
            keys = [k for k in keys if k["provider_id"] == provider_id]
        keys = sorted(keys, key=lambda k: k.get("created_at", ""))
        return [self._key_entry(k) for k in keys]

    async def enabled_keys(
        self, provider_id: str, user_id: str = DEFAULT_WORKSPACE
    ) -> list[KeyEntry]:
        return [k for k in await self.list_keys(provider_id, user_id) if k.enabled]

    async def _all_workspaces(self) -> list[dict]:
        out: list[dict] = []
        async for doc in self._db.collection("workspaces").stream():
            d = doc.to_dict() or {}
            if doc.id == "__ping__":
                continue
            out.append(d)
        return out

    async def any_enabled_key(self, provider_id: str) -> KeyEntry | None:
        best: dict | None = None
        for d in await self._all_workspaces():
            for k in d.get("provider_keys", []):
                if k.get("provider_id") == provider_id and k.get("enabled", True):
                    if best is None or k.get("created_at", "") < best.get("created_at", ""):
                        best = k
        return self._key_entry(best) if best else None

    async def providers_with_any_key(self) -> set[str]:
        out: set[str] = set()
        for d in await self._all_workspaces():
            for k in d.get("provider_keys", []):
                if k.get("enabled", True):
                    out.add(k.get("provider_id"))
        return out

    # -- provider enable/disable -------------------------------------------

    async def set_provider_enabled(
        self, provider_id: str, enabled: bool, user_id: str = DEFAULT_WORKSPACE
    ) -> None:
        data = await self._load(user_id)
        data["provider_overrides"][provider_id] = bool(enabled)
        await self._save(user_id, data)

    async def provider_overrides(
        self, user_id: str = DEFAULT_WORKSPACE
    ) -> dict[str, bool]:
        data = await self._load(user_id)
        return {k: bool(v) for k, v in (data.get("provider_overrides") or {}).items()}

    # -- hidden providers ---------------------------------------------------

    async def set_provider_hidden(
        self, provider_id: str, hidden: bool, user_id: str = DEFAULT_WORKSPACE
    ) -> None:
        data = await self._load(user_id)
        cur = set(data.get("hidden_providers") or [])
        if hidden:
            cur.add(provider_id)
        else:
            cur.discard(provider_id)
        data["hidden_providers"] = sorted(cur)
        await self._save(user_id, data)

    async def hidden_providers(self, user_id: str = DEFAULT_WORKSPACE) -> set[str]:
        data = await self._load(user_id)
        return set(data.get("hidden_providers") or [])

    # -- per-model enable/disable ------------------------------------------

    async def set_model_enabled(
        self, provider_id: str, model_id: str, enabled: bool,
        user_id: str = DEFAULT_WORKSPACE,
    ) -> None:
        data = await self._load(user_id)
        data["model_overrides"][f"{provider_id}|{model_id}"] = bool(enabled)
        await self._save(user_id, data)

    async def model_overrides(
        self, user_id: str = DEFAULT_WORKSPACE
    ) -> dict[tuple[str, str], bool]:
        data = await self._load(user_id)
        out: dict[tuple[str, str], bool] = {}
        for k, v in (data.get("model_overrides") or {}).items():
            if "|" in k:
                pid, mid = k.split("|", 1)
                out[(pid, mid)] = bool(v)
        return out

    # -- custom providers ---------------------------------------------------

    @staticmethod
    def _custom(d: dict) -> CustomProvider:
        return CustomProvider(
            id=d["id"], name=d["name"], base_url=d["base_url"],
            models=d.get("models", []), api_key=d.get("api_key", ""),
            enabled=bool(d.get("enabled", True)), created_at=d.get("created_at", ""),
            last_status=d.get("last_status"), last_latency_ms=d.get("last_latency_ms"),
            last_checked=d.get("last_checked"),
        )

    async def add_custom_provider(
        self, name: str, base_url: str, models: list[str], api_key: str = "",
        user_id: str = DEFAULT_WORKSPACE,
    ) -> CustomProvider:
        data = await self._load(user_id)
        d = {
            "id": "custom_" + uuid.uuid4().hex[:8],
            "name": name or base_url,
            "base_url": base_url.rstrip("/"),
            "models": models,
            "api_key": api_key or "",
            "enabled": True,
            "created_at": _now(),
            "last_status": None,
            "last_latency_ms": None,
            "last_checked": None,
        }
        data["custom_providers"].append(d)
        await self._save(user_id, data)
        return self._custom(d)

    async def list_custom_providers(
        self, user_id: str = DEFAULT_WORKSPACE
    ) -> list[CustomProvider]:
        data = await self._load(user_id)
        cps = sorted(data.get("custom_providers", []), key=lambda c: c.get("created_at", ""))
        return [self._custom(c) for c in cps]

    async def all_custom_providers(self) -> list[CustomProvider]:
        out: list[CustomProvider] = []
        for d in await self._all_workspaces():
            for c in d.get("custom_providers", []):
                out.append(self._custom(c))
        return out

    async def record_custom_health(
        self, cp_id: str, status: str, latency_ms: float | None,
        user_id: str | None = None,
    ) -> None:
        if user_id is None:
            return
        data = await self._load(user_id)
        for c in data["custom_providers"]:
            if c["id"] == cp_id:
                c["last_status"] = status
                c["last_latency_ms"] = latency_ms
                c["last_checked"] = _now()
                await self._save(user_id, data)
                return

    async def set_custom_provider_enabled(
        self, cp_id: str, enabled: bool, user_id: str = DEFAULT_WORKSPACE
    ) -> bool:
        data = await self._load(user_id)
        for c in data["custom_providers"]:
            if c["id"] == cp_id:
                c["enabled"] = bool(enabled)
                await self._save(user_id, data)
                return True
        return False

    async def update_custom_provider(
        self, cp_id: str, name: str | None = None, base_url: str | None = None,
        models: list[str] | None = None, api_key: str | None = None,
        user_id: str = DEFAULT_WORKSPACE,
    ) -> "CustomProvider | None":
        data = await self._load(user_id)
        for c in data["custom_providers"]:
            if c["id"] == cp_id:
                if name is not None:
                    c["name"] = name
                if base_url is not None:
                    c["base_url"] = base_url.rstrip("/")
                if models is not None:
                    c["models"] = models
                if api_key is not None:
                    c["api_key"] = api_key
                await self._save(user_id, data)
                return self._custom(c)
        return None

    async def delete_custom_provider(
        self, cp_id: str, user_id: str = DEFAULT_WORKSPACE
    ) -> bool:
        data = await self._load(user_id)
        before = len(data["custom_providers"])
        data["custom_providers"] = [c for c in data["custom_providers"] if c["id"] != cp_id]
        if len(data["custom_providers"]) == before:
            return False
        await self._save(user_id, data)
        return True
