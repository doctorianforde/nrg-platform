import { Suspense } from "react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/DashboardShell";
import { PracticeSetup } from "./PracticeSetup";

export const dynamic = "force-dynamic";

export default async function PracticePage() {
  const { user, profile } = await requireRole("student", "/study/practice");
  const { data: domains } = await createClient()
    .from("domains")
    .select("id, name, code")
    .order("display_order");

  return (
    <DashboardShell
      profile={profile}
      email={user.email}
      title="Question Bank"
      eyebrow="Practice"
      subtitle="Select your focus, set your preferences, and start practicing."
    >
      <Suspense>
        <PracticeSetup domains={(domains ?? []) as Array<{ id: number; name: string; code: string }>} />
      </Suspense>
    </DashboardShell>
  );
}
