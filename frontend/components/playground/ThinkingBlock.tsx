"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/**
 * Minimal, box-less thinking disclosure (Claude/o1 style).
 *
 * Header layout, left → right:  [chevron] "Thinking" [wave dots]
 * No background, no border, no button padding — plain text on the chat bg.
 * Reasoning text streams live strictly inside the collapsible body below.
 */
export function ThinkingBlock({
  reasoning,
  active,
}: {
  reasoning: string;
  active: boolean;
}) {
  const [open, setOpen] = useState(active);
  const [userToggled, setUserToggled] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Auto-expand WHILE thinking so the reasoning types out live (DeepSeek-style),
  // then auto-collapse once done — unless the user manually toggled it.
  useEffect(() => {
    if (!userToggled) setOpen(active);
  }, [active, userToggled]);

  useEffect(() => {
    if (open && active && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [reasoning, open, active]);

  return (
    <div className="mb-2">
      <button
        onClick={() => {
          setUserToggled(true);
          setOpen((o) => !o);
        }}
        className="flex items-center gap-1.5 bg-transparent p-0 text-sm text-txt-secondary transition-colors hover:text-txt-primary"
      >
        <motion.span
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ duration: 0.15 }}
          className="text-xs text-txt-tertiary"
        >
          ▸
        </motion.span>
        <span className={active ? "text-txt-primary" : ""}>
          {active ? "Thinking" : "Thought process"}
        </span>
        {active && (
          <span className="flex items-center gap-1">
            <Dot delay="0ms" />
            <Dot delay="150ms" />
            <Dot delay="300ms" />
          </span>
        )}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div
              ref={contentRef}
              className="ml-1.5 mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap border-l border-white/10 pl-3 text-[13px] leading-relaxed text-txt-tertiary"
            >
              {reasoning || "…"}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-txt-secondary"
      style={{ animationDelay: delay }}
    />
  );
}
