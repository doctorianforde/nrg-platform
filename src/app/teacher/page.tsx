import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/DashboardShell";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { user, profile } = await requireRole("teacher", "/teacher");
  const { count: pending } = await createClient()
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("is_ai_generated", true)
    .eq("review_status", "pending");
  return (
    <DashboardShell profile={profile} email={user.email} title="Teacher dashboard">
      <Link
        href="/teacher/review"
        className="mb-4 block rounded-lg border border-[hsl(270,15%,88%)] bg-white p-5 hover:border-[hsl(270,60%,35%)]"
      >
        <span className="font-medium text-[hsl(270,60%,35%)]">Review AI-generated questions →</span>
        <span className="mt-1 block text-sm text-gray-600">
          {(pending ?? 0).toLocaleString()} question{pending === 1 ? "" : "s"} waiting for review
        </span>
      </Link>
      <div className="rounded-lg border border-[hsl(270,15%,88%)] bg-white p-5 text-sm">
        <p>
          Signed in as <strong>{profile.full_name ?? user.email}</strong> · role{" "}
          <code>{profile.role}</code> · tier <code>{profile.subscription_tier}</code>
        </p>
        <p className="mt-2 text-gray-600">
          Phase 1 placeholder — this route exists to prove auth + role routing. Feature UI
          arrives in Phase 2.
        </p>
      </div>
    </DashboardShell>
  );
}
