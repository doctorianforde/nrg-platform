"use server";

import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { THEME_COOKIE, isThemeId } from "./themes";

export type SaveThemeResult = { ok: true } | { error: string };

/**
 * Save the signed-in student's theme to their profile (their own user token: the "update own" policy) and refresh the
 * cookie the middleware reads, so the next page load server-renders it. The picker has already applied it on screen.
 */
export async function saveTheme(theme: string): Promise<SaveThemeResult> {
  if (!isThemeId(theme)) return { error: "Unknown theme." };
  const session = await getSession();
  if (!session?.profile) return { error: "Please sign in again." };
  if (session.profile.role !== "student") return { error: "Themes are for the student study area." };

  const { error } = await createClient().from("profiles").update({ theme }).eq("id", session.user.id);
  if (error) return { error: "Could not save your theme. Please try again." };

  cookies().set(THEME_COOKIE, `${session.user.id}.${theme}`, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  return { ok: true };
}
