"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring, type MotionValue } from "framer-motion";

export type ParallaxState = {
  /** Normalised pointer X relative to viewport centre. Range -0.5 (left) → +0.5 (right). */
  x: MotionValue<number>;
  /** Normalised pointer Y relative to viewport centre. Range -0.5 (top) → +0.5 (bottom). */
  y: MotionValue<number>;
  /** Whether fine-pointer motion (mouse) is available; false on touch / reduced-motion. */
  enabled: boolean;
};

/**
 * The shared cursor tracker that powers every parallax layer on the landing
 * page. Returns spring-smoothed normalised pointer coordinates so background,
 * midground and foreground layers can move at different speeds for a real
 * depth illusion (Apple-style). Disables itself for touch devices and when
 * the user requests reduced motion.
 */
export function useParallax(): ParallaxState {
  const [enabled, setEnabled] = useState(false);

  // Raw normalised pointer position (-0.5 → 0.5 across the viewport).
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);

  // Spring it for that smooth, weighted "camera" feel.
  const x = useSpring(rawX, { stiffness: 60, damping: 18, mass: 0.6 });
  const y = useSpring(rawY, { stiffness: 60, damping: 18, mass: 0.6 });

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (reduce || coarse) return;

    setEnabled(true);

    const onMove = (e: PointerEvent) => {
      rawX.set(e.clientX / window.innerWidth - 0.5);
      rawY.set(e.clientY / window.innerHeight - 0.5);
    };
    const onLeave = () => {
      rawX.set(0);
      rawY.set(0);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, [rawX, rawY]);

  return { x, y, enabled };
}
