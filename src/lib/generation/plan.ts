/**
 * Distribution planning for stand-alone MCQs: turns a request's selections into one spec per item
 * (domain × taxonomy × cluster, plus topic and difficulty when chosen) with exact per-axis totals.
 * Moved here from scripts/generate-questions.ts so the teacher UI can show the same plan before anything runs.
 */
import { mixWeights, type McqSelections, type TopicRef } from "./request";
import { CLUSTERS, DOMAINS, MCQ_DIFFICULTIES, TAXONOMY, type McqDifficulty } from "./taxonomy";

/** Largest-remainder rounding: counts per code that sum exactly to `total`. Zero-weight codes get nothing. */
export function apportion(total: number, weights: { code: string; pct: number }[]): Record<string, number> {
  const sum = weights.reduce((a, w) => a + w.pct, 0);
  const raw = weights.map(w => ({ code: w.code, exact: sum ? (total * w.pct) / sum : 0 }));
  const out: Record<string, number> = {};
  let used = 0;
  for (const r of raw) { out[r.code] = Math.floor(r.exact); used += out[r.code]; }
  const live = raw.filter(r => r.exact > 0).sort((a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)));
  for (let i = 0; used < total && live.length; i++, used++) out[live[i % live.length].code]++;
  return out;
}

/** Deterministic interleave so each axis' totals are exact and the mix is spread evenly. */
export function spread(counts: Record<string, number>): string[] {
  const out: string[] = [];
  const pool = Object.entries(counts).map(([code, n]) => ({ code, n, acc: 0 }));
  const total = pool.reduce((a, p) => a + p.n, 0);
  for (let i = 0; i < total; i++) {
    for (const p of pool) p.acc += p.n;
    const pick = pool.reduce((a, b) => (b.acc > a.acc ? b : a));
    pick.acc -= total; out.push(pick.code);
  }
  return out;
}

export type McqSpec = { n: number; domain: string; taxonomy: string; cluster: string; topic?: TopicRef; difficulty?: McqDifficulty };
export type McqPlan = {
  dCounts: Record<string, number>; tCounts: Record<string, number>; cCounts: Record<string, number>;
  topicCounts?: Record<string, number>; difficultyCounts?: Record<string, number>; specs: McqSpec[];
};

const rot = <T,>(arr: T[], k: number) => arr.slice(k).concat(arr.slice(0, k));

/**
 * `withDifficulty` false (generation-rules drop_difficulty) leaves difficulty off every spec.
 * A topic without a cluster takes the cluster the cluster axis would have given that slot.
 */
export function buildMcqPlan(total: number, sel: McqSelections = {}, opts: { withDifficulty?: boolean } = {}): McqPlan {
  const dCounts = apportion(total, mixWeights(DOMAINS, sel.domains));
  const tCounts = apportion(total, mixWeights(TAXONOMY, sel.taxonomy));
  const d = spread(dCounts), t = spread(tCounts);
  // rotate the secondary axes so the same domain doesn't always get the same taxonomy
  const t2 = rot(t, Math.floor(total / 3));

  let c2: string[], topics: (TopicRef | undefined)[] = [], topicCounts: Record<string, number> | undefined;
  const clusterSlots = rot(spread(apportion(total, mixWeights(CLUSTERS, sel.clusters))), Math.floor(total / 2));
  if (sel.topics?.length) {
    const byName = new Map(sel.topics.map(x => [x.name, x]));
    topicCounts = apportion(total, sel.topics.map(x => ({ code: x.name, pct: 1 })));
    topics = rot(spread(topicCounts), Math.floor(total / 2)).map(name => byName.get(name));
    c2 = topics.map((tp, i) => tp?.cluster ?? clusterSlots[i]);
  } else c2 = clusterSlots;
  const cCounts: Record<string, number> = Object.fromEntries(CLUSTERS.map(c => [c.code, c2.filter(x => x === c.code).length]));

  let diffs: (McqDifficulty | undefined)[] = [], difficultyCounts: Record<string, number> | undefined;
  if (opts.withDifficulty !== false && sel.difficulty) {
    difficultyCounts = apportion(total, mixWeights(MCQ_DIFFICULTIES.map(x => ({ code: x, pct: 1 })), sel.difficulty));
    diffs = rot(spread(difficultyCounts), Math.floor(total / 4)) as McqDifficulty[];
  }

  const specs: McqSpec[] = d.map((domain, i) => ({
    n: i + 1, domain, taxonomy: t2[i], cluster: c2[i],
    ...(topics[i] ? { topic: topics[i] } : {}), ...(diffs[i] ? { difficulty: diffs[i] } : {}),
  }));
  return { dCounts, tCounts, cCounts, ...(topicCounts ? { topicCounts } : {}), ...(difficultyCounts ? { difficultyCounts } : {}), specs };
}
