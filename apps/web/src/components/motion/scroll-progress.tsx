"use client";

import { motion, useReducedMotion, useScroll, useSpring } from "motion/react";

/**
 * A thin accent bar pinned to the top of the viewport that fills as the page
 * scrolls — a familiar dev-platform reading-progress cue. Hidden entirely under
 * reduced motion.
 */
export function ScrollProgress() {
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    restDelta: 0.001,
  });

  if (reduceMotion) {
    return null;
  }

  return (
    <motion.div
      aria-hidden="true"
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-[60] h-px origin-left bg-gradient-to-r from-accent via-accent to-accent-deep"
    />
  );
}
