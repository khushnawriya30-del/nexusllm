"use client";

import { useEffect } from "react";
import { useUIStore } from "@/store/uiStore";

function prefersDark(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Syncs the persisted theme preference to the <html> class.
 *
 * Supports "system" (follows the phone/OS dark-mode setting and updates live
 * when it changes) plus explicit "dark"/"light" manual overrides.
 */
export function useTheme() {
  const theme = useUIStore((s) => s.theme);
  const toggleTheme = useUIStore((s) => s.toggleTheme);
  const setTheme = useUIStore((s) => s.setTheme);

  useEffect(() => {
    const root = document.documentElement;

    const apply = () => {
      const effective =
        theme === "system" ? (prefersDark() ? "dark" : "light") : theme;
      if (effective === "light") {
        root.classList.add("light");
        root.classList.remove("dark");
      } else {
        root.classList.remove("light");
        root.classList.add("dark");
      }
    };

    apply();

    // When following the system, react to OS dark-mode changes live.
    if (theme === "system" && typeof window !== "undefined") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [theme]);

  // The currently-applied (resolved) theme, useful for icons.
  const resolved: "dark" | "light" =
    theme === "system" ? (prefersDark() ? "dark" : "light") : theme;

  return { theme, resolved, toggleTheme, setTheme };
}
