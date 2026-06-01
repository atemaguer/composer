"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Sticky landing header that gains a hairline border and a stronger frosted
 * background once the page is scrolled — a small, familiar dev-platform cue
 * that the header is now floating over content. Pure CSS transition; no motion
 * dependency, so it's safe under reduced motion.
 */
export function HeaderShell({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-300 ${
        scrolled
          ? "border-b border-line bg-paper/80 backdrop-blur-xl"
          : "border-b border-transparent bg-paper/60 backdrop-blur-md"
      }`}
    >
      {children}
    </header>
  );
}
