"use client";

import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";
import type { ReactNode } from "react";

type ScrollScaleProps = {
  children: ReactNode;
  className?: string;
  /** Scale once the page has scrolled past `distance`. */
  to?: number;
  /** Scroll distance (px) over which the scale-down happens. */
  distance?: number;
};

/**
 * Scales its content down as the page scrolls — the hero specimen starts large
 * and settles back toward its resting size as the user moves past it. Anchored
 * to the top edge so it tucks under the headline rather than drifting. Static
 * under reduced motion.
 */
export function ScrollScale({
  children,
  className,
  to = 0.8,
  distance = 560,
}: ScrollScaleProps) {
  const reduceMotion = useReducedMotion();
  const { scrollY } = useScroll();
  // Bind scale directly to scroll position — no spring, so it tracks the
  // scrollbar 1:1 with no rebound/bounce on resize.
  const scale = useTransform(scrollY, [0, distance], [1, to]);

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      style={{ scale, transformOrigin: "50% 0%" }}
    >
      {children}
    </motion.div>
  );
}
