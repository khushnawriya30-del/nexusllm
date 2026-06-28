"use client";

import { useEffect, useState } from "react";
import { useUIStore } from "@/store/uiStore";

type Theme = "system" | "light" | "dark";

const OPTIONS: { value: Theme; label: string; icon: JSX.Element }[] = [
  {
    value: "system",
    label: "System",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    value: "light",
    label: "Light",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    value: "dark",
    label: "Dark",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
        <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export function ThemeMenu() {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="flex items-center gap-0.5 rounded-full border border-border bg-bg-secondary/70 p-0.5 backdrop-blur">
      {OPTIONS.map((o) => {
        const active = mounted && theme === o.value;
        return (
          <button
            key={o.value}
            onClick={() => setTheme(o.value)}
            title={o.label}
            aria-label={`${o.label} theme`}
            className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
              active
                ? "bg-txt-primary text-bg-primary"
                : "text-txt-secondary hover:text-txt-primary"
            }`}
          >
            {o.icon}
          </button>
        );
      })}
    </div>
  );
}
