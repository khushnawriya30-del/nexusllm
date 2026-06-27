// Persistent chat conversations for the ChatGPT-style app.
// Stored ENTIRELY in the device's localStorage — never sent to any cloud.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ChatMessage } from "@/lib/types";

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  model: string;
  createdAt: number;
  updatedAt: number;
}

interface ConversationState {
  conversations: Conversation[];
  activeId: string | null;

  createConversation: (model: string) => string;
  selectConversation: (id: string | null) => void;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  setConversationModel: (id: string, model: string) => void;
  /** Replace a conversation's messages (used after each send/stream). */
  setMessages: (id: string, messages: ChatMessage[]) => void;
  /** Remove empty (no-message) conversations except the currently active one. */
  pruneEmpty: () => void;
  clearAll: () => void;
}

function genId(): string {
  return Math.random().toString(36).slice(2, 11);
}

function deriveTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "New chat";
  const t = firstUser.content.trim().replace(/\s+/g, " ");
  return t ? (t.length > 48 ? t.slice(0, 48) + "…" : t) : "New chat";
}

export const useConversationStore = create<ConversationState>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeId: null,

      createConversation: (model) => {
        const id = genId();
        const conv: Conversation = {
          id,
          title: "New chat",
          messages: [],
          model,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set((s) => ({
          conversations: [conv, ...s.conversations],
          activeId: id,
        }));
        return id;
      },

      selectConversation: (id) => set({ activeId: id }),
      deleteConversation: (id) =>
        set((s) => {
          const remaining = s.conversations.filter((c) => c.id !== id);
          return {
            conversations: remaining,
            activeId:
              s.activeId === id ? remaining[0]?.id ?? null : s.activeId,
          };
        }),

      renameConversation: (id, title) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === id ? { ...c, title: title.trim() || c.title } : c,
          ),
        })),

      setConversationModel: (id, model) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === id ? { ...c, model } : c,
          ),
        })),

      setMessages: (id, messages) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === id
              ? {
                  ...c,
                  messages,
                  updatedAt: Date.now(),
                  title:
                    c.title === "New chat" ? deriveTitle(messages) : c.title,
                }
              : c,
          ),
        })),

      pruneEmpty: () =>
        set((s) => ({
          conversations: s.conversations.filter(
            (c) => c.messages.length > 0 || c.id === s.activeId,
          ),
        })),

      clearAll: () => set({ conversations: [], activeId: null }),
    }),
    { name: "nexusllm.conversations", version: 1 },
  ),
);
