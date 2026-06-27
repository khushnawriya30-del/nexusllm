"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useKeyGroups } from "@/hooks/useKeys";
import { api } from "@/lib/api";
import { colorForProvider } from "@/lib/colors";
import { formatLatency } from "@/lib/formatting";
import type { ConfiguredKey, ProviderKeyGroup } from "@/lib/types";

export function ConfiguredProvidersList() {
  const { data } = useKeyGroups();
  const groups = data?.groups ?? [];

  if (groups.length === 0) {
    return (
      <section>
        <h2 className="mb-3 text-base font-semibold">Configured providers</h2>
        <div className="rounded-3xl border border-white/[0.06] bg-bg-secondary/40 p-10 text-center">
          <p className="text-sm text-txt-secondary">No keys configured yet</p>
          <p className="mt-1 text-xs text-txt-tertiary">
            Add a provider key above and it’ll appear here, grouped by provider.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2 className="mb-3 text-base font-semibold">Configured providers</h2>
      <div className="space-y-3">
        {groups.map((g) => (
          <ProviderGroup key={g.provider_id} group={g} />
        ))}
      </div>
    </section>
  );
}

function ProviderGroup({ group }: { group: ProviderKeyGroup }) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["key-groups"] });

  const toggleProvider = async (enabled: boolean) => {
    if (group.is_custom) await api.toggleCustomProvider(group.provider_id, enabled);
    else await api.setProviderEnabled(group.provider_id, enabled);
    await refresh();
    await qc.invalidateQueries({ queryKey: ["providers"] });
  };

  return (
    <div className="overflow-hidden rounded-3xl border border-white/[0.06] bg-bg-secondary/40">
      {/* Provider header */}
      <div className="flex items-center gap-3 px-6 py-4">
        <Toggle on={group.enabled} onChange={toggleProvider} />
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: colorForProvider(group.provider_id) }}
        />
        <span className="font-medium">{group.name}</span>
        {group.is_custom && (
          <span className="rounded-full bg-bg-tertiary px-2 py-0.5 text-[10px] uppercase text-txt-tertiary">
            custom
          </span>
        )}
        {group.requires_key === false && (
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] uppercase text-emerald-400">
            no key needed
          </span>
        )}
        {group.requires_key !== false && group.key_free && (
          <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] uppercase text-sky-400">
            free key
          </span>
        )}
        {group.get_key_url && (
          <a
            href={group.get_key_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-txt-tertiary hover:text-accent"
          >
            Get API key ↗
          </a>
        )}
        <span className="ml-auto text-xs text-txt-tertiary">
          {group.key_count} key{group.key_count === 1 ? "" : "s"}
        </span>
      </div>

      {/* Keys */}
      <div className="space-y-px border-t border-white/[0.04] bg-bg-primary/30">
        {group.keys.map((k) => (
          <KeyRow
            key={k.id}
            entry={k}
            isCustom={group.is_custom}
            onChange={refresh}
          />
        ))}
        {group.keys.length === 0 && (
          <p className="px-6 py-3 text-xs text-txt-tertiary">
            {group.requires_key === false
              ? "Active automatically — no key needed. Add one for higher limits."
              : "No key stored for this endpoint."}
          </p>
        )}
      </div>
    </div>
  );
}

function KeyRow({
  entry,
  isCustom,
  onChange,
}: {
  entry: ConfiguredKey;
  isCustom: boolean;
  onChange: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(entry.label);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(entry.status);
  const [latency, setLatency] = useState(entry.latency_ms);

  const saveLabel = async () => {
    setBusy(true);
    try {
      await api.editKeyLabel(entry.id, label);
      setEditing(false);
      onChange();
    } finally {
      setBusy(false);
    }
  };

  const check = async () => {
    setBusy(true);
    try {
      const res = isCustom
        ? await api.checkCustomProvider(entry.id)
        : await api.checkKey(entry.id);
      setStatus(res.status);
      setLatency(res.latency_ms);
      onChange();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(isCustom ? "Remove this custom provider?" : "Remove this key?")) return;
    setBusy(true);
    try {
      if (isCustom) await api.removeCustomProvider(entry.id);
      else await api.removeKey(entry.id);
      onChange();
    } finally {
      setBusy(false);
    }
  };

  const dotColor =
    status === "healthy"
      ? "#10b981"
      : status == null
        ? "#71717a"
        : "#ef4444";

  return (
    <div className="flex items-center gap-3 px-6 py-3 text-sm">
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: dotColor }}
      />
      <span className="font-mono text-xs text-txt-secondary">{entry.masked}</span>

      {editing ? (
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          autoFocus
          onKeyDown={(e) => e.key === "Enter" && saveLabel()}
          placeholder="label"
          className="w-40 rounded-lg border border-white/[0.1] bg-bg-primary px-2 py-1 text-xs outline-none focus:border-accent"
        />
      ) : (
        <span className="text-xs text-txt-tertiary">
          {entry.label || (status ?? "unchecked")}
        </span>
      )}

      <span className="ml-auto flex items-center gap-4 text-xs text-txt-tertiary">
        {latency != null && <span className="font-mono">{formatLatency(latency)}</span>}

        {editing ? (
          <>
            <button
              onClick={saveLabel}
              disabled={busy}
              className="text-accent hover:underline"
            >
              Save
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setLabel(entry.label);
              }}
              className="hover:text-txt-primary"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            {/* Edit: label only — the key string is never editable. */}
            {!isCustom && (
              <button
                onClick={() => setEditing(true)}
                title="Edit label"
                className="hover:text-txt-primary"
              >
                ✎
              </button>
            )}
            <button
              onClick={check}
              disabled={busy}
              className="hover:text-txt-primary disabled:opacity-50"
            >
              Check
            </button>
            <button
              onClick={remove}
              disabled={busy}
              className="hover:text-red-400 disabled:opacity-50"
            >
              Remove
            </button>
          </>
        )}
      </span>
    </div>
  );
}

function Toggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${
        on ? "bg-accent" : "bg-bg-tertiary ring-1 ring-border"
      }`}
      aria-label="Toggle provider"
    >
      <span
        className={`block h-4 w-4 rounded-full bg-bg-primary shadow-sm ring-1 ring-border transition-transform ${
          on ? "translate-x-4" : ""
        }`}
      />
    </button>
  );
}
