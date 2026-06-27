"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";

export function AddCustomModelForm() {
  const qc = useQueryClient();
  const [baseUrl, setBaseUrl] = useState("");
  const [models, setModels] = useState("");
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const modelList = models
    .split(/[\n,]/)
    .map((m) => m.trim())
    .filter(Boolean);

  const add = async () => {
    if (!baseUrl.trim()) {
      setErr("Base URL is required.");
      return;
    }
    if (modelList.length === 0) {
      setErr("Add at least one model.");
      return;
    }
    setBusy(true);
    setErr(null);
    setSuccess(false);
    try {
      await api.addCustomProvider(baseUrl.trim(), modelList, name.trim(), apiKey.trim());
      setBaseUrl("");
      setModels("");
      setName("");
      setApiKey("");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      await qc.invalidateQueries({ queryKey: ["key-groups"] });
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
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <h2 className="text-base font-semibold text-txt-primary">
            Add a custom OpenAI-compatible model
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-txt-secondary">
            Point at any OpenAI-compatible endpoint: llama.cpp, LM Studio, vLLM, a
            local Ollama, or a remote gateway.
          </p>
        </div>
      </div>

      <div className="rounded-3xl border border-white/[0.08] bg-bg-secondary/50 p-7">
        <div className="flex flex-wrap items-end gap-4">
          {/* Base URL */}
          <div className="min-w-[200px] flex-1">
            <label className="mb-2 flex items-center gap-2 text-xs font-medium text-txt-secondary">
              <svg className="h-3.5 w-3.5 text-txt-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
              Base URL
              <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <input
                value={baseUrl}
                onChange={(e) => {
                  setBaseUrl(e.target.value);
                  setErr(null);
                }}
                onFocus={() => setFocusedField("baseUrl")}
                onBlur={() => setFocusedField(null)}
                placeholder="http://127.0.0.1:11434/v1"
                className="w-full rounded-xl border border-white/[0.08] bg-gradient-to-br from-bg-primary/90 to-bg-primary/70 px-4 py-2.5 font-mono text-sm text-txt-primary outline-none transition-all duration-200 placeholder:text-txt-tertiary hover:border-white/[0.12] focus:border-accent focus:shadow-lg focus:shadow-accent/10 focus:ring-2 focus:ring-accent/20"
              />
              <AnimatePresence>
                {focusedField === "baseUrl" && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0.3, 0.6, 0.3] }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-r from-accent/5 via-purple-500/5 to-pink-500/5"
                  />
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Models textarea */}
          <div className="min-w-[180px] flex-1">
            <label className="mb-2 flex items-center gap-2 text-xs font-medium text-txt-secondary">
              <svg className="h-3.5 w-3.5 text-txt-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
              Models
              <span className="text-red-400">*</span>
              {modelList.length > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="ml-auto rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent ring-1 ring-accent/30"
                >
                  {modelList.length}
                </motion.span>
              )}
            </label>
            <div className="relative">
              <textarea
                value={models}
                onChange={(e) => {
                  setModels(e.target.value);
                  setErr(null);
                }}
                onFocus={() => setFocusedField("models")}
                onBlur={() => setFocusedField(null)}
                placeholder={"qwen3:4b\nllama3:8b"}
                rows={2}
                className="w-full resize-y rounded-xl border border-white/[0.08] bg-gradient-to-br from-bg-primary/90 to-bg-primary/70 px-4 py-2.5 font-mono text-sm text-txt-primary outline-none transition-all duration-200 placeholder:text-txt-tertiary hover:border-white/[0.12] focus:border-accent focus:shadow-lg focus:shadow-accent/10 focus:ring-2 focus:ring-accent/20"
              />
              <AnimatePresence>
                {focusedField === "models" && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0.3, 0.6, 0.3] }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-r from-accent/5 via-purple-500/5 to-pink-500/5"
                  />
                )}
              </AnimatePresence>
            </div>
            <p className="mt-1 text-[10px] text-txt-tertiary">
              One per line or comma-separated
            </p>
          </div>

          {/* Display name */}
          <div className="min-w-[140px] flex-1">
            <label className="mb-2 flex items-center gap-2 text-xs font-medium text-txt-secondary">
              <svg className="h-3.5 w-3.5 text-txt-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              Display name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onFocus={() => setFocusedField("name")}
              onBlur={() => setFocusedField(null)}
              placeholder="optional"
              className="w-full rounded-xl border border-white/[0.08] bg-gradient-to-br from-bg-primary/90 to-bg-primary/70 px-4 py-2.5 text-sm text-txt-primary outline-none transition-all duration-200 placeholder:text-txt-tertiary hover:border-white/[0.12] focus:border-accent focus:shadow-lg focus:shadow-accent/10 focus:ring-2 focus:ring-accent/20"
            />
          </div>

          {/* API key */}
          <div className="min-w-[140px] flex-1">
            <label className="mb-2 flex items-center gap-2 text-xs font-medium text-txt-secondary">
              <svg className="h-3.5 w-3.5 text-txt-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              API key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onFocus={() => setFocusedField("apiKey")}
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
                  Add model
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>

        {/* Error feedback */}
        <AnimatePresence>
          {err && (
            <motion.div
              initial={{ opacity: 0, y: -10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -10, height: 0 }}
              className="mt-4 overflow-hidden"
            >
              <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-gradient-to-r from-red-500/10 to-red-600/5 px-4 py-3">
                <svg className="h-4 w-4 shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-xs text-red-400">{err}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
