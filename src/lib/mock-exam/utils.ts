import { hasAtLeast } from "@/lib/auth/roles";
import type { Profile } from "@/lib/auth/session";
import type { Tables } from "@/lib/supabase/types";

/** A set is manageable by its creator or by any admin (RLS mirrors this). */
export function canManageSet(
  profile: Profile,
  set: Pick<Tables<"mock_exam_sets">, "created_by">
): boolean {
  return hasAtLeast(profile.role, "admin") || set.created_by === profile.id;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export function fmtPct(value: number | null | undefined): string {
  return value == null ? "—" : `${Math.round(value)}%`;
}
