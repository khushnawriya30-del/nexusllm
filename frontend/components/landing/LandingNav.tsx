"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ThemeMenu } from "./ThemeMenu";

const LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how", label: "How it works" },
  { href: "/docs", label: "Docs" },
];

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${
        scrolled
          ? "border-b border-border bg-bg-primary/60 backdrop-blur-2xl shadow-sm"
          : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          {/* eslint-disable @next/next/no-img-element */}
          <img
            src="/logo-black.png"
            alt="NexusLLM"
            className="block h-8 w-8 object-contain transition-transform group-hover:scale-110 dark:hidden"
          />
          <img
            src="/logo-white.png"
            alt="NexusLLM"
            className="hidden h-8 w-8 object-contain transition-transform group-hover:scale-110 dark:block"
          />
          {/* eslint-enable @next/next/no-img-element */}
          <span className="text-lg font-bold tracking-tight">NexusLLM</span>
        </Link>

        {/* Desktop nav */}
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

        {/* Right side */}
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
            className="rounded-full bg-txt-primary px-4 py-2 text-sm font-semibold text-bg-primary transition-transform hover:scale-[1.04] active:scale-[0.97]"
          >
            Sign up
          </Link>

          {/* Mobile menu toggle */}
          <button
            className="flex h-9 w-9 items-center justify-center rounded-lg text-txt-secondary md:hidden"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {mobileOpen ? (
                <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" strokeLinejoin="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu dropdown */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-b border-border bg-bg-primary/80 backdrop-blur-2xl md:hidden"
          >
            <nav className="flex flex-col gap-1 px-5 py-3">
              {LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm text-txt-secondary transition-colors hover:bg-bg-secondary/60 hover:text-txt-primary"
                >
                  {l.label}
                </Link>
              ))}
              <Link
                href="/login"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm text-txt-secondary transition-colors hover:bg-bg-secondary/60 hover:text-txt-primary"
              >
                Log in
              </Link>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
