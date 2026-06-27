"use client";

import type { CircuitState } from "@/lib/types";

const COLORS: Record<CircuitState, string> = {
  CLOSED: "#10b981", // green — healthy
  HALF_OPEN: "#f59e0b", // amber — degraded
  OPEN: "#ef4444", // red — open
};

export function HealthDot({
  state,
  size = 8,
}: {
  state: CircuitState;
  size?: number;
}) {
  const color = COLORS[state];
  return (
    <span className="relative inline-flex" title={state}>
      <span
        className="inline-block rounded-full"
        style={{ width: size, height: size, backgroundColor: color }}
      />
      {state !== "OPEN" && (
        <span
          className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
          style={{ backgroundColor: color }}
        />
      )}
    </span>
  );
}
