"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

const TABS = [
  { href: "/models", label: "Models" },
  { href: "/chat", label: "Chat" },
  { href: "/playground", label: "Playground" },
  { href: "/analytics", label: "Analytics" },
  { href: "/keys", label: "Keys" },
];

export function NavBar() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg-primary/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6 lg:px-10">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            {/* eslint-disable @next/next/no-img-element */}
            {/* Black logo for light mode, white logo for dark mode. */}
            <img
              src="/logo-black.png"
              alt="NexusLLM logo"
              className="block h-9 w-9 object-contain dark:hidden"
            />
            <img
              src="/logo-white.png"
              alt="NexusLLM logo"
              className="hidden h-9 w-9 object-contain dark:block"
            />
            {/* eslint-enable @next/next/no-img-element */}
            <span className="text-xl font-bold tracking-tight">NexusLLM</span>
          </Link>
          <nav className="flex items-center gap-6">
            {TABS.map((tab) => {
              const active =
                tab.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`relative py-[1.15rem] text-base transition-colors ${
                    active
                      ? "text-txt-primary"
                      : "text-txt-secondary hover:text-txt-primary"
                  }`}
                >
                  {tab.label}
                  {active && (
                    <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-txt-primary" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/downloads/nexusllm.apk"
            download
            className="hidden items-center gap-1.5 rounded-full border border-border bg-bg-secondary px-3 py-1.5 text-sm font-medium text-txt-primary transition-colors hover:bg-bg-tertiary sm:flex"
            title="Download the NexusLLM Android app (.apk)"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M12 3v12" />
              <path d="m7 10 5 5 5-5" />
              <path d="M5 21h14" />
            </svg>
            Download App
          </a>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
