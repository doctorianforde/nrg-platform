"use client";

import { cn } from "@/lib/cn";
import { THEME_LIST, type Theme, type ThemeId } from "@/lib/theme/themes";
import { useThemeChoice } from "./useThemeChoice";

/**
 * A miniature study page drawn in one theme. The wrapper carries that theme's data-theme, so every colour below is the
 * real token, not a copy: what the student sees here is what the theme looks like.
 */
export function ThemePreview({ theme, className }: { theme: Theme; className?: string }) {
  return (
    <div
      data-theme={theme.id}
      aria-hidden="true"
      className={cn("overflow-hidden rounded-lg border border-border bg-muted text-left", className)}
    >
      <div className="bg-gradient-to-r from-header-from via-header-via to-header-to px-3 py-2.5">
        <div className="font-heading text-[13px] font-bold leading-tight text-header-foreground">Study</div>
        <div className="mt-1 h-1.5 w-16 rounded-full bg-header-muted/70" />
      </div>
      <div className="p-2.5">
        <div className="rounded-md border border-border bg-card p-2.5 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded bg-brand-100 font-heading text-[10px] font-bold text-brand-700">
              Aa
            </span>
            <span className="h-1.5 w-20 rounded-full bg-card-foreground/70" />
          </div>
          <div className="mt-2 space-y-1">
            <div className="flex items-center gap-1.5 rounded border border-l-4 border-green-600 bg-green-50 px-1.5 py-1">
              <span className="text-[9px] font-semibold uppercase tracking-wide text-green-900">Correct</span>
              <span className="h-1 flex-1 rounded-full bg-green-900/30" />
            </div>
            <div className="flex items-center gap-1.5 rounded border border-l-4 border-red-500 bg-red-50 px-1.5 py-1">
              <span className="text-[9px] font-semibold uppercase tracking-wide text-red-900">Incorrect</span>
              <span className="h-1 flex-1 rounded-full bg-red-900/30" />
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="h-1.5 w-12 rounded-full bg-muted-foreground/40" />
            <span className="rounded-md bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">Next</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The profile page's theme card: four live previews as a radio group. Applies instantly, saves in the background. */
export function ThemePicker({ initial }: { initial: ThemeId }) {
  const { theme, choose, pending, status } = useThemeChoice(initial);
  return (
    <div>
      <div role="radiogroup" aria-label="Colour theme" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {THEME_LIST.map((t) => {
          const on = t.id === theme;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => choose(t.id)}
              className={cn(
                "group relative rounded-xl border-2 bg-card p-2 text-left transition-[border-color,box-shadow] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                on ? "border-primary shadow-md" : "border-border hover:border-brand-300"
              )}
            >
              <ThemePreview theme={t} />
              <div className="flex items-start justify-between gap-2 px-1 pb-1 pt-2.5">
                <div className="min-w-0">
                  <div className="font-heading text-sm font-semibold text-card-foreground" style={{ fontFamily: `var(${t.headingFont})` }}>
                    {t.name}
                    {t.dark ? <span className="ml-1.5 align-middle text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Dark</span> : null}
                  </div>
                  <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{t.mood}</p>
                </div>
                <span
                  className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                    on ? "border-primary bg-primary text-primary-foreground" : "border-input"
                  )}
                >
                  {on ? (
                    <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                      <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      <p
        role="status"
        aria-live="polite"
        className={cn("mt-3 min-h-[1.25rem] text-xs", status?.kind === "error" ? "text-red-700" : "text-muted-foreground")}
      >
        {pending ? "Saving…" : status?.text ?? "Applies right away. Only your study area changes; teachers still see the classic look."}
      </p>
    </div>
  );
}
