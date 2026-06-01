"use client";

import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "motion/react";
import { useRef, type PointerEvent, type ReactNode } from "react";

type SpotlightCardProps = {
  children: ReactNode;
  className?: string;
  /** Color of the cursor-following glow. */
  glow?: string;
};

/**
 * A panel that tracks the cursor with a soft radial highlight and tilts a few
 * degrees toward the pointer — the premium "specimen on a lit stage" feel used
 * across modern dev-tool sites. Falls back to a plain panel under reduced
 * motion. Pass the existing `feature-stage` classes via `className`.
 */
export function SpotlightCard({
  children,
  className,
  glow = "rgba(109,94,246,0.18)",
}: SpotlightCardProps) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  const mx = useMotionValue(50);
  const my = useMotionValue(50);
  const rotateXValue = useMotionValue(0);
  const rotateYValue = useMotionValue(0);
  const glowValue = useMotionValue(0);

  const rotateX = useSpring(rotateXValue, { stiffness: 150, damping: 20 });
  const rotateY = useSpring(rotateYValue, { stiffness: 150, damping: 20 });
  const glowOpacity = useSpring(glowValue, { stiffness: 200, damping: 30 });
  const background = useMotionTemplate`radial-gradient(240px 240px at ${mx}% ${my}%, ${glow}, transparent 72%)`;

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  function handleMove(event: PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) {
      return;
    }
    const rect = el.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    mx.set(px * 100);
    my.set(py * 100);
    rotateYValue.set((px - 0.5) * 6);
    rotateXValue.set((0.5 - py) * 6);
    glowValue.set(1);
  }

  function reset() {
    rotateXValue.set(0);
    rotateYValue.set(0);
    glowValue.set(0);
  }

  return (
    <motion.div
      ref={ref}
      onPointerMove={handleMove}
      onPointerLeave={reset}
      style={{ rotateX, rotateY, transformPerspective: 1200 }}
      className={className}
    >
      <motion.div
        aria-hidden="true"
        style={{ background, opacity: glowOpacity }}
        className="pointer-events-none absolute inset-0 rounded-[26px]"
      />
      {children}
    </motion.div>
  );
}
