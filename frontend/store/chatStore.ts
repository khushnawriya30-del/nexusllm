// Chat state: selected model, params, system prompt, favorites, conversations.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ChatMessage, ChatParams } from "@/lib/types";
import type { ThinkingIntensity } from "@/lib/thinking-models";
import type { ThinkingIntensity } from "@/lib/thinking-models";

interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  model: string;
  createdAt: number;
}

interface ChatState {
  selectedModel: string;
  setSelectedModel: (m: string) => void;

  systemPrompt: string;
  setSystemPrompt: (p: string) => void;

  params: ChatParams;
  setParams: (p: Partial<ChatParams>) => void;

  // Extended thinking / reasoning (only used by capable models).
  isThinkingEnabled: boolean;
  setThinkingEnabled: (v: boolean) => void;
  thinkingIntensity: ThinkingIntensity;
  setThinkingIntensity: (v: ThinkingIntensity) => void;

  // Thinking capability settings
  isThinkingEnabled: boolean;
  thinkingIntensity: ThinkingIntensity;
  setThinkingEnabled: (enabled: boolean) => void;
  setThinkingIntensity: (intensity: ThinkingIntensity) => void;

  favorites: string[];
  toggleFavorite: (model: string) => void;

  conversations: Conversation[];
  activeConversationId: string | null;
  newConversation: () => void;
  setActiveConversation: (id: string) => void;
  saveConversation: (messages: ChatMessage[], model: string) => void;
}

const DEFAULT_PARAMS: ChatParams = {
  // Low temperature => accurate, consistent answers out of the box. Users
  // shouldn't have to understand sampling knobs, so this is fixed sensibly and
  // the Parameters UI is hidden.
  temperature: 0.3,
  maxTokens: 8192,
  topP: 1,
  stream: true,
};

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      selectedModel: "fast-small",
      setSelectedModel: (m) => set({ selectedModel: m }),

      systemPrompt: "",
      setSystemPrompt: (p) => set({ systemPrompt: p }),

      params: DEFAULT_PARAMS,
      setParams: (p) => set((s) => ({ params: { ...s.params, ...p } })),

      isThinkingEnabled: false,
      setThinkingEnabled: (v) => set({ isThinkingEnabled: v }),
      thinkingIntensity: "medium",
      setThinkingIntensity: (v) => set({ thinkingIntensity: v }),

      // Thinking capability state
      isThinkingEnabled: false,
      thinkingIntensity: "medium",
      setThinkingEnabled: (enabled) => set({ isThinkingEnabled: enabled }),
      setThinkingIntensity: (intensity) => set({ thinkingIntensity: intensity }),

      favorites: [],
      toggleFavorite: (model) =>
        set((s) => ({
          favorites: s.favorites.includes(model)
            ? s.favorites.filter((m) => m !== model)
            : [...s.favorites, model],
        })),

      conversations: [],
      activeConversationId: null,
      newConversation: () => set({ activeConversationId: null }),
      setActiveConversation: (id) => set({ activeConversationId: id }),
      saveConversation: (messages, model) => {
        if (messages.length === 0) return;
        const state = get();
        const id = state.activeConversationId || genId();
        const title =
          messages.find((m) => m.role === "user")?.content.slice(0, 40) ||
          "New chat";
        const existing = state.conversations.find((c) => c.id === id);
        const conv: Conversation = {
          id,
          title,
          messages,
          model,
          createdAt: existing?.createdAt || Date.now(),
        };
        set({
          activeConversationId: id,
          conversations: [
            conv,
            ...state.conversations.filter((c) => c.id !== id),
          ].slice(0, 50),
        });
      },
    }),
    { name: "nexusllm.chat",
      version: 4, // bump: hide params UI + force accurate sampling defaults
      migrate: (state: unknown) => {
        const s = state as { params?: ChatParams; isThinkingEnabled?: boolean; thinkingIntensity?: ThinkingIntensity } | undefined;
        if (s?.params) {
          // Sampling UI is hidden — force accurate, sensible values regardless
          // of any stale stored knobs.
          s.params.temperature = 0.3;
          s.params.topP = 1;
          s.params.stream = true;
          if (!s.params.maxTokens || s.params.maxTokens < 8192) {
            s.params.maxTokens = 8192;
          }
        }
        // Add default thinking values for existing state
        if (s && s.isThinkingEnabled === undefined) {
          s.isThinkingEnabled = false;
        }
        if (s && s.thinkingIntensity === undefined) {
          s.thinkingIntensity = "medium";
        }
        return s as never;
      },
    },
  ),
);
