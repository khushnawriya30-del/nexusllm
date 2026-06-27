"use client";

import { motion } from "framer-motion";
import type { FallbackInfo } from "@/lib/types";

export function FallbackBanner({
  fallback,
  onDismiss,
}: {
  fallback: FallbackInfo;
  onDismiss: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300"
    >
      <span>⚡</span>
      <span className="flex-1">
        Auto-switched to <span className="font-mono">{fallback.model}</span> via{" "}
        <span className="font-mono">{fallback.provider}</span> ({fallback.count}{" "}
        fallback{fallback.count > 1 ? "s" : ""} from{" "}
        <span className="font-mono">{fallback.requested}</span>)
      </span>
      <button
        onClick={onDismiss}
        className="text-amber-400 hover:text-amber-200"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </motion.div>
  );
}
