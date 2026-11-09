"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_THEME, THEME_COOKIE, isThemeId, parseThemeCookie, type ThemeId } from "@/lib/theme/themes";
import { applyTheme } from "./ThemeSync";

const EVENT = "nrg-theme-change";
/** Wait this long after the last pick before saving, so clicking through the themes saves only the one kept. */
const SAVE_DELAY_MS = 300;

/*
 * Saving runs in the browser with the student's own token (the profiles "update own" policy, same as before), NOT
 * through a server action. Checklist N1 (2026-11-07): the old `saveTheme` server action set a cookie, which makes
 * Next re-render the whole route; that re-render put <html data-theme> back to the theme from the *previous* cookie
 * 1–3 s after the click, and actions run one at a time, so quick clicks queued up for 4–5 s and the page could end on
 * a different theme from the one picked.
 *
 * Module-level so the profile picker and the header quick switch share one queue.
 */
let timer: ReturnType<typeof setTimeout> | null = null;
let chain: Promise<void> = Promise.resolve();
/** Last theme known to be saved (or loaded): where a failed save goes back to. Null until the first pick. */
let committed: ThemeId | null = null;

function readCookie(): { uid: string; theme: ThemeId } | null {
  const raw = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${THEME_COOKIE}=`))
    ?.slice(THEME_COOKIE.length + 1);
  return parseThemeCookie(raw ? decodeURIComponent(raw) : undefined);
}

/** Keep the cookie the middleware reads in step, so the next page load server-renders this theme (no flash). */
function writeCookie(uid: string, theme: ThemeId) {
  document.cookie = `${THEME_COOKIE}=${uid}.${theme}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

async function save(theme: ThemeId): Promise<{ uid: string } | { error: string }> {
  const supabase = createClient();
  const uid = readCookie()?.uid ?? (await supabase.auth.getSession()).data.session?.user.id;
  if (!uid) return { error: "Please sign in again." };
  // select() so a write RLS silently refuses (200 + no rows) counts as a failure, not a save.
  const { data, error } = await supabase.from("profiles").update({ theme }).eq("id", uid).select("id");
  if (error || !data?.length) return { error: "Could not save your theme. Please try again." };
  return { uid };
}

/**
 * The student's theme choice, shared by the profile picker and the header quick switch. Choosing applies the theme at
 * once (optimistic) and saves it shortly after; a failed save puts the last saved theme back and reports the error.
 */
export function useThemeChoice(initial?: ThemeId) {
  const [theme, setTheme] = useState<ThemeId>(initial ?? DEFAULT_THEME);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<{ kind: "saved" | "error"; text: string } | null>(null);

  useEffect(() => {
    const now = document.documentElement.dataset.theme;
    if (isThemeId(now)) setTheme(now);
    const on = (e: Event) => setTheme((e as CustomEvent<ThemeId>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);

  const choose = useCallback((next: ThemeId) => {
    const shown = document.documentElement.dataset.theme;
    const prev: ThemeId = isThemeId(shown) ? shown : DEFAULT_THEME;
    if (next === prev) return;
    if (committed === null) committed = prev;
    const announce = (t: ThemeId) => window.dispatchEvent(new CustomEvent<ThemeId>(EVENT, { detail: t }));

    applyTheme(next, true);
    announce(next);
    const cached = readCookie();
    if (cached) writeCookie(cached.uid, next);
    setStatus(null);
    setPending(true);

    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      // Saves run one after another, so they reach the database in the order they were made.
      chain = chain.then(async () => {
        const res = await save(next).catch(() => ({ error: "Could not save your theme. Please try again." }));
        if (!("error" in res)) committed = next;
        if (timer) return; // a newer pick is waiting; its save reports the outcome
        if ("error" in res) {
          const back = committed ?? DEFAULT_THEME;
          applyTheme(back, true);
          announce(back);
          const c = readCookie();
          if (c) writeCookie(c.uid, back);
          setStatus({ kind: "error", text: res.error });
        } else {
          setStatus({ kind: "saved", text: "Saved. Your theme follows you to any device." });
        }
        setPending(false);
      });
    }, SAVE_DELAY_MS);
  }, []);

  return { theme, choose, pending, status };
}
