"use client";

import { useEffect, useRef } from "react";

/**
 * A living "AI brain" — a field of nodes wired by proximity edges that drift
 * slowly and react to the pointer. Sits fixed behind the page (Apple-style):
 * the content scrolls over it while this layer only moves, never scrolls away.
 * Monochrome + theme-aware (white-on-black / black-on-white).
 */
export function NeuralBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const context = cv.getContext("2d");
    if (!context) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0;
    let h = 0;
    const pointer = { x: -9999, y: -9999, active: false };

    type Node = { x: number; y: number; vx: number; vy: number; r: number };
    let nodes: Node[] = [];

    const isLight = () => document.documentElement.classList.contains("light");

    function build() {
      const rect = cv!.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv!.width = Math.floor(w * dpr);
      cv!.height = Math.floor(h * dpr);
      context!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(90, Math.floor((w * h) / 18000));
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        r: Math.random() * 1.6 + 0.6,
      }));
    }

    function frame() {
      const light = isLight();
      const line = light ? "0,0,0" : "255,255,255";
      const dot = light ? "10,10,20" : "255,255,255";
      context!.clearRect(0, 0, w, h);

      const linkDist = 130;
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (!reduce) {
          n.x += n.vx;
          n.y += n.vy;
        }
        if (n.x < -20) n.x = w + 20;
        if (n.x > w + 20) n.x = -20;
        if (n.y < -20) n.y = h + 20;
        if (n.y > h + 20) n.y = -20;

        if (pointer.active) {
          const dx = pointer.x - n.x;
          const dy = pointer.y - n.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 26000) {
            n.x += dx * 0.0008;
            n.y += dy * 0.0008;
          }
        }

        for (let j = i + 1; j < nodes.length; j++) {
          const m = nodes[j];
          const dx = n.x - m.x;
          const dy = n.y - m.y;
          const dist = Math.hypot(dx, dy);
          if (dist < linkDist) {
            const a = (1 - dist / linkDist) * (light ? 0.16 : 0.22);
            context!.strokeStyle = `rgba(${line},${a})`;
            context!.lineWidth = 1;
            context!.beginPath();
            context!.moveTo(n.x, n.y);
            context!.lineTo(m.x, m.y);
            context!.stroke();
          }
        }
      }
      for (const n of nodes) {
        context!.fillStyle = `rgba(${dot},${light ? 0.5 : 0.65})`;
        context!.beginPath();
        context!.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        context!.fill();
      }
      raf = requestAnimationFrame(frame);
    }

    let raf = 0;
    build();
    frame();

    const onResize = () => build();
    const onMove = (e: PointerEvent) => {
      const rect = cv!.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
      pointer.active = true;
    };
    const onLeave = () => {
      pointer.active = false;
    };

    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerleave", onLeave);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full opacity-70"
    />
  );
}
