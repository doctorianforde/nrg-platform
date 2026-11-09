import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasAtLeast, isRole, ROLE_HOME, type Role, type Tier } from "./roles";

export type Profile = {
  id: string;
  role: Role;
  subscription_tier: Tier;
  full_name: string | null;
  avatar_url: string | null;
  suspended_at: string | null;
};

/** Server-side: current auth user + profile row, or null when signed out. */
export async function getSession() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // `effective_plan` (20261109180000) is the plan that counts: an active paid membership, else the profile's own plan.
  // It replaces subscription_tier here so every check in the app follows it. A database without that migration has
  // no such column, so fall back to the plain row rather than lose the profile.
  const cols = "id, role, subscription_tier, full_name, avatar_url, suspended_at";
  const withPlan = await supabase.from("profiles").select(`${cols}, effective_plan`).eq("id", user.id).single();
  type Row = Profile & { effective_plan?: Profile["subscription_tier"] | null };
  const row = (withPlan.error
    ? (await supabase.from("profiles").select(cols).eq("id", user.id).single()).data
    : withPlan.data) as unknown as Row | null;
  const profile = row ? { ...row, subscription_tier: row.effective_plan ?? row.subscription_tier } : null;
  if (profile) delete profile.effective_plan;

  if (!profile || !isRole(profile.role)) return { user, profile: null };
  return { user, profile: profile as Profile };
}

/**
 * Server-side route guard. Redirects to /login when signed out, or to the
 * caller's own dashboard when their role is below `required`.
 */
export async function requireRole(required: Role, currentPath: string) {
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(currentPath)}`);
  if (!session.profile) redirect("/login?error=profile_missing");
  // A suspended account is also banned at the auth layer, which blocks new
  // sign-ins; this turns away whatever is left of an already-issued token.
  if (session.profile.suspended_at) redirect("/login?error=suspended");
  if (!hasAtLeast(session.profile.role, required)) {
    redirect(ROLE_HOME[session.profile.role]);
  }
  return session as { user: NonNullable<typeof session>["user"]; profile: Profile };
}
