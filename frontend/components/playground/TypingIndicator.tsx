"use client";

/**
 * Premium three-dot typing indicator shown while waiting for the response
 * stream to start. A dark pill bubble with three grey dots that bounce in a
 * continuous wave (staggered animation delays).
 */
export function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-bg-tertiary px-4 py-3">
        <span
          className="typing-dot h-2 w-2 rounded-full bg-txt-tertiary"
          style={{ animationDelay: "0ms" }}
        />
        <span
          className="typing-dot h-2 w-2 rounded-full bg-txt-tertiary"
          style={{ animationDelay: "160ms" }}
        />
        <span
          className="typing-dot h-2 w-2 rounded-full bg-txt-tertiary"
          style={{ animationDelay: "320ms" }}
        />
      </div>
    </div>
  );
}
