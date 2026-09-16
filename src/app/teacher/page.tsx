import { requireRole } from "@/lib/auth/session";
import { DashboardShell } from "@/components/DashboardShell";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { user, profile } = await requireRole("teacher", "/teacher");
  return (
    <DashboardShell profile={profile} email={user.email} title="Teacher dashboard">
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
