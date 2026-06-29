"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "./AuthProvider";

// Public routes anyone can see. Everything else requires a signed-in account
// when Firebase is enabled. When Firebase is disabled, the gate is a no-op so
// the app keeps its original open behaviour.
const PUBLIC_ROUTES = ["/", "/docs", "/login", "/signup"];
const AUTH_ROUTES = ["/login", "/signup"];

function isPublic(pathname: string): boolean {
  return PUBLIC_ROUTES.includes(pathname);
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { enabled, user, loading } = useAuth();
  const pathname = usePathname() || "/";
  const router = useRouter();

  useEffect(() => {
    if (!enabled || loading) return;
    if (!user && !isPublic(pathname)) {
      router.replace("/login");
    } else if (user && AUTH_ROUTES.includes(pathname)) {
      router.replace("/chat");
    }
  }, [enabled, user, loading, pathname, router]);

  // Block protected content from flashing before auth resolves / redirects.
  if (enabled && !loading && !user && !isPublic(pathname)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-txt-tertiary">
        Redirecting to sign in…
      </div>
    );
  }
  return <>{children}</>;
}
