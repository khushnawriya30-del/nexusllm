"use client";

import { useState } from "react";
import { useAnalyticsRequests } from "@/hooks/useAnalytics";
import type { AnalyticsFilters } from "@/lib/types";
import { colorForProvider } from "@/lib/colors";
import { formatCompact, formatLatency } from "@/lib/formatting";

function money(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n > 0) return `$${n.toFixed(4)}`;
  return "$0.00";
}

const COLUMNS: { key: string; label: string; sortable?: boolean }[] = [
  { key: "timestamp", label: "Time", sortable: true },
  { key: "provider", label: "Provider", sortable: true },
  { key: "model", label: "Model", sortable: true },
  { key: "status", label: "Status", sortable: true },
  { key: "input_tokens", label: "In", sortable: true },
  { key: "output_tokens", label: "Out", sortable: true },
  { key: "total_tokens", label: "Total", sortable: true },
  { key: "latency_ms", label: "Response", sortable: true },
  { key: "estimated_savings", label: "Savings", sortable: false },
];

export function RecentRequestsTable({ base }: { base: AnalyticsFilters }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("timestamp");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const { data, isLoading } = useAnalyticsRequests({
    ...base,
    search: search || undefined,
    sort,
    direction,
    page,
    page_size: pageSize,
  });

  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const toggleSort = (key: string) => {
    if (sort === key) setDirection((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setDirection("desc");
    }
    setPage(1);
  };

  return (
    <div className="rounded-3xl border border-white/[0.06] bg-bg-secondary/50 p-6 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Recent requests</h3>
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search model / provider…"
          className="w-56 rounded-full border border-white/[0.08] bg-bg-primary px-3 py-1.5 text-xs outline-none focus:border-accent"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wide text-txt-tertiary">
            <tr className="border-b border-white/[0.06]">
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  onClick={() => c.sortable && toggleSort(c.key)}
                  className={`py-2 pr-3 font-medium ${c.sortable ? "cursor-pointer select-none hover:text-txt-primary" : ""}`}
                >
                  {c.label}
                  {sort === c.key && (direction === "asc" ? " ▲" : " ▼")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="py-10 text-center text-xs text-txt-tertiary">
                  {isLoading ? "Loading…" : "No requests match these filters."}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.request_id ?? r.timestamp} className="border-b border-white/[0.04] last:border-0">
                  <td className="py-2 pr-3 text-xs text-txt-tertiary">
                    {new Date(r.timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="py-2 pr-3">
                    <span className="flex items-center gap-1.5 text-xs">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorForProvider(r.provider || "?") }} />
                      {r.provider ?? "—"}
                    </span>
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs">{r.model ?? "—"}</td>
                  <td className="py-2 pr-3">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-mono ${
                        r.status === "success"
                          ? "bg-bg-tertiary text-txt-primary"
                          : "bg-white/[0.04] text-txt-tertiary line-through"
                      }`}
                    >
                      {r.status_code ?? r.status}
                    </span>
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs">{formatCompact(r.input_tokens)}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{formatCompact(r.output_tokens)}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{formatCompact(r.total_tokens)}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{formatLatency(r.latency_ms)}</td>
                  <td className="py-2 pr-3 font-mono text-xs text-txt-secondary">{money(r.estimated_savings)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between text-xs text-txt-tertiary">
        <span>{total} requests</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-full border border-white/[0.08] px-3 py-1 hover:text-txt-primary disabled:opacity-40"
          >
            Prev
          </button>
          <span>
            Page {page} / {pages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            disabled={page >= pages}
            className="rounded-full border border-white/[0.08] px-3 py-1 hover:text-txt-primary disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
