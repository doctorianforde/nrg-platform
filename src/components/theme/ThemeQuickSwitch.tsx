"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { THEME_LIST, THEMES, type ThemeId } from "@/lib/theme/themes";
import { useThemeChoice } from "./useThemeChoice";

/** A swatch of one theme: its header colour with a primary dot, drawn from the theme's own tokens. */
function Swatch({ id, size = 20 }: { id: ThemeId; size?: number }) {
  return (
    <span
      data-theme={id}
      aria-hidden="true"
      className="relative inline-block shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-header-from via-header-via to-header-to ring-1 ring-inset ring-black/10"
      style={{ width: size, height: size }}
    >
      <span className="absolute bottom-0 right-0 h-1/2 w-1/2 rounded-tl-full bg-primary" />
    </span>
  );
}

/** Header menu: a small theme switcher for students (the full picker with previews lives on the profile page). */
export function ThemeQuickSwitch() {
  const { theme, choose } = useThemeChoice();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Theme: ${THEMES[theme].name}. Change theme`}
        title="Change theme"
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-border hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Swatch id={theme} />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="Theme"
          className="absolute right-0 top-10 z-30 w-56 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg motion-safe:animate-fade-in"
        >
          <p className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Theme</p>
          {THEME_LIST.map((t) => (
            <button
              key={t.id}
              type="button"
              role="menuitemradio"
              aria-checked={t.id === theme}
              onClick={() => {
                choose(t.id);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted",
                t.id === theme && "bg-muted font-semibold"
              )}
            >
              <Swatch id={t.id} />
              <span className="flex-1">{t.name}</span>
              {t.id === theme ? <span aria-hidden="true" className="text-primary">✓</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
