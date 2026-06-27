# 🚀 NexusLLM — Free LLM API Manager, Gateway & Chat Playground

A self-hosted, production-grade gateway that unifies dozens of free LLM provider
API keys behind **one stable OpenAI-compatible endpoint**, with intelligent
routing, automatic failover, circuit breakers, a live resource dashboard, and a
built-in streaming chat playground.

> Point your tools (Open WebUI, Continue.dev, scripts) at NexusLLM once. When a
> key gets rate-limited or a provider goes down, NexusLLM fails over
> automatically — your chat never stops.

---

## ✨ Features

- **One unified endpoint** — `POST /v1/chat/completions` (OpenAI-compatible, streaming + non-streaming).
- **Intelligent fallback** — alias → candidate models → providers (by priority) → keys (round-robin), with failure classification (client error vs key error vs provider down vs network).
- **Circuit breakers** — per `(provider, key)` with `CLOSED → OPEN → HALF_OPEN` state machine and exponential back-off.
- **Dynamic model discovery** — polls each provider's `/v1/models` in parallel, persists to SQLite, refreshes in the background.
- **Resource dashboard** — animated, segmented resource bar + provider/model accordion cards.
- **Chat playground** — streaming responses, markdown + syntax highlighting, model selector, params, fallback banner.
- **Admin panel** — live metrics, provider health, circuit-breaker reset, searchable request log, hot config reload.

---

## 🏗️ Architecture

```
                ┌─────────────┐      OpenAI-compatible      ┌──────────────────┐
  Your tools ──▶│  NexusLLM   │──── /v1/chat/completions ──▶│  16+ providers   │
  & playground  │  Gateway    │  routing · failover · CB    │  (Groq, NVIDIA…) │
                └─────────────┘                             └──────────────────┘
                      │
              SQLite (models + logs) · in-memory (circuit breakers + metrics)
```

**Backend** — Python 3.11+, FastAPI, httpx, Pydantic v2, aiosqlite.
**Frontend** — Next.js 14 (App Router), TypeScript, Tailwind, Framer Motion, React Query, Zustand.

---

## 🚀 Quick start (Docker)

```bash
cp .env.example .env        # add the provider keys you have + an admin key
docker compose up --build
```

- Dashboard / Playground / Admin → http://localhost:3000
- Gateway API + Swagger docs → http://localhost:8080/docs

---

## 🛠️ Local development

### Backend

```bash
cd backend
python -m pip install -r requirements.txt
cp .env.example .env        # set NEXUS_ADMIN_KEY and any provider keys
python main.py              # -> http://localhost:8080
```

Verify per phase:

```bash
python -m core.config config.yaml          # Phase 1: config loads & validates
python -m pytest tests/test_circuit_breaker.py -v   # Phase 2
python -m core.registry                     # Phase 3: parallel discovery
python -m pytest tests/test_routing.py -v   # Phase 4
curl http://localhost:8080/health           # Phase 5
```

### Frontend

```bash
cd frontend
npm install
npm run dev                 # -> http://localhost:3000
```

The frontend proxies `/api/*` to the backend (configurable via
`NEXT_PUBLIC_API_URL`), so the browser uses a single origin.

---

## 🔑 Configuration

- **`backend/config.yaml`** — providers, model alias groups, routing tunables. Secrets are referenced as `${ENV_VAR}` and resolved at load time.
- **`backend/.env`** — provider API keys + `NEXUS_ADMIN_KEY` / `NEXUS_PROXY_KEY`.

Providers with no configured key are loaded but skipped by the router until a
key is added. Add keys, then hit **Admin → Hot-reload config** (or
`POST /admin/reload`) to re-discover models without a restart.

### Model aliases

Target a stable name; NexusLLM tries each underlying model in order:

```yaml
model_aliases:
  - alias: "llama-3.1-70b"
    models:
      - "meta/llama-3.1-70b-instruct"   # nvidia
      - "llama-3.1-70b-versatile"        # groq
      - "...-Turbo"                      # fireworks
default_fallback_model: "fast-small"
```

---

## 📡 API

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/v1/chat/completions` | proxy* | Chat (stream + non-stream) |
| GET | `/v1/models` | proxy* | Unified model list |
| POST | `/v1/embeddings` | proxy* | Embeddings |
| POST | `/v1/completions` | proxy* | Legacy completions |
| GET | `/health` | none | Health check |
| GET | `/admin/providers` | admin | Provider statuses (dashboard) |
| GET | `/admin/models` | admin | Full model registry |
| POST | `/admin/reload` | admin | Hot-reload config |
| POST | `/admin/providers/{id}/reset` | admin | Reset circuit breaker |
| GET | `/admin/metrics` | admin | Request metrics |
| GET | `/admin/logs` | admin | Recent request logs |

\* Proxy auth is only enforced when `NEXUS_PROXY_KEY` is set. Admin endpoints
always require `Authorization: Bearer $NEXUS_ADMIN_KEY`.

Every chat response includes routing headers:

```
X-NexusLLM-Provider: nvidia
X-NexusLLM-Model: meta/llama-3.1-70b-instruct
X-NexusLLM-Fallback-Count: 1
X-NexusLLM-Request-ID: <uuid>
```

The playground reads these to show the auto-fallback banner.

---

## 🔐 Security notes

- API keys are loaded from env vars, masked in all logs (`sk-***...1234`), and never returned by the API.
- Admin endpoints require the admin bearer key; if it is unset they return 503 (locked).
- Set `NEXUS_PROXY_KEY` to require auth on the `/v1/*` endpoints before exposing the gateway beyond localhost.
- CORS origins are configurable in `config.yaml` (`cors_allowed_origins`).

---

## 🧪 Tests

```bash
cd backend && python -m pytest -q     # circuit breaker + routing suites
```
