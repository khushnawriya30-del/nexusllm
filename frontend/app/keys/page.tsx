"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { UnifiedKeyCard } from "@/components/keys/UnifiedKeyCard";
import { AddProviderKeyForm } from "@/components/keys/AddProviderKeyForm";
import { AddCustomModelForm } from "@/components/keys/AddCustomModelForm";
import { ConfiguredProvidersList } from "@/components/keys/ConfiguredProvidersList";
import { motion } from "framer-motion";

export default function KeysPage() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const checkAll = async () => {
    setBusy(true);
    try {
      await api.checkAllKeys();
      await qc.invalidateQueries({ queryKey: ["key-groups"] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 lg:px-10">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 flex flex-wrap items-start justify-between gap-4"
      >
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 shadow-lg">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold">Keys</h1>
          </div>
          <p className="mt-2 text-sm text-txt-secondary">
            Provider credentials and the unified API key your apps connect with.
          </p>
        </div>
        <motion.button
          onClick={checkAll}
          disabled={busy}
          whileHover={{ scale: busy ? 1 : 1.02 }}
          whileTap={{ scale: busy ? 1 : 0.98 }}
          className="group flex items-center gap-2 rounded-xl border border-white/[0.08] bg-bg-secondary/80 px-4 py-2 text-sm font-medium text-txt-secondary backdrop-blur-sm transition-all duration-200 hover:border-white/[0.15] hover:bg-bg-tertiary hover:text-txt-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg
            className={`h-4 w-4 transition-transform ${busy ? "animate-spin" : "group-hover:rotate-180"}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {busy ? "Checking…" : "Check all"}
        </motion.button>
      </motion.div>

      {/* Cards */}
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <UnifiedKeyCard />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <AddProviderKeyForm />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <AddCustomModelForm />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <ConfiguredProvidersList />
        </motion.div>
      </div>
    </div>
  );
}
