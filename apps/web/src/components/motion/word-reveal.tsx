"use client";

import { motion, useReducedMotion } from "motion/react";
import { createElement, type ElementType } from "react";

import { word, wordContainer } from "./motion-presets";

type WordRevealProps = {
  text: string;
  as?: ElementType;
  className?: string;
};

/**
 * Reveals a headline word-by-word with a brief blur+rise. Each word is an
 * inline-block span so it can transform independently. Under reduced motion the
 * plain text renders immediately.
 */
export function WordReveal({ text, as = "h1", className }: WordRevealProps) {
  const reduceMotion = useReducedMotion();
  const words = text.split(" ");

  if (reduceMotion) {
    return createElement(as, { className }, text);
  }

  const MotionTag = (motion[as as "h1"] ?? motion.h1) as typeof motion.h1;

  return (
    <MotionTag
      className={className}
      variants={wordContainer}
      initial="hidden"
      animate="show"
    >
      {words.map((value, index) => (
        <motion.span
          key={`${value}-${index}`}
          variants={word}
          className="inline-block whitespace-pre"
        >
          {index < words.length - 1 ? `${value} ` : value}
        </motion.span>
      ))}
    </MotionTag>
  );
}
