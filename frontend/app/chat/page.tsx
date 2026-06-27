"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@/hooks/useChat";
import { useChatStore } from "@/store/chatStore";
import { useConversationStore } from "@/store/conversationStore";
import { MessageBubble } from "@/components/playground/MessageBubble";
import { ModelSelectorDropdown } from "@/components/playground/ModelSelectorDropdown";
import { ThinkingControl } from "@/components/playground/ThinkingControl";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatComposer } from "@/components/chat/ChatComposer";

export default function ChatPage() {
  const {
    messages,
    setMessages,
    isStreaming,
    send,
    regenerate,
    stop,
  } = useChat();

  const selectedModel = useChatStore((s) => s.selectedModel);
  const setSelectedModel = useChatStore((s) => s.setSelectedModel);
  const systemPrompt = useChatStore((s) => s.systemPrompt);
  const params = useChatStore((s) => s.params);
  const isThinkingEnabled = useChatStore((s) => s.isThinkingEnabled);
  const thinkingIntensity = useChatStore((s) => s.thinkingIntensity);

  const conversations = useConversationStore((s) => s.conversations);
  const activeId = useConversationStore((s) => s.activeId);
  const createConversation = useConversationStore((s) => s.createConversation);
  const selectConversation = useConversationStore((s) => s.selectConversation);
  const persistMessages = useConversationStore((s) => s.setMessages);
  const setConversationModel = useConversationStore((s) => s.setConversationModel);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const loadedFor = useRef<string | null>(null);

  // Ensure there is always an active conversation.
  useEffect(() => {
    if (!activeId) {
      if (conversations.length) selectConversation(conversations[0].id);
      else createConversation(selectedModel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the active conversation's messages into the chat hook when it changes.
  useEffect(() => {
    if (!activeId || loadedFor.current === activeId) return;
    loadedFor.current = activeId;
    const conv = useConversationStore.getState().conversations.find((c) => c.id === activeId);
    setMessages(conv?.messages ?? []);
    if (conv?.model) setSelectedModel(conv.model);
    stickRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // Persist messages to the device once a turn settles (not on every token).
  useEffect(() => {
    if (activeId && !isStreaming && loadedFor.current === activeId) {
      persistMessages(activeId, messages);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming, messages.length]);

  // Keep the conversation's model in sync with the selector.
  useEffect(() => {
    if (activeId) setConversationModel(activeId, selectedModel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModel]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  useEffect(() => {
    if (stickRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [messages]);

  const opts = useCallback(
    () => ({
      model: selectedModel,
      systemPrompt,
      params,
      history: messages,
      isThinkingEnabled,
      thinkingIntensity,
    }),
    [selectedModel, systemPrompt, params, messages, isThinkingEnabled, thinkingIntensity],
  );

  const onSend = useCallback(
    (text: string, images: string[]) => {
      if (isStreaming) return;
      let id = activeId;
      if (!id) id = createConversation(selectedModel);
      loadedFor.current = id;
      stickRef.current = true;
      send(text, opts(), images);
    },
    [activeId, isStreaming, send, opts, createConversation, selectedModel],
  );

  const activeConv = conversations.find((c) => c.id === activeId);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      <ChatSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main chat column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <div className="flex items-center gap-3 border-b border-border bg-bg-primary/60 px-4 py-2.5 backdrop-blur">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-txt-secondary hover:bg-bg-tertiary hover:text-txt-primary md:hidden"
            aria-label="Open chats"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="min-w-0 flex-1 truncate text-sm font-medium text-txt-secondary">
            {activeConv?.title ?? "New chat"}
          </div>
          <ModelSelectorDropdown />
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto"
        >
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <img
                src="/logo-black.png"
                alt=""
                className="mb-5 h-14 w-14 object-contain opacity-90 dark:hidden"
              />
              <img
                src="/logo-white.png"
                alt=""
                className="mb-5 hidden h-14 w-14 object-contain opacity-90 dark:block"
              />
              <h1 className="text-2xl font-bold text-txt-primary">
                How can I help you today?
              </h1>
              <p className="mt-2 max-w-md text-sm text-txt-tertiary">
                Ask anything. Pick a model above, attach an image, and your chats
                stay saved on this device.
              </p>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
              {messages.map((m, i) => {
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
              })}
            </div>
          )}
        </div>

        {/* Composer */}
        <ChatComposer isStreaming={isStreaming} onSend={onSend} onStop={stop} />
      </div>
    </div>
  );
}
