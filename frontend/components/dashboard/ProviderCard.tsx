"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { ProviderStatus } from "@/lib/types";
import { formatCompact, formatLatency, timeAgo } from "@/lib/formatting";
import { HealthDot } from "@/components/ui/HealthDot";
import { ModelRow } from "./ModelRow";
import { useUIStore } from "@/store/uiStore";

export function ProviderCard({
  provider,
  filter,
}: {
  provider: ProviderStatus;
  filter: string;
}) {
  const expanded = useUIStore((s) => s.expandedProviders[provider.id] ?? false);
  const toggle = useUIStore((s) => s.toggleProvider);

  const isOpen = provider.circuit_state === "OPEN";
  const models = filter
    ? provider.models.filter((m) =>
        m.model_id.toLowerCase().includes(filter.toLowerCase()),
      )
    : provider.models;

  return (
    <motion.div
      id={`provider-${provider.id}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`group relative overflow-hidden rounded-2xl border backdrop-blur-sm transition-all duration-300 ${
        isOpen
          ? "border-amber-500/40 bg-amber-500/5 shadow-lg shadow-amber-500/10"
          : "border-white/[0.06] bg-gradient-to-br from-bg-secondary/80 to-bg-secondary/40 hover:border-white/[0.12] hover:shadow-xl"
      }`}
    >
      {/* Gradient overlay on hover */}
      <div
        className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background: `radial-gradient(circle at top right, ${provider.color}15, transparent 70%)`,
        }}
      />

      {/* Header */}
      <button
        onClick={() => toggle(provider.id)}
        className="relative z-10 flex w-full items-center gap-4 p-5 text-left transition-all"
      >
        {/* Provider icon with glow */}
        <div className="relative">
          <motion.div
            className="absolute inset-0 rounded-xl opacity-50 blur-md"
            style={{ backgroundColor: provider.color }}
            animate={{
              scale: [1, 1.2, 1],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
          <div
            className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-base font-bold text-white shadow-lg"
            style={{ backgroundColor: provider.color }}
          >
            {provider.name.charAt(0)}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <span className="truncate text-base font-semibold text-txt-primary">
              {provider.name}
            </span>
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                provider.category === "free"
                  ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30"
                  : "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30"
              }`}
            >
              {provider.category === "free" ? "Free" : "Trial"}
            </span>
            <HealthDot state={provider.circuit_state} />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-txt-tertiary">
            <span className="flex items-center gap-1">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              {provider.model_count} models
            </span>
            <span className="flex items-center gap-1">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              {formatCompact(provider.daily_request_budget)}/day
            </span>
            <span className="flex items-center gap-1">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              {formatCompact(provider.daily_token_budget)} tok/day
            </span>
            <span className="flex items-center gap-1">
              🔐 {provider.key_count} keys
            </span>
          </div>
        </div>

        {/* Expand arrow */}
        <motion.div
          animate={{ rotate: expanded ? 90 : 0 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          className="shrink-0"
        >
          <svg className="h-5 w-5 text-txt-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </motion.div>
      </button>

      {/* Accordion */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="relative z-10 overflow-hidden"
          >
            {models.length === 0 ? (
              <div className="border-t border-white/[0.06] px-5 py-4">
                <p className="text-sm text-txt-tertiary">
                  {provider.key_count === 0
                    ? "No API key configured — add a key in .env to discover models."
                    : "No models discovered yet."}
                </p>
              </div>
            ) : (
              <div className="border-t border-white/[0.06] bg-bg-primary/20">
                {models.map((m) => (
                  <ModelRow key={m.model_id} model={m} />
                ))}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-white/[0.06] bg-gradient-to-r from-bg-tertiary/40 to-bg-tertiary/20 px-5 py-3 text-xs text-txt-tertiary">
              <span className="flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Avg: {formatLatency(provider.avg_latency_ms)}
              </span>
              <span className="flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {timeAgo(provider.last_health_check)}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
