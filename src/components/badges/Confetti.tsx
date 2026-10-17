"use client";

import { useEffect, useRef } from "react";
import { DEFAULT_THEME, THEMES, isThemeId } from "@/lib/theme/themes";

/** The current theme's confetti colours (brand tones, gold, a green and a blue, white). */
const colours = () => {
  const t = document.documentElement.dataset.theme;
  return THEMES[isThemeId(t) ? t : DEFAULT_THEME].confetti;
};

/** A short burst of confetti on a full-screen canvas. Skipped entirely when the student prefers reduced motion. */
export function Confetti({ pieces = 140, durationMs = 2600 }: { pieces?: number; durationMs?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const resize = () => { canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize();
    const COLOURS = colours();
    const cx = innerWidth / 2, cy = innerHeight * 0.38;
    const parts = Array.from({ length: pieces }, () => {
      const a = Math.random() * Math.PI * 2, v = 4 + Math.random() * 9;
      return { x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 6, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
        w: 6 + Math.random() * 6, h: 3 + Math.random() * 4, c: COLOURS[(Math.random() * COLOURS.length) | 0] };
    });
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = (t - start) / durationMs;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of parts) {
        p.vy += 0.28; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.globalAlpha = Math.max(0, 1 - Math.max(0, k - 0.6) / 0.4);
        ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
      }
      if (k < 1) raf = requestAnimationFrame(tick); else ctx.clearRect(0, 0, innerWidth, innerHeight);
    };
    raf = requestAnimationFrame(tick);
    addEventListener("resize", resize);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", resize); };
  }, [pieces, durationMs]);
  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none fixed inset-0 z-[60] h-full w-full" />;
}
