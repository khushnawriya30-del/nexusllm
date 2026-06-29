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

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const [baseUrl, setBaseUrl] = useState(group.base_url ?? "");
  const [apiKey, setApiKey] = useState("");
  const [modelsText, setModelsText] = useState((group.models ?? []).join("\n"));
  const [busy, setBusy] = useState(false);

  const toggleProvider = async (enabled: boolean) => {
    if (group.is_custom) await api.toggleCustomProvider(group.provider_id, enabled);
    else await api.setProviderEnabled(group.provider_id, enabled);
    await refresh();
    await qc.invalidateQueries({ queryKey: ["providers"] });
  };

  const startEdit = () => {
    setName(group.name);
    setBaseUrl(group.base_url ?? "");
    setApiKey("");
    setModelsText((group.models ?? []).join("\n"));
    setEditing(true);
  };

  const removeProvider = async () => {
    if (
      !confirm(
        `Remove "${group.name}"? It will disappear from the list, /v1/models, and routing. ` +
          `Re-add a key later to bring it back.`,
      )
    )
      return;
    setBusy(true);
    try {
      await api.removeProvider(group.provider_id);
      await refresh();
      await qc.invalidateQueries({ queryKey: ["providers"] });
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    const models = modelsText
      .split("\n")
      .map((m) => m.trim())
      .filter(Boolean);
    if (!baseUrl.trim() || models.length === 0) return;
    setBusy(true);
    try {
      await api.editCustomProvider(group.provider_id, {
        name: name.trim() || baseUrl.trim(),
        base_url: baseUrl.trim(),
        models,
        // Only overwrite the key if the user typed a new one; blank = keep.
        ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
      });
      setEditing(false);
      await refresh();
      await qc.invalidateQueries({ queryKey: ["providers"] });
    } finally {
      setBusy(false);
    }
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
        <span className="ml-auto flex items-center gap-3 text-xs text-txt-tertiary">
          {group.is_custom && !editing && (
            <button onClick={startEdit} className="hover:text-txt-primary" title="Edit endpoint">
              Edit
            </button>
          )}
          {!group.is_custom && (
            <button
              onClick={removeProvider}
              disabled={busy}
              className="hover:text-red-400 disabled:opacity-50"
              title="Remove this provider completely"
            >
              Remove
            </button>
          )}
          <span>
            {group.key_count} key{group.key_count === 1 ? "" : "s"}
          </span>
        </span>
      </div>

      {/* Custom provider edit panel — base URL, API key, models all editable */}
      {group.is_custom && editing && (
        <div className="space-y-3 border-t border-white/[0.06] bg-bg-primary/30 px-6 py-4">
          <div>
            <label className="mb-1 block text-xs text-txt-tertiary">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-white/[0.1] bg-bg-primary px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-txt-tertiary">Base URL (endpoint)</label>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.example.com/v1"
              className="w-full rounded-lg border border-white/[0.1] bg-bg-primary px-3 py-2 font-mono text-sm outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-txt-tertiary">
              API key <span className="text-txt-tertiary/70">(leave blank to keep current)</span>
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-…"
              className="w-full rounded-lg border border-white/[0.1] bg-bg-primary px-3 py-2 font-mono text-sm outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-txt-tertiary">Models (one per line)</label>
            <textarea
              value={modelsText}
              onChange={(e) => setModelsText(e.target.value)}
              rows={4}
              placeholder={"gpt-5.5\nmistral-large"}
              className="w-full resize-y rounded-lg border border-white/[0.1] bg-bg-primary px-3 py-2 font-mono text-sm outline-none focus:border-accent"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={saveEdit}
              disabled={busy}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg-primary disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save changes"}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="text-sm text-txt-tertiary hover:text-txt-primary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

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
  const [newKey, setNewKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(entry.status);
  const [latency, setLatency] = useState(entry.latency_ms);

  const saveLabel = async () => {
    setBusy(true);
    try {
      await api.editKey(entry.id, {
        label,
        ...(newKey.trim() ? { api_key: newKey.trim() } : {}),
      });
      setEditing(false);
      setNewKey("");
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
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            autoFocus
            placeholder="label"
            className="w-32 rounded-lg border border-white/[0.1] bg-bg-primary px-2 py-1 text-xs outline-none focus:border-accent"
          />
          <input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            type="password"
            onKeyDown={(e) => e.key === "Enter" && saveLabel()}
            placeholder="new API key (blank = keep)"
            className="w-56 rounded-lg border border-white/[0.1] bg-bg-primary px-2 py-1 font-mono text-xs outline-none focus:border-accent"
          />
        </div>
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
                setNewKey("");
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
