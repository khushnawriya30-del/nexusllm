"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import type { ProviderStatus } from "@/lib/types";
import { ResourceBarTooltip } from "./ResourceBarTooltip";

export function ResourceBar({
  providers,
  onJump,
}: {
  providers: ProviderStatus[];
  onJump?: (id: string) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  // Cumulative offset for tooltip x-position (center of each segment).
  let cumulative = 0;
  const centers: Record<string, number> = {};
  for (const p of providers) {
    centers[p.id] = cumulative + p.weight_percent / 2;
    cumulative += p.weight_percent;
  }

  const hoveredProvider = providers.find((p) => p.id === hovered);

  return (
    <div className="relative">
      <div className="relative flex h-10 w-full overflow-hidden rounded-lg border border-border">
        {providers.map((p, i) => (
          <motion.button
            key={p.id}
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: `${p.weight_percent}%`, opacity: 1 }}
            transition={{ duration: 0.8, delay: i * 0.05, ease: "easeOut" }}
            onMouseEnter={() => setHovered(p.id)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => onJump?.(p.id)}
            className="h-full min-w-[2px] cursor-pointer transition-opacity hover:opacity-80"
            style={{
              backgroundColor: p.color,
              opacity: p.circuit_state === "OPEN" ? 0.4 : 1,
            }}
            aria-label={`${p.name}: ${p.weight_percent}%`}
          />
        ))}
      </div>

      <AnimatePresence>
        {hoveredProvider && (
          <ResourceBarTooltip
            provider={hoveredProvider}
            x={centers[hoveredProvider.id]}
          />
        )}
      </AnimatePresence>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-2">
        {providers.map((p) => (
          <button
            key={p.id}
            onClick={() => onJump?.(p.id)}
            className="flex items-center gap-1.5 rounded-full border border-border bg-bg-secondary px-2.5 py-1 text-xs text-txt-secondary transition-colors hover:text-txt-primary"
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: p.color }}
            />
            {p.name}
          </button>
        ))}
      </div>
    </div>
  );
}
