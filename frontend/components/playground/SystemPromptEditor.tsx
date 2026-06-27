"use client";

import { useState, useRef, useEffect } from "react";
import { useChatStore } from "@/store/chatStore";
import { motion, AnimatePresence } from "framer-motion";

export function SystemPromptEditor() {
  const systemPrompt = useChatStore((s) => s.systemPrompt);
  const setSystemPrompt = useChatStore((s) => s.setSystemPrompt);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [systemPrompt, open]);

  const charCount = systemPrompt.length;
  const hasContent = systemPrompt.length > 0;

  return (
    <div className="border-b border-white/[0.06] bg-gradient-to-b from-bg-secondary/50 to-bg-secondary/30 backdrop-blur-sm">
      <motion.button
        onClick={() => setOpen((o) => !o)}
        whileHover={{ backgroundColor: "rgba(255, 255, 255, 0.02)" }}
        className="flex w-full items-center gap-2 px-5 py-3 text-xs transition-colors"
      >
        <motion.span
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="text-txt-tertiary"
        >
          ▶
        </motion.span>
        <span className="font-medium text-txt-secondary">System prompt</span>
        {systemPrompt && !open && (
          <motion.span
            initial={{ opacity: 0, x: -5 }}
            animate={{ opacity: 1, x: 0 }}
            className="truncate text-txt-tertiary"
          >
            — {systemPrompt.slice(0, 60)}
          </motion.span>
        )}
        {hasContent && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-accent/20 ring-1 ring-accent/30"
          >
            <span className="text-[10px] font-semibold text-accent">✓</span>
          </motion.div>
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-4">
              <div className="relative">
                {/* Floating label */}
                <motion.label
                  animate={{
                    y: focused || hasContent ? -24 : 0,
                    scale: focused || hasContent ? 0.85 : 1,
                    color: focused ? "rgb(139, 92, 246)" : "rgb(156, 163, 175)"
                  }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="pointer-events-none absolute left-3 top-3 origin-left text-sm text-txt-tertiary"
                >
                  You are a helpful assistant…
                </motion.label>

                <textarea
                  ref={textareaRef}
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  placeholder=""
                  rows={3}
                  className="w-full resize-none rounded-xl border border-white/[0.08] bg-gradient-to-br from-bg-primary/90 to-bg-primary/70 px-3 py-3 text-sm text-txt-primary outline-none transition-all duration-300 placeholder:text-transparent focus:border-accent focus:shadow-lg focus:shadow-accent/10 focus:ring-2 focus:ring-accent/20"
                  style={{ minHeight: '80px' }}
                />

                {/* Premium focus glow effect */}
                <motion.div
                  animate={{
                    opacity: focused ? 1 : 0,
                    scale: focused ? 1 : 0.95
                  }}
                  transition={{ duration: 0.3 }}
                  className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-r from-accent/5 via-purple-500/5 to-pink-500/5"
                />

                {/* Character counter */}
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: focused || hasContent ? 1 : 0, y: 0 }}
                  className="mt-2 flex items-center justify-between text-[10px]"
                >
                  <span className="text-txt-tertiary">
                    {focused ? "Breathing mode active" : "Configure AI behavior"}
                  </span>
                  <span className={`font-mono ${charCount > 500 ? "text-amber-400" : "text-txt-tertiary"}`}>
                    {charCount} chars
                  </span>
                </motion.div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
