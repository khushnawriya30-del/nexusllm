"use client";

import type { AnalyticsOverview } from "@/lib/types";
import { formatCompact, formatLatency } from "@/lib/formatting";

function money(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n > 0) return `$${n.toFixed(4)}`;
  return "$0.00";
}

export function StatCards({
  data,
  loading,
}: {
  data?: AnalyticsOverview;
  loading?: boolean;
}) {
  const cards: { label: string; value: string }[] = data
    ? [
        { label: "Total Requests", value: formatCompact(data.total_requests) },
        { label: "Successful", value: formatCompact(data.successful_requests) },
        { label: "Failed", value: formatCompact(data.failed_requests) },
        { label: "Success Rate", value: `${data.success_rate}%` },
        { label: "Error Rate", value: `${data.error_rate}%` },
        { label: "Input Tokens", value: formatCompact(data.input_tokens) },
        { label: "Output Tokens", value: formatCompact(data.output_tokens) },
        { label: "Total Tokens", value: formatCompact(data.total_tokens) },
        { label: "Avg Latency", value: formatLatency(data.avg_latency_ms) },
        { label: "Est. Cost", value: money(data.estimated_cost) },
        { label: "Est. Savings", value: money(data.estimated_savings) },
        { label: "Active Providers", value: `${data.active_providers}` },
        { label: "Active Models", value: `${data.active_models}` },
      ]
    : [];

  if (loading && !data) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-[78px] animate-pulse rounded-2xl bg-bg-secondary/50" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-2xl border border-white/[0.06] bg-bg-secondary/50 px-4 py-3.5"
        >
          <p className="text-[11px] uppercase tracking-wide text-txt-tertiary">
            {c.label}
          </p>
          <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-txt-primary">
            {c.value}
          </p>
        </div>
      ))}
    </div>
  );
}
