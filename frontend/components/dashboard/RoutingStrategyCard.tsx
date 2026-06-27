"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProviderStatus } from "@/lib/types";
import { colorForProvider } from "@/lib/colors";
import { api } from "@/lib/api";

type Strategy =
  | "Manual"
  | "Balanced"
  | "Smartest"
  | "Fastest"
  | "Most reliable"
  | "Custom";

const STRATEGIES: Strategy[] = [
  "Manual",
  "Balanced",
  "Smartest",
  "Fastest",
  "Most reliable",
  "Custom",
];

const TOOLTIPS: Record<Strategy, string> = {
  Manual:
    "Route in the exact order you set below. Drag the handle to reorder. No scoring; the chain is followed top-to-bottom.",
  Balanced:
    "Reliability leads (50%), with speed and intelligence weighted equally (25% each). A sensible all-round default.",
  Smartest:
    "Prefer the most capable model that still works. Intelligence 55%, reliability 35%, speed 10%.",
  Fastest:
    "Prefer the fastest model that still works. Speed 55%, reliability 35%, intelligence 10%.",
  "Most reliable":
    "Maximize success rate above all. Reliability 70%, speed and intelligence 15% each.",
  Custom:
    "Set your own balance of reliability, speed, and intelligence with sliders. Same engine as the preset, just your weights.",
};

const PRESETS: Record<Exclude<Strategy, "Manual" | "Custom">, Weights> = {
  Balanced: { r: 0.5, s: 0.25, i: 0.25 },
  Smartest: { r: 0.35, s: 0.1, i: 0.55 },
  Fastest: { r: 0.35, s: 0.55, i: 0.1 },
  "Most reliable": { r: 0.7, s: 0.15, i: 0.15 },
};

const COLORS = { r: "#10b981", s: "#3b82f6", i: "#a855f7" };

interface Weights {
  r: number;
  s: number;
  i: number;
}

interface RoutedModel {
  id: string;
  provider: string;
  color: string;
  reliability: number;
  speed: number;
  intelligence: number;
  latency: number | null;
  enabled: boolean;
}

function buildRows(providers: ProviderStatus[]): RoutedModel[] {
  const rows: RoutedModel[] = [];
  const latencies = providers
    .flatMap((p) => p.models.map((m) => m.avg_latency_ms))
    .filter((l): l is number => l != null);
  const maxLat = Math.max(1, ...latencies);

  for (const p of providers) {
    const reliability =
      p.circuit_state === "CLOSED" ? 100 : p.circuit_state === "HALF_OPEN" ? 50 : 0;
    for (const m of p.models) {
      if (m.status !== "active") continue;
      if ((m.capabilities || []).includes("embed")) continue;
      // Speed: faster (lower latency) = higher. Models without measured latency
      // get a neutral baseline so they don't all collapse to 0 (which made
      // every strategy produce the same order).
      const speed =
        m.avg_latency_ms != null
          ? Math.round(100 - (m.avg_latency_ms / maxLat) * 100)
          : 55;
      // Intelligence: proxy by context window; unknown gets a mid baseline.
      const intelligence = m.context_window
        ? Math.min(100, Math.round((m.context_window / 200000) * 100))
        : 40;
      rows.push({
        id: m.model_id,
        provider: p.id,
        color: colorForProvider(p.id),
        reliability,
        speed,
        intelligence,
        latency: m.avg_latency_ms,
        enabled: m.enabled !== false,
      });
    }
  }
  return rows;
}

/** Move one slider and proportionally rebalance the other two so sum == 100. */
function rebalance(w: Weights, key: keyof Weights, value: number): Weights {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const others = (["r", "s", "i"] as (keyof Weights)[]).filter((k) => k !== key);
  const remaining = 100 - v;
  const otherSum = w[others[0]] + w[others[1]];
  const next: Weights = { ...w, [key]: v };
  if (otherSum <= 0) {
    next[others[0]] = Math.round(remaining / 2);
    next[others[1]] = remaining - next[others[0]];
  } else {
    next[others[0]] = Math.round((w[others[0]] / otherSum) * remaining);
    next[others[1]] = remaining - next[others[0]];
  }
  return next;
}

/** Weights (0..1) for a given strategy. */
function weightsForStrategy(strategy: Strategy, custom: Weights): Weights {
  if (strategy === "Custom")
    return { r: custom.r / 100, s: custom.s / 100, i: custom.i / 100 };
  if (strategy === "Manual") return { r: 0, s: 0, i: 0 };
  return PRESETS[strategy];
}

/** The ordered list of model ids that Auto/fallback should follow. */
function computeOrderIds(
  rows: RoutedModel[],
  strategy: Strategy,
  weights: Weights,
  manualOrder: string[],
): string[] {
  if (strategy === "Manual") {
    const ids = rows.map((r) => r.id);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of manualOrder)
      if (ids.includes(id) && !seen.has(id)) {
        out.push(id);
        seen.add(id);
      }
    for (const id of ids)
      if (!seen.has(id)) {
        out.push(id);
        seen.add(id);
      }
    return out;
  }
  return [...rows]
    .map((m) => ({
      id: m.id,
      score:
        m.reliability * weights.r +
        m.speed * weights.s +
        m.intelligence * weights.i,
    }))
    .sort((a, b) => b.score - a.score)
    .map((m) => m.id);
}

export function RoutingStrategyCard({
  providers,
}: {
  providers: ProviderStatus[];
}) {
  const [strategy, setStrategy] = useState<Strategy>("Balanced");
  const [custom, setCustom] = useState<Weights>({ r: 50, s: 25, i: 25 });
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [applied, setApplied] = useState(false);
  const [manualOrder, setManualOrder] = useState<string[]>([]);
  const [manualBaseline, setManualBaseline] = useState<string[]>([]);
  const [manualDirty, setManualDirty] = useState(false);
  const dragId = useRef<string | null>(null);
  const adjustRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => buildRows(providers), [providers]);

  const qc = useQueryClient();

  // Persist the chosen strategy + resulting order to the backend so Auto mode
  // follows it AND it survives a refresh.
  const persist = (s: Strategy, customW: Weights, mOrder: string[]) => {
    const w = weightsForStrategy(s, customW);
    const order = computeOrderIds(rows, s, w, mOrder);
    Promise.resolve(
      api.setRoutingStrategy({ strategy: s, weights: customW, order }),
    )
      .catch(() => {})
      .finally(() => {
        qc.invalidateQueries({ queryKey: ["providers"] });
        qc.invalidateQueries({ queryKey: ["models"] });
      });
  };

  // Load the saved strategy once so the card (and Auto) reflect it on refresh.
  const savedQuery = useQuery({
    queryKey: ["routing-strategy"],
    queryFn: api.getRoutingStrategy,
    staleTime: 60000,
  });
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current || !savedQuery.data) return;
    hydrated.current = true;
    const d = savedQuery.data;
    const s = (d.strategy as Strategy) || "Balanced";
    setStrategy(s);
    if (d.weights) setCustom({ r: d.weights.r, s: d.weights.s, i: d.weights.i });
    if (d.order?.length) {
      setManualOrder(d.order);
      setManualBaseline(d.order);
    }
  }, [savedQuery.data]);

  // Once providers are loaded, if nothing is saved yet, seed the backend with
  // the current (default) order so Auto follows the visible ordering from the
  // very first run.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !savedQuery.data || rows.length === 0) return;
    if (savedQuery.data.order?.length) {
      seeded.current = true;
      return;
    }
    seeded.current = true;
    persist(strategy, custom, manualOrder);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedQuery.data, rows.length]);

  const toggleModel = async (provider: string, id: string, enabled: boolean) => {
    try {
      await api.setModelEnabled(provider, id, enabled);
    } finally {
      qc.invalidateQueries({ queryKey: ["providers"] });
      qc.invalidateQueries({ queryKey: ["models"] });
    }
  };

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (adjustRef.current && !adjustRef.current.contains(e.target as Node)) {
        setAdjustOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const weights: Weights = useMemo(() => {
    if (strategy === "Custom")
      return { r: custom.r / 100, s: custom.s / 100, i: custom.i / 100 };
    if (strategy === "Manual") return { r: 0, s: 0, i: 0 };
    return PRESETS[strategy];
  }, [strategy, custom]);

  const displayed = useMemo(() => {
    if (strategy === "Manual") {
      const order = manualOrder.length ? manualOrder : rows.map((r) => r.id);
      const byId = new Map(rows.map((r) => [r.id, r]));
      const ordered = order
        .map((id) => byId.get(id))
        .filter((r): r is RoutedModel => Boolean(r));
      for (const r of rows) if (!order.includes(r.id)) ordered.push(r);
      return ordered.map((m) => ({ ...m, score: null as number | null }));
    }
    return [...rows]
      .map((m) => ({
        ...m,
        score:
          Math.round(
            (m.reliability * weights.r +
              m.speed * weights.s +
              m.intelligence * weights.i) *
              10,
          ) / 1000,
      }))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }, [rows, strategy, weights, manualOrder]);

  const selectStrategy = (s: Strategy) => {
    if (s === "Manual") {
      const seed = displayed.map((m) => m.id);
      setManualOrder(seed);
      setManualBaseline(seed);
      setManualDirty(false);
      setStrategy(s);
      persist("Manual", custom, seed);
      return;
    }
    if (s !== "Custom") setAdjustOpen(false);
    setStrategy(s);
    persist(s, custom, manualOrder);
  };

  const onDrop = (targetId: string) => {
    const from = dragId.current;
    dragId.current = null;
    if (!from || from === targetId) return;
    setManualOrder((prev) => {
      const order = prev.length ? [...prev] : displayed.map((m) => m.id);
      const fromIdx = order.indexOf(from);
      const toIdx = order.indexOf(targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      order.splice(toIdx, 0, order.splice(fromIdx, 1)[0]);
      return order;
    });
    setManualDirty(true);
  };

  const saveManual = () => {
    setManualBaseline(manualOrder);
    setManualDirty(false);
    persist("Manual", custom, manualOrder);
  };
  const discardManual = () => {
    setManualOrder(manualBaseline);
    setManualDirty(false);
  };

  const apply = () => {
    setApplied(true);
    setTimeout(() => setApplied(false), 1500);
    persist("Custom", custom, manualOrder);
  };

  let summary: string;
  if (strategy === "Manual") {
    summary = "drag to set the order";
  } else if (strategy === "Custom") {
    summary = `reliability ${custom.r}% · speed ${custom.s}% · intelligence ${custom.i}%`;
  } else {
    const w = PRESETS[strategy];
    summary = `reliability ${Math.round(w.r * 100)}% · speed ${Math.round(w.s * 100)}% · intelligence ${Math.round(w.i * 100)}%`;
  }

  return (
    <div className="rounded-3xl border border-white/[0.06] bg-bg-secondary/50 p-6 lg:p-8">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-txt-primary">Routing strategy</h2>
          <p className="mt-1 text-sm text-txt-tertiary">{summary}</p>
        </div>
      </div>

      {/* Strategy tabs */}
      <div className="mb-5 flex flex-wrap items-center gap-1 rounded-2xl border border-white/[0.06] bg-bg-primary/40 p-1.5">
        {STRATEGIES.map((s) => (
          <div key={s} className="group relative">
            <button
              onClick={() => selectStrategy(s)}
              className={`rounded-xl px-4 py-2 text-sm transition-colors ${
                strategy === s
                  ? "bg-bg-tertiary text-txt-primary"
                  : "text-txt-secondary hover:text-txt-primary"
              }`}
            >
              {s}
            </button>
            <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-xl border border-white/[0.08] bg-bg-secondary px-4 py-3 text-xs leading-relaxed text-txt-secondary opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
              {TOOLTIPS[s]}
            </div>
          </div>
        ))}

        {strategy === "Custom" && (
          <div className="relative ml-auto" ref={adjustRef}>
            <button
              onClick={() => setAdjustOpen((o) => !o)}
              className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-bg-tertiary px-4 py-2 text-sm text-txt-primary transition-colors hover:border-white/[0.15]"
            >
              <span>⚙</span>
              Adjust
            </button>
            {adjustOpen && (
              <AdjustPanel
                weights={custom}
                onChange={setCustom}
                onApply={apply}
                applied={applied}
              />
            )}
          </div>
        )}
      </div>

      <p className="mb-5 text-sm text-txt-tertiary">
        {strategy === "Manual"
          ? "Drag rows to set the fallback order. Requests follow it top-to-bottom."
          : "Scores update from live traffic. The order below is how requests are routed right now."}
      </p>

      {/* Routing table */}
      <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-bg-primary/30">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-white/[0.06]">
              <tr className="text-left text-[11px] font-medium uppercase tracking-wide text-txt-tertiary">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Model</th>
                <th className="px-4 py-3">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS.r }} />
                    Reliability
                  </span>
                </th>
                <th className="px-4 py-3">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS.s }} />
                    Speed
                  </span>
                </th>
                <th className="px-4 py-3">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS.i }} />
                    Intelligence
                  </span>
                </th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3 text-right">On</th>
              </tr>
            </thead>
            <tbody>
              {displayed.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <p className="text-sm text-txt-tertiary">
                      No models yet. Add a provider key on the Keys page — models
                      appear here once they’re discovered.
                    </p>
                  </td>
                </tr>
              ) : (
                displayed.map((m, idx) => (
                  <tr
                    key={m.id}
                    draggable={strategy === "Manual"}
                    onDragStart={() => (dragId.current = m.id)}
                    onDragOver={(e) => strategy === "Manual" && e.preventDefault()}
                    onDrop={() => onDrop(m.id)}
                    className={`group border-b border-white/[0.04] transition-colors last:border-0 hover:bg-white/[0.02] ${
                      strategy === "Manual" ? "cursor-grab active:cursor-grabbing" : ""
                    } ${m.enabled ? "" : "opacity-40"}`}
                  >
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2 font-mono text-xs text-txt-tertiary">
                        {strategy === "Manual" && <span>⠿</span>}
                        <span>{idx + 1}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: m.color, boxShadow: `0 0 6px ${m.color}` }}
                        />
                        <span className="truncate font-mono text-[15px] font-bold text-txt-primary">
                          {m.id}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <ScoreBar value={m.reliability} color={COLORS.r} />
                    </td>
                    <td className="px-4 py-3">
                      <ScoreBar value={m.speed} color={COLORS.s} />
                    </td>
                    <td className="px-4 py-3">
                      <ScoreBar value={m.intelligence} color={COLORS.i} />
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="font-mono text-sm font-bold text-txt-primary">
                        {m.score == null ? "—" : m.score.toFixed(3)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <button
                        onClick={() => toggleModel(m.provider, m.id, !m.enabled)}
                        aria-label="Toggle model"
                        className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${
                          m.enabled ? "bg-emerald-500" : "bg-bg-tertiary"
                        }`}
                      >
                        <span
                          className={`block h-4 w-4 rounded-full bg-white transition-transform ${
                            m.enabled ? "translate-x-4" : ""
                          }`}
                        />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual save/discard bar */}
      {strategy === "Manual" && manualDirty && (
        <div className="sticky bottom-6 z-30 mt-6 flex items-center justify-between gap-4 rounded-2xl border border-white/[0.1] bg-bg-tertiary px-6 py-4 shadow-xl">
          <span className="text-sm text-txt-secondary">You changed the routing order.</span>
          <div className="flex items-center gap-3">
            <button
              onClick={discardManual}
              className="rounded-xl border border-white/[0.1] bg-bg-primary/60 px-4 py-2 text-sm text-txt-secondary transition-colors hover:text-txt-primary"
            >
              Discard
            </button>
            <button
              onClick={saveManual}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-bg-primary transition-opacity hover:opacity-90"
            >
              Save changes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AdjustPanel({
  weights,
  onChange,
  onApply,
  applied,
}: {
  weights: Weights;
  onChange: (w: Weights) => void;
  onApply: () => void;
  applied: boolean;
}) {
  return (
    <div className="absolute right-0 top-full z-50 mt-2 w-96 rounded-2xl border border-white/[0.1] bg-bg-secondary p-6 shadow-2xl">
      <h3 className="mb-1 text-base font-semibold text-txt-primary">Custom weights</h3>
      <p className="mb-5 text-xs leading-relaxed text-txt-tertiary">
        Adjust sliders independently — shares auto-balance to 100%.
      </p>

      <div className="space-y-5">
        <WeightSlider
          label="Reliability"
          color={COLORS.r}
          value={weights.r}
          onChange={(v) => onChange(rebalance(weights, "r", v))}
        />
        <WeightSlider
          label="Speed"
          color={COLORS.s}
          value={weights.s}
          onChange={(v) => onChange(rebalance(weights, "s", v))}
        />
        <WeightSlider
          label="Intelligence"
          color={COLORS.i}
          value={weights.i}
          onChange={(v) => onChange(rebalance(weights, "i", v))}
        />
      </div>

      <button
        onClick={onApply}
        className={`mt-6 w-full rounded-xl py-2.5 text-sm font-medium transition-colors ${
          applied
            ? "bg-emerald-500 text-white"
            : "bg-accent text-bg-primary hover:opacity-90"
        }`}
      >
        {applied ? "✓ Applied" : "Apply changes"}
      </button>
    </div>
  );
}

function WeightSlider({
  label,
  color,
  value,
  onChange,
}: {
  label: string;
  color: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm text-txt-secondary">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
          {label}
        </span>
        <span className="font-mono text-sm font-semibold text-txt-primary">{value}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="slider-premium w-full cursor-pointer"
        style={{
          background: `linear-gradient(to right, ${color} 0%, ${color} ${value}%, rgba(255,255,255,0.1) ${value}%, rgba(255,255,255,0.1) 100%)`,
        }}
      />
    </div>
  );
}

function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-2 w-24 overflow-hidden rounded-full bg-bg-tertiary">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.max(0, Math.min(100, value))}%`,
            backgroundColor: color,
          }}
        />
      </div>
      <span className="font-mono text-xs text-txt-tertiary">{value}%</span>
    </div>
  );
}
