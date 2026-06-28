"use client";

import { useState, useMemo } from "react";
import { useProviders } from "@/hooks/useProviders";
import { SegmentToggle, type ModelKind } from "@/components/dashboard/SegmentToggle";
import { TokenBudgetCard } from "@/components/dashboard/TokenBudgetCard";
import { RoutingStrategyCard } from "@/components/dashboard/RoutingStrategyCard";

export default function ModelsPage() {
  const { data, isLoading, error } = useProviders();
  const [kind, setKind] = useState<ModelKind>("chat");

  const providers = useMemo(() => data?.providers ?? [], [data?.providers]);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 lg:px-10">
      {/* Title row */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-semibold">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            Models
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-txt-secondary">
            {kind === "embeddings"
              ? "Embeddings fail over within a family only: the same model served by another provider. Vectors from different models are incompatible, so the router never swaps families."
              : "Pick a routing strategy. In Manual mode you drag to set the order; the other strategies route by live score across reliability, speed and intelligence."}
          </p>
        </div>
        <SegmentToggle value={kind} onChange={setKind} />
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
                Couldn't reach the backend
              </p>
              <p className="mt-1 text-xs text-red-400/80">
                Set your admin key in the Admin tab and make sure the server is running on port 8080.
              </p>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-6">
          <div className="h-48 w-full overflow-hidden rounded-3xl border border-white/[0.06] bg-gradient-to-br from-bg-secondary/60 to-bg-secondary/30">
            <div className="shimmer h-full w-full" />
          </div>
          <div className="h-72 w-full overflow-hidden rounded-3xl border border-white/[0.06] bg-gradient-to-br from-bg-secondary/60 to-bg-secondary/30">
            <div className="shimmer h-full w-full" />
          </div>
        </div>
      ) : kind === "embeddings" ? (
        <div className="space-y-6">
          <TokenBudgetCard providers={providers} kind="embeddings" />
          <div className="group relative overflow-hidden rounded-3xl border border-white/[0.06] bg-gradient-to-br from-bg-secondary/80 to-bg-secondary/40 p-8 shadow-lg transition-colors hover:border-white/[0.12]">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg">
                <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-base font-semibold text-txt-primary">
                How embeddings route
              </h2>
            </div>
            <p className="leading-relaxed text-txt-secondary">
              Call{" "}
              <span className="rounded-md bg-bg-tertiary/50 px-2 py-0.5 font-mono text-xs text-txt-primary">
                POST /v1/embeddings
              </span>{" "}
              with any embedding model id above. If that exact model is served
              by more than one provider, NexusLLM fails over between those
              providers automatically — but it{" "}
              <span className="font-semibold text-txt-primary">never</span> swaps to a
              different model, since vectors from different models aren't
              comparable.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <TokenBudgetCard providers={providers} kind="chat" />
          <RoutingStrategyCard providers={providers} />
        </div>
      )}
    </div>
  );
}
