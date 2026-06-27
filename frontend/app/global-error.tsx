"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <html lang="en" className="dark">
      <body className="bg-bg-primary">
        <div className="flex min-h-screen items-center justify-center px-6">
          <div className="max-w-md text-center">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500/20 to-red-600/10 mx-auto ring-1 ring-red-500/30">
              <svg className="h-10 w-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>

            <h2 className="mb-3 text-2xl font-bold text-white">
              Application Error
            </h2>

            <p className="mb-6 text-sm leading-relaxed text-gray-400">
              A critical error occurred. Please refresh the page.
            </p>

            <button
              onClick={reset}
              className="rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 px-6 py-3 text-sm font-semibold text-white shadow-lg"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
