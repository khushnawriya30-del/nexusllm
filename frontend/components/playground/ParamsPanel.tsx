"use client";

import { useState } from "react";
import { useChatStore } from "@/store/chatStore";
import { motion, AnimatePresence } from "framer-motion";

export function ParamsPanel() {
  const params = useChatStore((s) => s.params);
  const setParams = useChatStore((s) => s.setParams);
  const [open, setOpen] = useState(false);

  const presets = [
    { name: "Precise", temperature: 0.3, topP: 0.9 },
    { name: "Balanced", temperature: 0.7, topP: 0.9 },
    { name: "Creative", temperature: 1.2, topP: 0.95 },
  ];

  const applyPreset = (preset: typeof presets[0]) => {
    setParams({ temperature: preset.temperature, topP: preset.topP });
  };

  return (
    <div className="relative">
      <motion.button
        onClick={() => setOpen((o) => !o)}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="group flex items-center gap-2 rounded-full border border-white/[0.08] bg-gradient-to-r from-bg-secondary/80 to-bg-secondary/60 px-3 py-1.5 text-xs font-medium text-txt-secondary backdrop-blur-sm transition-all duration-200 hover:border-white/[0.15] hover:text-txt-primary hover:shadow-lg"
      >
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          ⚙
        </motion.span>
        Parameters
        <motion.div
          animate={{ opacity: open ? 0 : 1, scale: open ? 0.8 : 1 }}
          className="flex items-center gap-1"
        >
          <span className="text-[10px] text-txt-tertiary">T: {params.temperature}</span>
        </motion.div>
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-20 bg-black/20 backdrop-blur-sm"
            />

            {/* Panel */}
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{
                type: "spring",
                stiffness: 300,
                damping: 25
              }}
              className="absolute bottom-full right-0 z-30 mb-2 w-80 space-y-5 rounded-2xl border border-white/[0.1] bg-gradient-to-br from-bg-secondary/95 to-bg-secondary/90 p-5 shadow-2xl backdrop-blur-xl ring-1 ring-white/[0.05]"
            >
              {/* Header with presets */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-txt-tertiary">
                  Quick Presets
                </h3>
                <div className="flex gap-2">
                  {presets.map((preset, i) => (
                    <motion.button
                      key={preset.name}
                      onClick={() => applyPreset(preset)}
                      whileHover={{ scale: 1.05, y: -2 }}
                      whileTap={{ scale: 0.95 }}
                      transition={{ type: "spring", stiffness: 400, damping: 17 }}
                      className="flex-1 rounded-lg border border-white/[0.08] bg-gradient-to-b from-bg-tertiary/60 to-bg-tertiary/40 px-3 py-2 text-xs font-medium text-txt-secondary transition-all duration-200 hover:border-accent/50 hover:text-txt-primary hover:shadow-lg hover:shadow-accent/10"
                      style={{ animationDelay: `${i * 50}ms` }}
                    >
                      {preset.name}
                    </motion.button>
                  ))}
                </div>
              </div>

              <div className="h-px bg-gradient-to-r from-transparent via-white/[0.1] to-transparent" />

              {/* Sliders */}
              <PremiumSlider
                label="Temperature"
                description="Controls randomness"
                value={params.temperature}
                min={0}
                max={1.5}
                step={0.1}
                onChange={(v) => setParams({ temperature: v })}
              />

              <PremiumSlider
                label="Top-P"
                description="Nucleus sampling threshold"
                value={params.topP}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => setParams({ topP: v })}
              />

              <div className="h-px bg-gradient-to-r from-transparent via-white/[0.1] to-transparent" />

              {/* Max tokens input */}
              <div className="space-y-2">
                <label className="flex items-center justify-between text-xs font-medium text-txt-secondary">
                  <span>Max tokens</span>
                  <span className="font-mono text-[10px] text-txt-tertiary">{params.maxTokens}</span>
                </label>
                <input
                  type="number"
                  value={params.maxTokens}
                  min={1}
                  max={100000}
                  onChange={(e) =>
                    setParams({ maxTokens: parseInt(e.target.value || "1", 10) })
                  }
                  className="w-full rounded-lg border border-white/[0.08] bg-bg-primary px-3 py-2 text-sm text-txt-primary outline-none transition-all duration-200 focus:border-accent focus:shadow-lg focus:shadow-accent/10 focus:ring-2 focus:ring-accent/20"
                />
              </div>

              {/* Stream toggle */}
              <label className="flex cursor-pointer items-center justify-between rounded-lg border border-white/[0.06] bg-bg-tertiary/30 p-3 transition-all duration-200 hover:border-white/[0.12] hover:bg-bg-tertiary/50">
                <span className="text-xs font-medium text-txt-secondary">Stream responses</span>
                <motion.div
                  whileTap={{ scale: 0.95 }}
                  className="relative"
                >
                  <input
                    type="checkbox"
                    checked={params.stream}
                    onChange={(e) => setParams({ stream: e.target.checked })}
                    className="peer sr-only"
                  />
                  <div className="h-5 w-9 rounded-full bg-bg-primary ring-1 ring-white/[0.1] transition-all duration-300 peer-checked:bg-accent peer-checked:ring-accent/30" />
                  <motion.div
                    animate={{
                      x: params.stream ? 16 : 2
                    }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-lg ring-1 ring-black/[0.05]"
                  />
                </motion.div>
              </label>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function PremiumSlider({
  label,
  description,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-medium text-txt-secondary">{label}</div>
          <div className="text-[10px] text-txt-tertiary">{description}</div>
        </div>
        <motion.span
          animate={{ scale: showTooltip ? 1.1 : 1 }}
          className="rounded-lg bg-bg-tertiary/60 px-2 py-1 font-mono text-xs font-semibold text-accent ring-1 ring-accent/20"
        >
          {value}
        </motion.span>
      </div>

      <div className="relative pt-1">
        <motion.input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          className="slider-premium w-full"
          style={{
            background: `linear-gradient(to right, rgb(139, 92, 246) 0%, rgb(139, 92, 246) ${percentage}%, rgba(255, 255, 255, 0.08) ${percentage}%, rgba(255, 255, 255, 0.08) 100%)`
          }}
        />
      </div>
    </div>
  );
}
