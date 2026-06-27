"use client";

import { CAPABILITY_COLORS } from "@/lib/colors";

export function CapabilityBadge({ capability }: { capability: string }) {
  const color = CAPABILITY_COLORS[capability] ?? "#71717a";
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
      style={{ backgroundColor: `${color}22`, color }}
    >
      {capability}
    </span>
  );
}
