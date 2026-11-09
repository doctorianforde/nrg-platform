import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/DashboardShell";
import { Card, CardTitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { AccuracyBars } from "@/components/analytics/AccuracyBars";
import { WeeklyColumns } from "@/components/analytics/WeeklyColumns";
import { cn } from "@/lib/cn";
import {
  loadClassAnalytics, reasonDetail, daysAgo, REASON_META,
  type RiskReason, type ClassStudent,
} from "@/lib/analytics/class";

export const dynamic = "force-dynamic";

const REASONS: RiskReason[] = ["inactive", "low", "mock", "drop"];
const REASON_TONE: Record<RiskReason, "red" | "amber" | "blue" | "purple"> = { inactive: "amber", low: "red", mock: "purple", drop: "blue" };

const weekLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      {children}
    </svg>
  );
}

/**
 * Class analytics for teaching staff: who is at risk and why (definition approved by Ian 2026-11-09; every threshold
 * lives in ranking_config), class activity and accuracy over 12 weeks, and accuracy by domain. Students never see this.
 */
export default async function ClassAnalyticsPage({ searchParams }: { searchParams: { reason?: string } }) {
  const { user, profile } = await requireRole("teacher", "/teacher/analytics");
  const [a, { data: cfg }] = await Promise.all([
    loadClassAnalytics(),
    createClient().from("ranking_config").select("key, value").in("key", ["weak_max_pct", "mastered_min_pct"]),
  ]);

  const shell = (children: React.ReactNode) => (
    <DashboardShell
      profile={profile}
      email={user.email}
      title="Class analytics"
      eyebrow="Instructor Portal"
      subtitle="Students who may need a nudge, and how the class is doing week by week. Only teaching staff see this page."
    >
      {children}
    </DashboardShell>
  );

  if (!a) {
    return shell(<EmptyState title="Class analytics isn't available yet" body="This page appears once the instructor analytics update is applied to this database." />);
  }

  const t = a.thresholds;
  const now = Date.now();
  const atRisk = a.students.filter((s) => s.reasons.length > 0);
  const filter = REASONS.includes(searchParams.reason as RiskReason) ? (searchParams.reason as RiskReason) : null;
  const shown = filter ? atRisk.filter((s) => s.reasons.includes(filter)) : atRisk;
  const activeWeek = a.students.filter((s) => s.lastAt && now - new Date(s.lastAt).getTime() < 7 * 86_400_000).length;
  const d30 = a.domains.reduce((acc, d) => ({ n: acc.n + d.answered, c: acc.c + d.correct }), { n: 0, c: 0 });
  const classPct = d30.n ? Math.round((100 * d30.c) / d30.n) : null;
  const weakMax = Number(cfg?.find((r) => r.key === "weak_max_pct")?.value ?? 30);
  const masteredMin = Number(cfg?.find((r) => r.key === "mastered_min_pct")?.value ?? 75);
  const unconfirmed = new Set(t.unconfirmed);

  return shell(
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Students" value={a.students.length.toLocaleString()} hint="Active accounts (suspended ones left out)" iconTone="purple"
          icon={<Icon><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></Icon>} />
        <StatCard label="At risk" value={atRisk.length.toLocaleString()} hint={a.students.length ? `${Math.round((100 * atRisk.length) / a.students.length)}% of students` : undefined} iconTone="red"
          icon={<Icon><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></Icon>} />
        <StatCard label="Practised in the last 7 days" value={activeWeek.toLocaleString()} hint="Answered at least one question" iconTone="green"
          icon={<Icon><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></Icon>} />
        <StatCard label="Class accuracy, last 30 days" value={classPct === null ? "—" : `${classPct}%`} hint={`${d30.n.toLocaleString()} answers`} iconTone="blue"
          icon={<Icon><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></Icon>} />
      </div>

      <section aria-labelledby="risk-h">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 id="risk-h" className="font-heading text-lg font-semibold text-foreground">At risk</h2>
            <p className="max-w-[75ch] text-sm text-muted-foreground">
              A student is listed when any of these is true: no answers for {t.inactiveDays} days; under {t.lowPct}% over their last {t.recentAnswers} answers;
              their latest mock in the last {t.mockRecentDays} days was under {t.mockPassPct}%; or their accuracy fell {t.dropPoints}+ points over the last {t.dropDays} days.
              Accuracy rules wait until a student has {t.minAnswers} answers.
            </p>
          </div>
        </div>
        {unconfirmed.size ? (
          <p className="mb-3 rounded-lg border border-amber-300/80 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Still to confirm with Jade:{" "}
            {[
              unconfirmed.has("mock_pass_pct") ? `the mock pass mark (${t.mockPassPct}%)` : null,
              unconfirmed.has("risk_mock_recent_days") ? `how long a mock counts as recent (${t.mockRecentDays} days)` : null,
              unconfirmed.has("risk_min_answers") ? `the minimum answers before accuracy counts (${t.minAnswers})` : null,
            ].filter(Boolean).join("; ")}.
          </p>
        ) : null}

        <nav aria-label="Filter by reason" className="mb-3 flex flex-wrap gap-2">
          {[null, ...REASONS].map((r) => {
            const n = r ? atRisk.filter((s) => s.reasons.includes(r)).length : atRisk.length;
            const active = filter === r;
            return (
              <Link key={r ?? "all"} href={r ? `/teacher/analytics?reason=${r}` : "/teacher/analytics"} prefetch={false}
                aria-current={active ? "page" : undefined}
                className={cn("rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                  active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-card-foreground hover:bg-muted")}>
                {r ? REASON_META[r].short : "All"} <span className="tabular-nums opacity-80">{n}</span>
              </Link>
            );
          })}
        </nav>

        {shown.length === 0 ? (
          <Card><p className="text-sm text-muted-foreground">{atRisk.length === 0 ? "Nobody is at risk right now." : "Nobody matches this filter."}</p></Card>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {shown.map((s) => <RiskCard key={s.id} s={s} now={now} t={t} />)}
          </ul>
        )}
      </section>

      <section aria-labelledby="trends-h">
        <h2 id="trends-h" className="mb-3 font-heading text-lg font-semibold text-foreground">Class trends, last 12 weeks</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="min-w-0">
            <CardTitle className="mb-1 text-base">Students practising</CardTitle>
            <p className="mb-4 text-xs text-muted-foreground">Students who answered at least one question that week.</p>
            <WeeklyColumns caption="Students practising each week" unitLabel="Students"
              points={a.weeks.map((w) => ({ key: w.week, label: weekLabel(w.week), value: w.active, note: `${w.answered.toLocaleString()} answers` }))}
              format={(v) => `${v} student${v === 1 ? "" : "s"}`} />
          </Card>
          <Card className="min-w-0">
            <CardTitle className="mb-1 text-base">Class accuracy</CardTitle>
            <p className="mb-4 text-xs text-muted-foreground">Share of all answers that were correct (practice, quizzes and mocks).</p>
            <WeeklyColumns caption="Class accuracy each week" unitLabel="Accuracy" max={100}
              points={a.weeks.map((w) => ({ key: w.week, label: weekLabel(w.week), value: w.pct, note: w.answered ? `${w.correct} of ${w.answered}` : "no answers" }))}
              format={(v) => `${v}%`} refLine={{ value: t.lowPct, label: `${t.lowPct}%` }} />
          </Card>
          <Card className="min-w-0">
            <CardTitle className="mb-1 text-base">Average mock score</CardTitle>
            <p className="mb-4 text-xs text-muted-foreground">Mean score of mocks finished that week; the line is the pass mark.</p>
            <WeeklyColumns caption="Average mock score each week" unitLabel="Average" max={100}
              points={a.weeks.map((w) => ({ key: w.week, label: weekLabel(w.week), value: w.mockAvg === null ? null : Math.round(w.mockAvg), note: w.mocks ? `${w.mocks} mock${w.mocks === 1 ? "" : "s"}` : "no mocks" }))}
              format={(v) => `${v}%`} refLine={{ value: t.mockPassPct, label: `pass ${t.mockPassPct}%` }} />
          </Card>
        </div>
      </section>

      <section aria-label="Class accuracy by domain">
        <Card>
          <CardTitle className="mb-1">Class accuracy by domain, last 30 days</CardTitle>
          <p className="mb-5 text-sm text-muted-foreground">Compared with the 30 days before. Plan extra teaching where accuracy is low or falling.</p>
          <AccuracyBars caption="Class accuracy by domain over the last 30 days" weakMaxPct={weakMax} masteredMinPct={masteredMin}
            rows={a.domains.map((d) => ({
              key: String(d.id), code: d.code, label: d.name, answered: d.answered, correct: d.correct, pct: d.pct,
              note: [
                `${d.students} student${d.students === 1 ? "" : "s"}`,
                d.pct !== null && d.prevPct !== null ? (d.pct === d.prevPct ? "no change" : `${d.pct > d.prevPct ? "▲ up" : "▼ down"} ${Math.abs(d.pct - d.prevPct)} pts on the 30 days before`) : null,
              ].filter(Boolean).join(" · "),
            }))} />
        </Card>
      </section>

      <section aria-labelledby="all-h">
        <details className="rounded-xl border border-border/80 bg-card p-5 shadow-sm">
          <summary id="all-h" className="cursor-pointer font-heading font-semibold text-card-foreground">All students ({a.students.length})</summary>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Student</th>
                  <th className="py-2 pr-3 font-medium">Last answer</th>
                  <th className="py-2 pr-3 text-right font-medium">Answers</th>
                  <th className="py-2 pr-3 text-right font-medium">Last {t.recentAnswers}</th>
                  <th className="py-2 pr-3 text-right font-medium">Last mock</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {a.students.map((s) => (
                  <tr key={s.id} className="border-t border-border/70">
                    <td className="py-2 pr-3"><span className="font-medium text-card-foreground">{s.name}</span><span className="block text-xs text-muted-foreground">{s.email}</span></td>
                    <td className="py-2 pr-3 text-muted-foreground">{s.lastAt ? daysAgo(s.lastAt, now) : "never"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{s.answered.toLocaleString()}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{s.recentPct === null ? "—" : `${s.recentPct}%`}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{s.lastMock ? `${Math.round(s.lastMock.pct)}%` : "—"}</td>
                    <td className="py-2">{s.reasons.length ? <Badge tone="red">At risk</Badge> : <Badge tone="green">On track</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
    </div>
  );
}

function RiskCard({ s, now, t }: { s: ClassStudent; now: number; t: Parameters<typeof reasonDetail>[2] }) {
  return (
    <li className="min-w-0 rounded-xl border border-border/80 bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-card-foreground">{s.name}</p>
          <p className="truncate text-xs text-muted-foreground">{s.email}{s.plan ? ` · ${s.plan === "free" ? "Free plan" : "Paid plan"}` : ""}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {s.reasons.map((r) => <Badge key={r} tone={REASON_TONE[r]}>{REASON_META[r].short}</Badge>)}
        </div>
      </div>
      <ul className="mt-3 space-y-1 text-sm text-card-foreground">
        {s.reasons.map((r) => (
          <li key={r} className="flex gap-2"><span aria-hidden className="text-muted-foreground">•</span><span className="min-w-0">{reasonDetail(s, r, t, now)}</span></li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3 text-xs text-muted-foreground">
        <span>
          {s.answered.toLocaleString()} answers in all
          {s.recentPct !== null && !s.reasons.includes("low") ? ` · ${s.recentPct}% over the last ${s.recentAnswered}` : ""}
        </span>
        <Link href={`/teacher/messages?to=${s.id}`} prefetch={false} className="font-medium text-brand-700 hover:underline">Message →</Link>
      </div>
    </li>
  );
}
