/**
 * Configuration for models that support extended thinking/reasoning
 */

export type ThinkingIntensity = "low" | "medium" | "high" | "max";

export interface ThinkingModelConfig {
  modelId: string;
  provider: "anthropic" | "openai" | "google";
  supportsThinking: boolean;
}

// Models that support thinking/reasoning capabilities
export const THINKING_CAPABLE_MODELS: ThinkingModelConfig[] = [
  // Anthropic Claude models with extended thinking
  { modelId: "claude-opus-4", provider: "anthropic", supportsThinking: true },
  { modelId: "claude-opus-4.8", provider: "anthropic", supportsThinking: true },
  { modelId: "claude-sonnet-4", provider: "anthropic", supportsThinking: true },
  { modelId: "claude-sonnet-4.6", provider: "anthropic", supportsThinking: true },

  // OpenAI reasoning models
  { modelId: "o1", provider: "openai", supportsThinking: true },
  { modelId: "o1-preview", provider: "openai", supportsThinking: true },
  { modelId: "o1-mini", provider: "openai", supportsThinking: true },

  // Google models with thinking (if they add it)
  { modelId: "gemini-2.0-flash-thinking-exp", provider: "google", supportsThinking: true },
];

/**
 * Patterns that identify reasoning/thinking-capable model families.
 *
 * This is intentionally broad and future-proof: model gateways ship new
 * versioned ids constantly (gpt-5.4, gpt-5.5, claude-opus-4.8, glm-5.1, …), so
 * matching by family pattern is far more reliable than an exact-id allow-list.
 */
const THINKING_PATTERNS: RegExp[] = [
  /gpt-?5/i, // GPT-5.x family (reasoning-capable)
  /(^|[\/_-])o[1345]([\/_.-]|$)/i, // OpenAI o1 / o3 / o4 / o5 series
  /claude.*(opus|sonnet|3\.[57]|4)/i, // Claude Opus / Sonnet (3.5+, 4.x) extended thinking
  /deepseek.*(r1|reason|v[45])/i, // DeepSeek R1 / reasoner / v4+
  /\bqwq\b/i, // Qwen QwQ
  /qwen-?3/i, // Qwen3 hybrid reasoning
  /glm-?[45]/i, // Zhipu GLM 4.x / 5.x
  /grok-?[345]/i, // Grok 3/4/5 reasoning
  /gemini.*(think|2\.[05]|3)/i, // Gemini thinking / 2.x / 3
  /magistral/i, // Mistral Magistral
  /minimax-?m[23]/i, // MiniMax M2 / M3 reasoning
  /kimi-?k2/i, // Moonshot Kimi-K2 (thinking)
  /nemotron/i, // NVIDIA Nemotron reasoning family
  /gpt-?oss/i, // OpenAI gpt-oss (reasoning_effort)
  /seed-oss/i, // ByteDance Seed-OSS (thinking budget)
  /step-?3/i, // StepFun Step-3.x reasoning
  /(reason|reasoner|thinking)/i, // explicit reasoning markers
];

/**
 * Check if a model supports thinking mode.
 *
 * A model is considered thinking-capable if ANY of these hold:
 *  - the backend tagged it with the "reasoning" capability, OR
 *  - its id matches a known reasoning family pattern (see THINKING_PATTERNS), OR
 *  - it matches an entry in {@link THINKING_CAPABLE_MODELS}.
 *
 * The special routing modes ("auto"/"fusion") never expose thinking controls.
 * This function is pure, so it re-evaluates reliably on every model change.
 */
export function supportsThinking(
  modelId: string,
  capabilities?: string[],
): boolean {
  if (!modelId || modelId === "auto" || modelId === "fusion") return false;
  if (capabilities && capabilities.includes("reasoning")) return true;
  if (THINKING_PATTERNS.some((re) => re.test(modelId))) return true;
  return THINKING_CAPABLE_MODELS.some(
    (m) => modelId.includes(m.modelId) || m.modelId.includes(modelId),
  );
}

/**
 * Get provider-specific thinking parameters
 */
export function getThinkingParams(
  modelId: string,
  intensity: ThinkingIntensity
): Record<string, any> {
  const config = THINKING_CAPABLE_MODELS.find(
    (m) => modelId.includes(m.modelId) || m.modelId.includes(modelId)
  );

  if (!config) return {};

  switch (config.provider) {
    case "anthropic":
      // Map to Anthropic's thinking.budget_tokens
      const budgetMap = {
        low: 1000,
        medium: 5000,
        high: 10000,
        max: 25000,
      };
      return {
        thinking: {
          type: "enabled",
          budget_tokens: budgetMap[intensity],
        },
      };

    case "openai":
      // Map to OpenAI's reasoning_effort
      const effortMap = {
        low: "low",
        medium: "medium",
        high: "high",
        max: "high", // OpenAI doesn't have 'max', use 'high'
      };
      return {
        reasoning_effort: effortMap[intensity],
      };

    case "google":
      // Google's thinking parameter (if they have one)
      return {
        thinking_mode: intensity,
      };

    default:
      return {};
  }
}

/**
 * Get token consumption estimate for intensity levels
 */
export function getTokenEstimate(intensity: ThinkingIntensity): string {
  const estimates = {
    low: "~1K thinking tokens",
    medium: "~5K thinking tokens",
    high: "~10K thinking tokens",
    max: "~25K+ thinking tokens",
  };
  return estimates[intensity];
}

/**
 * Get intensity level descriptions
 */
export function getIntensityDescription(intensity: ThinkingIntensity): string {
  const descriptions = {
    low: "Fastest response, minimal reasoning depth",
    medium: "Balanced speed and reasoning quality",
    high: "Deeper analysis, thorough reasoning",
    max: "Extra-high (xhigh) — maximum reasoning depth & accuracy",
  };
  return descriptions[intensity];
}
