"use client";

import { memo, useMemo } from "react";
import { useChatStore } from "@/store/chatStore";
import { useModels } from "@/hooks/useModels";
import {
  supportsThinking,
  getTokenEstimate,
  getIntensityDescription,
  type ThinkingIntensity,
} from "@/lib/thinking-models";

const INTENSITY_OPTIONS: { value: ThinkingIntensity; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "max", label: "Max" },
];

export const ThinkingSettings = memo(function ThinkingSettings() {
  const selectedModel = useChatStore((s) => s.selectedModel);
  const isThinkingEnabled = useChatStore((s) => s.isThinkingEnabled);
  const thinkingIntensity = useChatStore((s) => s.thinkingIntensity);
  const setThinkingEnabled = useChatStore((s) => s.setThinkingEnabled);
  const setThinkingIntensity = useChatStore((s) => s.setThinkingIntensity);

  // Pull the selected model's capabilities from the live model list so the
  // control appears dynamically for any reasoning-capable model the backend
  // discovers (o1/o3/r1/deepseek/glm-thinking/qwen…), not just a static list.
  const { data } = useModels();
  const capabilities = useMemo(() => {
    const m = data?.data?.find((x) => x.id === selectedModel);
    return m?.["x-nexusllm"]?.capabilities ?? undefined;
  }, [data, selectedModel]);

  // Only render if the currently selected model supports thinking.
  if (!supportsThinking(selectedModel, capabilities)) {
    return null;
  }

  return (
    <div className="space-y-4 rounded-2xl border border-white/[0.1] bg-bg-tertiary/30 p-4">
      {/* Header with info tooltip */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-bg-primary ring-1 ring-white/[0.1]">
            <svg
              className="h-4 w-4 text-txt-primary"
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
          </div>
          <h3 className="text-sm font-bold text-txt-primary">
            Extended Thinking
          </h3>
        </div>

        <div className="group relative">
          <div className="flex h-5 w-5 cursor-help items-center justify-center rounded-full bg-white/5 text-txt-tertiary transition-colors hover:bg-white/10">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div className="pointer-events-none absolute right-0 top-6 z-50 w-64 rounded-xl border border-white/10 bg-bg-primary p-3 text-xs leading-relaxed text-txt-secondary opacity-0 shadow-xl transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
            The model reasons through the problem before answering. Higher
            settings give deeper analysis but consume significantly more tokens.
          </div>
        </div>
      </div>

      {/* Enable toggle */}
      <div className="flex items-center justify-between">
        <label htmlFor="thinking-toggle" className="text-sm font-medium text-txt-secondary">
          Enable Thinking Mode
        </label>
        <button
          id="thinking-toggle"
          role="switch"
          aria-checked={isThinkingEnabled}
          onClick={() => setThinkingEnabled(!isThinkingEnabled)}
          className={`relative h-6 w-11 rounded-full transition-colors ${
            isThinkingEnabled ? "bg-accent" : "bg-bg-tertiary ring-1 ring-white/[0.1]"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full shadow-lg transition-transform ${
              isThinkingEnabled
                ? "translate-x-5 bg-bg-primary"
                : "translate-x-0.5 bg-white"
            }`}
          />
        </button>
      </div>

      {/* Intensity dropdown — only when enabled */}
      {isThinkingEnabled && (
        <div className="space-y-2">
          <label htmlFor="thinking-intensity" className="text-sm font-medium text-txt-secondary">
            Thinking Intensity
          </label>
          <select
            id="thinking-intensity"
            value={thinkingIntensity}
            onChange={(e) => setThinkingIntensity(e.target.value as ThinkingIntensity)}
            className="w-full rounded-xl border border-white/10 bg-bg-secondary px-3 py-2 text-sm text-txt-primary transition-colors hover:border-white/20 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/20"
          >
            {INTENSITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <div className="space-y-1 rounded-lg bg-black/20 p-3">
            <p className="text-xs text-txt-secondary">
              {getIntensityDescription(thinkingIntensity)}
            </p>
            <div className="flex items-center gap-2 text-xs">
              <svg className="h-3 w-3 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <span className="text-amber-400/90">
                Est. consumption: {getTokenEstimate(thinkingIntensity)}
                {thinkingIntensity === "max" && " — uses the most tokens"}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
