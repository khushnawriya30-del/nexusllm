"use client";

import { useRef } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";

/**
 * The hero's 3D object: the NexusLLM bolt floating in space. It tilts toward
 * the pointer (real perspective) and slowly counter-rotates, with a soft glow,
 * an orbiting ring, and depth particles. Theme-aware (white / black logo).
 */
export function Hero3DLogo() {
  const ref = useRef<HTMLDivElement>(null);

  // Pointer-driven tilt
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rotateY = useSpring(useTransform(mx, [-0.5, 0.5], [-22, 22]), {
    stiffness: 120,
    damping: 18,
  });
  const rotateX = useSpring(useTransform(my, [-0.5, 0.5], [18, -18]), {
    stiffness: 120,
    damping: 18,
  });

  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  };
  const onLeave = () => {
    mx.set(0);
    my.set(0);
  };

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className="relative mx-auto flex h-[340px] w-[340px] items-center justify-center sm:h-[440px] sm:w-[440px]"
      style={{ perspective: 1000 }}
    >
      {/* glow */}
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.18),transparent_60%)] blur-2xl dark:opacity-100 opacity-40" />

      {/* orbit rings */}
      <motion.div
        aria-hidden
        className="absolute inset-6 rounded-full border border-txt-primary/15"
        animate={{ rotate: 360 }}
        transition={{ duration: 26, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        aria-hidden
        className="absolute inset-16 rounded-full border border-dashed border-txt-primary/10"
        animate={{ rotate: -360 }}
        transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
      />

      {/* floating bolt */}
      <motion.div
        className="relative"
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        animate={{ y: [0, -14, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      >
        <div style={{ transform: "translateZ(60px)" }} className="drop-shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-white.png"
            alt="NexusLLM"
            className="hidden h-48 w-48 select-none object-contain sm:h-60 sm:w-60 dark:block"
            draggable={false}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-black.png"
            alt="NexusLLM"
            className="block h-48 w-48 select-none object-contain sm:h-60 sm:w-60 dark:hidden"
            draggable={false}
          />
        </div>
      </motion.div>

      {/* depth sparks */}
      {[...Array(6)].map((_, i) => {
        const angle = (i / 6) * Math.PI * 2;
        const radius = 150;
        return (
          <motion.span
            key={i}
            className="absolute h-1.5 w-1.5 rounded-full bg-txt-primary/60"
            style={{
              left: `calc(50% + ${Math.cos(angle) * radius}px)`,
              top: `calc(50% + ${Math.sin(angle) * radius}px)`,
            }}
            animate={{ opacity: [0.2, 1, 0.2], scale: [1, 1.6, 1] }}
            transition={{ duration: 2.4 + (i % 3) * 0.6, repeat: Infinity, delay: i * 0.2 }}
          />
        );
      })}
    </div>
  );
}
