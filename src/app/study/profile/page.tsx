import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/DashboardShell";
import { Card, CardTitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { ThreadList } from "@/components/messages/ThreadList";
import { NewThreadForm } from "@/components/messages/NewThreadForm";
import { DisplayNameForm } from "./DisplayNameForm";
import { AvatarUpload } from "./AvatarUpload";
import { loadCitableAttempts, loadThreads } from "@/lib/messages/queries";
import { fmtDateTime, fmtPct } from "@/lib/mock-exam/utils";
import { hasAtLeast } from "@/lib/auth/roles";
import { loadEvents, loadStudentOptions, monthRange } from "@/lib/calendar/queries";
import { parseMonth, toDateKey } from "@/lib/calendar/types";
import { CalendarPanel } from "@/components/calendar/CalendarPanel";
import { loadXp } from "@/lib/xp/queries";
import { RankCard } from "@/components/xp/RankCard";
import { RankCardV2 } from "@/components/xp/RankCardV2";
import { loadRankV2 } from "@/lib/xp/rank-v2";
import { flags } from "@/lib/flags";
import { TrophyStrip } from "@/components/badges/TrophyStrip";
import { loadBadgeCatalogue, loadEarned } from "@/lib/badges/queries";
import { headers } from "next/headers";
import { ThemePicker } from "@/components/theme/ThemePicker";
import { DEFAULT_THEME, THEME_HEADER, isThemeId } from "@/lib/theme/themes";

export const dynamic = "force-dynamic";

export default async function StudentProfilePage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { user, profile } = await requireRole("student", "/study/profile");
  const supabase = createClient();

  const attach = typeof searchParams.attach === "string" ? searchParams.attach : undefined;
  const isStaff = hasAtLeast(profile.role, "teacher");
  const { year, month } = parseMonth(
    typeof searchParams.m === "string" ? searchParams.m : undefined
  );
  const { from, to } = monthRange(year, month);

  const [xp, rankV2, trophies, events, students, threads, attempts, { data: sessions }] = await Promise.all([
    loadXp(supabase, user.id),
    // Ranking v2 (staging only until go-live): rank comes from passed promotion quizzes, capped by XP.
    flags.rankingV2 ? loadRankV2(supabase, user.id) : Promise.resolve(null),
    flags.rankingV2 ? Promise.all([loadBadgeCatalogue(supabase), loadEarned(supabase, user.id)]) : Promise.resolve(null),
    loadEvents(supabase, user.id, isStaff, from, to),
    isStaff ? loadStudentOptions(supabase) : Promise.resolve([]),
    loadThreads(supabase, user.id, false),
    loadCitableAttempts(supabase, user.id),
    supabase
      .from("mock_exam_sessions")
      .select("score_pct, completed_at")
      .eq("student_id", user.id)
      .not("completed_at", "is", null),
  ]);

  const completed = sessions ?? [];
  const avgScore =
    completed.length > 0
      ? completed.reduce((n, s) => n + (s.score_pct ?? 0), 0) / completed.length
      : null;
  const best = completed.reduce<number | null>(
    (top, s) => (s.score_pct != null && (top === null || s.score_pct > top) ? s.score_pct : top),
    null
  );
  const unread = threads.filter((t) => t.unread).length;
  // The theme the middleware resolved for this request (= profiles.theme for a student).
  const resolvedTheme = headers().get(THEME_HEADER);
  const theme = isThemeId(resolvedTheme) ? resolvedTheme : DEFAULT_THEME;

  return (
    <DashboardShell protect={false}
      profile={profile}
      email={user.email}
      title="Your profile"
      eyebrow="Student"
      subtitle="Your details, your progress, and a direct line to your teacher."
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 motion-safe:animate-rise-in">
          <StatCard
            label="Mock exams completed"
            value={completed.length}
            iconTone="purple"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h4M8 4h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm1-2h6v4H9V2Z" />
              </svg>
            }
          />
          <StatCard
            label="Average score"
            value={fmtPct(avgScore)}
            hint="Completed attempts only"
            iconTone="blue"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 19V5m0 14h16M8 15l3-4 3 2 4-6" />
              </svg>
            }
          />
          <StatCard
            label="Best score"
            value={fmtPct(best)}
            iconTone="green"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 21h8m-4-4v4m-6-17h12v5a6 6 0 0 1-12 0V4Zm-2 2H4a3 3 0 0 0 3 3m13-3h2a3 3 0 0 1-3 3" />
              </svg>
            }
          />
          <StatCard
            label="Unread replies"
            value={unread}
            hint={unread > 0 ? "Your teacher has replied" : "Nothing new"}
            iconTone={unread > 0 ? "amber" : "purple"}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16v12H4V6Zm0 1 8 6 8-6" />
              </svg>
            }
          />
        </div>

        {!isStaff ? (
          <Card id="theme" className="scroll-mt-20 rounded-xl border-brand-100">
            <CardTitle>Your theme</CardTitle>
            <p className="mb-4 mt-1 text-sm text-muted-foreground">
              Pick the look you like to study in. Midnight is easier on the eyes at night.
            </p>
            <ThemePicker initial={theme} />
          </Card>
        ) : null}

        <Card id="calendar" className="scroll-mt-20 rounded-xl border-brand-100">
          <CardTitle>Calendar</CardTitle>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">
            {isStaff
              ? "Your own entries plus anything you publish. Pick who each event is for — everyone, all students, staff, or named students."
              : "Exam dates and anything your teachers have shared with you. Entries you add here are private to you."}
          </p>
          <CalendarPanel
            year={year}
            month={month}
            events={events}
            isStaff={isStaff}
            students={students}
            todayKey={toDateKey(new Date())}
          />
        </Card>

        <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-5">
            <Card className="rounded-xl border-brand-100">
              <CardTitle>Ask your teacher</CardTitle>
              <p className="mb-4 mt-1 text-sm text-muted-foreground">
                Send a question and your teacher will reply here. Attach a mock exam result if
                you want feedback on a specific attempt.
              </p>
              <NewThreadForm attempts={attempts} preselectedSessionId={attach} />
            </Card>

            <Card className="rounded-xl border-brand-100">
              <CardTitle className="mb-2">Your conversations</CardTitle>
              <ThreadList
                threads={threads}
                basePath="/study/profile/threads"
                showWho={false}
                emptyTitle="No conversations yet"
                emptyBody="Anything you send your teacher will appear here, along with their replies."
              />
            </Card>
          </div>

          <div className="space-y-5">
            {rankV2 ? <RankCardV2 rank={rankV2} /> : <RankCard xp={xp} />}
            {trophies ? (() => {
              const [defs, earned] = trophies;
              const latest = defs.filter((d) => earned.has(d.code)).sort((a, b) => earned.get(b.code)!.localeCompare(earned.get(a.code)!)).slice(0, 4)
                .map((d) => ({ code: d.code, art: d.art, name: d.name }));
              return <TrophyStrip latest={latest} earned={earned.size} total={defs.length} />;
            })() : null}

            <Card className="rounded-xl border-brand-100">
              <CardTitle className="mb-3">Your details</CardTitle>
              <AvatarUpload
                userId={user.id}
                name={profile.full_name}
                currentUrl={profile.avatar_url}
              />
              <div className="mt-4 border-t border-border pt-3">
                <DisplayNameForm currentName={profile.full_name ?? ""} />
              </div>
              <dl className="mt-4 space-y-2 border-t border-border pt-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Email</dt>
                  <dd className="truncate text-card-foreground">{user.email}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Plan</dt>
                  <dd className="capitalize text-card-foreground">{profile.subscription_tier}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Joined</dt>
                  <dd className="text-card-foreground">{fmtDateTime(user.created_at)}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">
                Your name is what your teacher sees when you write to them. Email and plan are
                changed by an administrator.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
