"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Front-end auth screen. NexusLLM is self-hosted and key-based, so this form
 * is the gateway into the app rather than a hosted account system — on submit
 * it takes you straight into the product, where you connect with your key.
 */
export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const isSignup = mode === "signup";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setTimeout(() => router.push("/chat"), 500);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center px-5 py-24">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          {/* eslint-disable @next/next/no-img-element */}
          <img src="/logo-black.png" alt="NexusLLM" className="block h-10 w-10 object-contain dark:hidden" />
          <img src="/logo-white.png" alt="NexusLLM" className="hidden h-10 w-10 object-contain dark:block" />
          {/* eslint-enable @next/next/no-img-element */}
        </Link>

        <h1 className="text-center text-2xl font-bold tracking-tight">
          {isSignup ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mt-2 text-center text-sm text-txt-secondary">
          {isSignup ? "Start building on free models in seconds." : "Sign in to continue to NexusLLM."}
        </p>

        <form onSubmit={submit} className="mt-8 space-y-3">
          {isSignup && (
            <input
              type="text"
              required
              placeholder="Full name"
              className="h-12 w-full rounded-xl border border-border bg-bg-secondary/60 px-4 text-sm outline-none transition-colors focus:border-txt-primary"
            />
          )}
          <input
            type="email"
            required
            placeholder="Email address"
            className="h-12 w-full rounded-xl border border-border bg-bg-secondary/60 px-4 text-sm outline-none transition-colors focus:border-txt-primary"
          />
          <input
            type="password"
            required
            placeholder={isSignup ? "Password (8+ characters)" : "Password"}
            className="h-12 w-full rounded-xl border border-border bg-bg-secondary/60 px-4 text-sm outline-none transition-colors focus:border-txt-primary"
          />
          <button
            type="submit"
            disabled={busy}
            className="h-12 w-full rounded-xl bg-txt-primary text-sm font-semibold text-bg-primary transition-transform hover:scale-[1.02] disabled:opacity-60"
          >
            {busy ? "One moment…" : isSignup ? "Create account" : "Continue"}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-txt-tertiary">
          <span className="h-px flex-1 bg-border" /> OR <span className="h-px flex-1 bg-border" />
        </div>

        <div className="space-y-2.5">
          <button
            onClick={() => router.push("/chat")}
            className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl border border-border bg-bg-secondary/40 text-sm font-medium transition-colors hover:border-border-hover"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="currentColor" d="M21.35 11.1h-9.18v2.92h5.27c-.23 1.4-1.64 4.1-5.27 4.1-3.17 0-5.76-2.62-5.76-5.86s2.59-5.86 5.76-5.86c1.81 0 3.02.77 3.71 1.43l2.53-2.44C16.9 3.6 14.76 2.7 12.17 2.7 6.95 2.7 2.7 6.94 2.7 12.16s4.25 9.46 9.47 9.46c5.47 0 9.1-3.84 9.1-9.26 0-.62-.07-1.1-.16-1.26z" /></svg>
            Continue with Google
          </button>
          <button
            onClick={() => router.push("/chat")}
            className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl border border-border bg-bg-secondary/40 text-sm font-medium transition-colors hover:border-border-hover"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M16.37 12.5c.02 2.5 2.2 3.33 2.22 3.34-.02.06-.35 1.2-1.15 2.37-.69 1.02-1.41 2.03-2.54 2.05-1.11.02-1.47-.66-2.74-.66-1.27 0-1.66.64-2.71.68-1.09.04-1.92-1.1-2.62-2.12-1.43-2.07-2.52-5.85-1.05-8.4.73-1.27 2.03-2.07 3.44-2.09 1.07-.02 2.08.72 2.74.72.65 0 1.88-.89 3.17-.76.54.02 2.06.22 3.03 1.64-.08.05-1.81 1.06-1.79 3.16M14.4 5.6c.58-.7.97-1.68.86-2.65-.83.03-1.84.55-2.44 1.25-.54.62-1.01 1.61-.88 2.56.93.07 1.88-.47 2.46-1.16" /></svg>
            Continue with Apple
          </button>
        </div>

        <p className="mt-7 text-center text-sm text-txt-secondary">
          {isSignup ? "Already have an account? " : "Don't have an account? "}
          <Link href={isSignup ? "/login" : "/signup"} className="font-semibold text-txt-primary hover:underline">
            {isSignup ? "Log in" : "Sign up"}
          </Link>
        </p>
        <p className="mt-3 text-center text-xs text-txt-tertiary">
          NexusLLM is self-hosted &amp; key-based — you connect with your own API key inside.
        </p>
      </div>
    </div>
  );
}
