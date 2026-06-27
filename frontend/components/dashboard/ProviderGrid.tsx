"use client";

import { useMemo, useState } from "react";
import type { ProviderStatus } from "@/lib/types";
import { ProviderCard } from "./ProviderCard";
import { useUIStore } from "@/store/uiStore";

type SortKey = "priority" | "tokens" | "latency" | "name";

export function ProviderGrid({ providers }: { providers: ProviderStatus[] }) {
  const [sort, setSort] = useState<SortKey>("priority");
  const [filter, setFilter] = useState("");
  const setAllProviders = useUIStore((s) => s.setAllProviders);

  const sorted = useMemo(() => {
    const arr = [...providers];
    switch (sort) {
      case "tokens":
        arr.sort(
          (a, b) => (b.daily_token_budget ?? 0) - (a.daily_token_budget ?? 0),
        );
        break;
      case "latency":
        arr.sort((a, b) => (a.avg_latency_ms ?? 1e9) - (b.avg_latency_ms ?? 1e9));
        break;
      case "name":
        arr.sort((a, b) => a.name.localeCompare(b.name));
        break;
      default:
        break; // already priority-ordered from backend
    }
    return arr;
  }, [providers, sort]);

  const ids = providers.map((p) => p.id);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter models across providers…"
          className="flex-1 rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-sm outline-none focus:border-accent"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded-md border border-border bg-bg-secondary px-2 py-1.5 text-sm outline-none"
        >
          <option value="priority">Sort: Priority</option>
          <option value="tokens">Sort: Tokens</option>
          <option value="latency">Sort: Latency</option>
          <option value="name">Sort: Name</option>
        </select>
        <button
          onClick={() => setAllProviders(ids, true)}
          className="rounded-md border border-border bg-bg-secondary px-2.5 py-1.5 text-sm text-txt-secondary hover:text-txt-primary"
        >
          Expand all
        </button>
        <button
          onClick={() => setAllProviders(ids, false)}
          className="rounded-md border border-border bg-bg-secondary px-2.5 py-1.5 text-sm text-txt-secondary hover:text-txt-primary"
        >
          Collapse all
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {sorted.map((p) => (
          <ProviderCard key={p.id} provider={p} filter={filter} />
        ))}
      </div>
    </div>
  );
}
