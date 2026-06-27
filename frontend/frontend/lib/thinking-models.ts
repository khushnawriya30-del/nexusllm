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
 * Check if a model supports thinking mode
 */
export function supportsThinking(modelId: string): boolean {
  return THINKING_CAPABLE_MODELS.some(
    (m) => modelId.includes(m.modelId) || m.modelId.includes(modelId)
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
    max: "Maximum reasoning depth, analyzes every aspect",
  };
  return descriptions[intensity];
}
