"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";

/**
 * An interactive blueprint dot-field rendered to a full-viewport canvas: faint
 * dots brighten and swell toward the cursor, trailed by a soft terracotta glow.
 * It echoes the hero's blueprint grid across the whole page.
 *
 * Performance: a single canvas, DPR-capped at 2, that only runs its rAF loop
 * while the pointer is moving (plus a short settle tail) and then idles on the
 * last frame. Pointer-events-none, reduced-motion renders a static faint grid.
 */
export function CursorField() {
  const reduceMotion = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvasNode = canvasRef.current;
    if (!canvasNode) {
      return;
    }
    const context = canvasNode.getContext("2d");
    if (!context) {
      return;
    }
    // Capture as already-narrowed consts so the nested rAF/resize closures keep
    // the non-null types (TS resets control-flow narrowing across closures).
    const canvas = canvasNode;
    const ctx = context;

    const GAP = 34;
    const INFLUENCE = 150;
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    let width = 0;
    let height = 0;
    let targetX = -9999;
    let targetY = -9999;
    let curX = -9999;
    let curY = -9999;
    let rafId = 0;
    let running = false;
    let idleFrames = 0;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawOnce();
    }

    function paint() {
      ctx.clearRect(0, 0, width, height);

      const hasCursor = targetX > -9999;
      if (hasCursor) {
        const glow = ctx.createRadialGradient(curX, curY, 0, curX, curY, 260);
        glow.addColorStop(0, "rgba(109,94,246,0.12)");
        glow.addColorStop(1, "rgba(109,94,246,0)");
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, width, height);
      }

      for (let y = GAP / 2; y < height; y += GAP) {
        for (let x = GAP / 2; x < width; x += GAP) {
          let t = 0;
          if (hasCursor) {
            const dx = x - curX;
            const dy = y - curY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            t = Math.max(0, 1 - dist / INFLUENCE);
          }
          const radius = 0.9 + t * 1.9;
          if (t > 0.001) {
            const r = Math.round(lerp(255, 109, t));
            const g = Math.round(lerp(255, 94, t));
            const b = Math.round(lerp(255, 246, t));
            ctx.fillStyle = `rgba(${r},${g},${b},${0.05 + t * 0.5})`;
          } else {
            ctx.fillStyle = "rgba(255,255,255,0.05)";
          }
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    function drawOnce() {
      curX = targetX;
      curY = targetY;
      paint();
    }

    function loop() {
      curX += (targetX - curX) * 0.14;
      curY += (targetY - curY) * 0.14;
      paint();

      const settled =
        Math.abs(targetX - curX) < 0.4 && Math.abs(targetY - curY) < 0.4;
      idleFrames = settled ? idleFrames + 1 : 0;
      // Stop after the motion settles; pointermove wakes it again.
      if (idleFrames > 6) {
        running = false;
        return;
      }
      rafId = requestAnimationFrame(loop);
    }

    function wake() {
      idleFrames = 0;
      if (!running) {
        running = true;
        rafId = requestAnimationFrame(loop);
      }
    }

    function onPointerMove(event: PointerEvent) {
      targetX = event.clientX;
      targetY = event.clientY;
      wake();
    }

    function onPointerLeave() {
      targetX = -9999;
      targetY = -9999;
      wake();
    }

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("pointerleave", onPointerLeave);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [reduceMotion]);

  // Under reduced motion, skip the canvas entirely — the static CSS mesh and
  // hero blueprint grid carry the texture.
  if (reduceMotion) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0"
    />
  );
}
