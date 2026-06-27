"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChatStore } from "@/store/chatStore";
import { useModels } from "@/hooks/useModels";
import {
  supportsThinking,
  getTokenEstimate,
  getIntensityDescription,
  type ThinkingIntensity,
} from "@/lib/thinking-models";

const LEVELS: { value: ThinkingIntensity; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "max", label: "Max" },
];

/**
 * Prominent, inline "Reasoning" control for the Playground toolbar.
 *
 * Renders a premium toggle switch plus an intensity dropdown — but ONLY when
 * the currently selected model supports extended thinking/reasoning (detected
 * via the backend "reasoning" capability or the known thinking-model list).
 */
export function ThinkingControl() {
  const selectedModel = useChatStore((s) => s.selectedModel);
  const enabled = useChatStore((s) => s.isThinkingEnabled);
  const setEnabled = useChatStore((s) => s.setThinkingEnabled);
  const intensity = useChatStore((s) => s.thinkingIntensity);
  const setIntensity = useChatStore((s) => s.setThinkingIntensity);

  const { data } = useModels();
  const caps = useMemo(
    () =>
      data?.data?.find((m) => m.id === selectedModel)?.["x-nexusllm"]
        ?.capabilities,
    [data, selectedModel],
  );

  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Show for reasoning-capable models, and for the special routing modes
  // (fusion/auto) whose panel/chain may include reasoning-capable models —
  // those members reason; plain models answer normally.
  const isSpecial = selectedModel === "fusion" || selectedModel === "auto";
  if (!isSpecial && !supportsThinking(selectedModel, caps)) return null;

  const current = LEVELS.find((l) => l.value === intensity) ?? LEVELS[1];

  return (
    <div ref={ref} className="flex items-center gap-2">
      {/* Toggle pill */}
      <button
        onClick={() => setEnabled(!enabled)}
        role="switch"
        aria-checked={enabled}
        title="Let the model reason before answering"
        className={`group flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${
          enabled
            ? "border-accent/40 bg-accent/10 text-txt-primary shadow-sm"
            : "border-white/[0.08] bg-bg-secondary/80 text-txt-secondary hover:border-white/[0.15] hover:text-txt-primary"
        }`}
      >
        <svg
          className={`h-3.5 w-3.5 ${enabled ? "text-accent" : "text-txt-tertiary"}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
          />
        </svg>
        Reasoning
        {/* Sleek sliding switch — knob slides forward (on) / back (off) and
            stays visible in both light & dark modes. */}
        <span
          className={`relative ml-1 inline-block h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${
            enabled
              ? "bg-accent"
              : "bg-bg-tertiary ring-1 ring-[color:var(--border-hover)]"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full shadow transition-transform duration-200 ${
              enabled
                ? "translate-x-4 bg-bg-primary"
                : "translate-x-0 bg-txt-primary"
            }`}
          />
        </span>
      </button>

      {/* Intensity dropdown — only when enabled */}
      {enabled && (
        <div className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-bg-secondary/80 px-3 py-1.5 text-xs font-semibold text-txt-secondary transition-all duration-200 hover:border-white/[0.15] hover:text-txt-primary"
          >
            <span className="text-txt-tertiary">Intensity:</span>
            <span className="text-txt-primary">{current.label}</span>
            {intensity === "max" && (
              <span className="text-amber-400" title="Highest token use">
                ⚡
              </span>
            )}
            <span className="text-txt-tertiary">▾</span>
          </button>

          {menuOpen && (
            <div className="absolute bottom-full right-0 z-40 mb-2 w-64 overflow-hidden rounded-2xl border border-white/[0.1] bg-bg-secondary/95 p-1.5 shadow-2xl backdrop-blur-xl ring-1 ring-white/[0.05]">
              {LEVELS.map((l) => (
                <button
                  key={l.value}
                  onClick={() => {
                    setIntensity(l.value);
                    setMenuOpen(false);
                  }}
                  className={`flex w-full flex-col gap-0.5 rounded-xl px-3 py-2 text-left transition-colors ${
                    intensity === l.value
                      ? "bg-accent/15 ring-1 ring-accent/40"
                      : "hover:bg-bg-tertiary/60"
                  }`}
                >
                  <span className="flex items-center justify-between text-xs font-bold text-txt-primary">
                    {l.label}
                    {l.value === "max" && (
                      <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-400">
                        Most tokens
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] leading-snug text-txt-tertiary">
                    {getIntensityDescription(l.value)} · {getTokenEstimate(l.value)}
                  </span>
                </button>
              ))}
              <div className="mt-1 flex items-center gap-1.5 border-t border-white/[0.06] px-3 py-2 text-[10px] text-amber-400/90">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                Higher levels use more tokens & take longer.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
