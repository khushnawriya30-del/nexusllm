"use client";

import { useState } from "react";
import { useConversationStore } from "@/store/conversationStore";
import { useChatStore } from "@/store/chatStore";

export function ChatSidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const conversations = useConversationStore((s) => s.conversations);
  const activeId = useConversationStore((s) => s.activeId);
  const createConversation = useConversationStore((s) => s.createConversation);
  const selectConversation = useConversationStore((s) => s.selectConversation);
  const deleteConversation = useConversationStore((s) => s.deleteConversation);
  const renameConversation = useConversationStore((s) => s.renameConversation);
  const selectedModel = useChatStore((s) => s.selectedModel);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const newChat = () => {
    createConversation(selectedModel);
    onClose();
  };

  const pick = (id: string) => {
    selectConversation(id);
    onClose();
  };

  const startRename = (id: string, title: string) => {
    setEditingId(id);
    setDraft(title);
  };
  const commitRename = (id: string) => {
    renameConversation(id, draft);
    setEditingId(null);
  };

  const content = (
    <div className="flex h-full w-64 flex-col border-r border-border bg-bg-secondary/60">
      <div className="p-3">
        <button
          onClick={newChat}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-bg-primary/60 px-4 py-2.5 text-sm font-semibold text-txt-primary transition-colors hover:bg-bg-tertiary"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {conversations.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-txt-tertiary">
            No chats yet. Start a new one.
          </p>
        ) : (
          <div className="space-y-0.5">
            {conversations.map((c) => (
              <div
                key={c.id}
                className={`group flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                  c.id === activeId
                    ? "bg-bg-tertiary text-txt-primary"
                    : "text-txt-secondary hover:bg-bg-tertiary/60"
                }`}
              >
                {editingId === c.id ? (
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => commitRename(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename(c.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="min-w-0 flex-1 rounded border border-border bg-bg-primary px-1.5 py-0.5 text-xs text-txt-primary outline-none"
                  />
                ) : (
                  <button
                    onClick={() => pick(c.id)}
                    onDoubleClick={() => startRename(c.id, c.title)}
                    className="min-w-0 flex-1 truncate text-left"
                    title={c.title}
                  >
                    {c.title}
                  </button>
                )}
                <button
                  onClick={() => startRename(c.id, c.title)}
                  className="shrink-0 text-txt-tertiary opacity-0 transition-opacity hover:text-txt-primary group-hover:opacity-100"
                  aria-label="Rename"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={() => deleteConversation(c.id)}
                  className="shrink-0 text-txt-tertiary opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                  aria-label="Delete"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: static sidebar */}
      <div className="hidden md:block">{content}</div>

      {/* Mobile: slide-over drawer */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={onClose}
          />
          <div className="absolute left-0 top-0 h-full">{content}</div>
        </div>
      )}
    </>
  );
}
