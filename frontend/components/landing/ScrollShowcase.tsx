"use client";

import { useRef } from "react";
import {
  motion,
  useScroll,
  useTransform,
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
  const end = (index + 1) / total;
  const opacity = useTransform(
    progress,
    [start, mid - 0.04, mid + 0.04, end],
    [0, 1, 1, 0],
  );
  const y = useTransform(progress, [start, end], [40, -40]);
  return (
    <motion.div
      style={{ opacity, y }}
      className="absolute inset-x-0 z-10 mx-auto max-w-2xl px-6 text-center"
    >
      <h3 className="bg-gradient-to-b from-txt-primary to-txt-secondary bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-6xl">
        {k}
      </h3>
      <p className="mx-auto mt-5 max-w-xl text-base text-txt-secondary sm:text-lg">
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

  const rotate = useTransform(scrollYProgress, [0, 1], [0, 320]);
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [0.85, 1.05, 0.9]);
  const glow = useTransform(scrollYProgress, [0, 0.5, 1], [0.25, 0.5, 0.25]);

  return (
    <section ref={ref} className="relative h-[300vh]">
      <div className="sticky top-0 flex h-screen items-center justify-center overflow-hidden">
        {/* pinned 3D object — rotates/scales as you scroll, never scrolls away */}
        <motion.div
          aria-hidden
          className="absolute inset-0 flex items-center justify-center"
          style={{ rotate, scale }}
        >
          <motion.div
            className="absolute h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.16),transparent_60%)] blur-3xl"
            style={{ opacity: glow }}
          />
          {/* eslint-disable @next/next/no-img-element */}
          <img src="/logo-white.png" alt="" className="hidden h-72 w-72 object-contain opacity-90 dark:block" />
          <img src="/logo-black.png" alt="" className="block h-72 w-72 object-contain opacity-90 dark:hidden" />
          {/* eslint-enable @next/next/no-img-element */}
        </motion.div>

        {/* scrolling text beats */}
        {BEATS.map((b, i) => (
          <Beat key={b.k} progress={scrollYProgress} index={i} total={BEATS.length} k={b.k} d={b.d} />
        ))}
      </div>
    </section>
  );
}
