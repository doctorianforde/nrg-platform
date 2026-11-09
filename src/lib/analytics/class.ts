import { createClient } from "@/lib/supabase/server";

/**
 * Instructor analytics (20261109220000 class_analytics()): every active student with their at-risk reasons, 12 weeks of
 * class activity, and class accuracy by domain. Teaching staff only (the function refuses anyone else).
 */

export type RiskReason = "inactive" | "low" | "mock" | "drop";

export const REASON_META: Record<RiskReason, { label: string; short: string }> = {
  inactive: { label: "No recent practice", short: "Inactive" },
  low: { label: "Low recent accuracy", short: "Low accuracy" },
  mock: { label: "Recent mock below the pass mark", short: "Mock below pass" },
  drop: { label: "Accuracy dropped this fortnight", short: "Dropping" },
};

export type ClassThresholds = {
  inactiveDays: number;
  recentAnswers: number;
  lowPct: number;
  minAnswers: number;
  mockPassPct: number;
  mockRecentDays: number;
  dropPoints: number;
  dropDays: number;
  unconfirmed: string[];
};

export type ClassStudent = {
  id: string;
  name: string;
  email: string | null;
  joinedAt: string;
  plan: string | null;
  lastAt: string | null;
  answered: number;
  recentAnswered: number;
  recentCorrect: number;
  recentPct: number | null;
  prevFortnight: { n: number; c: number; pct: number | null };
  thisFortnight: { n: number; c: number; pct: number | null };
  lastMock: { pct: number; at: string; title: string } | null;
  reasons: RiskReason[];
};

export type ClassWeek = { week: string; active: number; answered: number; correct: number; pct: number | null; mocks: number; mockAvg: number | null };
export type ClassDomain = { id: number; code: string; name: string; answered: number; correct: number; pct: number | null; prevPct: number | null; students: number };

export type ClassAnalytics = {
  generatedAt: string;
  thresholds: ClassThresholds;
  students: ClassStudent[];
  weeks: ClassWeek[];
  domains: ClassDomain[];
};

const pct = (c: number, n: number) => (n > 0 ? Math.round((100 * c) / n) : null);

type Raw = {
  generated_at: string;
  thresholds: Record<string, number> & { unconfirmed: string[] };
  students: {
    id: string; name: string | null; email: string | null; joined_at: string; plan: string | null; last_at: string | null;
    answered: number; recent_answered: number; recent_correct: number; prev_fortnight: [number, number];
    this_fortnight: [number, number]; last_mock: { pct: number; at: string; title: string } | null; reasons: RiskReason[];
  }[];
  weeks: { week: string; active: number; answered: number; correct: number; mocks: number; mock_avg: number | null }[];
  domains: { id: number; code: string; name: string; answered: number; correct: number; prev_answered: number; prev_correct: number; students: number }[];
};

/** Null on a database without the migration, or for a caller who isn't teaching staff. */
export async function loadClassAnalytics(): Promise<ClassAnalytics | null> {
  const { data, error } = await createClient().rpc("class_analytics");
  if (error || !data) return null;
  const r = data as unknown as Raw;
  const t = r.thresholds;
  return {
    generatedAt: r.generated_at,
    thresholds: {
      inactiveDays: Number(t.inactive_days), recentAnswers: Number(t.recent_answers), lowPct: Number(t.low_pct),
      minAnswers: Number(t.min_answers), mockPassPct: Number(t.mock_pass_pct), mockRecentDays: Number(t.mock_recent_days),
      dropPoints: Number(t.drop_points), dropDays: Number(t.drop_days), unconfirmed: t.unconfirmed ?? [],
    },
    students: r.students.map((s) => ({
      id: s.id,
      name: s.name?.trim() || s.email?.split("@")[0] || "Student",
      email: s.email,
      joinedAt: s.joined_at,
      plan: s.plan,
      lastAt: s.last_at,
      answered: s.answered,
      recentAnswered: s.recent_answered,
      recentCorrect: s.recent_correct,
      recentPct: pct(s.recent_correct, s.recent_answered),
      prevFortnight: { n: s.prev_fortnight[0], c: s.prev_fortnight[1], pct: pct(s.prev_fortnight[1], s.prev_fortnight[0]) },
      thisFortnight: { n: s.this_fortnight[0], c: s.this_fortnight[1], pct: pct(s.this_fortnight[1], s.this_fortnight[0]) },
      lastMock: s.last_mock ? { pct: Number(s.last_mock.pct), at: s.last_mock.at, title: s.last_mock.title } : null,
      reasons: s.reasons ?? [],
    })),
    weeks: r.weeks.map((w) => ({ week: w.week, active: w.active, answered: w.answered, correct: w.correct, pct: pct(w.correct, w.answered), mocks: w.mocks, mockAvg: w.mock_avg === null ? null : Number(w.mock_avg) })),
    domains: r.domains.map((d) => ({ id: d.id, code: d.code, name: d.name, answered: d.answered, correct: d.correct, pct: pct(d.correct, d.answered), prevPct: pct(d.prev_correct, d.prev_answered), students: d.students })),
  };
}

/** One sentence per reason, with the student's own numbers, for the at-risk list. */
export function reasonDetail(s: ClassStudent, r: RiskReason, t: ClassThresholds, now = Date.now()): string {
  switch (r) {
    case "inactive": {
      if (!s.lastAt) return `Hasn't answered a question since joining ${daysAgo(s.joinedAt, now)}.`;
      return `Last answered a question ${daysAgo(s.lastAt, now)}.`;
    }
    case "low":
      return `${s.recentPct}% correct over the last ${s.recentAnswered} answers (under ${t.lowPct}%).`;
    case "mock":
      return s.lastMock ? `Scored ${Math.round(s.lastMock.pct)}% on “${s.lastMock.title}” ${daysAgo(s.lastMock.at, now)} (pass mark ${t.mockPassPct}%).` : "";
    case "drop":
      return `${s.thisFortnight.pct}% this fortnight, down from ${s.prevFortnight.pct}% (${Math.round((100 * s.prevFortnight.c) / Math.max(1, s.prevFortnight.n) - (100 * s.thisFortnight.c) / Math.max(1, s.thisFortnight.n))} points).`;
  }
}

export function daysAgo(iso: string, now = Date.now()): string {
  const d = Math.floor((now - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
}
