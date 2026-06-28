"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ThemeMenu } from "./ThemeMenu";

const LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how", label: "How it works" },
  { href: "/docs", label: "Docs" },
];

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-b border-border bg-bg-primary/70 backdrop-blur-xl"
          : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          {/* eslint-disable @next/next/no-img-element */}
          <img src="/logo-black.png" alt="NexusLLM" className="block h-8 w-8 object-contain dark:hidden" />
          <img src="/logo-white.png" alt="NexusLLM" className="hidden h-8 w-8 object-contain dark:block" />
          {/* eslint-enable @next/next/no-img-element */}
          <span className="text-lg font-bold tracking-tight">NexusLLM</span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm text-txt-secondary transition-colors hover:text-txt-primary"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2.5">
          <ThemeMenu />
          <Link
            href="/login"
            className="hidden rounded-full px-3.5 py-2 text-sm text-txt-secondary transition-colors hover:text-txt-primary sm:block"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-full bg-txt-primary px-4 py-2 text-sm font-semibold text-bg-primary transition-transform hover:scale-[1.03]"
          >
            Sign up
          </Link>
        </div>
      </div>
    </header>
  );
}
