"use client";

export type ModelKind = "chat" | "embeddings" | "fusion";

const OPTIONS: { key: ModelKind; label: string; badge?: string }[] = [
  { key: "chat", label: "Chat models" },
  { key: "embeddings", label: "Embeddings" },
  { key: "fusion", label: "Fusion", badge: "NEW" },
];

export function SegmentToggle({
  value,
  onChange,
}: {
  value: ModelKind;
  onChange: (v: ModelKind) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-bg-secondary/70 p-1">
      {OPTIONS.map((opt) => {
        const active = opt.key === value;
        return (
          <button
            key={opt.key}
            onClick={() => onChange(opt.key)}
            className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm transition-colors ${
              active
                ? "bg-bg-tertiary text-txt-primary"
                : "text-txt-secondary hover:text-txt-primary"
            }`}
          >
            {opt.label}
            {opt.badge && (
              <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-400">
                {opt.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
