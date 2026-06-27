"use client";

import type { AnalyticsFilters } from "@/lib/types";
import { motion } from "framer-motion";

const RANGES = [
  { key: "24h", label: "24h" },
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
  { key: "90d", label: "90d" },
];

export function FiltersBar({
  filters,
  onChange,
  providers,
  models,
}: {
  filters: AnalyticsFilters;
  onChange: (f: AnalyticsFilters) => void;
  providers: string[];
  models: string[];
}) {
  const set = (patch: Partial<AnalyticsFilters>) =>
    onChange({ ...filters, ...patch });

  const clear = () => onChange({ range: filters.range });

  const hasFilters =
    filters.provider ||
    filters.model ||
    filters.status ||
    filters.request_type ||
    filters.min_tokens ||
    filters.max_tokens;

  const selectCls =
    "rounded-xl border border-white/[0.08] bg-bg-secondary/80 px-4 py-2 text-xs font-medium text-txt-secondary backdrop-blur-sm transition-all duration-200 hover:border-white/[0.15] hover:bg-bg-tertiary hover:text-txt-primary focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20";

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-bg-secondary/80 to-bg-secondary/40 p-4 shadow-lg backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-3">
        {/* Range pills */}
        <div className="relative inline-flex items-center gap-1 rounded-xl border border-white/[0.08] bg-bg-primary/50 p-1 backdrop-blur-sm">
          {RANGES.map((r) => {
            const active = filters.range === r.key;
            return (
              <button
                key={r.key}
                onClick={() => set({ range: r.key })}
                className="relative z-10 rounded-lg px-4 py-1.5 text-xs font-medium transition-all duration-200"
              >
                <span className={active ? "text-txt-primary" : "text-txt-secondary"}>
                  {r.label}
                </span>
                {active && (
                  <motion.div
                    layoutId="range-bg"
                    className="absolute inset-0 rounded-lg bg-gradient-to-br from-indigo-500/20 to-purple-500/20 ring-1 ring-white/[0.08]"
                    transition={{
                      type: "spring",
                      stiffness: 380,
                      damping: 30,
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="h-6 w-px bg-white/[0.08]" />

        {/* Dropdowns */}
        <select
          value={filters.provider ?? ""}
          onChange={(e) => set({ provider: e.target.value || undefined })}
          className={selectCls}
        >
          <option value="">All providers</option>
          {providers.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <select
          value={filters.model ?? ""}
          onChange={(e) => set({ model: e.target.value || undefined })}
          className={selectCls}
        >
          <option value="">All models</option>
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <select
          value={filters.status ?? ""}
          onChange={(e) =>
            set({ status: (e.target.value || undefined) as AnalyticsFilters["status"] })
          }
          className={selectCls}
        >
          <option value="">All status</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
        </select>

        <select
          value={filters.request_type ?? ""}
          onChange={(e) =>
            set({
              request_type: (e.target.value || undefined) as AnalyticsFilters["request_type"],
            })
          }
          className={selectCls}
        >
          <option value="">All types</option>
          <option value="chat">Chat</option>
          <option value="embeddings">Embeddings</option>
          <option value="completions">Completions</option>
        </select>

        {hasFilters && (
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={clear}
            className="flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-medium text-red-400 backdrop-blur-sm transition-all duration-200 hover:border-red-500/50 hover:bg-red-500/20"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Clear filters
          </motion.button>
        )}
      </div>
    </div>
  );
}
