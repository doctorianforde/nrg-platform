import { Suspense } from "react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/DashboardShell";
import { UpgradeNotice } from "@/components/tier/UpgradeNotice";
import { getAllowance } from "@/lib/tier/allowance";
import { PracticeSetup } from "./PracticeSetup";

export const dynamic = "force-dynamic";

export default async function PracticePage() {
  const { user, profile } = await requireRole("student", "/study/practice");
  const [{ data: domains }, allowance] = await Promise.all([
    createClient().from("domains").select("id, name, code").order("display_order"),
    getAllowance(),
  ]);

  return (
    <DashboardShell
      profile={profile}
      email={user.email}
      title="Question Bank"
      eyebrow="Practice"
      subtitle="Select your focus, set your preferences, and start practicing."
    >
      {allowance.limited ? (
        <UpgradeNotice
          className="mb-5"
          title={
            allowance.remaining
              ? `${allowance.remaining} of ${allowance.limit} free questions left today`
              : "That's today's free practice done"
          }
          body={
            allowance.remaining
              ? "Each question you check counts once, however many times you look at it today. Your allowance resets at midnight (Trinidad time)."
              : `You've answered your ${allowance.limit} free questions for today. Your allowance resets at midnight (Trinidad time).`
          }
        />
      ) : null}
      <Suspense>
        <PracticeSetup domains={(domains ?? []) as Array<{ id: number; name: string; code: string }>} />
      </Suspense>
    </DashboardShell>
  );
}
