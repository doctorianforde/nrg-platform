"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { DEFAULT_THEME, THEME_COOKIE, isThemedPath, parseThemeCookie, type ThemeId } from "@/lib/theme/themes";

/** The theme cached in the cookie the middleware (and the save action) keep for the signed-in user. */
export function cookieTheme(): ThemeId {
  const raw = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${THEME_COOKIE}=`))
    ?.slice(THEME_COOKIE.length + 1);
  return parseThemeCookie(raw ? decodeURIComponent(raw) : undefined)?.theme ?? DEFAULT_THEME;
}

/**
 * Put `theme` on <html>. With `animate`, colours cross-fade for a moment (globals.css; skipped for reduced motion).
 * Only colours change between themes, never sizes, so a switch causes no layout shift.
 */
export function applyTheme(theme: ThemeId, animate = false) {
  const html = document.documentElement;
  if (html.dataset.theme === theme) return;
  if (animate) {
    html.classList.add("theme-switching");
    window.setTimeout(() => html.classList.remove("theme-switching"), 350);
  }
  html.dataset.theme = theme;
}

/**
 * The server renders the right theme on the first load (root layout). Client-side navigations do not re-render the
 * root layout, so this keeps <html data-theme> right when a student moves between the study area (their theme) and
 * anywhere else (the default).
 */
export function ThemeSync() {
  const pathname = usePathname();
  useEffect(() => {
    applyTheme(isThemedPath(pathname ?? "") ? cookieTheme() : DEFAULT_THEME);
  }, [pathname]);
  return null;
}
