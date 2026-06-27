"use client";

import { memo, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { ChatMessage } from "@/lib/types";
import { ThinkingBlock } from "./ThinkingBlock";
import { FusionPanel } from "./FusionPanel";

// Heavy: defer the Prism bundle (+ language grammars) so it never bloats the
// initial playground load and only mounts when a code block actually renders.
const SyntaxHighlighter = dynamic(
  () => import("react-syntax-highlighter").then((m) => m.Prism),
  {
    ssr: false,
    loading: () => (
      <pre className="m-0 overflow-x-auto p-4 font-mono text-[13px] leading-relaxed text-txt-secondary">
        …
      </pre>
    ),
  },
);

function MessageBubbleImpl({
  message,
  isStreaming,
  onRegenerate,
}: {
  message: ChatMessage;
  isStreaming?: boolean;
  onRegenerate?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";

  const copy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Stable markdown renderer config. While streaming we render code as plain
  // <pre> (no per-token Prism re-highlight — that's what froze the UI); once
  // the stream finishes, the full syntax highlighter kicks in.
  const mdComponents = useMemo(
    () => ({
      code({ className, children, ...props }: any) {
        const match = /language-(\w+)/.exec(className || "");
        const inline = !className;
        if (inline || !match) {
          return (
            <code
              className="rounded-md bg-bg-tertiary/70 px-1.5 py-0.5 font-mono text-xs text-txt-primary ring-1 ring-white/[0.05]"
              {...props}
            >
              {children}
            </code>
          );
        }
        const codeText = String(children).replace(/\n$/, "");
        return (
          <div className="not-prose my-4">
            <div className="group/code overflow-hidden rounded-xl border border-white/[0.08] bg-bg-primary shadow-xl ring-1 ring-white/[0.03]">
              <div className="flex items-center justify-between border-b border-white/[0.08] bg-gradient-to-r from-bg-secondary/80 via-bg-secondary/60 to-bg-secondary/80 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full bg-red-400/60" />
                    <div className="h-2.5 w-2.5 rounded-full bg-yellow-400/60" />
                    <div className="h-2.5 w-2.5 rounded-full bg-green-400/60" />
                  </div>
                  <span className="text-xs font-semibold tracking-wide text-txt-tertiary">
                    {match[1]}
                  </span>
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(codeText)}
                  className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-bg-tertiary/60 px-2.5 py-1 text-xs font-medium text-txt-secondary transition-colors hover:border-white/[0.15] hover:bg-bg-tertiary hover:text-txt-primary"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy
                </button>
              </div>
              {isStreaming ? (
                <pre className="m-0 overflow-x-auto p-4 font-mono text-[13px] leading-relaxed text-txt-primary">
                  {codeText}
                </pre>
              ) : (
                <SyntaxHighlighter
                  style={oneDark as never}
                  language={match[1]}
                  PreTag="div"
                  customStyle={{
                    margin: 0,
                    borderRadius: 0,
                    background: "transparent",
                    fontSize: "13px",
                    lineHeight: "1.6",
                  }}
                >
                  {codeText}
                </SyntaxHighlighter>
              )}
            </div>
          </div>
        );
      },
    }),
    [isStreaming],
  );

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`group relative text-sm ${
          isUser ? "max-w-[85%]" : "w-full max-w-none"
        }`}
      >
        {isUser ? (
          <div className="rounded-2xl bg-gray-900 px-5 py-3.5 shadow-sm dark:bg-white">
            {message.images && message.images.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {message.images.map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={src}
                    alt=""
                    className="max-h-48 rounded-lg border border-white/10 object-cover"
                  />
                ))}
              </div>
            )}
            {message.content && (
              <p className="whitespace-pre-wrap font-medium leading-relaxed text-white dark:text-gray-900">
                {message.content}
              </p>
            )}
          </div>
        ) : message.error ? (
          <div className="w-full">
            {message.fusion && <FusionPanel fusion={message.fusion} />}
            <div className="max-w-[85%] overflow-hidden rounded-2xl border border-red-500/30 bg-red-500/[0.06] px-5 py-3.5">
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-500/15 ring-1 ring-red-500/30">
                  <svg className="h-4 w-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="flex-1 leading-relaxed text-red-300">{message.content}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="w-full">
            {message.content && (
              <div className="rounded-2xl bg-bg-tertiary/70 px-5 py-4 ring-1 ring-border">
                <div
                  className={`prose prose-sm max-w-none text-txt-primary prose-headings:text-txt-primary prose-headings:font-semibold prose-p:text-txt-primary prose-p:leading-relaxed prose-strong:text-txt-primary prose-strong:font-semibold prose-code:text-txt-primary prose-pre:bg-bg-primary prose-pre:border prose-pre:border-white/[0.06] prose-a:text-txt-primary prose-a:underline ${
                    isStreaming ? "typing-cursor" : ""
                  }`}
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                    {message.content}
                  </ReactMarkdown>
                </div>
              </div>
            )}
            {/* OUTSIDE the answer box, below it (no box of their own): */}
            {/* Fusion panel — Panel · Judge · time + the model responses. */}
            {message.fusion && <FusionPanel fusion={message.fusion} />}
            {/* Thought process (single-model reasoning). */}
            {!message.fusion &&
              (message.reasoning || (isStreaming && !message.content)) && (
                <div className="mt-3">
                  <ThinkingBlock
                    reasoning={message.reasoning || ""}
                    active={Boolean(isStreaming) && !message.content}
                  />
                </div>
              )}
          </div>
        )}

        {!isUser && !isStreaming && message.content && (
          <div className="mt-3 flex items-center gap-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            {message.model && (
              <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-gradient-to-r from-bg-secondary/60 to-bg-secondary/40 px-2.5 py-1.5 shadow-sm ring-1 ring-white/[0.03]">
                <svg className="h-3 w-3 text-txt-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
                <span className="font-mono text-[10px] font-medium text-txt-tertiary">{message.model}</span>
              </div>
            )}
            <button
              onClick={copy}
              className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-gradient-to-r from-bg-secondary/60 to-bg-secondary/40 px-2.5 py-1.5 text-xs font-medium text-txt-secondary shadow-sm ring-1 ring-white/[0.03] transition-colors duration-200 hover:border-white/[0.15] hover:bg-bg-tertiary hover:text-txt-primary"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {copied ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                )}
              </svg>
              {copied ? "Copied!" : "Copy"}
            </button>
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-gradient-to-r from-bg-secondary/60 to-bg-secondary/40 px-2.5 py-1.5 text-xs font-medium text-txt-secondary shadow-sm ring-1 ring-white/[0.03] transition-colors duration-200 hover:border-white/[0.15] hover:bg-bg-tertiary hover:text-txt-primary"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Regenerate
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Only re-render a bubble when its own content/state changes. This stops every
// past message from re-rendering on each streamed token of the active message.
export const MessageBubble = memo(MessageBubbleImpl, (prev, next) => {
  return (
    prev.message === next.message &&
    prev.isStreaming === next.isStreaming &&
    prev.onRegenerate === next.onRegenerate
  );
});
