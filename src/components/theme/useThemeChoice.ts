"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { saveTheme } from "@/lib/theme/actions";
import { DEFAULT_THEME, isThemeId, type ThemeId } from "@/lib/theme/themes";
import { applyTheme } from "./ThemeSync";

const EVENT = "nrg-theme-change";

/**
 * The student's theme choice, shared by the profile picker and the header quick switch. Choosing applies the theme at
 * once (optimistic), then saves it; a failed save puts the previous theme back and reports the error.
 */
export function useThemeChoice(initial?: ThemeId) {
  const [theme, setTheme] = useState<ThemeId>(initial ?? DEFAULT_THEME);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ kind: "saved" | "error"; text: string } | null>(null);

  useEffect(() => {
    const now = document.documentElement.dataset.theme;
    if (isThemeId(now)) setTheme(now);
    const on = (e: Event) => setTheme((e as CustomEvent<ThemeId>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);

  const choose = useCallback(
    (next: ThemeId) => {
      const prev = isThemeId(document.documentElement.dataset.theme) ? (document.documentElement.dataset.theme as ThemeId) : theme;
      if (next === prev) return;
      const announce = (t: ThemeId) => window.dispatchEvent(new CustomEvent<ThemeId>(EVENT, { detail: t }));
      applyTheme(next, true);
      announce(next);
      setStatus(null);
      startTransition(async () => {
        const res = await saveTheme(next).catch(() => ({ error: "Could not save your theme. Please try again." }));
        if ("error" in res) {
          applyTheme(prev, true);
          announce(prev);
          setStatus({ kind: "error", text: res.error });
        } else {
          setStatus({ kind: "saved", text: "Saved. Your theme follows you to any device." });
        }
      });
    },
    [theme]
  );

  return { theme, choose, pending, status };
}
