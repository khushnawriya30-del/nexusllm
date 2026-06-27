"use client";

import { motion } from "framer-motion";
import type { ProviderStatus } from "@/lib/types";
import { formatCompact } from "@/lib/formatting";
import { HealthDot } from "@/components/ui/HealthDot";

export function ResourceBarTooltip({
  provider,
  x,
}: {
  provider: ProviderStatus;
  x: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.12 }}
      className="pointer-events-none absolute bottom-full z-50 mb-2 w-60 -translate-x-1/2 rounded-lg border border-border bg-bg-secondary p-3 shadow-xl"
      style={{ left: `${x}%` }}
    >
      <div className="flex items-center gap-2">
        <span
          className="h-3 w-3 rounded-sm"
          style={{ backgroundColor: provider.color }}
        />
        <span className="font-medium">{provider.name}</span>
        <span className="ml-auto">
          <HealthDot state={provider.circuit_state} />
        </span>
      </div>
      <div className="mt-2 space-y-1 text-xs text-txt-secondary">
        <Row label="Keys configured" value={`${provider.key_count}`} />
        <Row
          label="Daily token budget"
          value={formatCompact(provider.daily_token_budget)}
        />
        <Row
          label="Daily request budget"
          value={formatCompact(provider.daily_request_budget)}
        />
        <Row label="Models" value={`${provider.model_count}`} />
        <Row label="Circuit" value={provider.circuit_state} />
        <Row label="Share" value={`${provider.weight_percent}%`} />
      </div>
    </motion.div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-txt-tertiary">{label}</span>
      <span className="font-mono text-txt-primary">{value}</span>
    </div>
  );
}
