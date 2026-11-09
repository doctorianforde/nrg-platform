import { createClient } from "@/lib/supabase/server";
import { buildFatigueReport, type FatigueReport } from "@/lib/mock-exam/fatigue";
import { TAXONOMY } from "@/lib/generation/taxonomy";
import { publishedReviewLinks } from "@/lib/topic-reviews/queries";
import { linkScore, MIN_LINK_SCORE, type ReviewLink } from "@/lib/topic-reviews/catalog";

/**
 * A student's own analytics (D8 option 2, decided by Ian 2026-11-09): rank plus private strengths and weaknesses by
 * domain and taxonomy, weakest topics with links to the matching topic review and practice, exam stamina, and activity.
 * A "topic" here is a published topic review: each answered question counts towards the review it links to in practice
 * (same keyword rule), since the database's `topics` are too fine-grained to aggregate (about one question each).
 * Never compared with classmates: everything here comes from the caller's own rows (my_study_analytics(), their own
 * mock sessions). Unreleased mock answers are left out by the database function (see its migration).
 */

export type DomainState = "new" | "weak" | "developing" | "mastered";

export type DomainStat = {
  id: number;
  code: string;
  name: string;
  examWeightPct: number | null;
  answered: number;
  correct: number;
  /** Accuracy over all counted answers, 0–100, or null with none. */
  pct: number | null;
  /** Ranking-v2 state from the last `window` answers. */
  state: DomainState;
  recentAnswered: number;
  recentPct: number | null;
};

export type TaxonomyStat = { level: string; code: string; name: string; answered: number; correct: number; pct: number | null };

/** One topic review's share of the student's answers. */
export type TopicStat = {
  slug: string;
  title: string;
  answered: number;
  correct: number;
  pct: number;
};

export type ActivityDay = { day: string; answered: number; correct: number };

export type StaminaEntry = {
  sessionId: string;
  title: string;
  completedAt: string;
  scorePct: number | null;
  report: FatigueReport | null;
};

export type StudentAnalytics = {
  answered: number;
  correct: number;
  pct: number | null;
  bySource: Record<string, number>;
  lastAt: string | null;
  withheldMockAnswers: number;
  thresholds: { window: number; minAnswers: number; weakMaxPct: number; masteredMinPct: number };
  domains: DomainStat[];
  taxonomy: TaxonomyStat[];
  /** Topics with at least TOPIC_MIN answers, weakest first (accuracy, then more answers first). */
  weakTopics: TopicStat[];
  /** Topics with at least TOPIC_MIN answers, strongest first. */
  strongTopics: TopicStat[];
  /** How many topic reviews cover at least one question the student has answered. */
  topicsTouched: number;
  /** Answers on questions no published review covers (they count in domain and taxonomy only). */
  unmatchedAnswers: number;
  activity: ActivityDay[];
  today: string;
  stamina: StaminaEntry[];
};

/** A topic needs this many counted answers before it is called weak or strong (fewer is noise). */
export const TOPIC_MIN = 3;
const TOPIC_LIST = 6;
const STAMINA_SESSIONS = 6;

const pct = (c: number, n: number) => (n > 0 ? Math.round((100 * c) / n) : null);
const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v !== "" && Number.isFinite(Number(v)) ? Number(v) : d);

type RawAnalytics = {
  answered: number;
  correct: number;
  by_source: Record<string, number>;
  last_at: string | null;
  withheld_mock_answers: number;
  thresholds: { window: number; min_answers: number; weak_max_pct: number; mastered_min_pct: number };
  domains: Array<{ id: number; code: string; name: string; exam_weight_pct: number | null; answered: number; correct: number; recent_answered: number; recent_correct: number; state: DomainState }>;
  taxonomy: Array<{ level: string; answered: number; correct: number }>;
  questions: Array<[string, number, number]>;
  activity: ActivityDay[];
  today: string;
};

/** Null when the database lacks 20261109120000 (the page then says analytics are not available yet). */
export async function loadStudentAnalytics(userId: string, opts: { stamina?: boolean } = {}): Promise<StudentAnalytics | null> {
  const supabase = createClient();
  const [{ data, error }, reviews, stamina] = await Promise.all([
    supabase.rpc("my_study_analytics"),
    publishedReviewLinks().catch(() => [] as ReviewLink[]),
    opts.stamina === false ? Promise.resolve([] as StaminaEntry[]) : loadStamina(userId),
  ]);
  if (error || !data) return null;
  const raw = data as unknown as RawAnalytics;

  const domains: DomainStat[] = raw.domains.map((d) => ({
    id: d.id,
    code: d.code,
    name: d.name,
    examWeightPct: d.exam_weight_pct === null ? null : num(d.exam_weight_pct),
    answered: d.answered,
    correct: d.correct,
    pct: pct(d.correct, d.answered),
    state: d.state,
    recentAnswered: d.recent_answered,
    recentPct: pct(d.recent_correct, d.recent_answered),
  }));

  // Fixed taxonomy order (KC → AP → ASE: recall, then use, then judgement), every level shown even at 0.
  const byLevel = new Map(raw.taxonomy.map((t) => [t.level, t]));
  const taxonomy: TaxonomyStat[] = ["knowledge", "application", "analysis"].map((level) => {
    const t = byLevel.get(level);
    const meta = TAXONOMY.find((x) => x.db === level)!;
    return { level, code: meta.code, name: meta.name, answered: t?.answered ?? 0, correct: t?.correct ?? 0, pct: t ? pct(t.correct, t.answered) : null };
  });

  const byReview = await answersByReview(raw.questions ?? [], reviews);
  const scored: TopicStat[] = byReview.stats.filter((t) => t.answered >= TOPIC_MIN);
  const weakTopics = scored
    .filter((t) => t.pct < raw.thresholds.mastered_min_pct)
    .sort((a, b) => a.pct - b.pct || b.answered - a.answered)
    .slice(0, TOPIC_LIST);
  const strongTopics = scored
    .filter((t) => t.pct >= raw.thresholds.mastered_min_pct)
    .sort((a, b) => b.pct - a.pct || b.answered - a.answered)
    .slice(0, TOPIC_LIST);

  return {
    answered: raw.answered,
    correct: raw.correct,
    pct: pct(raw.correct, raw.answered),
    bySource: raw.by_source ?? {},
    lastAt: raw.last_at,
    withheldMockAnswers: Math.max(0, raw.withheld_mock_answers ?? 0),
    thresholds: {
      window: num(raw.thresholds.window, 30),
      minAnswers: num(raw.thresholds.min_answers, 10),
      weakMaxPct: num(raw.thresholds.weak_max_pct, 30),
      masteredMinPct: num(raw.thresholds.mastered_min_pct, 75),
    },
    domains,
    taxonomy,
    weakTopics,
    strongTopics,
    topicsTouched: byReview.stats.length,
    unmatchedAnswers: byReview.unmatched,
    activity: raw.activity ?? [],
    today: raw.today,
    stamina,
  };
}

/**
 * Group the student's per-question counts by topic review: each question goes to its best-scoring published review
 * (linkScore over the review's SQL-prefiltered candidates), exactly as practice picks a question's "Review this topic".
 */
async function answersByReview(
  questions: Array<[string, number, number]>,
  reviews: ReviewLink[]
): Promise<{ stats: TopicStat[]; unmatched: number }> {
  const mine = new Map(questions.map(([id, n, c]) => [id, { n, c }]));
  const total = questions.reduce((s, [, n]) => s + n, 0);
  if (mine.size === 0 || reviews.length === 0) return { stats: [], unmatched: total };
  const supabase = createClient();
  const candidates = await Promise.all(
    reviews.map((r) => supabase.rpc("topic_review_candidates", { p_slug: r.slug }).then(({ data }) => (data ?? []) as Array<{ id: string; body: string; topic_name: string | null }>))
  );
  const best = new Map<string, { review: number; score: number }>();
  candidates.forEach((list, ri) => {
    for (const q of list) {
      if (!mine.has(q.id)) continue;
      const score = linkScore({ body: q.body, topicName: q.topic_name }, reviews[ri]);
      const cur = best.get(q.id);
      if (score >= MIN_LINK_SCORE && (!cur || score > cur.score)) best.set(q.id, { review: ri, score });
    }
  });
  const agg = new Map<number, { n: number; c: number }>();
  let matched = 0;
  best.forEach(({ review }, id) => {
    const m = mine.get(id)!;
    const a = agg.get(review) ?? { n: 0, c: 0 };
    a.n += m.n; a.c += m.c; matched += m.n;
    agg.set(review, a);
  });
  const stats = Array.from(agg.entries()).map(([ri, a]) => ({
    slug: reviews[ri].slug, title: reviews[ri].title, answered: a.n, correct: a.c, pct: pct(a.c, a.n) ?? 0,
  }));
  return { stats, unmatched: total - matched };
}

/**
 * Exam stamina: the fatigue report (accuracy by quarter) of each of the student's recent completed mock exams. The
 * results page already shows these quarters before rationales are released, so this reveals nothing new.
 */
async function loadStamina(userId: string): Promise<StaminaEntry[]> {
  const supabase = createClient();
  const { data: sessions } = await supabase
    .from("mock_exam_sessions")
    .select("id, set_id, started_at, completed_at, score_pct")
    .eq("student_id", userId)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(STAMINA_SESSIONS);
  if (!sessions?.length) return [];

  const setIds = Array.from(new Set(sessions.map((s) => s.set_id)));
  const [{ data: sets }, { data: setQuestions }, { data: responses }] = await Promise.all([
    supabase.from("mock_exam_sets").select("id, title").in("id", setIds),
    supabase.from("mock_exam_set_questions").select("set_id, question_id, display_order").in("set_id", setIds).order("display_order"),
    supabase
      .from("mock_exam_responses")
      .select("session_id, question_id, selected_option_ids, is_correct, answered_at")
      .in("session_id", sessions.map((s) => s.id)),
  ]);

  const titles = new Map((sets ?? []).map((s) => [s.id, s.title]));
  return sessions.map((s) => {
    const order = (setQuestions ?? []).filter((q) => q.set_id === s.set_id).map((q) => q.question_id);
    const mine = (responses ?? []).filter((r) => r.session_id === s.id);
    return {
      sessionId: s.id,
      title: titles.get(s.set_id) ?? "Mock exam",
      completedAt: s.completed_at as string,
      scorePct: s.score_pct,
      report: buildFatigueReport(order, mine, s.started_at),
    };
  });
}
