"use client";

import { useState, useMemo, memo } from "react";
import { useAnalytics } from "@/hooks/useAnalytics";
import { FiltersBar } from "@/components/analytics/FiltersBar";
import { StatCards } from "@/components/analytics/StatCards";
import {
  AreaTrend,
  BarDist,
  ChartCard,
  LineTrend,
  PieDist,
  StackedTokens,
} from "@/components/analytics/Charts";
import {
  ModelBreakdown,
  ProviderBreakdown,
  RecentErrors,
} from "@/components/analytics/Breakdowns";
import { RecentRequestsTable } from "@/components/analytics/RecentRequestsTable";
import type { AnalyticsFilters } from "@/lib/types";

export default function AnalyticsPage() {
  const [filters, setFilters] = useState<AnalyticsFilters>({ range: "24h" });
  const { data, isLoading, error, isFetching } = useAnalytics(filters);

  const providers = useMemo(() => data?.providers.map((p) => p.provider) ?? [], [data?.providers]);
  const models = useMemo(() => data?.models.map((m) => m.model) ?? [], [data?.models]);

  const series = data?.series;
  const points = useMemo(() => series?.points ?? [], [series?.points]);
  const noPoints = points.length === 0;

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 lg:px-10">
      {/* Title row */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-semibold">
            Analytics
            {isFetching && (
              <span
                className="h-1.5 w-1.5 rounded-full bg-txt-tertiary"
                title="Live updating"
              />
            )}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-txt-secondary">
            Every request across all providers and models is tracked here —
            usage, latency, cost saved, and errors. Updates automatically.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6">
        <FiltersBar
          filters={filters}
          onChange={setFilters}
          providers={providers}
          models={models}
        />
      </div>

      {error && (
        <div className="mb-6 overflow-hidden rounded-2xl border border-red-500/30 bg-gradient-to-br from-red-500/10 to-red-600/5 p-4 shadow-lg">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-500/20">
              <svg className="h-4 w-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-red-300">
                Couldn't load analytics
              </p>
              <p className="mt-1 text-xs text-red-400/80">
                Make sure the backend is running on port 8080 and your admin key is set.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Overview cards */}
      <StatCards data={data?.overview} loading={isLoading} />

      {/* Time-series charts */}
      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChartCard title="Requests over time" empty={noPoints}>
          <LineTrend data={points} dataKey="requests" color="#e5e5e5" />
        </ChartCard>
        <ChartCard title="Token usage over time" empty={noPoints}>
          <AreaTrend data={points} dataKey="total_tokens" color="#e5e5e5" />
        </ChartCard>
        <ChartCard title="Input vs output tokens" empty={noPoints}>
          <StackedTokens data={points} />
        </ChartCard>
        <ChartCard title="Average latency trend" empty={noPoints}>
          <LineTrend data={points} dataKey="latency_ms" color="#a1a1aa" />
        </ChartCard>
        <ChartCard title="Cost trend" subtitle="Paid-equivalent cost" empty={noPoints}>
          <AreaTrend data={points} dataKey="cost" color="#a1a1aa" />
        </ChartCard>
        <ChartCard title="Savings trend" subtitle="Cost avoided on free tiers" empty={noPoints}>
          <AreaTrend data={points} dataKey="savings" color="#e5e5e5" />
        </ChartCard>
      </div>

      {/* Distribution charts */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <ChartCard title="Requests by provider" empty={!series || series.by_provider.length === 0}>
          <BarDist data={series?.by_provider ?? []} />
        </ChartCard>
        <ChartCard title="Requests by model" empty={!series || series.by_model.length === 0}>
          <BarDist data={series?.by_model ?? []} />
        </ChartCard>
        <ChartCard title="Provider distribution" empty={!series || series.by_provider.length === 0}>
          <PieDist data={series?.by_provider ?? []} />
        </ChartCard>
        <ChartCard title="Success vs failed" empty={!series || series.success_vs_failed.length === 0}>
          <PieDist
            data={series?.success_vs_failed ?? []}
            colors={["#e5e5e5", "#52525b"]}
          />
        </ChartCard>
        <ChartCard title="Error distribution" empty={!series || series.errors_by_type.length === 0}>
          <PieDist data={series?.errors_by_type ?? []} />
        </ChartCard>
        <ChartCard title="Errors by provider" empty={!series || series.errors_by_provider.length === 0}>
          <BarDist data={series?.errors_by_provider ?? []} />
        </ChartCard>
      </div>

      {/* Provider analytics table */}
      <div className="mt-8">
        <ProviderBreakdown data={data?.providers ?? []} />
      </div>

      {/* Model breakdown + recent errors */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ModelBreakdown data={data?.models ?? []} />
        <RecentErrors data={data?.errors ?? []} />
      </div>

      {/* Recent requests table */}
      <div className="mt-8">
        <RecentRequestsTable base={filters} />
      </div>
    </div>
  );
}
