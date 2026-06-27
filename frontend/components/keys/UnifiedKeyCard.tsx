"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUnifiedKey } from "@/hooks/useKeys";
import { api } from "@/lib/api";
import { motion } from "framer-motion";

export function UnifiedKeyCard() {
  const { data } = useUnifiedKey();
  const qc = useQueryClient();
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const key = data?.key ?? "";
  const masked =
    key.length > 10 ? key.slice(0, 10) + "•".repeat(28) : "•".repeat(28);

  const copy = async () => {
    await navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const regenerate = async () => {
    if (!confirm("Regenerate the unified key? Existing clients using the old key will stop working.")) return;
    setBusy(true);
    try {
      await api.regenerateUnifiedKey();
      await qc.invalidateQueries({ queryKey: ["unified-key"] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-3xl border border-white/[0.06] bg-bg-secondary/50 p-8"
    >
      <div className="relative z-10">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-bg-tertiary">
                <svg className="h-5 w-5 text-txt-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-txt-primary">Your Unified API Key</h2>
            </div>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-txt-secondary">
              Use this as your{" "}
              <span className="rounded-md bg-bg-tertiary/50 px-2 py-0.5 font-mono text-xs text-txt-primary">
                openai_api_key
              </span>
              {" "}to authenticate requests to this proxy.
            </p>
          </div>
          <button
            onClick={regenerate}
            disabled={busy}
            className="group/btn flex items-center gap-2 rounded-xl border border-white/[0.08] bg-bg-tertiary/50 px-4 py-2 text-sm font-medium text-txt-secondary backdrop-blur-sm transition-all duration-200 hover:border-white/[0.15] hover:bg-bg-tertiary hover:text-txt-primary disabled:opacity-50"
          >
            <svg className="h-4 w-4 transition-transform group-hover/btn:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {busy ? "Regenerating…" : "Regenerate"}
          </button>
        </div>

        {/* Key display */}
        <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-bg-primary/60 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-bg-tertiary">
              <svg className="h-5 w-5 text-txt-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <span className="flex-1 truncate font-mono text-sm text-txt-primary">
              {show ? key : masked}
            </span>
            <div className="flex gap-2">
              <motion.button
                onClick={() => setShow((s) => !s)}
                whileTap={{ scale: 0.95 }}
                className="rounded-lg border border-white/[0.08] bg-bg-secondary/80 px-3 py-2 text-xs font-medium text-txt-secondary backdrop-blur-sm transition-all duration-200 hover:border-white/[0.15] hover:bg-bg-tertiary hover:text-txt-primary"
              >
                <span className="flex items-center gap-1.5">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    {show ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    )}
                  </svg>
                  {show ? "Hide" : "Show"}
                </span>
              </motion.button>
              <motion.button
                onClick={copy}
                whileTap={{ scale: 0.95 }}
                className="rounded-lg border border-white/[0.08] bg-bg-secondary/80 px-3 py-2 text-xs font-medium text-txt-secondary backdrop-blur-sm transition-all duration-200 hover:border-white/[0.15] hover:bg-bg-tertiary hover:text-txt-primary"
              >
                <span className="flex items-center gap-1.5">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    {copied ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    )}
                  </svg>
                  {copied ? "Copied!" : "Copy"}
                </span>
              </motion.button>
            </div>
          </div>
        </div>

        {/* Endpoints section */}
        <div className="mt-6 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-txt-tertiary">
            API Endpoints
          </h3>
          <div className="space-y-2">
            <EndpointRow label="Base URL" value={data?.base_url ?? "—"} />
            <EndpointRow label="Chat" value={data?.endpoints.chat ?? "—"} />
            <EndpointRow label="Completions" value={data?.endpoints.completions ?? "—"} />
            <EndpointRow
              label="Embeddings"
              value={`${data?.endpoints.embeddings ?? "—"}`}
              hint='Use model: "auto" or an embeddings model'
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function EndpointRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-start gap-4 rounded-xl border border-white/[0.04] bg-bg-tertiary/30 p-3 backdrop-blur-sm">
      <span className="w-24 shrink-0 text-xs font-medium text-txt-tertiary">{label}</span>
      <div className="flex-1">
        <span className="block font-mono text-xs text-txt-secondary">{value}</span>
        {hint && <span className="mt-1 block text-[10px] text-txt-tertiary">{hint}</span>}
      </div>
    </div>
  );
}
