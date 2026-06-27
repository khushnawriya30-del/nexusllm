"use client";

import { useState } from "react";
import type { FusionModelState, FusionState } from "@/lib/types";

function label(m: { provider?: string; model: string }): string {
  return m.provider ? `${m.provider}/${m.model}` : m.model;
}

/**
 * Clean "model responses" disclosure for a Fusion answer (rendered BELOW the
 * synthesized answer). While the panel runs it auto-expands and streams each
 * model's reply live; once the judge finishes it collapses to a single
 * "N model responses" toggle, with a subtle Panel · Judge · time meta line.
 */
export function FusionPanel({ fusion }: { fusion: FusionState }) {
  const total = fusion.models.length;
  const done = fusion.models.filter((m) => m.status === "done").length;
  const thinking = fusion.models.filter((m) => m.status === "thinking").length;

  // Active while any model is still thinking or the judge hasn't resolved yet.
  const active = thinking > 0 || fusion.judging || !fusion.judgeModel;
  const [manual, setManual] = useState<boolean | null>(null);
  const open = manual !== null ? manual : active;

  const contributors = fusion.models.filter((m) => m.status === "done");

  return (
    <div className="mt-3 text-[13px]">
      {/* Meta line (Panel · Judge · time) — appears once the judge resolves. */}
      {fusion.judgeModel && (
        <p className="mb-1 leading-relaxed text-txt-tertiary">
          <span className="font-medium text-txt-secondary">Panel:</span>{" "}
          <span className="font-mono text-[11px]">
            {contributors.map((m) => label(m)).join(", ") || "—"}
          </span>
          {fusion.judgeModel && (
            <>
              {"  ·  "}
              <span className="font-medium text-txt-secondary">Judge:</span>{" "}
              <span className="font-mono text-[11px]">
                {label({ provider: fusion.judgeProvider, model: fusion.judgeModel })}
              </span>
            </>
          )}
          {typeof fusion.elapsedMs === "number" && (
            <>
              {"  ·  "}
              <span className="font-mono text-[11px]">
                {(fusion.elapsedMs / 1000).toFixed(1)}s
              </span>
            </>
          )}
        </p>
      )}

      {/* Accordion toggle */}
      <button
        onClick={() => setManual(!open)}
        className="flex items-center gap-1.5 text-txt-secondary transition-colors hover:text-txt-primary"
      >
        <span
          className={`text-xs text-txt-tertiary transition-transform duration-150 ${
            open ? "rotate-90" : ""
          }`}
        >
          ▸
        </span>
        <span>
          {total} model response{total === 1 ? "" : "s"}
        </span>
        {active && (
          <span className="text-[11px] text-txt-tertiary">
            {thinking > 0 ? ` · ${thinking} thinking…` : ""}
            {done > 0 ? ` ${done} answered` : ""}
          </span>
        )}
      </button>

      {/* Body: flat, clean list — model name, then its reply below. */}
      {open && (
        <div className="ml-1.5 mt-2 space-y-4 border-l border-white/10 pl-3">
          {fusion.models.map((m) => (
            <FusionModelRow key={`${m.slot}-${m.model}`} m={m} />
          ))}
        </div>
      )}
    </div>
  );
}

function FusionModelRow({ m }: { m: FusionModelState }) {
  return (
    <div>
      <div className="font-mono text-[11px] text-txt-tertiary">{label(m)}</div>
      {m.status === "error" ? (
        <p className="mt-0.5 text-[12px] leading-relaxed text-yellow-400/90">
          ⚠️ {m.error || "Request failed"}
        </p>
      ) : (
        <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-txt-secondary">
          {m.content || (
            <span className="text-txt-tertiary">
              {m.status === "thinking" ? "…" : ""}
            </span>
          )}
        </p>
      )}
    </div>
  );
}
