import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/DashboardShell";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { describeDevice } from "@/lib/auth/user-agent";
import { ReviewForm, ThresholdsForm } from "./SharingForms";

export const dynamic = "force-dynamic";

type Signal = {
  user_id: string;
  name: string | null;
  email: string | null;
  plan: string;
  suspended: boolean;
  max_bumps_day: number;
  bumps_today: number;
  devices_7d: number;
  sign_ins_7d: number;
  last_activity: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  flagged: boolean;
  recent: Array<{ at: string; user_agent: string | null; ip: string | null }>;
};
type Payload = { bumps_per_day: number; devices_per_week: number; students: Signal[] };

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Port_of_Spain" }) : "—";

/**
 * Accounts that look shared (2026-11-09). Students are signed in on one device at a time; this lists students whose
 * sign-ins keep bumping each other or come from many browsers. Signals for a person to review, never an automatic ban.
 */
export default async function SharedAccountsPage() {
  const { user, profile } = await requireRole("admin", "/admin/sharing");
  const { data, error } = await createClient().rpc("shared_account_signals");
  const payload = (data ?? null) as unknown as Payload | null;

  return (
    <DashboardShell
      profile={profile}
      email={user.email}
      title="Accounts that look shared"
      eyebrow="Administration"
      subtitle="Each student account works on one device at a time. These students keep signing each other out, or sign in from many browsers. Check before acting: a new phone or a shared family laptop looks the same."
    >
      {error || !payload ? (
        <EmptyState title="Not available yet" body="The shared-account signals need their database update on this environment." />
      ) : (
        <div className="space-y-6">
          <Card>
            <CardTitle>Flag a student when, since their last review</CardTitle>
            <p className="mt-1 mb-4 text-xs text-muted-foreground">
              They are signed out by a newer sign-in this many times in one day (Trinidad time), or sign in from this many
              different browsers in 7 days. Counts look back 14 days.
            </p>
            <ThresholdsForm bumps={Number(payload.bumps_per_day)} devices={Number(payload.devices_per_week)} />
          </Card>

          {payload.students.length === 0 ? (
            <EmptyState title="No student sign-in activity in the last 14 days" body="Students appear here once they sign in." />
          ) : (
            <Section title={`Flagged (${payload.students.filter((s) => s.flagged).length})`} rows={payload.students.filter((s) => s.flagged)} empty="Nobody is over a threshold." />
          )}
          {payload.students.some((s) => !s.flagged) ? (
            <Section title="Other recent sign-ins" rows={payload.students.filter((s) => !s.flagged)} empty="" />
          ) : null}

          <p className="text-xs text-muted-foreground">
            To suspend an account, use{" "}
            <Link href="/admin" className="font-medium text-brand-700 underline">Admin → accounts</Link>. IP addresses and
            browsers are kept only to judge sharing.
          </p>
        </div>
      )}
    </DashboardShell>
  );
}

function Section({ title, rows, empty }: { title: string; rows: Signal[]; empty: string }) {
  return (
    <section>
      <h2 className="mb-3 font-heading text-lg font-semibold text-foreground">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((s) => (
            <li key={s.user_id}>
              <Card className={s.flagged ? "border-amber-300" : ""}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-card-foreground">{s.name || "Unnamed student"}</p>
                    <p className="truncate text-xs text-muted-foreground">{s.email} · {s.plan} plan</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {s.flagged ? <Badge tone="amber" dot>Looks shared</Badge> : null}
                    {s.suspended ? <Badge tone="red" dot>Suspended</Badge> : null}
                    {s.reviewed_at ? <Badge tone="gray">Reviewed {when(s.reviewed_at)}</Badge> : null}
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <Stat label="Most sign-outs in a day" value={s.max_bumps_day} />
                  <Stat label="Sign-outs today" value={s.bumps_today} />
                  <Stat label="Browsers, 7 days" value={s.devices_7d} />
                  <Stat label="Sign-ins, 7 days" value={s.sign_ins_7d} />
                </dl>
                {s.review_note ? <p className="mt-2 text-xs text-muted-foreground">Last note: {s.review_note}</p> : null}
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
                    Recent sign-ins (last activity {when(s.last_activity)})
                  </summary>
                  <table className="mt-2 w-full text-left text-xs">
                    <thead className="text-muted-foreground">
                      <tr><th className="py-1 pr-3 font-medium">When</th><th className="py-1 pr-3 font-medium">Device</th><th className="py-1 font-medium">IP address</th></tr>
                    </thead>
                    <tbody>
                      {s.recent.map((r, i) => (
                        <tr key={i} className="border-t border-border/70">
                          <td className="py-1 pr-3 tabular-nums">{when(r.at)}</td>
                          <td className="py-1 pr-3">{describeDevice(r.user_agent)}</td>
                          <td className="py-1 tabular-nums">{r.ip ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
                {s.flagged ? <ReviewForm userId={s.user_id} /> : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums text-card-foreground">{value}</dd>
    </div>
  );
}
