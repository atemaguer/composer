"use client";

import { motion, useReducedMotion, type Variants } from "motion/react";
import type { ElementType, ReactNode } from "react";

import { fadeUp, staggerContainer } from "./motion-presets";

type HeroEntranceProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Hero load orchestration: staggers its <HeroItem> children on mount.
 * Replaces the CSS `load-up` cascade with Motion. Static under reduced motion.
 */
export function HeroEntrance({ children, className }: HeroEntranceProps) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      variants={staggerContainer}
      initial="hidden"
      animate="show"
    >
      {children}
    </motion.div>
  );
}

type HeroItemProps = {
  children: ReactNode;
  className?: string;
  as?: ElementType;
  variants?: Variants;
};

export function HeroItem({ children, className, as, variants }: HeroItemProps) {
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
