import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasAtLeast, isRole, ROLE_HOME, type Role, type Tier } from "./roles";

export type Profile = {
  id: string;
  role: Role;
  subscription_tier: Tier;
  full_name: string | null;
  avatar_url: string | null;
};

/** Server-side: current auth user + profile row, or null when signed out. */
export async function getSession() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, subscription_tier, full_name, avatar_url")
    .eq("id", user.id)
    .single();

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
  if (!hasAtLeast(session.profile.role, required)) {
    redirect(ROLE_HOME[session.profile.role]);
  }
  return session as { user: NonNullable<typeof session>["user"]; profile: Profile };
}
