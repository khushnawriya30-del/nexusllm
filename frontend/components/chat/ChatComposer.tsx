"use client";

import { useEffect, useRef, useState } from "react";
import { ThinkingControl } from "@/components/playground/ThinkingControl";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4MB per image safety cap

export function ChatComposer({
  isStreaming,
  onSend,
  onStop,
}: {
  isStreaming: boolean;
  onSend: (text: string, images: string[]) => void;
  onStop: () => void;
}) {
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [text]);

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      if (file.size > MAX_IMAGE_BYTES) {
        alert(`"${file.name}" is larger than 4MB and was skipped.`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () =>
        setImages((prev) => [...prev, reader.result as string]);
      reader.readAsDataURL(file);
    });
  };

  const submit = () => {
    const trimmed = text.trim();
    if ((!trimmed && images.length === 0) || isStreaming) return;
    onSend(trimmed, images);
    setText("");
    setImages([]);
  };

  return (
    <div className="border-t border-border bg-bg-primary/60 px-4 py-3 backdrop-blur">
      <div className="mx-auto w-full max-w-3xl">
        {/* Reasoning control (only shows for capable models) */}
        <div className="mb-2 flex justify-start">
          <ThinkingControl />
        </div>

        {/* Image thumbnails */}
        {images.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {images.map((src, i) => (
              <div key={i} className="relative h-16 w-16 overflow-hidden rounded-lg border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full object-cover" />
                <button
                  onClick={() => setImages((p) => p.filter((_, j) => j !== i))}
                  className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/70 text-[10px] text-white"
                  aria-label="Remove image"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 rounded-2xl border border-border bg-bg-secondary/70 p-2 transition-colors focus-within:border-txt-tertiary">
          {/* Attach image */}
          <button
            onClick={() => fileRef.current?.click()}
            className="shrink-0 rounded-xl p-2 text-txt-secondary transition-colors hover:bg-bg-tertiary hover:text-txt-primary"
            aria-label="Attach image"
            title="Attach image"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />

          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder="Message NexusLLM…  (↵ send · ⇧↵ newline)"
            className="max-h-[220px] flex-1 resize-none bg-transparent px-2 py-2 text-sm text-txt-primary placeholder:text-txt-tertiary focus:outline-none"
          />

          {isStreaming ? (
            <button
              onClick={onStop}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 transition-colors hover:border-red-500/50"
              aria-label="Stop"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!text.trim() && images.length === 0}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-bg-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Send"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            </button>
          )}
        </div>
        <p className="mt-1.5 text-center text-[10px] text-txt-tertiary">
          Chats are saved only on this device.
        </p>
      </div>
    </div>
  );
}
