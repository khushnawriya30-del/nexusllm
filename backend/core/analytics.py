"""
Analytics aggregation for NexusLLM.

Pure functions that turn persisted `request_logs` rows (from RequestLogStore)
into the shapes the Analytics dashboard needs: overview metrics, per-provider
and per-model breakdowns, time-series for charts, recent errors, and a
filtered/sorted/paginated recent-requests view.

Cost & savings are estimated from a per-model paid-equivalent Price_Table.
Because every provider here is free-tier, "savings" == the paid-equivalent
cost that was avoided (i.e. equal to the estimated cost).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

# ---------------------------------------------------------------------------
# Price table — paid-equivalent USD per 1,000,000 tokens (input, output).
# Matched by keyword against the model id; a default applies otherwise. These
# are rough public-pricing estimates used only to quantify "savings".
# ---------------------------------------------------------------------------

_PRICE_RULES: list[tuple[tuple[str, ...], float, float]] = [
    # (keywords, input_per_1M, output_per_1M)
    (("gpt-4o-mini", "4.1-nano", "4.1-mini"), 0.15, 0.60),
    (("gpt-4o", "gpt-4.1", "gpt-5"), 2.50, 10.00),
    (("o1", "o3", "o4"), 3.00, 12.00),
    (("405b", "ultra", "large", "120b", "180b", "235b", "480b"), 0.90, 0.90),
    (("70b", "72b", "90b", "compound"), 0.60, 0.80),
    (("gemini", "gemma"), 0.30, 0.60),
    (("mistral", "mixtral", "codestral", "ministral"), 0.25, 0.55),
    (("32b", "27b", "24b", "scout", "maverick"), 0.25, 0.45),
    (("8b", "7b", "3b", "1b", "mini", "flash-lite", "nano", "small"), 0.08, 0.20),
    (("embed", "bge", "nv-embed", "nomic"), 0.02, 0.0),
]
_DEFAULT_PRICE = (0.40, 1.20)


def price_for(model_id: str | None) -> tuple[float, float]:
    """Return (input_per_1M, output_per_1M) USD for a model id."""
    if not model_id:
        return _DEFAULT_PRICE
    lower = model_id.lower()
    for keywords, pin, pout in _PRICE_RULES:
        if any(k in lower for k in keywords):
            return pin, pout
    return _DEFAULT_PRICE


def estimate_cost(model_id: str | None, input_tokens: int, output_tokens: int) -> float:
    """Paid-equivalent USD cost for the given token usage of a model."""
    pin, pout = price_for(model_id)
    return (input_tokens / 1_000_000) * pin + (output_tokens / 1_000_000) * pout


# ---------------------------------------------------------------------------
# Row helpers
# ---------------------------------------------------------------------------


def _is_success(row: dict[str, Any]) -> bool:
    sc = row.get("status_code")
    return sc is not None and 200 <= int(sc) < 400


def _parse_ts(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, TypeError):
        return None


def parse_range(range_str: str | None) -> tuple[datetime, datetime]:
    """Resolve a range token (24h/7d/30d/90d) to (start, end) in UTC."""
    now = datetime.now(timezone.utc)
    mapping = {"24h": timedelta(hours=24), "7d": timedelta(days=7),
               "30d": timedelta(days=30), "90d": timedelta(days=90)}
    delta = mapping.get((range_str or "24h").lower(), timedelta(hours=24))
    return now - delta, now


def _bucket_seconds(start: datetime, end: datetime) -> int:
    """Pick a sensible time-bucket width for the range."""
    total = (end - start).total_seconds()
    if total <= 26 * 3600:
        return 3600            # hourly
    if total <= 8 * 86400:
        return 6 * 3600        # 6-hourly
    return 86400               # daily


# ---------------------------------------------------------------------------
# Filtering
# ---------------------------------------------------------------------------


def filter_rows(
    rows: list[dict[str, Any]],
    *,
    start: datetime | None = None,
    end: datetime | None = None,
    provider: str | None = None,
    model: str | None = None,
    status: str | None = None,          # "success" | "failed"
    request_type: str | None = None,    # chat | embeddings | completions
    min_tokens: int | None = None,
    max_tokens: int | None = None,
    search: str | None = None,
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for r in rows:
        ts = _parse_ts(r.get("timestamp"))
        if start and (ts is None or ts < start):
            continue
        if end and (ts is None or ts > end):
            continue
        if provider and r.get("provider_used") != provider:
            continue
        if model and r.get("model_used") != model:
            continue
        if status == "success" and not _is_success(r):
            continue
        if status == "failed" and _is_success(r):
            continue
        if request_type and (r.get("request_type") or "chat") != request_type:
            continue
        total_tok = (r.get("prompt_tokens") or 0) + (r.get("completion_tokens") or 0)
        if min_tokens is not None and total_tok < min_tokens:
            continue
        if max_tokens is not None and total_tok > max_tokens:
            continue
        if search:
            hay = f"{r.get('model_used') or ''} {r.get('model_requested') or ''} {r.get('provider_used') or ''}".lower()
            if search.lower() not in hay:
                continue
        out.append(r)
    return out


# ---------------------------------------------------------------------------
# Aggregations
# ---------------------------------------------------------------------------


def compute_overview(rows: list[dict[str, Any]]) -> dict[str, Any]:
    total = len(rows)
    success = sum(1 for r in rows if _is_success(r))
    failed = total - success
    inp = sum(r.get("prompt_tokens") or 0 for r in rows)
    out = sum(r.get("completion_tokens") or 0 for r in rows)
    latencies = [r.get("total_latency_ms") or 0 for r in rows if _is_success(r)]
    avg_latency = round(sum(latencies) / len(latencies), 1) if latencies else 0
    cost = sum(
        estimate_cost(r.get("model_used"), r.get("prompt_tokens") or 0,
                      r.get("completion_tokens") or 0)
        for r in rows
    )
    providers = {r.get("provider_used") for r in rows if r.get("provider_used")}
    models = {r.get("model_used") for r in rows if r.get("model_used")}
    return {
        "total_requests": total,
        "successful_requests": success,
        "failed_requests": failed,
        "success_rate": round(100 * success / total, 1) if total else 0,
        "error_rate": round(100 * failed / total, 1) if total else 0,
        "input_tokens": inp,
        "output_tokens": out,
        "total_tokens": inp + out,
        "avg_latency_ms": avg_latency,
        "estimated_cost": round(cost, 4),
        "estimated_savings": round(cost, 4),
        "active_providers": len(providers),
        "active_models": len(models),
    }


def compute_providers(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[str, list[dict[str, Any]]] = {}
    for r in rows:
        pid = r.get("provider_used") or "unknown"
        groups.setdefault(pid, []).append(r)
    result = []
    for pid, grp in groups.items():
        total = len(grp)
        success = sum(1 for r in grp if _is_success(r))
        inp = sum(r.get("prompt_tokens") or 0 for r in grp)
        out = sum(r.get("completion_tokens") or 0 for r in grp)
        lat = [r.get("total_latency_ms") or 0 for r in grp if _is_success(r)]
        cost = sum(
            estimate_cost(r.get("model_used"), r.get("prompt_tokens") or 0,
                          r.get("completion_tokens") or 0)
            for r in grp
        )
        result.append({
            "provider": pid,
            "requests": total,
            "success_rate": round(100 * success / total, 1) if total else 0,
            "error_rate": round(100 * (total - success) / total, 1) if total else 0,
            "avg_latency_ms": round(sum(lat) / len(lat), 1) if lat else 0,
            "input_tokens": inp,
            "output_tokens": out,
            "total_tokens": inp + out,
            "estimated_cost": round(cost, 4),
            "estimated_savings": round(cost, 4),
        })
    result.sort(key=lambda x: x["requests"], reverse=True)
    return result


def compute_models(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[str, list[dict[str, Any]]] = {}
    for r in rows:
        mid = r.get("model_used") or r.get("model_requested") or "unknown"
        groups.setdefault(mid, []).append(r)
    result = []
    for mid, grp in groups.items():
        total = len(grp)
        success = sum(1 for r in grp if _is_success(r))
        inp = sum(r.get("prompt_tokens") or 0 for r in grp)
        out = sum(r.get("completion_tokens") or 0 for r in grp)
        lat = [r.get("total_latency_ms") or 0 for r in grp if _is_success(r)]
        cost = sum(
            estimate_cost(mid, r.get("prompt_tokens") or 0,
                          r.get("completion_tokens") or 0)
            for r in grp
        )
        provider = next((r.get("provider_used") for r in grp if r.get("provider_used")), None)
        result.append({
            "model": mid,
            "provider": provider,
            "requests": total,
            "successful": success,
            "failed": total - success,
            "success_rate": round(100 * success / total, 1) if total else 0,
            "avg_latency_ms": round(sum(lat) / len(lat), 1) if lat else 0,
            "input_tokens": inp,
            "output_tokens": out,
            "total_tokens": inp + out,
            "estimated_cost": round(cost, 4),
            "estimated_savings": round(cost, 4),
        })
    result.sort(key=lambda x: x["requests"], reverse=True)
    return result


def compute_series(
    rows: list[dict[str, Any]], start: datetime, end: datetime
) -> dict[str, Any]:
    bucket = _bucket_seconds(start, end)
    n = max(1, int((end - start).total_seconds() // bucket) + 1)
    points = []
    for i in range(n):
        b_start = start + timedelta(seconds=i * bucket)
        points.append({
            "t": b_start.isoformat(),
            "requests": 0, "input_tokens": 0, "output_tokens": 0,
            "total_tokens": 0, "successful": 0, "failed": 0,
            "_lat_sum": 0, "_lat_n": 0, "latency_ms": 0,
            "cost": 0.0, "savings": 0.0,
        })

    for r in rows:
        ts = _parse_ts(r.get("timestamp"))
        if ts is None:
            continue
        idx = int((ts - start).total_seconds() // bucket)
        if idx < 0 or idx >= n:
            continue
        p = points[idx]
        inp = r.get("prompt_tokens") or 0
        out = r.get("completion_tokens") or 0
        p["requests"] += 1
        p["input_tokens"] += inp
        p["output_tokens"] += out
        p["total_tokens"] += inp + out
        if _is_success(r):
            p["successful"] += 1
            p["_lat_sum"] += r.get("total_latency_ms") or 0
            p["_lat_n"] += 1
        else:
            p["failed"] += 1
        c = estimate_cost(r.get("model_used"), inp, out)
        p["cost"] = round(p["cost"] + c, 4)
        p["savings"] = p["cost"]

    for p in points:
        p["latency_ms"] = round(p["_lat_sum"] / p["_lat_n"], 1) if p["_lat_n"] else 0
        p.pop("_lat_sum"); p.pop("_lat_n")

    # Distributions
    by_provider: dict[str, int] = {}
    by_model: dict[str, int] = {}
    errors_by_type: dict[str, int] = {}
    errors_by_provider: dict[str, int] = {}
    for r in rows:
        if r.get("provider_used"):
            by_provider[r["provider_used"]] = by_provider.get(r["provider_used"], 0) + 1
        mid = r.get("model_used") or r.get("model_requested")
        if mid:
            by_model[mid] = by_model.get(mid, 0) + 1
        if not _is_success(r):
            sc = r.get("status_code")
            etype = f"HTTP {sc}" if sc else "Network/timeout"
            errors_by_type[etype] = errors_by_type.get(etype, 0) + 1
            pid = r.get("provider_used") or "unknown"
            errors_by_provider[pid] = errors_by_provider.get(pid, 0) + 1

    def _dist(d: dict[str, int]) -> list[dict[str, Any]]:
        return sorted(
            [{"name": k, "value": v} for k, v in d.items()],
            key=lambda x: x["value"], reverse=True,
        )

    success_total = sum(1 for r in rows if _is_success(r))
    return {
        "bucket_seconds": bucket,
        "points": points,
        "by_provider": _dist(by_provider),
        "by_model": _dist(by_model),
        "errors_by_type": _dist(errors_by_type),
        "errors_by_provider": _dist(errors_by_provider),
        "success_vs_failed": [
            {"name": "Successful", "value": success_total},
            {"name": "Failed", "value": len(rows) - success_total},
        ],
    }


def recent_errors(rows: list[dict[str, Any]], limit: int = 20) -> list[dict[str, Any]]:
    errs = []
    for r in rows:  # rows are already newest-first
        if _is_success(r):
            continue
        sc = r.get("status_code")
        errs.append({
            "provider": r.get("provider_used"),
            "model": r.get("model_used") or r.get("model_requested"),
            "message": r.get("error_reason") or "Unknown error",
            "error_type": f"HTTP {sc}" if sc else "Network/timeout",
            "status_code": sc,
            "timestamp": r.get("timestamp"),
            "request_id": r.get("request_id"),
        })
        if len(errs) >= limit:
            break
    return errs


def to_request_row(r: dict[str, Any]) -> dict[str, Any]:
    """Shape a log row for the Recent Requests table (with cost/savings)."""
    inp = r.get("prompt_tokens") or 0
    out = r.get("completion_tokens") or 0
    cost = round(estimate_cost(r.get("model_used"), inp, out), 4)
    return {
        "request_id": r.get("request_id"),
        "timestamp": r.get("timestamp"),
        "provider": r.get("provider_used"),
        "model": r.get("model_used") or r.get("model_requested"),
        "request_type": r.get("request_type") or "chat",
        "status": "success" if _is_success(r) else "failed",
        "status_code": r.get("status_code"),
        "input_tokens": inp,
        "output_tokens": out,
        "total_tokens": inp + out,
        "latency_ms": r.get("total_latency_ms") or 0,
        "estimated_cost": cost,
        "estimated_savings": cost,
    }


def query_requests(
    rows: list[dict[str, Any]],
    *,
    sort: str = "timestamp",
    direction: str = "desc",
    page: int = 1,
    page_size: int = 25,
) -> dict[str, Any]:
    shaped = [to_request_row(r) for r in rows]
    reverse = direction.lower() != "asc"
    sortable = {
        "timestamp", "provider", "model", "status", "input_tokens",
        "output_tokens", "total_tokens", "latency_ms", "estimated_cost",
    }
    key = sort if sort in sortable else "timestamp"
    shaped.sort(key=lambda x: (x.get(key) is None, x.get(key)), reverse=reverse)
    total = len(shaped)
    page = max(1, page)
    page_size = max(1, min(page_size, 200))
    start = (page - 1) * page_size
    return {
        "items": shaped[start:start + page_size],
        "total": total,
        "page": page,
        "page_size": page_size,
    }
