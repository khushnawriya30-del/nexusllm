// UI state: theme, expanded provider accordions, sidebar visibility.

import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "dark" | "light" | "system";

interface UIState {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;

  expandedProviders: Record<string, boolean>;
  toggleProvider: (id: string) => void;
  setAllProviders: (ids: string[], expanded: boolean) => void;

  modelSidebarOpen: boolean;
  setModelSidebarOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: "system",
      toggleTheme: () =>
        set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
      setTheme: (t) => set({ theme: t }),

      expandedProviders: {},
      toggleProvider: (id) =>
        set((s) => ({
          expandedProviders: {
            ...s.expandedProviders,
            [id]: !s.expandedProviders[id],
          },
        })),
      setAllProviders: (ids, expanded) =>
        set(() => ({
          expandedProviders: Object.fromEntries(ids.map((id) => [id, expanded])),
        })),

      modelSidebarOpen: true,
      setModelSidebarOpen: (open) => set({ modelSidebarOpen: open }),
    }),
    { name: "nexusllm.ui" },
  ),
);
