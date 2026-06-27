"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useChat } from "@/hooks/useChat";
import { useChatStore } from "@/store/chatStore";
import { estimateTokens } from "@/lib/formatting";
import { MessageBubble } from "@/components/playground/MessageBubble";
import { FallbackBanner } from "@/components/playground/FallbackBanner";
import { SystemPromptEditor } from "@/components/playground/SystemPromptEditor";
import { ModelSelectorDropdown } from "@/components/playground/ModelSelectorDropdown";
import { ThinkingControl } from "@/components/playground/ThinkingControl";

export default function PlaygroundPage() {
  const {
    messages,
    isStreaming,
    fallback,
    clearFallback,
    send,
    regenerate,
    stop,
    reset,
  } = useChat();

  const selectedModel = useChatStore((s) => s.selectedModel);
  const systemPrompt = useChatStore((s) => s.systemPrompt);
  const params = useChatStore((s) => s.params);
  const isThinkingEnabled = useChatStore((s) => s.isThinkingEnabled);
  const thinkingIntensity = useChatStore((s) => s.thinkingIntensity);

  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottomRef = useRef(true);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 80;
  }, []);

  useEffect(() => {
    if (stickToBottomRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [messages]);

  const MAX_INPUT_HEIGHT = 300;
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }, [text]);

  const opts = useCallback(() => ({
    model: selectedModel,
    systemPrompt,
    params,
    history: messages,
    isThinkingEnabled,
    thinkingIntensity,
  }), [selectedModel, systemPrompt, params, messages, isThinkingEnabled, thinkingIntensity]);

  const submit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    stickToBottomRef.current = true;
    send(trimmed, opts());
    setText("");
  }, [text, isStreaming, send, opts]);

  const tokens = useMemo(() => {
    const conversationText = messages.map((m) => m.content).join(" ");
    return estimateTokens(conversationText + text);
  }, [messages, text]);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 lg:px-10">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Playground</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-txt-secondary">
            Send a chat completion through the router and see which provider
            serves it.
          </p>
        </div>
        <ModelSelectorDropdown />
      </div>

      {/* Chat card */}
      <div className="flex h-[calc(100vh-15rem)] min-h-[480px] flex-col overflow-hidden rounded-3xl border border-white/[0.06] bg-bg-secondary/50 shadow-sm">
        <SystemPromptEditor />

        {fallback && (
          <div className="px-6 pt-4">
            <FallbackBanner fallback={fallback} onDismiss={clearFallback} />
          </div>
        )}

        {/* Messages */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 space-y-6 overflow-y-auto p-6"
        >
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.08] bg-bg-tertiary/40">
                <svg className="h-8 w-8 text-txt-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="mt-4 text-base font-medium text-txt-primary">
                Ready to chat
              </p>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-txt-tertiary">
                Using{" "}
                <span className="rounded-md bg-bg-tertiary/50 px-2 py-0.5 font-mono text-xs text-txt-secondary">
                  {selectedModel}
                </span>
                <br />
                Switch models using the dropdown above.
              </p>
            </div>
          ) : (
            messages.map((m, i) => {
              const isLast = i === messages.length - 1;
              return (
                <MessageBubble
                  key={m.id}
                  message={m}
                  isStreaming={isStreaming && isLast && m.role === "assistant"}
                  onRegenerate={
                    isLast && m.role === "assistant"
                      ? () => regenerate(opts())
                      : undefined
                  }
                />
              );
            })
          )}
        </div>

        {/* Input bar */}
        <div className="border-t border-white/[0.06] bg-bg-primary/40 p-4">
          <div className="mb-3 flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-txt-tertiary">
                ~{tokens} tokens in context
              </span>
            </div>
            <div className="flex items-center gap-2">
              <ThinkingControl />
              <button
                onClick={reset}
                className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-bg-secondary/80 px-3 py-1.5 text-xs font-medium text-txt-secondary transition-colors hover:border-white/[0.15] hover:bg-bg-tertiary hover:text-txt-primary"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                New chat
              </button>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-bg-primary/70 p-2 transition-colors focus-within:border-white/30">
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder="Type a message… (↵ to send, ⇧↵ for newline)"
                rows={1}
                className="max-h-[300px] flex-1 resize-none overflow-y-auto bg-transparent px-3 py-2.5 text-sm text-txt-primary placeholder:text-txt-tertiary focus:outline-none"
              />
              {isStreaming ? (
                <button
                  onClick={stop}
                  className="shrink-0 rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-2.5 text-sm font-medium text-red-400 transition-colors hover:border-red-500/50"
                >
                  <span className="flex items-center gap-2">
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                    Stop
                  </span>
                </button>
              ) : (
                <button
                  onClick={submit}
                  disabled={!text.trim()}
                  className="shrink-0 rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-bg-primary transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="flex items-center gap-2">
                    Send
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
