import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { hasAtLeast } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/DashboardShell";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { qgenConfig } from "@/lib/grading/store";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

/** Template 3.8: question writers ranked by approved questions. Students see it only when qgen_config.leaderboard is
 *  "students"; staff also when it is "staff". Off by default, since Jade asked for students to see their rank only. */
export default async function LeaderboardPage() {
  const { user, profile } = await requireRole("student", "/study/leaderboard");
  const staff = hasAtLeast(profile.role, "teacher");
  const cfg = await qgenConfig();
  const visible = cfg.leaderboard === "students" || (staff && cfg.leaderboard === "staff");
  if (!visible && !staff) notFound();
  const { data } = visible ? await createClient().rpc("qgen_leaderboard") : { data: [] };
  const rows = (data ?? []) as { user_id: string; display_name: string; points: number; approved: number; is_me: boolean }[];

  return (
    <DashboardShell
      profile={profile}
      email={user.email}
      title="Question writers"
      eyebrow="Leaderboard"
      subtitle="Points for approved questions: 10 each, 15 for an AI score of 90+, +5 for an excellent rationale, and streak bonuses for 3 and 5 approved in a row."
    >
      {!visible ? (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          The leaderboard is switched off (it waits on Jade&apos;s decision). Set <code>qgen_config.leaderboard</code> to
          &quot;staff&quot; to preview it here, or &quot;students&quot; to show it to students.
        </p>
      ) : null}
      {visible && rows.length === 0 ? (
        <EmptyState title="No approved questions yet" body="The board fills as teachers approve student questions." />
      ) : null}
      {rows.length > 0 ? (
        <Card className="mx-auto max-w-2xl p-0">
          <ol className="divide-y divide-border">
            {rows.map((r, i) => (
              <li key={r.user_id} className={cn("flex items-center gap-3 px-4 py-3", r.is_me && "bg-brand-50")}>
                <span className={cn("flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold", i < 3 ? "bg-gradient-to-br from-brand-400 to-brand-700 text-white" : "bg-muted text-muted-foreground")}>
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 font-medium text-card-foreground">
                  {r.display_name}
                  {r.is_me ? <span className="ml-1 text-xs font-normal text-muted-foreground">(you)</span> : null}
                </span>
                <span className="text-xs text-muted-foreground">{r.approved} approved</span>
                <span className="w-16 text-right font-heading font-semibold tabular-nums text-brand-700">{r.points}</span>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}
    </DashboardShell>
  );
}
