"use client";

import { useState } from "react";
import type { FusionModelState, FusionState } from "@/lib/types";

/**
 * Collapsible "Model Responses" accordion shown above a Fusion answer.
 *
 * Fully dynamic: the header reflects the live count of panel models and their
 * status. Each model has its OWN expand/collapse arrow so you can open just the
 * one you want without scrolling through every model's thinking.
 */
export function FusionPanel({ fusion }: { fusion: FusionState }) {
  const [open, setOpen] = useState(true);

  const total = fusion.models.length;
  const answered = fusion.models.filter((m) => m.status === "done").length;
  const thinking = fusion.models.filter((m) => m.status === "thinking").length;
  const failed = fusion.models.filter((m) => m.status === "error").length;

  const statusBits: string[] = [];
  if (thinking > 0) statusBits.push(`${thinking} thinking…`);
  if (answered > 0) statusBits.push(`${answered} answered`);
  if (failed > 0) statusBits.push(`${failed} failed`);
  const statusLine = statusBits.join("  ·  ");

  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-white/[0.08] bg-bg-secondary/40">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-bg-tertiary/40"
      >
        <span
          className={`text-txt-tertiary transition-transform duration-200 ${
            open ? "rotate-90" : ""
          }`}
        >
          ▸
        </span>
        <span className="font-mono text-xs font-semibold text-txt-primary">
          {total} model response{total === 1 ? "" : "s"}
        </span>
        {statusLine && (
          <span className="truncate text-[11px] font-medium text-txt-tertiary">
            {statusLine}
          </span>
        )}
        {thinking > 0 && (
          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-txt-tertiary">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#39ff14]" />
            live
          </span>
        )}
      </button>

      {open && (
        <div className="space-y-2 border-t border-white/[0.06] px-4 py-3">
          {fusion.models.map((m) => (
            <FusionModelRow key={`${m.slot}-${m.model}`} m={m} />
          ))}

          {fusion.judging && (
            <div className="flex items-center gap-2 px-1 py-1 text-[11px] font-medium text-txt-tertiary">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#39ff14]" />
              Judge synthesizing the master answer
              {fusion.contributors && fusion.contributors.length > 0
                ? ` from ${fusion.contributors.length} model${
                    fusion.contributors.length === 1 ? "" : "s"
                  }…`
                : "…"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** One panel model with its own expand/collapse arrow. */
function FusionModelRow({ m }: { m: FusionModelState }) {
  // null => follow the smart default (open while streaming, collapsed once
  // done). Once the user clicks the arrow, their choice sticks.
  const [manual, setManual] = useState<boolean | null>(null);
  const autoOpen = m.status === "thinking" || m.status === "error";
  const open = manual !== null ? manual : autoOpen;

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.05] bg-bg-primary/40">
      <button
        onClick={() => setManual(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-bg-tertiary/30"
      >
        <span
          className={`shrink-0 text-txt-tertiary transition-transform duration-200 ${
            open ? "rotate-90" : ""
          }`}
        >
          ▸
        </span>
        <StatusDot status={m.status} />
        <span className="truncate font-mono text-[11px] font-semibold text-txt-secondary">
          {m.provider ? `${m.provider} / ` : ""}
          {m.model}
        </span>
        <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide text-txt-tertiary">
          {m.status === "thinking"
            ? "streaming"
            : m.status === "done"
            ? "done"
            : "error"}
        </span>
      </button>

      {open && (
        <div className="border-t border-white/[0.05] px-3 py-2.5">
          {m.status === "error" ? (
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/[0.07] px-3 py-2 text-[11px] leading-relaxed text-yellow-300">
              ⚠️ {m.error || "Request failed"}
            </div>
          ) : (
            <p className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words font-sans text-[12px] leading-relaxed text-txt-secondary">
              {m.content || <span className="text-txt-tertiary">…</span>}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: "thinking" | "done" | "error" }) {
  if (status === "done") {
    return <span className="h-2 w-2 shrink-0 rounded-full bg-green-400" />;
  }
  if (status === "error") {
    return <span className="h-2 w-2 shrink-0 rounded-full bg-yellow-400" />;
  }
  return (
    <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[#39ff14]" />
  );
}
