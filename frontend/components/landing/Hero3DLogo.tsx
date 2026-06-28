"use client";

import { useRef } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";

/**
 * Hero 3D bolt: the NexusLLM logo floating in space with real perspective.
 *
 * • Tilts toward the pointer (cursor-reactive).
 * • Slow continuous Y-rotation for that Apple product-spin feel.
 * • Soft floor shadow that stretches as the logo tilts.
 * • Orbit rings and depth sparks.
 * • Theme-aware (white / black logo via CSS class).
 */
export function Hero3DLogo() {
  const ref = useRef<HTMLDivElement>(null);

  const mx = useMotionValue(0);
  const my = useMotionValue(0);

  const rotateY = useSpring(useTransform(mx, [-0.5, 0.5], [-25, 25]), {
    stiffness: 100,
    damping: 16,
  });
  const rotateX = useSpring(useTransform(my, [-0.5, 0.5], [20, -20]), {
    stiffness: 100,
    damping: 16,
  });

  const onMove = (e: React.PointerEvent) => {
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

  // Shadow responds to tilt — stretches and fades as the logo leans.
  const shadowScaleX = useTransform(rotateY, [-25, 0, 25], [1.3, 1, 1.3]);
  const shadowScaleY = useTransform(rotateX, [20, 0, -20], [0.8, 1, 0.8]);
  const shadowOpacity = useSpring(0.35, { stiffness: 50, damping: 14 });

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className="relative mx-auto flex h-[340px] w-[340px] items-center justify-center sm:h-[440px] sm:w-[440px] lg:h-[520px] lg:w-[520px]"
      style={{ perspective: 1200 }}
    >
      {/* ---------- Ambient glow ---------- */}
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(var(--glow-accent),0.25),transparent_60%)] blur-2xl" />

      {/* ---------- Orbit rings ---------- */}
      <motion.div
        aria-hidden
        className="absolute inset-8 rounded-full border border-txt-primary/10"
        animate={{ rotate: 360 }}
        transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        aria-hidden
        className="absolute inset-20 rounded-full border border-dashed border-txt-primary/[0.06]"
        animate={{ rotate: -360 }}
        transition={{ duration: 50, repeat: Infinity, ease: "linear" }}
      />

      {/* ---------- Floor shadow ---------- */}
      <motion.div
        aria-hidden
        className="absolute bottom-4 left-1/2 h-16 w-48 -translate-x-1/2 rounded-full bg-txt-primary/5 blur-2xl sm:h-20 sm:w-64"
        style={{
          scaleX: shadowScaleX,
          scaleY: shadowScaleY,
          opacity: shadowOpacity,
        }}
      />

      {/* ---------- Floating bolt ---------- */}
      <motion.div
        className="relative"
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        animate={{ y: [0, -12, 0], rotateZ: [0, 2, -2, 0] }}
        transition={{
          y: { duration: 5, repeat: Infinity, ease: "easeInOut" },
          rotateZ: { duration: 8, repeat: Infinity, ease: "easeInOut" },
        }}
      >
        <div
          style={{ transform: "translateZ(80px)" }}
          className="drop-shadow-[0_24px_64px_rgba(0,0,0,0.7)]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-white.png"
            alt="NexusLLM"
            className="hidden h-44 w-44 select-none object-contain sm:h-56 sm:w-56 lg:h-64 lg:w-64 dark:block"
            draggable={false}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-black.png"
            alt="NexusLLM"
            className="block h-44 w-44 select-none object-contain sm:h-56 sm:w-56 lg:h-64 lg:w-64 dark:hidden"
            draggable={false}
          />
        </div>
      </motion.div>

      {/* ---------- Depth sparks ---------- */}
      {[...Array(8)].map((_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        const radius = 170;
        return (
          <motion.span
            key={i}
            className="absolute h-1.5 w-1.5 rounded-full bg-txt-primary/50"
            style={{
              left: `calc(50% + ${Math.cos(angle) * radius}px)`,
              top: `calc(50% + ${Math.sin(angle) * radius}px)`,
              transform: "translateZ(20px)",
            }}
            animate={{ opacity: [0.15, 0.9, 0.15], scale: [0.8, 1.6, 0.8] }}
            transition={{
              duration: 2.8 + (i % 3) * 0.7,
              repeat: Infinity,
              delay: i * 0.25,
            }}
          />
        );
      })}
    </div>
  );
}
