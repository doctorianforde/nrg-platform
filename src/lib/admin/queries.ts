import { adminClient } from "@/lib/supabase/admin";

/**
 * Admin-screen reads.
 *
 * Email addresses live in auth.users, which RLS can't reach, so these go through
 * the service-role client. Only ever call them from a page that has already run
 * requireRole("admin").
 */

export type PendingRequest = {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  requestedRole: string;
  createdAt: string;
};

export type Account = {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  email: string;
  role: string;
  tier: string;
  suspended: boolean;
  createdAt: string;
};

/** id → email for every account, up to the page limit. */
async function emailsById(): Promise<Map<string, string>> {
  const { data } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return new Map((data?.users ?? []).map((u) => [u.id, u.email ?? ""]));
}

export async function loadPendingRequests(): Promise<PendingRequest[]> {
  const { data } = await adminClient
    .from("role_requests")
    .select("id, user_id, requested_role, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (!data || data.length === 0) return [];

  const ids = data.map((r) => r.user_id);
  const [{ data: profiles }, emails] = await Promise.all([
    adminClient.from("profiles").select("id, full_name").in("id", ids),
    emailsById(),
  ]);
  const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  return data.map((r) => ({
    id: r.id,
    userId: r.user_id,
    name: names.get(r.user_id) ?? null,
    email: emails.get(r.user_id) ?? "(unknown address)",
    requestedRole: r.requested_role,
    createdAt: r.created_at,
  }));
}

export async function loadAccounts(): Promise<Account[]> {
  const [{ data }, emails] = await Promise.all([
    adminClient
      .from("profiles")
      .select("id, full_name, avatar_url, role, subscription_tier, suspended_at, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    emailsById(),
  ]);
  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.full_name,
    avatarUrl: p.avatar_url,
    email: emails.get(p.id) ?? "(unknown address)",
    role: p.role,
    tier: p.subscription_tier,
    suspended: p.suspended_at !== null,
    createdAt: p.created_at,
  }));
}
