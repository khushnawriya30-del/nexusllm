"use client";

import { useRef } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useMotionValue,
  useSpring,
  type MotionValue,
} from "framer-motion";

const BEATS = [
  {
    k: "One key. Every model.",
    d: "Point any OpenAI-compatible client at one base URL and key. GPT, Claude, Llama, Gemini, DeepSeek, Qwen — all of it, instantly.",
  },
  {
    k: "Auto-routes. Never breaks.",
    d: "When a provider rate-limits or fails, NexusLLM fails over to the next in milliseconds. Your app never sees the seams.",
  },
  {
    k: "Fusion. Many minds, one answer.",
    d: "Run several models in parallel and let a judge synthesize the best response. Depth when it matters, speed when it doesn't.",
  },
];

function Beat({
  progress,
  index,
  total,
  k,
  d,
}: {
  progress: MotionValue<number>;
  index: number;
  total: number;
  k: string;
  d: string;
}) {
  const start = index / total;
  const mid = start + 1 / (total * 2);
  const end = index + 1;
  const endN = end / total;

  const opacity = useTransform(
    progress,
    [start, mid - 0.03, mid + 0.03, endN],
    [0, 1, 1, 0],
  );
  const y = useTransform(progress, [start, endN], [50, -50]);
  const scale = useTransform(progress, [start, mid - 0.03, mid + 0.03, endN], [0.92, 1, 1, 0.92]);

  return (
    <motion.div
      style={{ opacity, y, scale }}
      className="absolute inset-x-0 z-10 mx-auto max-w-2xl px-6 text-center"
    >
      <h3 className="bg-gradient-to-b from-txt-primary to-txt-secondary bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-6xl">
        {k}
      </h3>
      <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-txt-secondary sm:text-lg">
        {d}
      </p>
    </motion.div>
  );
}

export function ScrollShowcase() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });

  const rotate = useTransform(scrollYProgress, [0, 1], [0, 360]);
  const scale = useTransform(scrollYProgress, [0, 0.35, 0.65, 1], [0.8, 1.08, 1.08, 0.85]);
  const glow = useTransform(scrollYProgress, [0, 0.35, 0.65, 1], [0.2, 0.5, 0.5, 0.2]);

  // Subtle parallax tilt from pointer
  const ptrX = useMotionValue(0);
  const ptrY = useMotionValue(0);
  const tiltY = useSpring(useTransform(ptrX, [-0.5, 0.5], [-12, 12]), { stiffness: 80, damping: 16 });
  const tiltX = useSpring(useTransform(ptrY, [-0.5, 0.5], [10, -10]), { stiffness: 80, damping: 16 });

  return (
    <section
      ref={ref}
      className="relative h-[300vh]"
      onPointerMove={(e) => {
        ptrX.set(e.clientX / window.innerWidth - 0.5);
        ptrY.set(e.clientY / window.innerHeight - 0.5);
      }}
    >
      <div className="sticky top-0 flex h-screen items-center justify-center overflow-hidden">
        {/* Pinned 3D object — rotates/scales as you scroll, tilts with cursor */}
        <motion.div
          aria-hidden
          className="absolute inset-0 flex items-center justify-center"
          style={{ rotate, scale, perspective: 800 }}
        >
          <motion.div
            style={{ rotateY: tiltY, rotateX: tiltX, transformStyle: "preserve-3d" }}
          >
            <motion.div
              className="absolute h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,var(--glow-accent),transparent_60%)] blur-3xl"
              style={{ opacity: glow }}
            />
            {/* eslint-disable @next/next/no-img-element */}
            <img
              src="/logo-white.png"
              alt=""
              className="hidden h-72 w-72 object-contain opacity-90 dark:block"
            />
            <img
              src="/logo-black.png"
              alt=""
              className="block h-72 w-72 object-contain opacity-90 dark:hidden"
            />
            {/* eslint-enable @next/next/no-img-element */}
          </motion.div>
        </motion.div>

        {/* Scrolling text beats */}
        {BEATS.map((b, i) => (
          <Beat
            key={b.k}
            progress={scrollYProgress}
            index={i}
            total={BEATS.length}
            k={b.k}
            d={b.d}
          />
        ))}
      </div>
    </section>
  );
}
