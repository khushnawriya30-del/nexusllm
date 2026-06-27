"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSupportedProviders } from "@/hooks/useKeys";
import { api } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";

export function AddProviderKeyForm() {
  const { data } = useSupportedProviders();
  const qc = useQueryClient();
  const providers = data?.providers ?? [];

  const [providerId, setProviderId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  useEffect(() => {
    if (!providerId && providers.length) setProviderId(providers[0].id);
  }, [providers, providerId]);

  const selected = providers.find((p) => p.id === providerId);
  const keyless = selected?.requires_key === false;
  const freeKey = !keyless && selected?.key_free === true;

  const add = async () => {
    if (!keyless && !apiKey.trim()) {
      setErr("Paste an API key first.");
      return;
    }
    setBusy(true);
    setErr(null);
    setSuccess(false);
    try {
      // Keyless providers (e.g. OVH free tier) just need the provider enabled;
      // an optional key can still be added for higher limits.
      if (keyless && !apiKey.trim()) {
        await api.setProviderEnabled(providerId, true);
      } else {
        await api.addKey(providerId, apiKey.trim(), label.trim());
      }
      setApiKey("");
      setLabel("");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      await qc.invalidateQueries({ queryKey: ["key-groups"] });
      await qc.invalidateQueries({ queryKey: ["providers"] });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] bg-bg-tertiary">
          <svg className="h-4 w-4 text-txt-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </div>
        <h2 className="text-base font-semibold text-txt-primary">Add a provider key</h2>
      </div>

      <div className="rounded-3xl border border-white/[0.08] bg-bg-secondary/50 p-7">
        <div className="flex flex-wrap items-end gap-4">
          {/* Provider select */}
          <div className="min-w-[180px] flex-1">
            <label className="mb-2 block text-xs font-medium text-txt-secondary">
              Platform
            </label>
            <div className="relative">
              <select
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
                onFocus={() => setFocusedField("provider")}
                onBlur={() => setFocusedField(null)}
                className="w-full appearance-none rounded-xl border border-white/[0.08] bg-gradient-to-br from-bg-primary/90 to-bg-primary/70 px-4 py-2.5 pr-10 text-sm text-txt-primary outline-none transition-all duration-200 hover:border-white/[0.12] focus:border-accent focus:shadow-lg focus:shadow-accent/10 focus:ring-2 focus:ring-accent/20"
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                <motion.svg
                  animate={{ rotate: focusedField === "provider" ? 180 : 0 }}
                  className="h-4 w-4 text-txt-tertiary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </motion.svg>
              </div>
            </div>
          </div>

          {/* API key input */}
          <div className="min-w-[260px] flex-[2]">
            <label className="mb-2 flex items-center gap-2 text-xs font-medium text-txt-secondary">
              <span>API key</span>
              {keyless && <span className="text-txt-tertiary">(optional)</span>}
              {freeKey && (
                <motion.span
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex items-center gap-1 text-emerald-400"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  free to get
                </motion.span>
              )}
            </label>
            {keyless ? (
              <motion.div
                whileHover={{ scale: 1.01 }}
                className="flex h-[42px] items-center gap-2 rounded-xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/[0.1] to-emerald-500/[0.05] px-4 text-sm font-medium text-emerald-400 shadow-sm"
              >
                <motion.span
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="h-2 w-2 rounded-full bg-emerald-500"
                />
                No API Key Required — works automatically
              </motion.div>
            ) : (
              <div className="relative">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setErr(null);
                  }}
                  onFocus={() => setFocusedField("apikey")}
                  onBlur={() => setFocusedField(null)}
                  placeholder="paste key here"
                  className="w-full rounded-xl border border-white/[0.08] bg-gradient-to-br from-bg-primary/90 to-bg-primary/70 px-4 py-2.5 text-sm text-txt-primary outline-none transition-all duration-200 placeholder:text-txt-tertiary hover:border-white/[0.12] focus:border-accent focus:shadow-lg focus:shadow-accent/10 focus:ring-2 focus:ring-accent/20"
                />
                {/* Breathing glow on focus */}
                <AnimatePresence>
                  {focusedField === "apikey" && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0.3, 0.6, 0.3] }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="pointer-events-none absolute inset-0 rounded-xl bg-white/[0.02]"
                    />
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Label input */}
          <div className="min-w-[140px] flex-1">
            <label className="mb-2 block text-xs font-medium text-txt-secondary">
              Label
            </label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onFocus={() => setFocusedField("label")}
              onBlur={() => setFocusedField(null)}
              placeholder="optional"
              className="w-full rounded-xl border border-white/[0.08] bg-gradient-to-br from-bg-primary/90 to-bg-primary/70 px-4 py-2.5 text-sm text-txt-primary outline-none transition-all duration-200 placeholder:text-txt-tertiary hover:border-white/[0.12] focus:border-accent focus:shadow-lg focus:shadow-accent/10 focus:ring-2 focus:ring-accent/20"
            />
          </div>

          {/* Submit button */}
          <motion.button
            onClick={add}
            disabled={busy || success}
            whileHover={!busy && !success ? { scale: 1.02, y: -1 } : {}}
            whileTap={!busy && !success ? { scale: 0.98 } : {}}
            className="rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-bg-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <AnimatePresence mode="wait">
              {busy ? (
                <motion.span
                  key="busy"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex items-center gap-2"
                >
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Adding…
                </motion.span>
              ) : success ? (
                <motion.span
                  key="success"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="flex items-center gap-2"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  Added!
                </motion.span>
              ) : (
                <motion.span
                  key="idle"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  {keyless ? "Enable" : "Add key"}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>

        {/* Footer with link and error */}
        <div className="mt-4 flex items-center gap-4">
          {keyless ? (
            <span className="text-xs text-txt-tertiary">
              This provider’s free tier needs no key. Click Enable to activate
              it, or paste a key above for higher rate limits.
            </span>
          ) : (
            selected?.get_key_url && (
              <motion.a
                href={selected.get_key_url}
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ x: 2 }}
                className="flex items-center gap-1.5 text-xs text-txt-secondary transition-colors hover:text-accent"
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                Get API key ↗
              </motion.a>
            )
          )}
          <AnimatePresence>
            {err && (
              <motion.span
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="flex items-center gap-1.5 text-xs text-red-400"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {err}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
