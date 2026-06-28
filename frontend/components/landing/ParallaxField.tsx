"use client";

import { motion, useTransform, type MotionValue } from "framer-motion";
import { useEffect, useRef } from "react";

type ParallaxFieldProps = {
  x: MotionValue<number>;
  y: MotionValue<number>;
};

/** A subtle dot-grid that drifts with the cursor for depth. */
function Grid({ x, y }: ParallaxFieldProps) {
  const tx = useTransform(x, [-0.5, 0.5], [-30, 30]);
  const ty = useTransform(y, [-0.5, 0.5], [-30, 30]);
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 opacity-[0.035]"
      style={{ x: tx, y: ty }}
    >
      <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="pgrid" width="60" height="60" patternUnits="userSpaceOnUse">
            <circle cx="30" cy="30" r="1" fill="currentColor" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#pgrid)" />
      </svg>
    </motion.div>
  );
}

/** Two large radial glow blobs that orbit slowly and react to cursor. */
function GlowBlobs({ x, y }: ParallaxFieldProps) {
  const ax = useTransform(x, [-0.5, 0.5], [40, -40]);
  const ay = useTransform(y, [-0.5, 0.5], [40, -40]);
  const bx = useTransform(x, [-0.5, 0.5], [-50, 50]);
  const by = useTransform(y, [-0.5, 0.5], [-30, 30]);

  return (
    <>
      <motion.div
        aria-hidden
        className="pointer-events-none fixed -z-10 h-[600px] w-[600px] rounded-full bg-[radial-gradient(circle,var(--glow-accent),transparent_70%)] blur-3xl"
        style={{ x: ax, y: ay, top: "10%", left: "15%" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none fixed -z-10 h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,var(--glow-accent),transparent_70%)] blur-3xl"
        style={{ x: bx, y: by, bottom: "10%", right: "10%" }}
      />
    </>
  );
}

/** Floating particles that drift in a canvas layer. */
function Particles() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0;
    let raf = 0;

    type P = { x: number; y: number; vx: number; vy: number; r: number; a: number };
    let particles: P[] = [];

    function build() {
      const rect = cv!.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv!.width = Math.floor(w * dpr);
      cv!.height = Math.floor(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(50, Math.floor((w * h) / 40000));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
        r: Math.random() * 1.2 + 0.4,
        a: Math.random() * 0.3 + 0.05,
      }));
    }

    function frame() {
      const light = document.documentElement.classList.contains("light");
      ctx!.clearRect(0, 0, w, h);
      for (const p of particles) {
        if (!reduce) { p.x += p.vx; p.y += p.vy; }
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;

        ctx!.fillStyle = light
          ? `rgba(0,0,0,${p.a})`
          : `rgba(255,255,255,${p.a})`;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fill();
      }
      raf = requestAnimationFrame(frame);
    }

    build();
    frame();
    window.addEventListener("resize", build);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", build);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 opacity-60"
    />
  );
}

/**
 * The fixed background layer for the landing page. Combines a subtle grid,
 * two glow blobs (cursor-reactive), and drifting particles. All theme-aware.
 */
export function ParallaxField({ x, y }: ParallaxFieldProps) {
  return (
    <>
      <Grid x={x} y={y} />
      <GlowBlobs x={x} y={y} />
      <Particles />
    </>
  );
}
