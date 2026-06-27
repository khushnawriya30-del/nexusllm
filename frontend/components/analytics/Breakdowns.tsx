"use client";

import type {
  AnalyticsError,
  ModelAnalytics,
  ProviderAnalytics,
} from "@/lib/types";
import { colorForProvider } from "@/lib/colors";
import { formatCompact, formatLatency, timeAgo } from "@/lib/formatting";

function money(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n > 0) return `$${n.toFixed(4)}`;
  return "$0.00";
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-white/[0.06] bg-bg-secondary/50 p-6 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]">
      <h3 className="mb-4 text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}

export function ProviderBreakdown({ data }: { data: ProviderAnalytics[] }) {
  return (
    <Card title="Provider analytics">
      {data.length === 0 ? (
        <Empty />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-txt-tertiary">
              <tr className="border-b border-white/[0.06]">
                <th className="py-2 pr-3 font-medium">Provider</th>
                <th className="py-2 pr-3 font-medium">Reqs</th>
                <th className="py-2 pr-3 font-medium">Success</th>
                <th className="py-2 pr-3 font-medium">Error</th>
                <th className="py-2 pr-3 font-medium">Latency</th>
                <th className="py-2 pr-3 font-medium">In</th>
                <th className="py-2 pr-3 font-medium">Out</th>
                <th className="py-2 pr-3 text-right font-medium">Savings</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.provider} className="border-b border-white/[0.04] last:border-0">
                  <td className="py-2 pr-3">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colorForProvider(p.provider) }} />
                      {p.provider}
                    </span>
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs">{p.requests}</td>
                  <td className="py-2 pr-3 font-mono text-xs text-txt-secondary">{p.success_rate}%</td>
                  <td className="py-2 pr-3 font-mono text-xs text-txt-tertiary">{p.error_rate}%</td>
                  <td className="py-2 pr-3 font-mono text-xs">{formatLatency(p.avg_latency_ms)}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{formatCompact(p.input_tokens)}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{formatCompact(p.output_tokens)}</td>
                  <td className="py-2 pr-3 text-right font-mono text-xs text-txt-primary">{money(p.estimated_savings)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function ModelBreakdown({ data }: { data: ModelAnalytics[] }) {
  return (
    <Card title="Per-model breakdown">
      {data.length === 0 ? (
        <Empty />
      ) : (
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-bg-secondary/95 text-left text-[11px] uppercase tracking-wide text-txt-tertiary backdrop-blur">
              <tr className="border-b border-white/[0.06]">
                <th className="py-2 pr-3 font-medium">Model</th>
                <th className="py-2 pr-3 font-medium">Provider</th>
                <th className="py-2 pr-3 font-medium">Reqs</th>
                <th className="py-2 pr-3 font-medium">Success</th>
                <th className="py-2 pr-3 font-medium">Latency</th>
                <th className="py-2 pr-3 font-medium">In</th>
                <th className="py-2 pr-3 font-medium">Out</th>
                <th className="py-2 pr-3 text-right font-medium">Savings</th>
              </tr>
            </thead>
            <tbody>
              {data.map((m) => (
                <tr key={m.model} className="border-b border-white/[0.04] last:border-0">
                  <td className="py-2 pr-3 font-mono text-xs">{m.model}</td>
                  <td className="py-2 pr-3 text-xs text-txt-tertiary">{m.provider ?? "—"}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{m.requests}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{m.success_rate}%</td>
                  <td className="py-2 pr-3 font-mono text-xs">{formatLatency(m.avg_latency_ms)}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{formatCompact(m.input_tokens)}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{formatCompact(m.output_tokens)}</td>
                  <td className="py-2 pr-3 text-right font-mono text-xs text-txt-primary">{money(m.estimated_savings)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function RecentErrors({ data }: { data: AnalyticsError[] }) {
  return (
    <Card title="Recent errors">
      {data.length === 0 ? (
        <div className="py-8 text-center text-xs text-txt-tertiary">
          No errors in this range. 🎉
        </div>
      ) : (
        <div className="space-y-2">
          {data.map((e, i) => (
            <div key={i} className="rounded-xl border border-white/[0.06] bg-bg-primary/30 px-3 py-2">
              <div className="flex items-center gap-2 text-xs">
                <span className="rounded bg-bg-tertiary px-1.5 py-0.5 font-mono text-txt-secondary">
                  {e.error_type}
                </span>
                <span className="font-medium">{e.provider ?? "—"}</span>
                <span className="font-mono text-txt-tertiary">{e.model ?? "—"}</span>
                <span className="ml-auto text-txt-tertiary">{timeAgo(e.timestamp)}</span>
              </div>
              <p className="mt-1 truncate text-xs text-txt-secondary" title={e.message}>
                {e.message}
              </p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Empty() {
  return (
    <div className="py-8 text-center text-xs text-txt-tertiary">
      No data for this range yet.
    </div>
  );
}
