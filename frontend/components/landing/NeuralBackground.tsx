"use client";

import { useParallax } from "@/hooks/useParallax";
import { ParallaxField } from "./ParallaxField";

/**
 * The landing page's fixed visual background. Wraps the ParallaxField
 * (grid + glow blobs + particles) with the shared cursor tracker.
 * Theme-aware via CSS variables — no hardcoded colours.
 */
export function NeuralBackground() {
  const { x, y } = useParallax();
  return <ParallaxField x={x} y={y} />;
}
