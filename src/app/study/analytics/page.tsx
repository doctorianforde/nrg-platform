import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/DashboardShell";
import { Card, CardTitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { RankCard } from "@/components/xp/RankCard";
import { RankCardV2 } from "@/components/xp/RankCardV2";
import { AccuracyBars, STATE_META } from "@/components/analytics/AccuracyBars";
import { ActivityHeatmap } from "@/components/analytics/ActivityHeatmap";
import { StaminaPanel } from "@/components/analytics/StaminaPanel";
import { loadStudentAnalytics, TOPIC_MIN, type TopicStat } from "@/lib/analytics/student";
import { loadXp } from "@/lib/xp/queries";
import { loadRankV2 } from "@/lib/xp/rank-v2";
import { flags } from "@/lib/flags";

export const dynamic = "force-dynamic";

const PRACTICE = 10;

/**
 * "My progress": the student's own analytics (D8 option 2). Private: nothing here is compared with classmates, and the
 * data comes only from the student's own rows. Staff see their own (empty) view; cohort analytics belong to /teacher.
 */
export default async function MyProgressPage() {
  const { user, profile } = await requireRole("student", "/study/analytics");
  const supabase = createClient();
  const [analytics, rank, xp] = await Promise.all([
    loadStudentAnalytics(user.id),
    flags.rankingV2 ? loadRankV2(supabase, user.id) : Promise.resolve(null),
    flags.rankingV2 ? Promise.resolve(null) : loadXp(supabase, user.id),
  ]);

  const shell = (children: React.ReactNode) => (
    <DashboardShell
      profile={profile}
      email={user.email}
      title="My progress"
      eyebrow="Study"
      subtitle="Where you're strong, where to focus next, and how your exam stamina is holding up. Private to you — never compared with classmates."
    >
      {children}
    </DashboardShell>
  );

  if (!analytics) {
    return shell(<EmptyState title="Progress isn't available yet" body="Your analytics will appear here once this feature is switched on. Keep practising — every answer counts." />);
  }

  const a = analytics;
  const t = a.thresholds;
  const last30 = a.activity.filter((d) => daysBetween(d.day, a.today) < 30);
  const focusDomain = [...a.domains]
    .filter((d) => d.state === "weak" || d.state === "developing")
    .sort((x, y) => (x.recentPct ?? 0) - (y.recentPct ?? 0) || (y.examWeightPct ?? 0) - (x.examWeightPct ?? 0))[0];
  const focusTopic = a.weakTopics[0];
  const practised = a.domains.filter((d) => d.answered > 0).length;

  return shell(
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        {rank ? <RankCardV2 rank={rank} /> : xp ? <RankCard xp={xp} /> : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatCard label="Questions answered" value={a.answered.toLocaleString()} hint={sourceHint(a.bySource)} iconTone="purple" icon={<Icon d="M8.6 9a3.4 3.4 0 1 1 4.9 3c-.9.5-1.5 1.1-1.5 2v.5M12 17.5h.01" circle />} />
          <StatCard label="Overall accuracy" value={a.pct === null ? "—" : `${a.pct}%`} hint={a.answered ? `${a.correct.toLocaleString()} correct` : "Answer a few questions to start"} iconTone="green" icon={<Icon d="M5 12.5l4 4 10-10" />} />
          <StatCard label="Days studied (30 days)" value={last30.length} hint={`${last30.reduce((s, d) => s + d.answered, 0).toLocaleString()} answers this month`} iconTone="amber" icon={<Icon d="M4 7h16M7 3.5v3M17 3.5v3M5 5.5h14a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1z" />} />
          <StatCard label="Domains practised" value={`${practised} of ${a.domains.length}`} hint={`${a.topicsTouched} topic review${a.topicsTouched === 1 ? "" : "s"} touched`} iconTone="blue" icon={<Icon d="M3.5 3.5h7v7h-7zM13.5 3.5h7v7h-7zM3.5 13.5h7v7h-7zM13.5 13.5h7v7h-7z" />} />
        </div>
      </div>

      {a.withheldMockAnswers > 0 ? (
        <p className="mt-4 rounded-xl border border-border bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
          {a.withheldMockAnswers} mock-exam answer{a.withheldMockAnswers === 1 ? " is" : "s are"} not counted yet. They join your
          analytics when your teacher releases that exam&apos;s rationales.
        </p>
      ) : null}

      {focusDomain || focusTopic ? (
        <Card className="mt-6 border-brand-200 bg-gradient-to-br from-brand-50 to-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Focus next</p>
          <div className="mt-2 grid grid-cols-1 gap-4 md:grid-cols-2">
            {focusTopic ? <FocusTopic topic={focusTopic} /> : null}
            {focusDomain ? (
              <div>
                <p className="font-heading text-lg font-semibold text-card-foreground">{focusDomain.name}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {focusDomain.recentPct}% over your last {focusDomain.recentAnswered} answers ({STATE_META[focusDomain.state].label})
                  {focusDomain.examWeightPct ? ` · ${focusDomain.examWeightPct}% of the exam` : ""}.
                </p>
                <Link href={`/study/practice/session?domain=${focusDomain.id}&count=${PRACTICE}`} className={primaryBtn}>
                  Practise {PRACTICE} {focusDomain.code} questions
                </Link>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardTitle>Strengths and weaknesses by domain</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            The state uses your last {t.window} answers in each domain: fewer than {t.minAnswers} is New.
          </p>
          <div className="mt-5">
            <AccuracyBars
              caption="Accuracy by RENR domain"
              weakMaxPct={t.weakMaxPct}
              masteredMinPct={t.masteredMinPct}
              rows={a.domains.map((d) => ({
                key: String(d.id),
                code: d.code,
                label: d.name,
                answered: d.answered,
                correct: d.correct,
                pct: d.pct,
                state: d.state,
                note: d.examWeightPct ? `${d.examWeightPct}% of the exam` : undefined,
                practiceHref: `/study/practice/session?domain=${d.id}&count=${PRACTICE}`,
              }))}
            />
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardTitle>By taxonomy level</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Recall, applying it, and clinical judgement — the RENR tests all three.</p>
            <div className="mt-5">
              <AccuracyBars
                caption="Accuracy by taxonomy level"
                weakMaxPct={t.weakMaxPct}
                masteredMinPct={t.masteredMinPct}
                rows={a.taxonomy.map((x) => ({
                  key: x.level,
                  code: x.code,
                  label: x.name,
                  answered: x.answered,
                  correct: x.correct,
                  pct: x.pct,
                  practiceHref: `/study/practice/session?cognitive=${x.level}&count=${PRACTICE}`,
                }))}
              />
            </div>
          </Card>

          <Card>
            <CardTitle>Strongest topics</CardTitle>
            {a.strongTopics.length ? (
              <ul className="mt-3 divide-y divide-border/70">
                {a.strongTopics.map((tp) => (
                  <li key={tp.slug} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <Link href={`/study/reviews/${tp.slug}`} prefetch={false} className="min-w-0 truncate text-card-foreground hover:text-primary hover:underline">{tp.title}</Link>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      <strong className="font-semibold text-card-foreground">{tp.pct}%</strong> · {tp.answered}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Topic reviews where you score {t.masteredMinPct}% or more (over at least {TOPIC_MIN} answers) appear here.
              </p>
            )}
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardTitle>Weakest topics</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          Topics (grouped by topic review) with at least {TOPIC_MIN} answers where you&apos;re under {t.masteredMinPct}%, weakest first. Read the review, then practise.
          {a.unmatchedAnswers > 0 ? ` ${a.unmatchedAnswers} answer${a.unmatchedAnswers === 1 ? " is" : "s are"} on topics without a review yet; they still count above.` : ""}
        </p>
        {a.weakTopics.length ? (
          <ul className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {a.weakTopics.map((tp) => (
              <li key={tp.slug} className="flex flex-col rounded-xl border border-border/80 p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 font-medium text-card-foreground">{tp.title}</p>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-card-foreground">{tp.pct}%</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{tp.correct} of {tp.answered} correct</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href={`/study/reviews/${tp.slug}`} prefetch={false} className={chip}>
                    Read the review
                  </Link>
                  <Link href={`/study/practice/session?review=${tp.slug}&count=${PRACTICE}`} prefetch={false} className={chip}>
                    Practise this topic
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            {a.answered === 0
              ? "Nothing yet. Start with a practice session and this fills in as you go."
              : `No weak topics yet — once you've answered ${TOPIC_MIN} or more in a topic, any under ${t.masteredMinPct}% show here.`}
          </p>
        )}
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardTitle>Exam stamina</CardTitle>
          <p className="mt-1 mb-4 text-xs text-muted-foreground">Does your accuracy hold up from the first quarter of a mock exam to the last?</p>
          <StaminaPanel entries={a.stamina} />
        </Card>
        <Card>
          <CardTitle>Study activity</CardTitle>
          <p className="mt-1 mb-4 text-xs text-muted-foreground">Answers per day (Trinidad time), last 12 weeks.</p>
          <ActivityHeatmap activity={a.activity} today={a.today} />
        </Card>
      </div>
    </>
  );
}

function FocusTopic({ topic }: { topic: TopicStat }) {
  return (
    <div>
      <p className="font-heading text-lg font-semibold text-card-foreground">{topic.title}</p>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Your weakest topic: {topic.correct} of {topic.answered} correct ({topic.pct}%).
      </p>
      <div className="flex flex-wrap gap-2">
        <Link href={`/study/reviews/${topic.slug}`} prefetch={false} className={primaryBtn}>
          Read the review
        </Link>
        <Link href={`/study/practice/session?review=${topic.slug}&count=${PRACTICE}`} prefetch={false} className={secondaryBtn}>
          Practise {PRACTICE} questions
        </Link>
      </div>
    </div>
  );
}

const primaryBtn =
  "mt-3 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary-hover hover:shadow-md";
const secondaryBtn =
  "mt-3 inline-flex items-center justify-center rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-card-foreground transition-colors hover:bg-muted";
const chip =
  "inline-block rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-800 transition-colors hover:bg-brand-100";

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

function sourceHint(by: Record<string, number>) {
  const parts = [
    by.practice ? `${by.practice} practice` : null,
    by.mock ? `${by.mock} mock` : null,
    by.promotion ? `${by.promotion} promotion quiz` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Practice, mock exams and promotion quizzes count";
}

function Icon({ d, circle = false }: { d: string; circle?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
      {circle ? <circle cx="12" cy="12" r="9.25" /> : null}
    </svg>
  );
}
