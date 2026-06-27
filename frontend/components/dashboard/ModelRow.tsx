"use client";

import { useRouter } from "next/navigation";
import type { ProviderModel } from "@/lib/types";
import { formatCompact, formatContext, formatLatency } from "@/lib/formatting";
import { CapabilityBadge } from "./CapabilityBadge";
import { useChatStore } from "@/store/chatStore";

export function ModelRow({ model }: { model: ProviderModel }) {
  const router = useRouter();
  const setSelectedModel = useChatStore((s) => s.setSelectedModel);

  const openInPlayground = () => {
    setSelectedModel(model.model_id);
    router.push("/playground");
  };

  const rl = model.rate_limits;
  const rateText = rl
    ? [
        rl.requests_per_day ? `${formatCompact(rl.requests_per_day)} req/day` : null,
        rl.tokens_per_minute ? `${formatCompact(rl.tokens_per_minute)} tok/min` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "—";

  return (
    <div className="flex items-center gap-3 border-t border-border px-4 py-2 text-sm hover:bg-bg-tertiary/40">
      <button
        onClick={openInPlayground}
        className="truncate font-mono text-xs text-txt-primary hover:text-accent"
        title={model.model_id}
      >
        {model.model_id}
      </button>
      <span className="ml-auto shrink-0 font-mono text-xs text-txt-tertiary">
        {formatContext(model.context_window)}
      </span>
      <div className="hidden shrink-0 gap-1 sm:flex">
        {model.capabilities.map((c) => (
          <CapabilityBadge key={c} capability={c} />
        ))}
      </div>
      <span className="hidden w-40 shrink-0 truncate text-right text-xs text-txt-tertiary md:block">
        {rateText}
      </span>
      <span className="hidden w-16 shrink-0 text-right text-xs text-txt-tertiary lg:block">
        {formatLatency(model.avg_latency_ms)}
      </span>
      <button
        onClick={openInPlayground}
        className="shrink-0 rounded border border-border px-2 py-0.5 text-xs text-txt-secondary transition-colors hover:border-accent hover:text-accent"
      >
        ▶ Chat
      </button>
    </div>
  );
}
