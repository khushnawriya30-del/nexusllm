"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useModels } from "@/hooks/useModels";
import { useChatStore } from "@/store/chatStore";
import { colorForProvider } from "@/lib/colors";
import type { ModelListItem } from "@/lib/types";
import { motion, AnimatePresence } from "framer-motion";

export function ModelSelectorDropdown() {
  const { data } = useModels();
  const selectedModel = useChatStore((s) => s.selectedModel);
  const setSelectedModel = useChatStore((s) => s.setSelectedModel);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const all = data?.data ?? [];

  // Aliases (fallback chains) carry `underlying_models`; concrete models don't.
  // Embedding models are excluded — they can't be used for chat.
  const { aliases, concrete } = useMemo(() => {
    const aliases: ModelListItem[] = [];
    const concrete: ModelListItem[] = [];
    for (const m of all) {
      if (m.id === "auto" || m.id === "fusion") continue; // shown in Special group
      if ((m["x-nexusllm"].capabilities || []).includes("embed")) continue;
      if (m["x-nexusllm"].underlying_models?.length) aliases.push(m);
      else concrete.push(m);
    }
    return { aliases, concrete };
  }, [all]);

  const filterFn = (m: ModelListItem) =>
    m.id.toLowerCase().includes(search.toLowerCase());

  // Special routing modes shown at the very top of the list.
  // - auto: route through the fallback chain (try next model on failure)
  // - fusion: ask a panel of models in parallel, judge synthesizes one answer
  const SPECIAL = useMemo(
    () => [
      {
        id: "auto",
        title: "Auto (Fallback Chain)",
        subtitle: "Tries models until one works",
        badge: undefined as string | undefined,
      },
      {
        id: "fusion",
        title: "Fusion",
        subtitle: "Panel of models → judge synthesizes",
        badge: "NEW",
      },
    ],
    []
  );
  const specialFiltered = SPECIAL.filter(
    (s) =>
      s.id.includes(search.toLowerCase()) ||
      s.title.toLowerCase().includes(search.toLowerCase())
  );

  const select = (id: string) => {
    setSelectedModel(id);
    setOpen(false);
    setSearch("");
    setFocusedIndex(-1);
  };

  // Keyboard navigation (special modes first, then aliases, then concrete)
  const filteredItems = [
    ...specialFiltered.map((s) => ({ id: s.id })),
    ...aliases.filter(filterFn),
    ...concrete.filter(filterFn),
  ];
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((prev) => (prev + 1) % filteredItems.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length);
    } else if (e.key === "Enter" && focusedIndex >= 0) {
      e.preventDefault();
      select(filteredItems[focusedIndex].id);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <motion.button
        onClick={() => setOpen((o) => !o)}
        whileHover={{ scale: 1.01, borderColor: "rgba(255, 255, 255, 0.14)" }}
        whileTap={{ scale: 0.99 }}
        className="flex w-[280px] items-center gap-2 rounded-2xl border border-white/[0.08] bg-gradient-to-r from-bg-secondary/80 to-bg-secondary/60 px-4 py-2.5 text-sm shadow-sm backdrop-blur-sm transition-all duration-200 hover:shadow-lg"
      >
        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-accent/20 to-purple-500/20 ring-1 ring-accent/30">
          <svg className="h-3.5 w-3.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
          </svg>
        </div>
        <span className="flex-1 truncate font-mono text-xs text-txt-primary">
          {selectedModel}
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="text-txt-tertiary"
        >
          ▾
        </motion.span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 25
            }}
            className="absolute right-0 top-full z-50 mt-2 max-h-[420px] w-[320px] overflow-hidden rounded-2xl border border-white/[0.1] bg-bg-secondary/95 shadow-2xl backdrop-blur-xl ring-1 ring-white/[0.05]"
          >
            <div className="border-b border-white/[0.08] bg-gradient-to-r from-bg-tertiary/40 to-bg-tertiary/20 p-2.5">
              <div className="relative">
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search models…"
                  className="w-full rounded-xl border border-white/[0.08] bg-bg-primary pl-9 pr-3 py-2 text-sm text-txt-primary outline-none transition-all duration-200 placeholder:text-txt-tertiary focus:border-accent focus:shadow-lg focus:shadow-accent/10 focus:ring-2 focus:ring-accent/20"
                />
                <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-txt-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            <div className="max-h-[340px] overflow-y-auto p-1.5">
              {specialFiltered.length > 0 && (
                <Group label="Special">
                  {specialFiltered.map((s, idx) => (
                    <Item
                      key={s.id}
                      title={s.title}
                      subtitle={s.subtitle}
                      badge={s.badge}
                      selected={s.id === selectedModel}
                      focused={focusedIndex === idx}
                      onClick={() => select(s.id)}
                    />
                  ))}
                </Group>
              )}

              {aliases.filter(filterFn).length > 0 && (
                <Group label="Smart routes">
                  {aliases.filter(filterFn).map((m, idx) => (
                    <Item
                      key={m.id}
                      title={m.id}
                      subtitle={m["x-nexusllm"].description || "fallback chain"}
                      selected={m.id === selectedModel}
                      focused={focusedIndex === specialFiltered.length + idx}
                      onClick={() => select(m.id)}
                    />
                  ))}
                </Group>
              )}

              {concrete.filter(filterFn).length > 0 && (
                <Group label="Models">
                  {concrete.filter(filterFn).map((m, idx) => {
                    const provider =
                      m["x-nexusllm"].providers?.[0] ?? m.owned_by;
                    const globalIdx =
                      specialFiltered.length +
                      aliases.filter(filterFn).length +
                      idx;
                    return (
                      <Item
                        key={m.id}
                        title={m.id}
                        providerTag={provider}
                        providerColor={colorForProvider(provider)}
                        selected={m.id === selectedModel}
                        focused={focusedIndex === globalIdx}
                        onClick={() => select(m.id)}
                      />
                    );
                  })}
                </Group>
              )}

              {all.filter(filterFn).length === 0 && specialFiltered.length === 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="px-3 py-8 text-center"
                >
                  <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-bg-tertiary/50">
                    <svg className="h-6 w-6 text-txt-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-xs text-txt-tertiary">
                    No models found. Configure provider keys to discover models.
                  </p>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Group({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2">
      <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-txt-tertiary">
        {label}
      </p>
      {children}
    </div>
  );
}

function Item({
  title,
  subtitle,
  providerTag,
  badge,
  selected,
  focused,
  onClick,
}: {
  title: string;
  subtitle?: string;
  providerTag?: string;
  providerColor?: string;
  badge?: string;
  selected: boolean;
  focused: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.015, x: 2 }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-all duration-200 ${
        selected
          ? "bg-gradient-to-r from-accent/15 to-accent/10 ring-1 ring-accent/40 shadow-lg shadow-accent/10"
          : focused
          ? "bg-bg-tertiary/80 ring-1 ring-white/[0.08]"
          : "hover:bg-bg-tertiary/60"
      }`}
    >
      {selected && (
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 25 }}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/20 ring-1 ring-accent/40"
        >
          <svg className="h-3 w-3 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </motion.div>
      )}
      <div className="min-w-0 flex-1">
        <span className="block truncate font-mono text-xs">
          <span className={selected ? "font-semibold text-txt-primary" : "text-txt-primary"}>
            {title}
          </span>
          {providerTag && (
            <span className="text-txt-tertiary"> ({providerTag})</span>
          )}
          {badge && (
            <span
              className="ml-2 inline-block rounded-full bg-[#39ff14] px-1.5 py-0.5 align-middle font-sans text-[9px] font-extrabold uppercase tracking-wider text-black"
              style={{
                boxShadow:
                  "0 0 6px #39ff14, 0 0 12px #39ff14cc, 0 0 18px #39ff1499",
              }}
            >
              {badge}
            </span>
          )}
        </span>
        {subtitle && (
          <span className="block truncate text-[10px] text-txt-tertiary">
            {subtitle}
          </span>
        )}
      </div>
      {focused && !selected && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10"
        >
          <span className="text-[10px] text-accent">↵</span>
        </motion.div>
      )}
    </motion.button>
  );
}
