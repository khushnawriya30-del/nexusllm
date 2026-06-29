"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

/**
 * Auth screen — styled to match the 3D landing (glass card, gradient accents,
 * cosmic backdrop). When Firebase is configured, "Continue with Google" does a
 * real Google sign-in; each account gets its own isolated workspace. Without
 * Firebase it degrades to the original key-based flow.
 */
export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const { enabled, user, signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSignup = mode === "signup";

  useEffect(() => {
    if (user) router.replace("/chat");
  }, [user, router]);

  const handleGoogle = async () => {
    setError(null);
    if (!enabled) {
      router.push("/chat");
      return;
    }
    setBusy(true);
    try {
      await signInWithGoogle();
      router.replace("/chat");
    } catch (e: any) {
      const code = e?.code || "";
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        setError(null);
      } else {
        setError(e?.message || "Sign-in failed. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  const submitEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!enabled) {
      setBusy(true);
      setTimeout(() => router.push("/chat"), 400);
      return;
    }
    setError("Please continue with Google to create your isolated workspace.");
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center px-5 py-24">
      <div className="w-full max-w-sm">
        {/* Glass card matching the landing aesthetic */}
        <div className="glass rounded-3xl p-8 shadow-2xl">
          <Link href="/" className="mb-7 flex items-center justify-center gap-2">
            {/* eslint-disable @next/next/no-img-element */}
            <img src="/logo-black.png" alt="NexusLLM" className="block h-10 w-10 object-contain dark:hidden" />
            <img src="/logo-white.png" alt="NexusLLM" className="hidden h-10 w-10 object-contain dark:block" />
            {/* eslint-enable @next/next/no-img-element */}
          </Link>

          <h1 className="text-center text-3xl font-bold tracking-tight">
            {isSignup ? (
              <>Create your <span className="nx-gradient">account</span></>
            ) : (
              <>Welcome <span className="nx-gradient">back</span></>
            )}
          </h1>
          <p className="mt-2 text-center text-sm text-txt-secondary">
            {isSignup ? "Your own private workspace of keys & models." : "Sign in to continue to NexusLLM."}
          </p>

          {/* Google first — the real account method */}
          <button
            onClick={handleGoogle}
            disabled={busy}
            className="mt-8 flex h-12 w-full items-center justify-center gap-2.5 rounded-full bg-txt-primary text-sm font-semibold text-bg-primary transition-transform hover:scale-[1.03] active:scale-[0.98] disabled:opacity-60"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="currentColor" d="M21.35 11.1h-9.18v2.92h5.27c-.23 1.4-1.64 4.1-5.27 4.1-3.17 0-5.76-2.62-5.76-5.86s2.59-5.86 5.76-5.86c1.81 0 3.02.77 3.71 1.43l2.53-2.44C16.9 3.6 14.76 2.7 12.17 2.7 6.95 2.7 2.7 6.94 2.7 12.16s4.25 9.46 9.47 9.46c5.47 0 9.1-3.84 9.1-9.26 0-.62-.07-1.1-.16-1.26z" /></svg>
            {busy ? "Opening Google…" : "Continue with Google"}
          </button>

          {error && <p className="mt-3 text-center text-xs text-red-400">{error}</p>}

          <div className="my-5 flex items-center gap-3 text-xs text-txt-tertiary">
            <span className="h-px flex-1 bg-border" /> OR <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={submitEmail} className="space-y-3">
            {isSignup && (
              <input
                type="text"
                placeholder="Full name"
                className="h-12 w-full rounded-xl border border-border bg-bg-primary/40 px-4 text-sm outline-none transition-colors focus:border-purple-400"
              />
            )}
            <input
              type="email"
              placeholder="Email address"
              className="h-12 w-full rounded-xl border border-border bg-bg-primary/40 px-4 text-sm outline-none transition-colors focus:border-purple-400"
            />
            <input
              type="password"
              placeholder={isSignup ? "Password (8+ characters)" : "Password"}
              className="h-12 w-full rounded-xl border border-border bg-bg-primary/40 px-4 text-sm outline-none transition-colors focus:border-purple-400"
            />
            <button
              type="submit"
              disabled={busy}
              className="h-12 w-full rounded-xl border border-border bg-bg-secondary/40 text-sm font-semibold text-txt-primary transition-colors hover:border-border-hover disabled:opacity-60"
            >
              {busy ? "One moment…" : isSignup ? "Create account" : "Continue"}
            </button>
          </form>

          <p className="mt-7 text-center text-sm text-txt-secondary">
            {isSignup ? "Already have an account? " : "Don't have an account? "}
            <Link href={isSignup ? "/login" : "/signup"} className="font-semibold text-txt-primary hover:underline">
              {isSignup ? "Log in" : "Sign up"}
            </Link>
          </p>
        </div>

        <p className="mt-5 text-center text-xs text-txt-tertiary">
          Each account is fully isolated — your keys & models are never shared.
        </p>
      </div>
    </div>
  );
}
