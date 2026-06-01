"use client";

import { motion, useReducedMotion, type Variants } from "motion/react";
import type { ElementType, ReactNode } from "react";

import { fadeUp, staggerContainer, viewportOnce } from "./motion-presets";

type RevealProps = {
  children: ReactNode;
  className?: string;
  as?: ElementType;
  variants?: Variants;
  /** When true, stagger direct <RevealItem> children instead of animating self. */
  stagger?: boolean;
  id?: string;
};

/**
 * Scroll-reveal wrapper. Animates once when scrolled into view.
 * Respects prefers-reduced-motion by rendering static, fully visible content.
 */
export function Reveal({
  children,
  className,
  as,
  variants,
  stagger = false,
  id,
}: RevealProps) {
  const reduceMotion = useReducedMotion();
  const Component = (motion[(as ?? "div") as "div"] ??
    motion.div) as typeof motion.div;

  if (reduceMotion) {
    const Static = (as ?? "div") as ElementType;
    return (
      <Static className={className} id={id}>
        {children}
      </Static>
    );
  }

  return (
    <Component
      id={id}
      className={className}
      variants={stagger ? staggerContainer : (variants ?? fadeUp)}
      initial="hidden"
      whileInView="show"
      viewport={viewportOnce}
    >
      {children}
    </Component>
  );
}

type RevealItemProps = {
  children: ReactNode;
  className?: string;
  as?: ElementType;
  variants?: Variants;
};

/**
 * Child of a <Reveal stagger> container. Inherits the parent's
 * orchestrated timing. Static under reduced motion.
 */
export function RevealItem({
  children,
  className,
  as,
  variants,
}: RevealItemProps) {
  const reduceMotion = useReducedMotion();
  const Component = (motion[(as ?? "div") as "div"] ??
    motion.div) as typeof motion.div;

  if (reduceMotion) {
    const Static = (as ?? "div") as ElementType;
    return <Static className={className}>{children}</Static>;
  }

  return (
    <Component className={className} variants={variants ?? fadeUp}>
      {children}
    </Component>
  );
}
