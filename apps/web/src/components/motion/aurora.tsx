"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * Slow-drifting warm/cool gradient blooms layered behind the page content.
 * Complements the static CSS mesh (body::before) with gentle life. Sits at
 * z-0 (page content is z-10) and never captures pointer events. Renders
 * nothing under reduced motion so the static mesh carries the atmosphere.
 */
export function Aurora() {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      <motion.div
        className="absolute -left-[10%] top-[-8%] h-[42vw] w-[42vw] rounded-full opacity-70 blur-[80px]"
        style={{
          background:
            "radial-gradient(circle at center, rgba(109,94,246,0.22), transparent 68%)",
        }}
        animate={{ x: [0, 60, 0], y: [0, 40, 0], scale: [1, 1.12, 1] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute right-[-8%] top-[6%] h-[38vw] w-[38vw] rounded-full opacity-60 blur-[90px]"
        style={{
          background:
            "radial-gradient(circle at center, rgba(63,125,248,0.18), transparent 70%)",
        }}
        animate={{ x: [0, -50, 0], y: [0, 50, 0], scale: [1, 1.15, 1] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-[-12%] left-[40%] h-[46vw] w-[46vw] rounded-full opacity-50 blur-[100px]"
        style={{
          background:
            "radial-gradient(circle at center, rgba(109,94,246,0.13), transparent 72%)",
        }}
        animate={{ x: [0, -40, 0], y: [0, -30, 0], scale: [1, 1.1, 1] }}
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
