"use client";

import { motion, useReducedMotion, useScroll, useSpring } from "motion/react";
import { useRef } from "react";

/**
 * A vertical "thread" that draws downward as the workflows section scrolls —
 * a visual echo of Composer's continuous agent thread. Decorative, large
 * screens only, hidden under reduced motion. Render inside a `position:
 * relative` container; it spans the container's full height.
 */
export function ScrollRail() {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 70%", "end 80%"],
  });
  const scaleY = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    restDelta: 0.001,
  });

  if (reduceMotion) {
    return null;
  }

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute -left-4 top-0 bottom-0 hidden w-px lg:block xl:-left-8"
    >
      <div className="absolute inset-0 bg-line" />
      <motion.div
        style={{ scaleY }}
        className="absolute inset-0 origin-top bg-gradient-to-b from-accent via-accent to-accent-deep"
      />
    </div>
  );
}
