"use client";

import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { useRef, type ReactNode, type PointerEvent } from "react";

type MagneticProps = {
  children: ReactNode;
  className?: string;
  /** How strongly the element follows the cursor (0–1). */
  strength?: number;
};

/**
 * Wraps an interactive element so it gently pulls toward the cursor while
 * hovered, then springs back on leave — a subtle "magnetic" CTA. Renders a
 * plain inline-flex span under reduced motion.
 */
export function Magnetic({ children, className, strength = 0.3 }: MagneticProps) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const x = useSpring(mx, { stiffness: 260, damping: 18, mass: 0.4 });
  const y = useSpring(my, { stiffness: 260, damping: 18, mass: 0.4 });

  if (reduceMotion) {
    return <span className={className}>{children}</span>;
  }

  function handleMove(event: PointerEvent<HTMLSpanElement>) {
    const el = ref.current;
    if (!el) {
      return;
    }
    const rect = el.getBoundingClientRect();
    mx.set((event.clientX - (rect.left + rect.width / 2)) * strength);
    my.set((event.clientY - (rect.top + rect.height / 2)) * strength);
  }

  function reset() {
    mx.set(0);
    my.set(0);
  }

  return (
    <motion.span
      ref={ref}
      style={{ x, y, display: "inline-flex" }}
      onPointerMove={handleMove}
      onPointerLeave={reset}
      className={className}
    >
      {children}
    </motion.span>
  );
}
