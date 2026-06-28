"""
Model registry for NexusLLM.

The :class:`ModelRegistry` discovers available models from every enabled
provider (in parallel via ``asyncio.TaskGroup``), merges them into a unified
in-memory registry, and persists them to SQLite. A background task re-polls the
providers on a configurable interval and marks vanished models ``unavailable``
without deleting their history.

Pre-seeded per-model rate limits (Groq / Cerebras / Google) are merged in when
a discovered model id matches, so the dashboard has rich data even before any
real traffic flows.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Literal

import aiosqlite
from pydantic import BaseModel, Field

from core.http_client import mask_api_key

if TYPE_CHECKING:
    from core.config import NexusLLMConfig, ProviderConfig
    from core.http_client import HTTPClientManager

logger = logging.getLogger("nexusllm.registry")


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------


class ModelRateLimits(BaseModel):
    """Per-model rate limits used for display."""

    requests_per_minute: int | None = None
    requests_per_day: int | None = None
    tokens_per_minute: int | None = None
    tokens_per_day: int | None = None
    tokens_per_month: int | None = None


class RegisteredModel(BaseModel):
    """A single model known to NexusLLM, possibly served by many providers."""

    model_id: str
    provider_id: str
    canonical_aliases: list[str] = Field(default_factory=list)
    context_window: int | None = None
    capabilities: list[str] = Field(default_factory=lambda: ["chat"])
    rate_limits: ModelRateLimits | None = None
    status: Literal["active", "unavailable", "unknown"] = "unknown"
    last_verified: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    avg_latency_ms: float | None = None


# ---------------------------------------------------------------------------
# Pre-seeded per-model rate limit / capability data
# ---------------------------------------------------------------------------

_SEED_RATE_LIMITS: dict[str, ModelRateLimits] = {
    # Groq
    "allam-2-7b": ModelRateLimits(requests_per_day=7000, tokens_per_minute=6000),
    "llama-3.1-8b-instant": ModelRateLimits(requests_per_day=14400, tokens_per_minute=6000),
    "llama-3.3-70b-versatile": ModelRateLimits(requests_per_day=1000, tokens_per_minute=12000),
    "llama-4-scout-17b-16e-instruct": ModelRateLimits(requests_per_day=1000, tokens_per_minute=30000),
    "openai/gpt-oss-120b": ModelRateLimits(requests_per_day=1000, tokens_per_minute=8000),
    "qwen/qwen3-32b": ModelRateLimits(requests_per_day=1000, tokens_per_minute=6000),
    "groq/compound": ModelRateLimits(requests_per_day=250, tokens_per_minute=70000),
    # Cerebras
    "gpt-oss-120b": ModelRateLimits(
        requests_per_minute=30, tokens_per_minute=60000,
        requests_per_day=14400, tokens_per_day=1000000,
    ),
    "llama-3.1-8b": ModelRateLimits(
        requests_per_minute=30, tokens_per_minute=60000,
        requests_per_day=14400, tokens_per_day=1000000,
    ),
    # Google AI Studio
    "gemini-2.5-flash": ModelRateLimits(tokens_per_minute=250000, requests_per_day=20, requests_per_minute=5),
    "gemini-2.5-flash-lite": ModelRateLimits(tokens_per_minute=250000, requests_per_day=20, requests_per_minute=10),
    "gemma-3-27b-it": ModelRateLimits(tokens_per_minute=15000, requests_per_day=14400, requests_per_minute=30),
    "gemma-3-12b-it": ModelRateLimits(tokens_per_minute=15000, requests_per_day=14400, requests_per_minute=30),
}

# ---------------------------------------------------------------------------
# Static rate-limit tables (for providers/limits not exposed via headers)
# ---------------------------------------------------------------------------
#
# Free-tier providers enforce a DAILY token ceiling (TPD) that is NOT returned
# in the rate-limit headers (those only give per-day requests + per-minute
# tokens). The realistic monthly budget = TPD * 30, so we hardcode the daily
# token caps the same way FreeLLM hardcodes Cerebras/Google. Sourced/derived
# from provider free-tier docs; rephrased for compliance.

# Groq free-tier daily token limits (tokens/day) per model.
_GROQ_FREE_TIER_TPD: dict[str, int] = {
    "llama-3.1-8b-instant": 500_000,
    "llama-3.3-70b-versatile": 100_000,
    "openai/gpt-oss-120b": 200_000,
    "openai/gpt-oss-20b": 200_000,
    "groq/compound": 200_000,
    "groq/compound-mini": 200_000,
    "qwen/qwen3-32b": 500_000,
    "meta-llama/llama-4-scout-17b-16e-instruct": 500_000,
    "moonshotai/kimi-k2-instruct": 300_000,
    "deepseek-r1-distill-llama-70b": 100_000,
}

# Cerebras free tier: identical generous caps across its (few) models.
_CEREBRAS_STATIC = ModelRateLimits(
    requests_per_minute=30,
    requests_per_day=14_400,
    tokens_per_minute=60_000,
    tokens_per_day=1_000_000,
)

# Google AI Studio free tier (per model): TPM + RPD; daily token cap derived.
_GOOGLE_STATIC: dict[str, ModelRateLimits] = {
    "gemini-2.5-flash": ModelRateLimits(
        requests_per_minute=5, requests_per_day=20,
        tokens_per_minute=250_000, tokens_per_day=1_000_000,
    ),
    "gemini-2.5-flash-lite": ModelRateLimits(
        requests_per_minute=10, requests_per_day=20,
        tokens_per_minute=250_000, tokens_per_day=1_000_000,
    ),
    "gemma-3-27b-it": ModelRateLimits(
        requests_per_minute=30, requests_per_day=14_400,
        tokens_per_minute=15_000, tokens_per_day=500_000,
    ),
    "gemma-3-12b-it": ModelRateLimits(
        requests_per_minute=30, requests_per_day=14_400,
        tokens_per_minute=15_000, tokens_per_day=500_000,
    ),
    "gemma-3-4b-it": ModelRateLimits(
        requests_per_minute=30, requests_per_day=14_400,
        tokens_per_minute=15_000, tokens_per_day=500_000,
    ),
}

# Mistral La Plateforme free tier: a flat monthly token budget per model.
_MISTRAL_MONTHLY_TOKENS = 1_000_000_000  # 1B tokens/month, per model
_MISTRAL_STATIC = ModelRateLimits(
    requests_per_minute=60,
    tokens_per_minute=500_000,
    tokens_per_month=_MISTRAL_MONTHLY_TOKENS,
)

# Curated ignore list — internal / safety / niche models we never surface
# (mirrors FreeLLM's per-provider ignore sets in data.py).
_IGNORED_MODEL_IDS: set[str] = {
    "openai/gpt-oss-safeguard-20b",
    "meta-llama/llama-prompt-guard-2-22m",
    "meta-llama/llama-prompt-guard-2-86m",
    "meta-llama/llama-guard-4-12b",
    "allam-2-7b",
}

# Providers whose limits are not header-based and whose free quota is tiny — we
# register their models without sending probe requests.
_NO_PROBE_PROVIDERS: set[str] = {"github"}

# Credit-gated providers expose BOTH free and paid models behind one key. On a
# zero-balance account their paid models return 401 "CreditsError" (or 402)
# while free models return 200. Discovery drops 401/403 for these so only the
# genuinely-free models are registered (e.g. OpenCode Zen).
_CREDIT_GATED_PROVIDERS: set[str] = {"opencode"}


def _is_openrouter_free(model_id: str, item: dict) -> bool:
    """OpenRouter model is free if it has the ``:free`` suffix or zero per-token
    pricing (prompt + completion cost both 0)."""
    if isinstance(model_id, str) and model_id.endswith(":free"):
        return True
    pricing = item.get("pricing") or {}

    def _zero(v) -> bool:
        return str(v) in ("0", "0.0")

    return _zero(pricing.get("prompt", "1")) and _zero(pricing.get("completion", "1"))

# Known model ids that a provider's /models endpoint omits, but which are
# callable (often the free tier). Injected as discovery candidates and then
# validated by the normal probe — so paid/invalid ones are dropped, only the
# ones this key can actually call survive.
_PROVIDER_EXTRA_MODELS: dict[str, tuple[str, ...]] = {
    # z.ai/Zhipu: /models returns paid base ids (glm-4.5, glm-4.6, ...); the
    # free tier is the *-flash variants. These are the ones that work for free.
    "zai": (
        "glm-4.7-flash",
        "glm-4.6-flash",
        "glm-4.5-flash",
        "glm-4.6v-flash",
        "glm-4.5v-flash",
    ),
    # Pollinations: anonymous tier exposes the OpenAI-compatible text model(s)
    # via a non-standard /models response, so inject the known no-key models.
    "pollinations": ("openai-fast", "openai"),
}

# OVH AI Endpoints public model catalog (mirrors cheahjs/free-llm-api-resources
# `fetch_ovh_models`). The token below is OVH's *public* Supabase anon key that
# the repo bakes in to list the catalogue — it is not a per-user secret. If this
# backend is unavailable, discovery falls back to the OpenAI-compatible
# /v1/models endpoint (which OVH serves keyless).
_OVH_CATALOG_URL = "https://endpoints-backend.ai.cloud.ovh.net/rest/v1/models_v2"
_OVH_ANON_TOKEN = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "ewogICJyb2xlIjogImFub24iLAogICJpc3MiOiAic3VwYWJhc2UiLAogICJpYXQiOiAxNzEwNzE2NDAwLAogICJleHAiOiAxODY4NDgyODAwCn0."
    "Jty_eO4oWqLm4Lx_LfbpRW5WESXYXtT2humbBq2Pal8"
)

# NVIDIA build.nvidia.com catalogue search API. The browser "Free Endpoint"
# filter maps to ``nimType:nim_type_preview``; the public NGC catalogue search
# endpoint exposes exactly that filter (no auth needed for listing). We use it
# as the source of truth for WHICH NVIDIA models are free, plus their
# capabilities (reasoning / vision / code), instead of the bare /v1/models list
# (which mixes free + paid + retired models and carries no capability info).
_NVIDIA_CATALOG_URL = (
    "https://api.ngc.nvidia.com/v2/search/catalog/resources/ENDPOINT"
)


def _resolve_limits(
    provider_id: str, model_id: str, header_limits: "ModelRateLimits | None"
) -> "ModelRateLimits | None":
    """Merge live header limits (RPD/TPM) with static daily/monthly caps.

    Header limits give the per-day request and per-minute token caps; the
    static tables supply the per-day / per-month token budgets the headers
    don't expose, which drive an accurate monthly figure.
    """
    base = header_limits.model_copy() if header_limits else ModelRateLimits()

    if provider_id == "groq":
        # Every Groq free-tier chat model has a daily token cap; use the known
        # value, else a conservative default (so we never fall back to the
        # loose request-based estimate which overcounts).
        base.tokens_per_day = _GROQ_FREE_TIER_TPD.get(model_id, 200_000)
        return base

    if provider_id == "cerebras":
        static = _CEREBRAS_STATIC.model_copy()
        # Keep any header values we did get.
        static.requests_per_day = base.requests_per_day or static.requests_per_day
        static.tokens_per_minute = base.tokens_per_minute or static.tokens_per_minute
        return static

    if provider_id == "google":
        static = _GOOGLE_STATIC.get(model_id)
        return static.model_copy() if static else (header_limits or None)

    if provider_id in ("mistral", "codestral"):
        return _MISTRAL_STATIC.model_copy()

    return header_limits



_CAPABILITY_HINTS: list[tuple[str, str]] = [
    ("vision", "vision"),
    ("vl", "vision"),
    ("coder", "code"),
    ("code", "code"),
    ("codestral", "code"),
    ("embed", "embed"),
    ("reason", "reasoning"),
    ("o1", "reasoning"),
    ("o3", "reasoning"),
    ("r1", "reasoning"),
    ("thinking", "reasoning"),
]

# Known multimodal (image-capable) model families. Their ids rarely contain
# "vision", so we match family patterns to keep images flowing to them while
# stripping images for text-only models (avoids upstream errors).
_VISION_MODEL_RE = re.compile(
    r"vision|(^|[^a-z])vl([^a-z]|$)|-vl-|"
    r"gpt-?5|gpt-?4o|gpt-?4\.1|"
    r"claude.*(opus|sonnet)|"
    r"gemini|pixtral|llava|internvl|moondream|"
    r"llama.*(vision|3\.2|4)|qwen.*vl|"
    r"grok-?[234]|phi-?4-multimodal|multimodal",
    re.I,
)

# Known reasoning/"thinking" model families. Used as a fallback when a model
# hasn't been tagged with the explicit "reasoning" capability during discovery
# (e.g. providers whose /models endpoint exposes no capability metadata).
_REASONING_MODEL_RE = re.compile(
    r"gpt-?5|(^|[/_-])o[1345]([/_.-]|$)|claude.*(opus|sonnet)|"
    r"deepseek.*(r1|reason|v[45])|\bqwq\b|qwen-?3|glm-?[45]|"
    r"grok-?[345]|gemini.*(think|2\.[05]|3)|magistral|minimax-?m[23]|"
    r"kimi-?k2|nemotron|gpt-?oss|seed-oss|step-?3|"
    r"reason|reasoner|thinking",
    re.I,
)


def _infer_capabilities(model_id: str) -> list[str]:
    """Heuristically infer capability tags from a model id."""
    lower = model_id.lower()
    caps = {"chat"}
    for needle, cap in _CAPABILITY_HINTS:
        if needle in lower:
            caps.add(cap)
    # Family-pattern reasoning detection (catches qwen3/glm/gpt-oss/deepseek/
    # claude/gpt-5/etc. whose ids don't contain a literal "reason" keyword).
    if _REASONING_MODEL_RE.search(lower):
        caps.add("reasoning")
    # Pure embedding models are not chat models.
    if "embed" in lower:
        caps.discard("chat")
    # Preserve a stable order for display.
    order = ["chat", "vision", "code", "embed", "reasoning"]
    return [c for c in order if c in caps]


# Substrings that mark a model as NOT a text-generation/chat model. These are
# dropped during discovery (matches FreeLLM's tts/whisper/audio filtering).
# Note: embedding markers are handled separately (registered, not dropped).
_NON_CHAT_MARKERS = (
    "tts",
    "whisper",
    "audio",
    "speech",
    "transcrib",
    "stt",
    "rerank",
    "moderation",
    "guard",
    "orpheus",
    "diffusion",
    "-vision-ocr",
    "image",
    "dall-e",
    "clip",
)

# Substrings that identify an EMBEDDING model. These are registered (not
# dropped) and tagged with the "embed" capability so the Embeddings UI and
# /v1/embeddings routing can use them.
_EMBEDDING_MARKERS = (
    "embed",
    "embedding",
    "bge",
    "nomic-embed",
    "e5-mistral",
    "e5-large",
)


def _is_chat_model(model_id: str) -> bool:
    """True only for text-generation / chat models (drops tts/whisper/audio/etc)."""
    lower = model_id.lower()
    return not any(marker in lower for marker in _NON_CHAT_MARKERS)


def _is_embedding_model(model_id: str, task: str = "") -> bool:
    """True if the model produces embeddings (vectors), not chat text."""
    lower = model_id.lower()
    if "embed" in task.lower():
        return True
    return any(marker in lower for marker in _EMBEDDING_MARKERS)


def _parse_int(value: str | None) -> int | None:
    """Parse an integer rate-limit header value, tolerating junk/None."""
    if value is None:
        return None
    try:
        return int(float(str(value).strip()))
    except (ValueError, TypeError):
        return None


def _auth_headers(key: str | None) -> dict[str, str]:
    """Build the Authorization header, omitting it for keyless providers."""
    return {"Authorization": f"Bearer {key}"} if key else {}


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------


class ModelRegistry:
    """Discovers, stores, and serves the unified model catalog."""

    def __init__(
        self,
        config: "NexusLLMConfig",
        http: "HTTPClientManager",
        keystore=None,
    ) -> None:
        self._config = config
        self._http = http
        self._keystore = keystore
        self._db_path = Path(config.app.data_dir) / "nexusllm.db"
        # keyed by (provider_id, model_id)
        self._models: dict[tuple[str, str], RegisteredModel] = {}
        # (provider_id, model_id) pairs the user has disabled via the UI toggle.
        self._disabled: set[tuple[str, str]] = set()
        # Ordered list of model_ids defining the Auto/fallback routing order
        # (set from the dashboard Routing Strategy). Empty => provider priority.
        self._auto_order: list[str] = []
        # (provider_id, model_id) pairs whose limits we've probed this run.
        self._probed: set[tuple[str, str]] = set()
        self._lock = asyncio.Lock()
        self._refresh_task: asyncio.Task | None = None
        self._stopped = asyncio.Event()

    # -- alias mapping ------------------------------------------------------

    def _aliases_for_model(self, model_id: str) -> list[str]:
        """Return the alias groups that list a given model id."""
        return [
            group.alias
            for group in self._config.model_aliases
            if model_id in group.models
        ]

    # -- persistence --------------------------------------------------------

    async def init_db(self) -> None:
        """Create the SQLite schema if it does not yet exist."""
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                """
                CREATE TABLE IF NOT EXISTS models (
                    provider_id TEXT NOT NULL,
                    model_id TEXT NOT NULL,
                    canonical_aliases TEXT,
                    context_window INTEGER,
                    capabilities TEXT,
                    rate_limits TEXT,
                    status TEXT,
                    last_verified TEXT,
                    avg_latency_ms REAL,
                    PRIMARY KEY (provider_id, model_id)
                )
                """
            )
            await db.commit()

    async def _persist(self, model: RegisteredModel) -> None:
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                """
                INSERT INTO models (
                    provider_id, model_id, canonical_aliases, context_window,
                    capabilities, rate_limits, status, last_verified, avg_latency_ms
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(provider_id, model_id) DO UPDATE SET
                    canonical_aliases=excluded.canonical_aliases,
                    context_window=excluded.context_window,
                    capabilities=excluded.capabilities,
                    rate_limits=excluded.rate_limits,
                    status=excluded.status,
                    last_verified=excluded.last_verified,
                    avg_latency_ms=excluded.avg_latency_ms
                """,
                (
                    model.provider_id,
                    model.model_id,
                    json.dumps(model.canonical_aliases),
                    model.context_window,
                    json.dumps(model.capabilities),
                    model.rate_limits.model_dump_json() if model.rate_limits else None,
                    model.status,
                    model.last_verified.isoformat(),
                    model.avg_latency_ms,
                ),
            )
            await db.commit()

    async def _load_from_db(self) -> None:
        """Hydrate the in-memory registry from SQLite at startup."""
        if not self._db_path.is_file():
            return
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM models") as cursor:
                rows = await cursor.fetchall()
        for row in rows:
            rl_raw = row["rate_limits"]
            model = RegisteredModel(
                model_id=row["model_id"],
                provider_id=row["provider_id"],
                canonical_aliases=json.loads(row["canonical_aliases"] or "[]"),
                context_window=row["context_window"],
                capabilities=json.loads(row["capabilities"] or '["chat"]'),
                rate_limits=ModelRateLimits.model_validate_json(rl_raw) if rl_raw else None,
                status=row["status"] or "unknown",
                last_verified=datetime.fromisoformat(row["last_verified"]),
                avg_latency_ms=row["avg_latency_ms"],
            )
            self._models[(model.provider_id, model.model_id)] = model
        logger.info("Loaded %d model(s) from SQLite.", len(self._models))

    # -- discovery ----------------------------------------------------------

    async def _discover_ovh(self, provider: "ProviderConfig") -> list[str]:
        """Discover OVH AI Endpoints models the way FreeLLM's repo does.

        Primary: fetch the public catalogue from OVH's Supabase backend using
        the baked-in anon token, keeping only ``available`` models tagged
        ``LLM``. Fallback: the OpenAI-compatible ``/v1/models`` endpoint (served
        keyless). Models are registered without an inference probe because the
        keyless free tier is heavily rate-limited (probing would 429 them all).
        """
        import httpx

        names: list[str] = []

        # 1) Repo-faithful catalogue fetch with the baked anon token.
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                resp = await client.get(
                    _OVH_CATALOG_URL,
                    params={"select": "*", "order": "id.desc", "offset": "0", "limit": "100"},
                    headers={
                        "accept": "*/*",
                        "accept-profile": "public",
                        "apikey": _OVH_ANON_TOKEN,
                        "authorization": f"Bearer {_OVH_ANON_TOKEN}",
                        "x-client-info": "supabase-js-web/2.39.7",
                    },
                )
            if resp.status_code == 200:
                for m in resp.json():
                    if not isinstance(m, dict) or not m.get("available"):
                        continue
                    if "LLM" not in (m.get("category") or []):
                        continue
                    if m.get("name"):
                        names.append(m["name"])
                logger.info("OVH catalogue: %d LLM model(s).", len(names))
            else:
                logger.info(
                    "OVH catalogue returned HTTP %s; falling back to /v1/models.",
                    resp.status_code,
                )
        except Exception as exc:
            logger.info("OVH catalogue fetch failed (%s); using /v1/models.", exc)

        # 2) Fallback: OpenAI-compatible keyless /v1/models.
        if not names:
            try:
                client = await self._http.get_client(provider.id)
                resp = await client.get("/models")
                resp.raise_for_status()
                payload = resp.json()
                items = payload.get("data") if isinstance(payload, dict) else payload
                for it in items or []:
                    if isinstance(it, dict) and (it.get("id") or it.get("name")):
                        names.append(it.get("id") or it.get("name"))
                logger.info("OVH /v1/models: %d model(s).", len(names))
            except Exception as exc:
                logger.warning("OVH discovery failed entirely: %s", exc)
                return []

        # Register (keyless, no probe). 12 req/min anonymous free-tier limit.
        discovered: list[str] = []
        base_limits = ModelRateLimits(requests_per_minute=12)
        for model_id in names:
            if model_id in _IGNORED_MODEL_IDS:
                continue
            is_embed = _is_embedding_model(model_id)
            if not is_embed and not _is_chat_model(model_id):
                continue
            caps = ["embed"] if is_embed else _infer_capabilities(model_id)
            model = RegisteredModel(
                model_id=model_id,
                provider_id=provider.id,
                canonical_aliases=self._aliases_for_model(model_id),
                context_window=None,
                capabilities=caps,
                rate_limits=base_limits.model_copy(),
                status="active",
                last_verified=datetime.now(timezone.utc),
                avg_latency_ms=None,
            )
            async with self._lock:
                self._models[(provider.id, model_id)] = model
                discovered.append(model_id)
            await self._persist(model)
        logger.info("Discovered %d model(s) from ovh.", len(discovered))
        return discovered

    async def _discover_nvidia(
        self, provider: "ProviderConfig", key: str | None
    ) -> list[str] | None:
        """Discover ONLY NVIDIA's free-endpoint models, with capabilities.

        Source of truth is NVIDIA's own catalogue (the ``Free Endpoint`` filter
        on build.nvidia.com == ``nimType:nim_type_preview``), fetched from the
        public NGC catalogue search API. That gives the exact free model set
        plus each model's capability labels (reasoning / vision / code). We then
        intersect it with the live ``/v1/models`` ids (so only models this key
        can actually call survive) and register the free chat + embedding ones.

        Returns the list of discovered ids, or ``None`` to signal the caller to
        fall back to the generic ``/models`` discovery (e.g. catalogue down).
        """
        import json as _json
        import urllib.parse as _urlparse
        import httpx

        def _norm(s: str) -> str:
            return re.sub(r"[._/\-]", "", (s or "").lower())

        # 1) Fetch the free-endpoint catalogue (free list + capability labels).
        free: dict[str, tuple[str, bool, set[str]]] = {}
        q = {
            "query": "",
            "page": 0,
            "pageSize": 200,
            "filters": [{"field": "nimType", "value": "nim_type_preview"}],
        }
        url = _NVIDIA_CATALOG_URL + "?q=" + _urlparse.quote(_json.dumps(q))
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(
                    url,
                    headers={
                        "accept": "application/json",
                        "resource-type": "ENDPOINT",
                        "user-agent": "Mozilla/5.0",
                    },
                )
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:
            logger.warning(
                "NVIDIA catalogue fetch failed (%s); using generic discovery.",
                exc,
            )
            return None

        for group in data.get("results", []) or []:
            for res in group.get("resources", []) or []:
                name = res.get("name")
                if not name:
                    continue
                publisher = None
                general: list[str] = []
                for lab in res.get("labels", []) or []:
                    k = lab.get("key")
                    if k == "publisher":
                        vals = lab.get("values") or lab.get("unresolvedValues") or []
                        publisher = vals[0] if vals else None
                    elif k == "general":
                        general = [str(x).lower() for x in (lab.get("values") or [])]
                model_id = f"{publisher}/{name}" if publisher else name
                # Combine the capability pills (general labels) + the model's
                # own spec blurb — NVIDIA states reasoning/vision capability in
                # BOTH, so we match either (e.g. Llama-3.x list "reasoning" only
                # in the description, GPT-OSS/Nemotron/Kimi tag it as a pill).
                desc = str(res.get("description") or "").lower()
                spec = desc + " || " + " ".join(general)
                is_chat = "chat" in general
                caps: set[str] = set()
                if is_chat:
                    caps.add("chat")
                if re.search(r"reason|thinking|chain[- ]of[- ]thought|\bcot\b", spec):
                    caps.add("reasoning")
                if any(
                    k in spec
                    for k in (
                        "image-to-text", "image to text", "from image", "visual",
                        "vision", "vlm", "multimodal", "multi-modal", "ocr",
                        "omni", "video",
                    )
                ):
                    caps.add("vision")
                if any(k in spec for k in ("cod", "program")):  # code / coding / programming
                    caps.add("code")
                free[_norm(model_id)] = (model_id, is_chat, caps)

        if not free:
            return None

        # 2) Fetch the live /v1/models list (the ids this key can actually call).
        try:
            client = await self._http.get_client(provider.id)
            resp = await client.get("/models", headers=_auth_headers(key))
            resp.raise_for_status()
            payload = resp.json()
            items = (
                payload.get("data")
                if isinstance(payload, dict)
                else payload
            ) or []
        except Exception as exc:
            logger.warning("NVIDIA /v1/models failed (%s).", exc)
            return None

        # 3) Register the intersection: free chat models (+ free embeddings).
        discovered: list[str] = []
        base_limits = ModelRateLimits(requests_per_minute=40)
        for item in items:
            if not isinstance(item, dict):
                continue
            rid = item.get("id") or item.get("name")
            if not rid:
                continue
            entry = free.get(_norm(rid))
            if entry is None:
                continue  # not a free-endpoint model -> drop (paid/retired).
            _mid, is_chat, caps = entry

            if _is_embedding_model(rid):
                capabilities = ["embed"]
            elif is_chat and _is_chat_model(rid):
                # Catalogue is authoritative for NVIDIA reasoning — don't let
                # the id family-pattern re-add it (e.g. "qwen3-...-instruct" is
                # the non-thinking variant, so NVIDIA lists no reasoning).
                inferred = set(_infer_capabilities(rid))
                inferred.discard("reasoning")
                merged = caps | inferred
                order = ["chat", "vision", "code", "embed", "reasoning"]
                capabilities = [c for c in order if c in merged]
            else:
                # Free but non-chat (TTS / AV / safety / detectors) — skip.
                continue

            cw = item.get("context_window") or item.get("context_length")
            model = RegisteredModel(
                model_id=rid,
                provider_id=provider.id,
                canonical_aliases=self._aliases_for_model(rid),
                context_window=cw,
                capabilities=capabilities,
                rate_limits=base_limits.model_copy(),
                status="active",
                last_verified=datetime.now(timezone.utc),
                avg_latency_ms=None,
            )
            async with self._lock:
                self._models[(provider.id, rid)] = model
                discovered.append(rid)
            await self._persist(model)

        logger.info(
            "Discovered %d free NVIDIA model(s) from catalogue (of %d free, "
            "%d listed).",
            len(discovered), len(free), len(items),
        )
        return discovered

    async def _discover_provider(self, provider: "ProviderConfig") -> list[str]:
        """Poll one provider's /models endpoint. Returns discovered ids."""
        # Custom providers carry a USER-CURATED model list (registered via
        # register_custom_models from the keystore). Never auto-discover them:
        # probing the upstream gateway's /models would overwrite the user's
        # explicitly-chosen models with whatever the gateway happens to expose
        # (e.g. a pile of default gpt-* ids), and mark the user's models stale.
        if "custom" in (provider.tags or []):
            return []
        # OVH uses its public catalogue (baked anon token), per the FreeLLM repo.
        if provider.id == "ovh":
            return await self._discover_ovh(provider)
        # Prefer a runtime key from the key store; fall back to config keys.
        key: str | None = None
        if self._keystore is not None:
            entries = await self._keystore.enabled_keys(provider.id)
            if entries:
                key = entries[0].api_key
        if key is None and provider.has_usable_keys:
            key = provider.api_keys[0]
        if not key:
            # Keyless providers (e.g. OVH free tier) discover without auth.
            if not provider.requires_key:
                key = ""
            else:
                logger.info(
                    "Skipping discovery for %s: no usable API keys.", provider.id
                )
                return []

        # NVIDIA: register ONLY the free-endpoint models from NVIDIA's own
        # catalogue (the build.nvidia.com "Free Endpoint" filter), with the
        # reasoning/vision capabilities it declares. Falls back to the generic
        # /models discovery below if the catalogue is unreachable.
        if provider.id == "nvidia":
            nv = await self._discover_nvidia(provider, key)
            if nv is not None:
                return nv

        try:
            client = await self._http.get_client(provider.id)
            started = time.perf_counter()
            resp = await client.get(
                "/models",
                headers=_auth_headers(key),
            )
            latency_ms = (time.perf_counter() - started) * 1000
            resp.raise_for_status()
            payload = resp.json()
        except Exception as exc:
            # If this provider has injectable known models, continue with an
            # empty catalogue so those still get probed (e.g. Pollinations whose
            # /models response isn't standard JSON); otherwise give up.
            if _PROVIDER_EXTRA_MODELS.get(provider.id):
                logger.info(
                    "Discovery /models unavailable for %s (%s); using known models.",
                    provider.id, exc,
                )
                payload = []
                latency_ms = 0.0
            else:
                logger.warning(
                    "Discovery failed for %s (key %s): %s",
                    provider.id,
                    mask_api_key(key),
                    exc,
                )
                return []

        # Providers return either OpenAI's {"data": [...]} or a bare JSON
        # array (GitHub Models). Handle both.
        if isinstance(payload, list):
            items = payload
        elif isinstance(payload, dict):
            items = payload.get("data") or payload.get("models") or []
        else:
            items = []

        # Phase 1: collect candidate models after cheap filters.
        candidates: list[tuple[str, int | None, bool]] = []
        seen_ids: set[str] = set()
        for item in items:
            if not isinstance(item, dict):
                continue
            model_id = item.get("id") or item.get("name")
            # GitHub Models' inference endpoint returns azureml:// URIs as the
            # id; the usable chat model name lives in "name".
            if isinstance(model_id, str) and model_id.startswith("azureml://"):
                model_id = item.get("name")
            if not model_id or model_id in seen_ids:
                continue
            # OpenRouter lists 300+ models, mostly paid. Keep ONLY the free
            # ones (the user explicitly wants free models only).
            if provider.id == "openrouter" and not _is_openrouter_free(model_id, item):
                continue
            task = str(item.get("task") or "").lower()
            # Drop tasks that are neither chat nor embeddings.
            if task and any(
                x in task for x in ("whisper", "audio", "image", "rerank", "moderation")
            ):
                continue
            is_embed = _is_embedding_model(model_id, task)
            # Keep chat models and embedding models; drop everything else
            # (tts/audio/image/etc).
            if not is_embed and not _is_chat_model(model_id):
                continue
            if model_id in _IGNORED_MODEL_IDS:
                continue
            cw = (
                item.get("context_window")
                or item.get("context_length")
                or (item.get("limits") or {}).get("max_input_tokens")
                or (item.get("x-nexusllm") or {}).get("context_window")
            )
            candidates.append((model_id, cw, is_embed))
            seen_ids.add(model_id)

        # Inject known-but-unlisted models for providers whose /models endpoint
        # omits the free variants (e.g. z.ai lists only the paid base ids; the
        # free tier is the *-flash variants). The probe below validates each, so
        # only models this key can actually call (the free ones) survive.
        for extra_id in _PROVIDER_EXTRA_MODELS.get(provider.id, ()):
            if extra_id not in seen_ids:
                candidates.append((extra_id, None, _is_embedding_model(extra_id)))
                seen_ids.add(extra_id)

        # Phase 2: validate + resolve limits concurrently. Chat models are
        # tested via /chat/completions, embedding models via /embeddings; both
        # drop catalogue entries that aren't actually callable (400/404/422).
        discovered: list[str] = []
        sem = asyncio.Semaphore(6)

        async def _handle(model_id: str, cw: int | None, is_embed: bool) -> None:
            pkey = (provider.id, model_id)
            existing = self._models.get(pkey)
            capabilities = ["embed"] if is_embed else _infer_capabilities(model_id)

            if provider.id in _NO_PROBE_PROVIDERS:
                limits = _resolve_limits(
                    provider.id, model_id, _SEED_RATE_LIMITS.get(model_id)
                )
            elif pkey in self._probed and existing and existing.status == "active":
                # Already validated this process run; reuse.
                limits = existing.rate_limits
            elif is_embed:
                async with sem:
                    status = await self._probe_embedding(provider, model_id, key)
                self._probed.add(pkey)
                if status in (400, 404, 422):
                    logger.debug(
                        "Dropping non-working embed model %s/%s (HTTP %s)",
                        provider.id, model_id, status,
                    )
                    return
                limits = _resolve_limits(
                    provider.id, model_id, _SEED_RATE_LIMITS.get(model_id)
                )
            else:
                async with sem:
                    status, probed = await self._probe_model(provider, model_id, key)
                self._probed.add(pkey)
                # Drop models that aren't callable. For keyless providers also
                # drop 401/403 — those models need an auth we don't send, so
                # they'd only fail at runtime. For credit-gated providers (e.g.
                # OpenCode Zen) paid models return 401 "CreditsError"/402 on a
                # zero-balance account, while free models return 200 — so drop
                # 401/403 there too to keep ONLY the genuinely-free models.
                drop_statuses = {400, 404, 422, 402}
                if not provider.requires_key or provider.id in _CREDIT_GATED_PROVIDERS:
                    drop_statuses |= {401, 403}
                if status in drop_statuses:
                    logger.debug(
                        "Dropping non-working model %s/%s (HTTP %s)",
                        provider.id, model_id, status,
                    )
                    return
                if probed is None:
                    probed = (
                        existing.rate_limits
                        if existing and existing.rate_limits
                        else _SEED_RATE_LIMITS.get(model_id)
                    )
                limits = _resolve_limits(provider.id, model_id, probed)

            model = RegisteredModel(
                model_id=model_id,
                provider_id=provider.id,
                canonical_aliases=self._aliases_for_model(model_id),
                context_window=cw,
                capabilities=capabilities,
                rate_limits=limits,
                status="active",
                last_verified=datetime.now(timezone.utc),
                avg_latency_ms=round(latency_ms, 1),
            )
            async with self._lock:
                self._models[pkey] = model
                discovered.append(model_id)
            await self._persist(model)

        try:
            async with asyncio.TaskGroup() as tg:
                for mid, cw, is_embed in candidates:
                    tg.create_task(_handle(mid, cw, is_embed))
        except* Exception as eg:  # noqa: PERF203
            for exc in eg.exceptions:
                logger.debug("model validation task error: %s", exc)

        logger.info(
            "Discovered %d model(s) from %s in %.0f ms.",
            len(discovered),
            provider.id,
            latency_ms,
        )
        return discovered

    async def _probe_embedding(
        self, provider: "ProviderConfig", model_id: str, key: str
    ) -> int | None:
        """Validate an embedding model via a minimal /embeddings call.

        Returns the HTTP status so the caller can drop catalogue entries that
        aren't actually callable (400/404/422). Embedding models cannot be
        tested through /chat/completions (that would 404), so we use the
        embeddings endpoint with a tiny input.
        """
        try:
            client = await self._http.get_client(provider.id)
            resp = await client.post(
                "/embeddings",
                headers={
                    **_auth_headers(key),
                    "Content-Type": "application/json",
                },
                json={"model": model_id, "input": "test"},
                timeout=20.0,
            )
            return resp.status_code
        except Exception as exc:
            logger.debug(
                "embedding probe failed for %s/%s: %s", provider.id, model_id, exc
            )
            return None

    async def _probe_model(
        self, provider: "ProviderConfig", model_id: str, key: str
    ) -> "tuple[int | None, ModelRateLimits | None]":
        """Send a 1-token chat completion to validate a model and read limits.

        Returns ``(status_code, limits)``. The status lets the caller drop
        models that are listed in the catalogue but not actually callable
        (e.g. NVIDIA returns 404 for most of its 121 listed models). Limits are
        parsed from the standard ``x-ratelimit-*`` headers when present.
        """
        try:
            client = await self._http.get_client(provider.id)
            resp = await client.post(
                "/chat/completions",
                headers={
                    **_auth_headers(key),
                    "Content-Type": "application/json",
                },
                json={
                    "model": model_id,
                    "messages": [{"role": "user", "content": "Hi"}],
                    "max_tokens": 1,
                    "stream": False,
                },
                timeout=20.0,
            )
        except Exception as exc:
            logger.debug("probe failed for %s/%s: %s", provider.id, model_id, exc)
            return None, None

        headers = resp.headers
        rpd = _parse_int(headers.get("x-ratelimit-limit-requests"))
        tpm = _parse_int(headers.get("x-ratelimit-limit-tokens"))
        tpd = _parse_int(headers.get("x-ratelimit-limit-tokens-day"))
        limits = None
        if not (rpd is None and tpm is None and tpd is None):
            limits = ModelRateLimits(
                requests_per_day=rpd, tokens_per_minute=tpm, tokens_per_day=tpd
            )

        status = resp.status_code
        # Some providers (e.g. z.ai/Zhipu) list paid models in /models but
        # reject them with a balance/quota error this key can't satisfy. Treat
        # that as "not usable" (status 402) so discovery drops it and keeps only
        # the models this key can actually call (e.g. the free *-flash models).
        if status in (402, 429, 403):
            try:
                btext = resp.text.lower()
            except Exception:
                btext = ""
            if any(
                s in btext
                for s in ("insufficient balance", "recharge",
                          "no resource package", '"1113"', "quota")
            ):
                status = 402
        return status, limits

    async def discover_all(self) -> None:
        """Discover models from every enabled provider in parallel."""
        providers = self._config.enabled_providers()
        # Track which (provider, model) pairs we see this round so we can mark
        # the rest unavailable afterwards.
        seen: set[tuple[str, str]] = set()

        async def _run(p: "ProviderConfig") -> None:
            for mid in await self._discover_provider(p):
                seen.add((p.id, mid))

        try:
            async with asyncio.TaskGroup() as tg:
                for provider in providers:
                    tg.create_task(_run(provider))
        except* Exception as eg:  # noqa: PERF203 - aggregate provider errors.
            for exc in eg.exceptions:
                logger.warning("Provider discovery task error: %s", exc)

        # Mark models that were present before but absent now as unavailable.
        async with self._lock:
            for pkey, model in self._models.items():
                provider_seen_any = any(s[0] == pkey[0] for s in seen)
                if provider_seen_any and pkey not in seen and model.status == "active":
                    model.status = "unavailable"
                    await self._persist(model)

    # -- background refresh -------------------------------------------------

    async def start_background_refresh(self) -> None:
        """Launch the periodic refresh loop."""
        if self._refresh_task is not None:
            return
        self._stopped.clear()
        self._refresh_task = asyncio.create_task(self._refresh_loop())

    async def _refresh_loop(self) -> None:
        interval = self._config.app.model_refresh_interval_minutes * 60
        # Run an initial discovery immediately (in the background, so server
        # startup is not blocked while large catalogues are validated).
        try:
            await self.discover_all()
        except Exception as exc:  # pragma: no cover - defensive.
            logger.warning("Initial discovery error: %s", exc)
        while not self._stopped.is_set():
            try:
                await asyncio.wait_for(self._stopped.wait(), timeout=interval)
            except asyncio.TimeoutError:
                pass
            if self._stopped.is_set():
                break
            logger.info("Background model refresh starting.")
            try:
                await self.discover_all()
            except Exception as exc:  # pragma: no cover - defensive.
                logger.warning("Background refresh error: %s", exc)

    async def stop_background_refresh(self) -> None:
        """Stop the periodic refresh loop."""
        self._stopped.set()
        if self._refresh_task is not None:
            self._refresh_task.cancel()
            try:
                await self._refresh_task
            except (asyncio.CancelledError, Exception):
                pass
            self._refresh_task = None

    # -- queries ------------------------------------------------------------

    def all_models(self) -> list[RegisteredModel]:
        return list(self._models.values())

    def providers_for_model(self, model_id: str) -> list[str]:
        """Return enabled provider ids that serve a given concrete model id."""
        priority = {p.id: p.priority for p in self._config.enabled_providers()}
        provider_ids = [
            pid
            for (pid, mid), m in self._models.items()
            if mid == model_id
            and m.status == "active"
            and pid in priority
            and (pid, mid) not in self._disabled
        ]
        return sorted(set(provider_ids), key=lambda pid: priority[pid])

    def is_enabled(self, provider_id: str, model_id: str) -> bool:
        """True unless the user has toggled this model off."""
        return (provider_id, model_id) not in self._disabled

    def supports_vision(self, provider_id: str, model_id: str) -> bool:
        """True if this model can accept image input (multimodal).

        Uses the inferred "vision" tag, plus a pattern for known multimodal
        families (their ids rarely contain the word "vision" but they do accept
        images): GPT-5/4o, Claude Opus/Sonnet, Gemini, Qwen-VL, Llama-vision,
        Pixtral, LLaVA, etc. Everything else is treated as text-only so image
        content is stripped instead of erroring.
        """
        m = self._models.get((provider_id, model_id))
        if m and "vision" in (m.capabilities or []):
            return True
        return bool(_VISION_MODEL_RE.search((model_id or "").lower()))

    def supports_reasoning(self, provider_id: str, model_id: str) -> bool:
        """True if this model performs extended reasoning/"thinking".

        Registered models are authoritative — their "reasoning" capability is
        set at discovery from the provider's own catalogue (NVIDIA) or the
        id family-pattern (other providers), so we trust it exactly. Only
        unregistered models (e.g. a freshly-added custom provider not yet in
        the registry) fall back to the family pattern.
        """
        m = self._models.get((provider_id, model_id))
        if m is not None:
            return "reasoning" in (m.capabilities or [])
        return bool(_REASONING_MODEL_RE.search((model_id or "").lower()))

    def routable_models(self) -> list[tuple[str, str]]:
        """All chat-routable (provider_id, model_id) pairs.

        Ordered by the Auto routing strategy when one is set (the dashboard's
        Routing Strategy / Manual order); otherwise by provider priority. Skips
        embeddings, disabled, and non-keyed providers.
        """
        priority = {p.id: p.priority for p in self._config.enabled_providers()}
        # Position of each model_id in the user-defined Auto order (lower first).
        order_idx = {mid: i for i, mid in enumerate(self._auto_order)}
        BIG = len(order_idx) + 1
        items: list[tuple[int, int, str, str]] = []
        for (pid, mid), m in self._models.items():
            if (
                m.status == "active"
                and pid in priority
                and (pid, mid) not in self._disabled
                and "embed" not in (m.capabilities or [])
            ):
                # Primary sort: position in the Auto order (models not listed go
                # last). Secondary: provider priority (keeps same-model failover
                # deterministic).
                items.append((order_idx.get(mid, BIG), priority[pid], pid, mid))
        items.sort(key=lambda x: (x[0], x[1]))
        return [(pid, mid) for _, _, pid, mid in items]

    def set_auto_order(self, order: list[str]) -> None:
        """Set the ordered model_id list that Auto/fallback routing follows."""
        self._auto_order = [m for m in (order or []) if isinstance(m, str)]

    async def set_model_enabled(
        self, provider_id: str, model_id: str, enabled: bool
    ) -> None:
        """Toggle a model on/off and persist the choice via the key store."""
        key = (provider_id, model_id)
        if enabled:
            self._disabled.discard(key)
        else:
            self._disabled.add(key)
        if self._keystore is not None:
            await self._keystore.set_model_enabled(provider_id, model_id, enabled)

    async def _load_disabled(self) -> None:
        """Load persisted per-model enable/disable overrides from the store."""
        if self._keystore is None:
            return
        try:
            overrides = await self._keystore.model_overrides()
        except Exception:
            return
        self._disabled = {k for k, enabled in overrides.items() if not enabled}

    def models_for_provider(self, provider_id: str) -> list[RegisteredModel]:
        return [m for (pid, _), m in self._models.items() if pid == provider_id]

    def get_model(self, provider_id: str, model_id: str) -> RegisteredModel | None:
        return self._models.get((provider_id, model_id))

    async def register_custom_models(
        self, provider_id: str, model_ids: list[str]
    ) -> None:
        """Register a custom provider's user-supplied models as active (no probe
        — the user listed them explicitly). Replaces any previous set."""
        async with self._lock:
            # Drop stale entries for this provider first.
            for key in [k for k in self._models if k[0] == provider_id]:
                del self._models[key]
            now = datetime.now(timezone.utc)
            for mid in model_ids:
                if not mid:
                    continue
                model = RegisteredModel(
                    model_id=mid,
                    provider_id=provider_id,
                    canonical_aliases=self._aliases_for_model(mid),
                    context_window=None,
                    capabilities=_infer_capabilities(mid),
                    rate_limits=None,
                    status="active",
                    last_verified=now,
                    avg_latency_ms=None,
                )
                self._models[(provider_id, mid)] = model
                await self._persist(model)

    async def unregister_provider_models(self, provider_id: str) -> None:
        """Remove all models for a provider (used when a custom provider is
        deleted)."""
        async with self._lock:
            for key in [k for k in self._models if k[0] == provider_id]:
                del self._models[key]
        try:
            async with aiosqlite.connect(self._db_path) as db:
                await db.execute(
                    "DELETE FROM models WHERE provider_id=?", (provider_id,)
                )
                await db.commit()
        except Exception:
            pass

    async def record_latency(
        self, provider_id: str, model_id: str, latency_ms: float
    ) -> None:
        """Update a model's rolling average latency after a real request."""
        async with self._lock:
            model = self._models.get((provider_id, model_id))
            if model is None:
                return
            if model.avg_latency_ms is None:
                model.avg_latency_ms = round(latency_ms, 1)
            else:
                # Exponential moving average (alpha=0.3).
                model.avg_latency_ms = round(
                    0.7 * model.avg_latency_ms + 0.3 * latency_ms, 1
                )
            model.last_verified = datetime.now(timezone.utc)

    # -- lifecycle ----------------------------------------------------------

    async def startup(self) -> None:
        await self.init_db()
        await self._load_from_db()
        await self._load_disabled()
        # Initial discovery runs inside the refresh loop (background) so the
        # server is reachable immediately; models appear as they're validated.
        await self.start_background_refresh()

    async def shutdown(self) -> None:
        await self.stop_background_refresh()


if __name__ == "__main__":  # pragma: no cover - manual verification helper.
    import sys

    from core.config import load_config

    async def _main() -> None:
        from core.http_client import HTTPClientManager

        cfg = load_config("config.yaml")
        logging.basicConfig(level="INFO", format="%(levelname)s %(name)s: %(message)s")
        http = HTTPClientManager(cfg)
        await http.startup()
        registry = ModelRegistry(cfg, http)
        await registry.init_db()
        await registry.discover_all()
        print(f"\nTotal models discovered: {len(registry.all_models())}")
        for m in registry.all_models()[:20]:
            print(f"  {m.provider_id:<12} {m.model_id:<45} {m.status} caps={m.capabilities}")
        await http.shutdown()

    sys.exit(asyncio.run(_main()) or 0)
