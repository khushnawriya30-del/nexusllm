"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md text-center"
      >
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500/20 to-red-600/10 mx-auto ring-1 ring-red-500/30">
          <svg className="h-10 w-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        <h2 className="mb-3 text-2xl font-bold text-txt-primary">
          Something went wrong
        </h2>

        <p className="mb-6 text-sm leading-relaxed text-txt-secondary">
          {error.message || "An unexpected error occurred. Please try again."}
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <motion.button
            onClick={reset}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:shadow-xl"
          >
            Try again
          </motion.button>

          <motion.button
            onClick={() => (window.location.href = "/")}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="rounded-xl border border-white/[0.08] bg-bg-secondary/80 px-6 py-3 text-sm font-semibold text-txt-primary backdrop-blur-sm transition-all hover:bg-bg-tertiary"
          >
            Go home
          </motion.button>
        </div>

        {error.digest && (
          <p className="mt-6 text-xs text-txt-tertiary">
            Error ID: {error.digest}
          </p>
        )}
      </motion.div>
    </div>
  );
}
