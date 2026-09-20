/**
 * Fatigue analysis — does a student's accuracy fall as a mock exam goes on?
 *
 * Adapted from the client's "Fatigue Analysis — Data & Prompt Specification".
 * That document targets a prototype that held the exam in memory; the parts that
 * differ here do so because of our schema or because the original would misreport:
 *
 *   - Segments come from the set's real length, not a hardcoded 100 questions / 25
 *     per quarter. Our sets are any size.
 *   - Correctness comes from mock_exam_responses.is_correct, graded in Postgres by
 *     trg_grade_mock_exam_response. The spec compared a single selected index to a
 *     correct index, which cannot express SATA and would require shipping the answer
 *     key to the client.
 *   - Accuracy is measured over ANSWERED questions; skips are counted separately.
 *     The spec's prose said the same, but its code counted every slot in the range,
 *     so a skipped question was scored as wrong and a tiring student's accuracy was
 *     double-penalised. A rising skip count is its own fatigue signal, reported on
 *     its own terms.
 *   - A drop only counts as `significant` when it also clears sampling error. At 25
 *     questions a quarter, two-proportion standard error is ~13 points, so the
 *     spec's flat 15-point rule fires on noise roughly a quarter of the time even
 *     when nothing is wrong. The 15-point threshold is kept for display (`observed`)
 *     so the client's intent survives, but recommendations wait for significance.
 *   - The pattern and recommendation are computed here. The spec called an LLM to
 *     classify four numbers against four fixed rules — slower, costs money per
 *     result, and returns something different each run for the same exam.
 *
 * Pace is an addition the prototype could not make: mock_exam_responses.answered_at
 * gives us per-question timing.
 */

/** Quarters, per the client's spec. */
export const SEGMENT_COUNT = 4;
/** Below this, quarters are too small to say anything at all. */
export const MIN_QUESTIONS = 16;
/** Below this many answered in a quarter, no significance claim is made. */
export const MIN_ANSWERED_PER_SEGMENT = 5;
/** The client's display threshold: this many points below quarter 1 reads as a drop. */
export const DROP_POINTS = 15;
/** One-sided 95%. Applied to the two-proportion standard error. */
const Z_95 = 1.645;

export type DropLevel = "none" | "observed" | "significant";

export type FatigueSegment = {
  name: string;
  /** 0-based, inclusive. */
  start: number;
  /** 0-based, exclusive. */
  end: number;
  total: number;
  answered: number;
  skipped: number;
  correct: number;
  /** Accuracy over answered questions, 0–100. 0 when nothing was answered. */
  pct: number;
  /** Wall-clock seconds per question in this quarter; null when unavailable. */
  secondsPerQuestion: number | null;
  /** Points below quarter 1. Positive means worse. */
  dropPoints: number;
  drop: DropLevel;
};

export type FatiguePattern =
  | "insufficient-data"
  | "steady-strong"
  | "steady"
  | "gradual-decline"
  | "late-drop"
  | "low-throughout";

export type FatigueReport = {
  segments: FatigueSegment[];
  pattern: FatiguePattern;
  headline: string;
  recommendation: string;
  /** Points quarter 4 sits below quarter 1. Positive means worse. */
  finalQuarterDrop: number;
  hasSignificantDrop: boolean;
  /** Accuracy over every answered question, 0–100. */
  overallPct: number;
  totalAnswered: number;
  totalSkipped: number;
  /** Least-squares trend in points per quarter. Negative means declining. */
  slope: number;
  paceAvailable: boolean;
};

export type FatigueResponse = {
  question_id: string;
  selected_option_ids: string[];
  is_correct: boolean | null;
  answered_at?: string | null;
};

const pctOf = (correct: number, answered: number) =>
  answered > 0 ? Math.round((correct / answered) * 100) : 0;

/** Standard error of the difference between two proportions, in points. */
function diffStandardError(c1: number, n1: number, c2: number, n2: number): number {
  if (n1 <= 0 || n2 <= 0) return Infinity;
  const p1 = c1 / n1;
  const p2 = c2 / n2;
  return Math.sqrt((p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2) * 100;
}

/** Least-squares slope of pct against quarter index, in points per quarter. */
function trendSlope(points: { x: number; y: number }[]): number {
  if (points.length < 2) return 0;
  const mx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const my = points.reduce((s, p) => s + p.y, 0) / points.length;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

/**
 * Per-quarter wall-clock boundaries, or null when the timings can't be trusted.
 *
 * answered_at is rewritten every time an answer is saved, so it is the LAST time a
 * question was touched, not the first. When a student revisits an earlier question
 * its timestamp jumps ahead of later ones, and the sequence stops being monotonic.
 * We only report pace when it is monotonic, which means the student worked straight
 * through and each timestamp really is when they left that question.
 */
function segmentBoundaries(
  orderedIds: string[],
  byQuestion: Map<string, FatigueResponse>,
  startedAt: string | null | undefined,
  bounds: { start: number; end: number }[]
): (number | null)[] | null {
  if (!startedAt) return null;
  const startMs = Date.parse(startedAt);
  if (Number.isNaN(startMs)) return null;

  const stamps: (number | null)[] = orderedIds.map((id) => {
    const at = byQuestion.get(id)?.answered_at;
    if (!at) return null;
    const ms = Date.parse(at);
    return Number.isNaN(ms) ? null : ms;
  });

  const seen = stamps.filter((s): s is number => s !== null);
  if (seen.length === 0) return null;
  for (let i = 1; i < seen.length; i++) {
    if (seen[i] < seen[i - 1]) return null;
  }
  if (seen[0] < startMs) return null;

  let previous = startMs;
  return bounds.map((b) => {
    const inSegment = stamps.slice(b.start, b.end).filter((s): s is number => s !== null);
    const last = inSegment.length > 0 ? inSegment[inSegment.length - 1] : null;
    const edge = last ?? previous;
    const seconds = (edge - previous) / 1000;
    previous = edge;
    return seconds > 0 ? seconds : null;
  });
}

function describe(
  pattern: FatiguePattern,
  segments: FatigueSegment[],
  finalDrop: number,
  totalSkipped: number
): { headline: string; recommendation: string } {
  const half = segments[Math.floor(segments.length / 2)]?.start ?? 0;
  const skipNote =
    totalSkipped > 0
      ? ` You left ${totalSkipped} question${totalSkipped === 1 ? "" : "s"} unanswered — on the real paper those score nothing, so it is worth committing to an answer before moving on.`
      : "";

  switch (pattern) {
    case "insufficient-data":
      return {
        headline: "Not enough answers to compare quarters",
        recommendation:
          "Answer more of the paper and the quarter-by-quarter comparison will appear here." + skipNote,
      };
    case "low-throughout":
      return {
        headline: "Accuracy was low throughout",
        recommendation:
          "Accuracy stayed low from the first quarter onward, so this looks like content rather than stamina. Short practice sets aimed at your weakest domains will move your score faster than more full-length papers." +
          skipNote,
      };
    case "late-drop":
      return {
        headline: `Accuracy fell ${Math.round(finalDrop)} points in the final quarter`,
        recommendation:
          `You held your accuracy until late, then dropped ${Math.round(finalDrop)} points — that pattern is usually concentration rather than knowledge. Take a deliberate 60-second pause around question ${half + 1}, and keep sitting full-length papers so the last stretch stops feeling unfamiliar.` +
          skipNote,
      };
    case "gradual-decline":
      return {
        headline: `Accuracy slipped steadily — ${Math.round(finalDrop)} points across the paper`,
        recommendation:
          "Your accuracy edged down from the first quarter to the last rather than falling off a cliff. That usually means pacing: check the clock at each quarter mark so early questions don't eat the time you need later." +
          skipNote,
      };
    case "steady-strong":
      return {
        headline: "Strong and steady across all four quarters",
        recommendation:
          "You stayed above 70% in every quarter, which is genuinely good exam stamina. Keep practising at full length so it holds on exam day." +
          skipNote,
      };
    default:
      return {
        headline: "Accuracy held steady across the paper",
        recommendation:
          "Your accuracy didn't fall as the exam went on, so stamina isn't your limiting factor right now. Put your revision into the domains you missed rather than into endurance." +
          skipNote,
      };
  }
}

/**
 * Build the fatigue report for one completed attempt.
 *
 * `orderedQuestionIds` must be in the order the student saw them. Returns null when
 * the exam is too short for quarters to mean anything.
 */
export function buildFatigueReport(
  orderedQuestionIds: string[],
  responses: FatigueResponse[],
  startedAt?: string | null,
  segmentCount: number = SEGMENT_COUNT
): FatigueReport | null {
  const n = orderedQuestionIds.length;
  if (n < MIN_QUESTIONS || segmentCount < 2) return null;

  const byQuestion = new Map(responses.map((r) => [r.question_id, r]));

  const bounds = Array.from({ length: segmentCount }, (_, i) => ({
    start: Math.floor((i * n) / segmentCount),
    end: Math.floor(((i + 1) * n) / segmentCount),
  }));

  const pace = segmentBoundaries(orderedQuestionIds, byQuestion, startedAt, bounds);

  const raw = bounds.map((b, i) => {
    let answered = 0;
    let correct = 0;
    for (let q = b.start; q < b.end; q++) {
      const response = byQuestion.get(orderedQuestionIds[q]);
      if (!response || response.selected_option_ids.length === 0) continue;
      answered++;
      if (response.is_correct) correct++;
    }
    const total = b.end - b.start;
    const seconds = pace?.[i] ?? null;
    return {
      name: `Q${b.start + 1}–${b.end}`,
      start: b.start,
      end: b.end,
      total,
      answered,
      skipped: total - answered,
      correct,
      pct: pctOf(correct, answered),
      secondsPerQuestion: seconds !== null && total > 0 ? Math.round(seconds / total) : null,
    };
  });

  const first = raw[0];
  const segments: FatigueSegment[] = raw.map((s, i) => {
    if (i === 0 || first.answered === 0 || s.answered === 0) {
      return { ...s, dropPoints: 0, drop: "none" as DropLevel };
    }
    const dropPoints = first.pct - s.pct;
    let drop: DropLevel = "none";
    if (dropPoints >= DROP_POINTS) {
      const se = diffStandardError(first.correct, first.answered, s.correct, s.answered);
      const enough =
        first.answered >= MIN_ANSWERED_PER_SEGMENT && s.answered >= MIN_ANSWERED_PER_SEGMENT;
      drop = enough && dropPoints >= Z_95 * se ? "significant" : "observed";
    }
    return { ...s, dropPoints, drop };
  });

  const totalAnswered = segments.reduce((sum, s) => sum + s.answered, 0);
  const totalCorrect = segments.reduce((sum, s) => sum + s.correct, 0);
  const totalSkipped = segments.reduce((sum, s) => sum + s.skipped, 0);
  const overallPct = pctOf(totalCorrect, totalAnswered);
  const scored = segments.filter((s) => s.answered > 0);
  const last = segments[segments.length - 1];
  const finalQuarterDrop = last.dropPoints;
  const slope = trendSlope(scored.map((s, i) => ({ x: i, y: s.pct })));

  // Telling "held up, then fell away" apart from "slid all the way down" can't be
  // done by drop size: in a steady slide the last quarter is always furthest below
  // the first. What separates them is the shape of the last step. A late drop ends
  // in a cliff that dwarfs the earlier steps; a slide takes steps of similar size.
  const steps = scored.slice(1).map((s, i) => s.pct - scored[i].pct);
  const finalStepDown = steps.length > 0 ? -steps[steps.length - 1] : 0;
  const earlierDrops = steps.slice(0, -1).map((d) => Math.max(0, -d));
  const meanEarlierDrop =
    earlierDrops.length > 0 ? earlierDrops.reduce((a, b) => a + b, 0) / earlierDrops.length : 0;
  const endsInACliff = finalStepDown >= DROP_POINTS && finalStepDown >= 2 * meanEarlierDrop;

  let pattern: FatiguePattern;
  if (scored.length < 2) {
    pattern = "insufficient-data";
  } else if (overallPct < 50) {
    pattern = "low-throughout";
  } else if (finalQuarterDrop >= DROP_POINTS && endsInACliff) {
    pattern = "late-drop";
  } else if (slope <= -5 && finalQuarterDrop >= DROP_POINTS) {
    pattern = "gradual-decline";
  } else if (scored.every((s) => s.pct >= 70)) {
    pattern = "steady-strong";
  } else {
    pattern = "steady";
  }

  const { headline, recommendation } = describe(pattern, segments, finalQuarterDrop, totalSkipped);

  return {
    segments,
    pattern,
    headline,
    recommendation,
    finalQuarterDrop,
    hasSignificantDrop: segments.some((s) => s.drop === "significant"),
    overallPct,
    totalAnswered,
    totalSkipped,
    slope,
    paceAvailable: pace !== null,
  };
}

/**
 * Class-level view of one exam set.
 *
 * The spec scored each student 0–100 for "fatigue" and banded them 0–29 / 30–59 /
 * 60+, but never defined how the score was produced — in the prototype it was mock
 * data, and the companion figure (an accuracy penalty of `fatigue * 0.3`) was not
 * derived from anything measurable. Rather than invent a scale, this bands students
 * by a quantity that is actually observed: how many points their final quarter sits
 * below their first.
 */
export const COHORT_MODERATE_DROP = 10;
export const COHORT_HIGH_DROP = 20;

export type CohortFatigue = {
  attempts: number;
  stable: number;
  moderate: number;
  high: number;
  /** Attempts where the fall is larger than sampling error can explain. */
  significant: number;
  /** Attempts that held up and then fell away at the end. */
  lateDrop: number;
  /** Median points lost between the first and last quarter. */
  medianDrop: number;
};

export function summariseCohort(reports: FatigueReport[]): CohortFatigue | null {
  const usable = reports.filter((r) => r.pattern !== "insufficient-data");
  if (usable.length === 0) return null;

  const drops = usable.map((r) => r.finalQuarterDrop).sort((a, b) => a - b);
  const mid = Math.floor(drops.length / 2);
  const medianDrop =
    drops.length % 2 === 0 ? Math.round((drops[mid - 1] + drops[mid]) / 2) : drops[mid];

  return {
    attempts: usable.length,
    stable: usable.filter((r) => r.finalQuarterDrop < COHORT_MODERATE_DROP).length,
    moderate: usable.filter(
      (r) => r.finalQuarterDrop >= COHORT_MODERATE_DROP && r.finalQuarterDrop < COHORT_HIGH_DROP
    ).length,
    high: usable.filter((r) => r.finalQuarterDrop >= COHORT_HIGH_DROP).length,
    significant: usable.filter((r) => r.hasSignificantDrop).length,
    lateDrop: usable.filter((r) => r.pattern === "late-drop").length,
    medianDrop,
  };
}

/** Green at 70+, amber at 50+, red below — the client's thresholds. */
export function accuracyTone(pct: number): "green" | "amber" | "red" {
  if (pct >= 70) return "green";
  if (pct >= 50) return "amber";
  return "red";
}
