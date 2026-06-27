"use client";

import { useTheme } from "@/hooks/useTheme";
import { motion } from "framer-motion";
import { useState } from "react";

export function ThemeToggle() {
  const { resolved, toggleTheme } = useTheme();
  const isDark = resolved === "dark";
  const [isPressed, setIsPressed] = useState(false);

  const handleToggle = () => {
    setIsPressed(true);
    toggleTheme();
    setTimeout(() => setIsPressed(false), 150);
  };

  return (
    <motion.button
      onClick={handleToggle}
      aria-label="Toggle theme"
      className="group relative flex h-10 w-[4.25rem] items-center rounded-full border border-white/[0.08] bg-bg-secondary/80 p-1 backdrop-blur-sm transition-all duration-300 hover:border-white/[0.15] hover:bg-bg-tertiary/80"
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
    >
      {/* Premium hover glow */}
      <motion.div
        className="absolute inset-0 rounded-full opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        animate={{
          boxShadow: isDark
            ? "0 0 20px rgba(99, 102, 241, 0.15)"
            : "0 0 20px rgba(251, 191, 36, 0.15)",
        }}
      />

      {/* Toggle track background */}
      <motion.div
        className="absolute inset-0 rounded-full"
        animate={{
          background: isDark
            ? "linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(139, 92, 246, 0.12))"
            : "linear-gradient(135deg, rgba(251, 191, 36, 0.12), rgba(245, 158, 11, 0.12))",
        }}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
      />

      {/* Slider knob with 180deg rotation */}
      <motion.div
        className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full shadow-lg"
        animate={{
          x: isDark ? 0 : 30,
          rotate: isDark ? 0 : 180,
          background: isDark
            ? "linear-gradient(135deg, #1a1a24, #12121a)"
            : "linear-gradient(135deg, #ffffff, #f8f8fb)",
          boxShadow: isDark
            ? "0 4px 12px rgba(99, 102, 241, 0.35), 0 0 0 1px rgba(99, 102, 241, 0.1)"
            : "0 4px 12px rgba(251, 191, 36, 0.35), 0 0 0 1px rgba(251, 191, 36, 0.1)",
          scale: isPressed ? 0.9 : 1,
        }}
        transition={{
          type: "spring",
          stiffness: 400,
          damping: 28,
          mass: 0.8,
        }}
      >
        {/* Moon icon */}
        <motion.svg
          className="absolute"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          animate={{
            opacity: isDark ? 1 : 0,
            scale: isDark ? 1 : 0.5,
            rotate: isDark ? 0 : -180,
          }}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        >
          <path
            d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
            fill="currentColor"
            className="text-indigo-400"
          />
        </motion.svg>

        {/* Sun icon */}
        <motion.svg
          className="absolute"
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          animate={{
            opacity: isDark ? 0 : 1,
            scale: isDark ? 0.5 : 1,
            rotate: isDark ? 180 : 0,
          }}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        >
          <circle cx="12" cy="12" r="4" fill="currentColor" className="text-amber-500" />
          <path
            d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="text-amber-500"
          />
        </motion.svg>
      </motion.div>

      {/* Background stars (only visible in dark mode) */}
      <motion.div
        className="absolute inset-0 flex items-center justify-start px-2.5"
        animate={{ opacity: isDark ? 0.5 : 0 }}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
      >
        <div className="flex gap-1.5">
          <motion.div
            className="h-1 w-1 rounded-full bg-indigo-400/70"
            animate={{ opacity: [0.4, 0.8, 0.4] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="h-0.5 w-0.5 rounded-full bg-purple-400/50"
            animate={{ opacity: [0.3, 0.7, 0.3] }}
            transition={{
              duration: 2.5,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 0.5,
            }}
          />
        </div>
      </motion.div>

      {/* Sun rays (only visible in light mode) */}
      <motion.div
        className="absolute inset-0 flex items-center justify-end px-2.5"
        animate={{ opacity: isDark ? 0 : 0.5 }}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
      >
        <div className="flex gap-1">
          <motion.div
            className="h-1 w-1 rounded-full bg-amber-400/60"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="h-0.5 w-0.5 rounded-full bg-orange-400/50"
            animate={{ scale: [1, 1.3, 1] }}
            transition={{
              duration: 1.8,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 0.3,
            }}
          />
        </div>
      </motion.div>
    </motion.button>
  );
}
