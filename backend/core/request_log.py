"""SQLite-backed request log + query helpers for the admin/analytics APIs."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import aiosqlite

from models.responses import RouteResult


class RequestLogStore:
    """Persists routing decisions and serves entries to admin/analytics APIs."""

    def __init__(self, db_path: str | Path, max_entries: int = 1000) -> None:
        self._db_path = Path(db_path)
        self._max_entries = max_entries

    async def init_db(self) -> None:
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                """
                CREATE TABLE IF NOT EXISTS request_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    request_id TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    model_requested TEXT,
                    model_used TEXT,
                    provider_used TEXT,
                    key_index_used INTEGER,
                    prompt_tokens INTEGER,
                    completion_tokens INTEGER,
                    total_latency_ms INTEGER,
                    fallback_count INTEGER,
                    status_code INTEGER,
                    error_reason TEXT,
                    attempts_json TEXT,
                    is_stream INTEGER,
                    request_type TEXT DEFAULT 'chat'
                )
                """
            )
            # Backward-compatible migration: add request_type to older DBs.
            async with db.execute("PRAGMA table_info(request_logs)") as cur:
                cols = {row[1] for row in await cur.fetchall()}
            if "request_type" not in cols:
                await db.execute(
                    "ALTER TABLE request_logs ADD COLUMN request_type TEXT DEFAULT 'chat'"
                )
            await db.commit()

    async def record(
        self, result: RouteResult, *, is_stream: bool, request_type: str = "chat"
    ) -> None:
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                """
                INSERT INTO request_logs (
                    request_id, timestamp, model_requested, model_used,
                    provider_used, key_index_used, prompt_tokens,
                    completion_tokens, total_latency_ms, fallback_count,
                    status_code, error_reason, attempts_json, is_stream,
                    request_type
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    result.request_id,
                    datetime.now(timezone.utc).isoformat(),
                    result.model_requested,
                    result.final_model,
                    result.final_provider,
                    result.final_key_index,
                    result.prompt_tokens,
                    result.completion_tokens,
                    int(result.total_latency_ms),
                    result.fallback_count,
                    result.status_code,
                    result.error_reason,
                    json.dumps([a.to_dict() for a in result.attempts]),
                    1 if is_stream else 0,
                    request_type,
                ),
            )
            # Trim to the most recent N entries.
            await db.execute(
                """
                DELETE FROM request_logs WHERE id NOT IN (
                    SELECT id FROM request_logs ORDER BY id DESC LIMIT ?
                )
                """,
                (self._max_entries,),
            )
            await db.commit()

    def _row_to_entry(self, row: aiosqlite.Row) -> dict[str, Any]:
        entry = dict(row)
        entry["attempts"] = json.loads(entry.pop("attempts_json") or "[]")
        entry["is_stream"] = bool(entry["is_stream"])
        entry["request_type"] = entry.get("request_type") or "chat"
        return entry

    async def recent(self, limit: int = 100, search: str | None = None) -> list[dict[str, Any]]:
        query = "SELECT * FROM request_logs"
        params: list[Any] = []
        if search:
            query += (
                " WHERE model_requested LIKE ? OR model_used LIKE ? "
                "OR provider_used LIKE ?"
            )
            like = f"%{search}%"
            params.extend([like, like, like])
        query += " ORDER BY id DESC LIMIT ?"
        params.append(limit)

        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(query, params) as cursor:
                rows = await cursor.fetchall()
        return [self._row_to_entry(r) for r in rows]

    async def all_rows(self, limit: int = 5000) -> list[dict[str, Any]]:
        """Return up to `limit` most-recent rows (newest first) for analytics."""
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM request_logs ORDER BY id DESC LIMIT ?", (limit,)
            ) as cursor:
                rows = await cursor.fetchall()
        return [self._row_to_entry(r) for r in rows]
