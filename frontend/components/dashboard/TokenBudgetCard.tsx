"use client";

import { useMemo, useState } from "react";
import type { ProviderStatus } from "@/lib/types";
import { formatCompact } from "@/lib/formatting";
import { colorForProvider } from "@/lib/colors";

interface FlatModel {
  id: string;
  provider: string;
  providerName: string;
  color: string;
  tokens: number;
  free: boolean;
  embed: boolean;
}

/** Flatten provider.models into a single list with per-model token budgets. */
function flattenModels(providers: ProviderStatus[]): FlatModel[] {
  const out: (FlatModel & { monthlyAccount: boolean })[] = [];
  for (const p of providers) {
    for (const m of p.models) {
      if (m.enabled === false) continue; // user toggled this model off
      const rl = m.rate_limits;
      // Distinguish an ACCOUNT-level monthly allowance (tokens_per_month, e.g.
      // Mistral's free 1B/month shared across all its models) from PER-MODEL
      // daily quotas (tokens_per_day, e.g. Groq/Google/Cerebras — independent
      // per model). The former must NOT be multiplied by model count.
      const monthlyAccount = rl?.tokens_per_month != null;
      const monthly =
        rl?.tokens_per_month != null
          ? rl.tokens_per_month
          : rl?.tokens_per_day != null
            ? rl.tokens_per_day * 30
            : rl?.requests_per_day != null
              ? rl.requests_per_day * 2000 * 30
              : 0;
      out.push({
        id: m.model_id,
        provider: p.id,
        providerName: p.name,
        color: colorForProvider(p.id),
        tokens: monthly,
        free: p.category === "free",
        embed: (m.capabilities || []).includes("embed"),
        monthlyAccount,
      });
    }
  }

  // For providers whose budget is an account-level monthly allowance, split
  // that single allowance across the provider's models so the grid + total
  // reflect the real shared budget (not allowance × model-count).
  const provCounts = new Map<string, number>();
  for (const m of out) provCounts.set(m.provider, (provCounts.get(m.provider) ?? 0) + 1);
  for (const m of out) {
    if (m.monthlyAccount) {
      const count = provCounts.get(m.provider) ?? 1;
      m.tokens = count > 0 ? m.tokens / count : m.tokens;
    }
  }

  const totals = new Map<string, number>();
  for (const m of out) totals.set(m.provider, (totals.get(m.provider) ?? 0) + m.tokens);
  return out.sort((a, b) => {
    const ta = totals.get(a.provider) ?? 0;
    const tb = totals.get(b.provider) ?? 0;
    if (tb !== ta) return tb - ta;
    if (a.provider !== b.provider) return a.provider.localeCompare(b.provider);
    return b.tokens - a.tokens;
  });
}

const INITIAL_VISIBLE = 12;

export function TokenBudgetCard({
  providers,
  kind = "chat",
}: {
  providers: ProviderStatus[];
  kind?: "chat" | "embeddings";
}) {
  const [showAll, setShowAll] = useState(false);

  const models = useMemo(
    () => flattenModels(providers).filter((m) => (kind === "embeddings" ? m.embed : !m.embed)),
    [providers, kind],
  );
  const total = useMemo(() => models.reduce((s, m) => s + m.tokens, 0), [models]);

  const visible = showAll ? models : models.slice(0, INITIAL_VISIBLE);

  return (
    <div className="rounded-3xl border border-white/[0.06] bg-bg-secondary/50 p-6 lg:p-8">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-txt-primary">Monthly token budget</h2>
        {total > 0 && (
          <span className="text-sm text-txt-tertiary">
            {formatCompact(total)} remaining ·{" "}
            <span className="text-txt-secondary">100% of {formatCompact(total)}</span>
          </span>
        )}
      </div>

      {/* Segmented bar */}
      <div className="mb-7 flex h-4 w-full overflow-hidden rounded-full bg-bg-primary/60 ring-1 ring-white/[0.04]">
        {total > 0 ? (
          models.map((m) => (
            <div
              key={`${m.provider}-${m.id}`}
              className="h-full transition-[filter] duration-200 hover:brightness-125"
              style={{
                width: `${(m.tokens / total) * 100}%`,
                backgroundColor: m.color,
                boxShadow: `0 0 10px ${m.color}, 0 0 4px ${m.color} inset`,
              }}
              title={`${m.id} · ${formatCompact(m.tokens)} (${m.providerName})`}
            />
          ))
        ) : (
          <div className="flex w-full items-center justify-center text-xs text-txt-tertiary">
            No models configured yet
          </div>
        )}
      </div>

      {/* Model grid (compact) */}
      {models.length > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-x-10 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((m) => (
              <div
                key={`${m.provider}-${m.id}`}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: m.color, boxShadow: `0 0 6px ${m.color}` }}
                  />
                  <span className="truncate text-txt-secondary" title={m.id}>
                    {m.id}
                    {m.free && <span className="text-txt-tertiary"> (free)</span>}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-xs text-txt-tertiary">
                  {formatCompact(m.tokens)}
                </span>
              </div>
            ))}
          </div>

          {models.length > INITIAL_VISIBLE && (
            <div className="mt-6 flex justify-center">
              <button
                onClick={() => setShowAll((s) => !s)}
                className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-bg-secondary/70 px-4 py-1.5 text-xs text-txt-secondary transition-colors hover:text-txt-primary"
              >
                {showAll ? "Show less" : `Show all ${models.length} models`}
                <span className={showAll ? "rotate-180" : ""}>⌄</span>
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-bg-primary/30 py-12 text-center">
          <p className="text-sm font-medium text-txt-secondary">No models configured yet</p>
          <p className="max-w-md text-sm leading-relaxed text-txt-tertiary">
            Add provider API keys on the Keys page, then they’ll appear here once
            discovered.
          </p>
        </div>
      )}
    </div>
  );
}
