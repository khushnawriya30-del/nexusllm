// Deterministic provider color assignment.
//
// Colors are assigned strictly by PROVIDER (company): every model from the
// same provider shares one color, on the bar, the legend, and the tables.
// The palette is intentionally vibrant/neon so segments pop on dark backgrounds.

export const PROVIDER_COLORS = [
  "#ff2d78", // hot pink
  "#00e5ff", // vivid cyan
  "#39ff14", // neon green
  "#ffe600", // electric yellow
  "#ff7a00", // bright orange
  "#b026ff", // vibrant violet
  "#2979ff", // electric blue
  "#ff00e5", // magenta
  "#c6ff00", // lime
  "#1de9b6", // aqua teal
  "#ff3b3b", // coral red
  "#7c4dff", // indigo
];

/**
 * Stable, collision-resistant color for a provider id. Uses a small hash so
 * the same provider always maps to the same vibrant color.
 */
export function colorForProvider(providerId: string): string {
  let hash = 0;
  for (let i = 0; i < providerId.length; i++) {
    hash = (hash * 31 + providerId.charCodeAt(i)) >>> 0;
  }
  return PROVIDER_COLORS[hash % PROVIDER_COLORS.length];
}

/** Capability badge color mapping. */
export const CAPABILITY_COLORS: Record<string, string> = {
  chat: "#2979ff",
  vision: "#ff2d78",
  code: "#39ff14",
  embed: "#ffe600",
  reasoning: "#b026ff",
};
