"use client";

import { useCallback, useRef, useState } from "react";
import { CHAT_ENDPOINT } from "@/lib/api";
import { firebaseEnabled, getFreshIdToken } from "@/lib/firebase";
import type { ChatMessage, ChatParams, FallbackInfo, FusionState } from "@/lib/types";
import { type ThinkingIntensity } from "@/lib/thinking-models";

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

interface SendOptions {
  model: string;
  systemPrompt: string;
  params: ChatParams;
  history: ChatMessage[];
  // Thinking capability options
  isThinkingEnabled?: boolean;
  thinkingIntensity?: ThinkingIntensity;
}

interface UseChatResult {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  isStreaming: boolean;
  fallback: FallbackInfo | null;
  clearFallback: () => void;
  send: (text: string, opts: SendOptions, images?: string[]) => Promise<void>;
  regenerate: (opts: SendOptions) => Promise<void>;
  stop: () => void;
  reset: () => void;
}

export function useChat(): UseChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [fallback, setFallback] = useState<FallbackInfo | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runCompletion = useCallback(
    async (convo: ChatMessage[], opts: SendOptions) => {
      setIsStreaming(true);
      setFallback(null);
      const controller = new AbortController();
      abortRef.current = controller;

      const apiMessages = [
        ...(opts.systemPrompt
          ? [{ role: "system", content: opts.systemPrompt }]
          : []),
        ...convo
          .filter((m) => m.role !== "system")
          .map((m) => {
            // Multimodal: send attached images alongside the text so vision
            // models can see them (OpenAI image_url content format).
            if (m.images && m.images.length > 0 && m.role === "user") {
              return {
                role: m.role,
                content: [
                  ...(m.content ? [{ type: "text", text: m.content }] : []),
                  ...m.images.map((url) => ({
                    type: "image_url",
                    image_url: { url },
                  })),
                ],
              };
            }
            return { role: m.role, content: m.content };
          }),
      ];

      const assistantId = genId();
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "" },
      ]);

      try {
        // Clamp sampling params to safe ranges. Very high temperature/top_p
        // make many models emit degenerate multilingual token "vomit"; we cap
        // temperature at 1.5 and top_p at 1.0 regardless of any stale stored
        // value to guarantee coherent output.
        const safeTemp = Math.min(Math.max(opts.params.temperature, 0), 1.5);
        const safeTopP = Math.min(Math.max(opts.params.topP, 0), 1);

        // Build request body
        const requestBody: any = {
          model: opts.model,
          messages: apiMessages,
          stream: opts.params.stream,
          temperature: safeTemp,
          max_tokens: opts.params.maxTokens,
          top_p: safeTopP,
        };

        // Pass ABSTRACT thinking flags to the backend; it maps them to the
        // correct provider params (Anthropic thinking.budget_tokens, OpenAI
        // reasoning_effort, …) based on whichever model/provider actually
        // serves the request after routing/fallback.
        if (opts.isThinkingEnabled && opts.thinkingIntensity) {
          requestBody.thinking_enabled = true;
          requestBody.thinking_intensity = opts.thinkingIntensity;
        }

        // Attach the signed-in user's fresh token so chat routes through THEIR
        // workspace (their keys/models). Logged out / Firebase off -> no header.
        const authHeaders: Record<string, string> = {};
        if (firebaseEnabled) {
          const token = await getFreshIdToken();
          if (token) authHeaders.Authorization = `Bearer ${token}`;
        }

        const res = await fetch(CHAT_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        // Detect auto-fallback from custom headers.
        const usedProvider = res.headers.get("X-NexusLLM-Provider");
        const usedModel = res.headers.get("X-NexusLLM-Model");
        const fallbackCount = parseInt(
          res.headers.get("X-NexusLLM-Fallback-Count") || "0",
          10,
        );
        // The "auto-switched" banner only makes sense when the request ended
        // up on a DIFFERENT model than the user picked (e.g. an alias resolving
        // to an underlying model). For the special routing modes (auto /
        // fallback / fusion) switching is the whole point, and for an explicit
        // model that merely failed over to another PROVIDER serving the SAME
        // model id, there's no real "switch" — so don't nag the user.
        const isAutoMode =
          opts.model === "auto" ||
          opts.model === "fallback" ||
          opts.model === "fusion";
        if (
          !isAutoMode &&
          fallbackCount > 0 &&
          usedModel &&
          usedProvider &&
          usedModel !== opts.model
        ) {
          setFallback({
            provider: usedProvider,
            model: usedModel,
            requested: opts.model,
            count: fallbackCount,
          });
        }

        if (!res.ok || !res.body) {
          const raw = await res.text().catch(() => "");
          const msg = extractErrorMessage(raw) || res.statusText;
          updateAssistant(
            setMessages,
            assistantId,
            `⚠️ **Request failed (${res.status})**\n\n${msg}`,
            { error: true },
          );
          return;
        }

        if (opts.params.stream) {
          if (opts.model === "fusion") {
            await consumeFusionStream(res.body, setMessages, assistantId);
          } else {
            await consumeStream(res.body, setMessages, assistantId, {
              provider: usedProvider,
              model: usedModel,
            });
          }
        } else {
          const data = await res.json();
          const msg = data.choices?.[0]?.message ?? {};
          const { content: parsed, reasoning: tagReasoning } = splitThinkTags(
            msg.content || "",
          );
          const reasoning =
            (msg.reasoning_content || msg.reasoning || "") + tagReasoning;
          const finalContent =
            parsed || (reasoning ? "" : "(empty response)");
          updateAssistant(setMessages, assistantId, finalContent, {
            reasoning: reasoning || undefined,
            provider: usedProvider ?? undefined,
            model: usedModel ?? undefined,
          });
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          updateAssistant(setMessages, assistantId, " _(stopped)_", {
            append: true,
          });
        } else {
          updateAssistant(
            setMessages,
            assistantId,
            `**Network error**: ${(err as Error).message}`,
            { error: true },
          );
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [],
  );

  const send = useCallback(
    async (text: string, opts: SendOptions, images?: string[]) => {
      const userMsg: ChatMessage = {
        id: genId(),
        role: "user",
        content: text,
        ...(images && images.length ? { images } : {}),
      };
      const convo = [...opts.history, userMsg];
      setMessages((prev) => [...prev, userMsg]);
      await runCompletion(convo, opts);
    },
    [runCompletion],
  );

  const regenerate = useCallback(
    async (opts: SendOptions) => {
      // Drop the last assistant message and re-run from the prior user turn.
      const lastUserIdx = [...opts.history]
        .reverse()
        .findIndex((m) => m.role === "user");
      if (lastUserIdx === -1) return;
      const keep = opts.history.slice(
        0,
        opts.history.length - lastUserIdx,
      );
      setMessages(keep);
      await runCompletion(keep, opts);
    },
    [runCompletion],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setFallback(null);
  }, []);

  return {
    messages,
    setMessages,
    isStreaming,
    fallback,
    clearFallback: () => setFallback(null),
    send,
    regenerate,
    stop,
    reset,
  };
}

// --- helpers ---------------------------------------------------------------

function updateAssistant(
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  id: string,
  content: string,
  opts: {
    append?: boolean;
    error?: boolean;
    provider?: string;
    model?: string;
    reasoning?: string;
  } = {},
) {
  setMessages((prev) =>
    prev.map((m) =>
      m.id === id
        ? {
            ...m,
            content: opts.append ? m.content + content : content,
            error: opts.error ?? m.error,
            provider: opts.provider ?? m.provider,
            model: opts.model ?? m.model,
            reasoning: opts.reasoning !== undefined ? opts.reasoning : m.reasoning,
          }
        : m,
    ),
  );
}

/** Split out a <think>...</think> block embedded in content (e.g. DeepSeek R1). */
function splitThinkTags(raw: string): { content: string; reasoning: string } {
  const open = raw.indexOf("<think>");
  if (open === -1) return { content: raw, reasoning: "" };
  const before = raw.slice(0, open);
  const rest = raw.slice(open + "<think>".length);
  const close = rest.indexOf("</think>");
  if (close === -1) {
    // Still inside the think block (streaming).
    return { content: before, reasoning: rest };
  }
  const reasoning = rest.slice(0, close);
  const after = rest.slice(close + "</think>".length);
  return { content: (before + after).trim(), reasoning };
}

async function consumeStream(
  body: ReadableStream<Uint8Array>,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  assistantId: string,
  meta: { provider: string | null; model: string | null },
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let rawContent = ""; // raw assistant content (may embed <think> tags)
  let apiReasoning = ""; // reasoning from dedicated API fields
  let errorMsg = "";

  const render = () => {
    const { content, reasoning: tagReasoning } = splitThinkTags(rawContent);
    const reasoning = apiReasoning + tagReasoning;
    updateAssistant(setMessages, assistantId, content, {
      reasoning: reasoning || undefined,
      provider: meta.provider ?? undefined,
      model: meta.model ?? undefined,
    });
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload);
        if (json.error) {
          errorMsg = json.error.message || "stream error";
          continue;
        }
        const delta = json.choices?.[0]?.delta ?? {};
        if (delta.content) rawContent += delta.content;
        if (delta.reasoning_content) apiReasoning += delta.reasoning_content;
        else if (delta.reasoning) apiReasoning += delta.reasoning;
        render();
      } catch {
        // Ignore partial/non-JSON keepalive lines.
      }
    }
  }

  // Finalize.
  const { content, reasoning: tagReasoning } = splitThinkTags(rawContent);
  const reasoning = apiReasoning + tagReasoning;
  if (errorMsg) {
    updateAssistant(setMessages, assistantId, `⚠️ **Error**\n\n${errorMsg}`, {
      error: true,
      reasoning: reasoning || undefined,
      provider: meta.provider ?? undefined,
      model: meta.model ?? undefined,
    });
  } else if (!content && !reasoning) {
    updateAssistant(
      setMessages,
      assistantId,
      "_(No content returned — the model may have hit its token limit. Try increasing Max tokens in Parameters.)_",
      { error: true },
    );
  } else if (!content && reasoning) {
    // Thinking finished but no final answer (tokens exhausted while reasoning).
    updateAssistant(
      setMessages,
      assistantId,
      "_(The model used all its tokens on reasoning and didn't produce a final answer. Increase **Max tokens** in Parameters and try again.)_",
      {
        reasoning,
        provider: meta.provider ?? undefined,
        model: meta.model ?? undefined,
      },
    );
  } else {
    updateAssistant(setMessages, assistantId, content, {
      reasoning: reasoning || undefined,
      provider: meta.provider ?? undefined,
      model: meta.model ?? undefined,
    });
  }
}

/** Pull a human-readable message out of a JSON or SSE error body. */
function extractErrorMessage(raw: string): string {
  if (!raw) return "";
  // Try plain JSON: {"error": {"message": "..."}}
  try {
    const j = JSON.parse(raw);
    if (j?.error?.message) return j.error.message;
    if (typeof j?.error === "string") return j.error;
    if (j?.message) return j.message;
  } catch {
    // Not plain JSON — maybe an SSE stream with a `data: {json}` error line.
  }
  const match = raw.match(/data:\s*(\{.*\})/);
  if (match) {
    try {
      const j = JSON.parse(match[1]);
      if (j?.error?.message) return j.error.message;
    } catch {
      /* ignore */
    }
  }
  return raw.slice(0, 300);
}

// --- Fusion streaming ------------------------------------------------------

interface FusionEvent {
  type:
    | "panel_init"
    | "delta"
    | "model_done"
    | "model_error"
    | "fallback"
    | "judge_start"
    | "judge_model";
  slot?: number;
  model?: string;
  provider?: string;
  content?: string;
  error?: string;
  from?: string;
  to?: string;
  to_provider?: string;
  models?: Array<{ slot: number; model: string; provider?: string }>;
  contributors?: string[];
}

/**
 * Consume the custom Fusion SSE protocol: ``data: {"fusion": {...}}`` events
 * drive the live per-model accordion, while plain OpenAI ``choices[].delta``
 * chunks (emitted after ``judge_start``) stream the synthesized master answer.
 */
async function consumeFusionStream(
  body: ReadableStream<Uint8Array>,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  assistantId: string,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const fusion: FusionState = { models: [], judging: false };
  let judgeRaw = "";
  let judgeReasoning = "";
  let errorMsg = "";
  const startTs = Date.now();

  const snapshot = (): FusionState => ({
    models: fusion.models.map((m) => ({ ...m })),
    contributors: fusion.contributors ? [...fusion.contributors] : undefined,
    judging: fusion.judging,
    judgeProvider: fusion.judgeProvider,
    judgeModel: fusion.judgeModel,
    elapsedMs: fusion.elapsedMs,
  });

  const findIdx = (slot: number, model: string): number => {
    for (let i = fusion.models.length - 1; i >= 0; i--) {
      if (fusion.models[i].slot === slot && fusion.models[i].model === model) {
        return i;
      }
    }
    return -1;
  };

  const handle = (f: FusionEvent) => {
    switch (f.type) {
      case "panel_init":
        fusion.models = (f.models || []).map((m) => ({
          slot: m.slot,
          model: m.model,
          provider: m.provider,
          content: "",
          status: "thinking" as const,
        }));
        break;
      case "delta": {
        const i = findIdx(f.slot ?? -1, f.model ?? "");
        if (i >= 0) fusion.models[i].content += f.content ?? "";
        break;
      }
      case "model_done": {
        const i = findIdx(f.slot ?? -1, f.model ?? "");
        if (i >= 0) fusion.models[i].status = "done";
        break;
      }
      case "model_error": {
        const i = findIdx(f.slot ?? -1, f.model ?? "");
        if (i >= 0) {
          fusion.models[i].status = "error";
          fusion.models[i].error = f.error;
        }
        break;
      }
      case "fallback":
        fusion.models.push({
          slot: f.slot ?? fusion.models.length,
          model: f.to ?? "?",
          provider: f.to_provider,
          content: "",
          status: "thinking",
        });
        break;
      case "judge_start":
        fusion.judging = true;
        fusion.contributors = f.contributors || [];
        break;
      case "judge_model":
        fusion.judgeProvider = f.provider;
        fusion.judgeModel = f.model;
        break;
    }
  };

  const render = () => {
    const { content, reasoning: tagReasoning } = splitThinkTags(judgeRaw);
    const reasoning = judgeReasoning + tagReasoning;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantId
          ? {
              ...m,
              content,
              reasoning: reasoning || undefined,
              fusion: snapshot(),
            }
          : m,
      ),
    );
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;
      let json: any;
      try {
        json = JSON.parse(payload);
      } catch {
        continue;
      }
      if (json.error) {
        errorMsg = json.error.message || "fusion error";
        continue;
      }
      if (json.fusion) {
        handle(json.fusion as FusionEvent);
        render();
        continue;
      }
      // Plain OpenAI chunk -> the judge's synthesized answer.
      const delta = json.choices?.[0]?.delta ?? {};
      if (delta.content) judgeRaw += delta.content;
      if (delta.reasoning_content) judgeReasoning += delta.reasoning_content;
      else if (delta.reasoning) judgeReasoning += delta.reasoning;
      render();
    }
  }

  // Judging finished — drop the live indicator and record total time.
  fusion.judging = false;
  fusion.elapsedMs = Date.now() - startTs;
  const { content } = splitThinkTags(judgeRaw);

  if (errorMsg && !content) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantId
          ? {
              ...m,
              content: `⚠️ **Fusion error**\n\n${errorMsg}`,
              error: true,
              fusion: snapshot(),
            }
          : m,
      ),
    );
    return;
  }
  render();
}
