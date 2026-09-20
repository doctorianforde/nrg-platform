/**
 * Unit checks for the fatigue analysis maths (src/lib/mock-exam/fatigue.ts).
 *
 *   npx tsx scripts/test-fatigue.ts
 *
 * No database and no network — the function is pure. Exits non-zero on failure.
 */
import {
  buildFatigueReport,
  DROP_POINTS,
  MIN_QUESTIONS,
  type FatigueResponse,
} from "../src/lib/mock-exam/fatigue";

let failures = 0;
function check(name: string, condition: boolean, detail = "") {
  console.log(`${condition ? "PASS" : "FAIL"} | ${name}${detail ? ` | ${detail}` : ""}`);
  if (!condition) failures++;
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `q${i + 1}`);

/** Build responses where `accuracyByQuarter` gives the fraction correct per quarter. */
function buildResponses(
  n: number,
  accuracyByQuarter: number[],
  opts: { skipPerQuarter?: number[]; startMs?: number; secondsPerQuestion?: number[] } = {}
): { responses: FatigueResponse[]; startedAt: string } {
  const startMs = opts.startMs ?? Date.parse("2026-09-19T10:00:00.000Z");
  const responses: FatigueResponse[] = [];
  let clock = startMs;

  for (let quarter = 0; quarter < accuracyByQuarter.length; quarter++) {
    const start = Math.floor((quarter * n) / accuracyByQuarter.length);
    const end = Math.floor(((quarter + 1) * n) / accuracyByQuarter.length);
    const size = end - start;
    const skip = opts.skipPerQuarter?.[quarter] ?? 0;
    const answerable = size - skip;
    const wantCorrect = Math.round(answerable * accuracyByQuarter[quarter]);
    const pace = (opts.secondsPerQuestion?.[quarter] ?? 60) * 1000;

    for (let i = 0; i < size; i++) {
      clock += pace;
      if (i < skip) continue; // skipped: no response row at all
      const answeredSoFar = i - skip;
      responses.push({
        question_id: `q${start + i + 1}`,
        selected_option_ids: ["opt"],
        is_correct: answeredSoFar < wantCorrect,
        answered_at: new Date(clock).toISOString(),
      });
    }
  }
  return { responses, startedAt: new Date(startMs).toISOString() };
}

// ── Segmentation ────────────────────────────────────────────────────────────
{
  const { responses, startedAt } = buildResponses(100, [0.8, 0.8, 0.8, 0.8]);
  const r = buildFatigueReport(ids(100), responses, startedAt)!;
  check("100 questions split into 4 quarters of 25", r.segments.length === 4 && r.segments.every((s) => s.total === 25));
  check(
    "quarter names match the spec",
    r.segments.map((s) => s.name).join(",") === "Q1–25,Q26–50,Q51–75,Q76–100",
    r.segments.map((s) => s.name).join(",")
  );
}
{
  // The spec hardcoded 100/25. Real sets are any length.
  const { responses, startedAt } = buildResponses(37, [0.8, 0.8, 0.8, 0.8]);
  const r = buildFatigueReport(ids(37), responses, startedAt)!;
  const sizes = r.segments.map((s) => s.total);
  check("37 questions split without gaps or overlaps", sizes.reduce((a, b) => a + b, 0) === 37, sizes.join("+"));
  check("37-question quarters stay within one of each other", Math.max(...sizes) - Math.min(...sizes) <= 1, sizes.join(","));
  check("last quarter ends on the final question", r.segments[3].end === 37);
}
check(`below ${MIN_QUESTIONS} questions returns null`, buildFatigueReport(ids(12), [], null) === null);

// ── Accuracy is over answered, skips counted separately ─────────────────────
{
  // Final quarter: 15 answered at 67%, 10 skipped.
  const { responses, startedAt } = buildResponses(100, [0.8, 0.8, 0.8, 0.667], {
    skipPerQuarter: [0, 0, 0, 10],
  });
  const r = buildFatigueReport(ids(100), responses, startedAt)!;
  const last = r.segments[3];
  check("skipped questions are counted", last.skipped === 10 && last.answered === 15, `answered=${last.answered} skipped=${last.skipped}`);
  check("accuracy uses answered as the denominator, not the whole quarter", last.pct === 67, `pct=${last.pct}`);
  check("total skipped is reported", r.totalSkipped === 10);
  check("skipping is mentioned in the advice", r.recommendation.includes("unanswered"));
}

// ── Significance: the core fix to the spec's flat 15-point rule ─────────────
{
  // 80% -> 64%: a 16-point drop over 25 answered. Inside sampling noise.
  const { responses, startedAt } = buildResponses(100, [0.8, 0.8, 0.8, 0.64]);
  const r = buildFatigueReport(ids(100), responses, startedAt)!;
  const last = r.segments[3];
  check(`16-point drop over 25 clears the ${DROP_POINTS}-point display threshold`, last.dropPoints >= DROP_POINTS, `drop=${last.dropPoints}`);
  check("...but is reported as observed, not significant", last.drop === "observed", last.drop);
  check("...and no significant drop is claimed for the attempt", r.hasSignificantDrop === false);
}
{
  // 85% -> 40%: a 45-point drop. Far outside noise.
  const { responses, startedAt } = buildResponses(100, [0.85, 0.8, 0.75, 0.4]);
  const r = buildFatigueReport(ids(100), responses, startedAt)!;
  check("45-point drop is significant", r.segments[3].drop === "significant", r.segments[3].drop);
  check("attempt is flagged as having a significant drop", r.hasSignificantDrop === true);
}
{
  // Same 45-point gap, but 4 answered per quarter: too little to claim anything.
  const { responses, startedAt } = buildResponses(16, [1, 1, 1, 0.5]);
  const r = buildFatigueReport(ids(16), responses, startedAt)!;
  check(
    "a big drop on tiny quarters is observed, never significant",
    r.segments[3].dropPoints >= DROP_POINTS && r.segments[3].drop === "observed",
    `drop=${r.segments[3].dropPoints} level=${r.segments[3].drop}`
  );
}

// ── Pattern classification (replaces the spec's LLM call) ───────────────────
{
  const cases: [string, number[], string][] = [
    ["all quarters above 70% -> steady-strong", [0.85, 0.82, 0.8, 0.84], "steady-strong"],
    ["flat mid-range -> steady", [0.62, 0.6, 0.64, 0.61], "steady"],
    ["holds then falls away -> late-drop", [0.85, 0.84, 0.82, 0.4], "late-drop"],
    ["steady slide -> gradual-decline", [0.85, 0.72, 0.6, 0.48], "gradual-decline"],
    ["low from the start -> low-throughout", [0.45, 0.4, 0.42, 0.38], "low-throughout"],
  ];
  for (const [name, quarters, expected] of cases) {
    const { responses, startedAt } = buildResponses(100, quarters);
    const r = buildFatigueReport(ids(100), responses, startedAt)!;
    check(name, r.pattern === expected, `got ${r.pattern} (slope=${r.slope.toFixed(1)}, finalDrop=${r.finalQuarterDrop})`);
  }
}
{
  const { responses, startedAt } = buildResponses(100, [0.85, 0.84, 0.82, 0.4]);
  const r = buildFatigueReport(ids(100), responses, startedAt)!;
  check("late-drop headline names the size of the fall", /\d+ points in the final quarter/.test(r.headline), r.headline);
  check("late-drop advice suggests a pause", /pause|break/i.test(r.recommendation));
}
{
  // Regression: a mild slide (88/84/78) that then falls off a cliff (35) is a late
  // drop, not a gradual decline. Comparing total drop against the earlier quarters'
  // trend put this on the wrong side of the line and described a 43-point cliff as
  // having "edged down ... rather than falling off a cliff".
  const { responses, startedAt } = buildResponses(100, [0.88, 0.84, 0.8, 0.36], {
    skipPerQuarter: [0, 0, 2, 8],
  });
  const r = buildFatigueReport(ids(100), responses, startedAt)!;
  check(
    "mild slide then a cliff is a late drop",
    r.pattern === "late-drop",
    `${r.segments.map((s) => s.pct).join("/")} -> ${r.pattern}`
  );
  check("...and the advice does not call it gradual", !/edged down/.test(r.recommendation));
}

// ── Pace ────────────────────────────────────────────────────────────────────
{
  const { responses, startedAt } = buildResponses(100, [0.8, 0.8, 0.8, 0.8], {
    secondsPerQuestion: [40, 50, 60, 90],
  });
  const r = buildFatigueReport(ids(100), responses, startedAt)!;
  check("pace is available when answers run in order", r.paceAvailable === true);
  check(
    "per-quarter pace matches the time actually spent",
    r.segments.map((s) => s.secondsPerQuestion).join(",") === "40,50,60,90",
    r.segments.map((s) => s.secondsPerQuestion).join(",")
  );
}
{
  // Student revisits question 2 at the very end: answered_at is a last-touched
  // stamp, so the sequence stops being monotonic and pace becomes untrustworthy.
  const { responses, startedAt } = buildResponses(100, [0.8, 0.8, 0.8, 0.8]);
  const revisited = responses.map((r) =>
    r.question_id === "q2" ? { ...r, answered_at: "2026-09-19T12:29:00.000Z" } : r
  );
  const r = buildFatigueReport(ids(100), revisited, startedAt)!;
  check("pace is withheld when the student revisited earlier questions", r.paceAvailable === false);
  check("accuracy is still reported when pace is withheld", r.segments.every((s) => s.answered > 0));
}
{
  const { responses } = buildResponses(100, [0.8, 0.8, 0.8, 0.8]);
  const r = buildFatigueReport(ids(100), responses, null)!;
  check("pace is withheld when the start time is missing", r.paceAvailable === false);
}

// ── Edge cases ──────────────────────────────────────────────────────────────
{
  const r = buildFatigueReport(ids(100), [], "2026-09-19T10:00:00.000Z")!;
  check("an untouched paper reports insufficient data", r.pattern === "insufficient-data", r.pattern);
  check("an untouched paper does not divide by zero", r.overallPct === 0 && r.segments.every((s) => s.pct === 0));
  check("an untouched paper counts every question as skipped", r.totalSkipped === 100);
}
{
  // Only the first quarter attempted: nothing to compare against.
  const { responses, startedAt } = buildResponses(100, [0.8, 0, 0, 0], {
    skipPerQuarter: [0, 25, 25, 25],
  });
  const r = buildFatigueReport(ids(100), responses, startedAt)!;
  check("one scored quarter reports insufficient data", r.pattern === "insufficient-data", r.pattern);
  check("empty quarters are never flagged as a drop", r.segments.slice(1).every((s) => s.drop === "none"));
}
{
  const { responses, startedAt } = buildResponses(100, [1, 1, 1, 1]);
  const r = buildFatigueReport(ids(100), responses, startedAt)!;
  check("a perfect paper is steady-strong with no drop", r.pattern === "steady-strong" && !r.hasSignificantDrop);
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
