/**
 * NRG — semantic de-duplication of the question bank (AI pool first).
 *
 * The token-overlap check in fix-option-cues.ts (stop-worded Jaccard) catches reworded
 * duplicates but not rewritten ones: two failure-to-thrive infants, three TB-isolation
 * items, three panic attacks. This tool finds those with a local embedding model
 * (Ollama — no paid API), then leaves the judgement to a reviewer: a candidate cluster
 * is only retired after a person or agent has written a verdict for it.
 *
 *   npx tsx scripts/dedup-bank.ts --embed       [--model nomic-embed-text] [--recipe stem_answer]
 *   npx tsx scripts/dedup-bank.ts --eval        compare models/recipes on the known duplicate pairs
 *   npx tsx scripts/dedup-bank.ts --candidates  [--threshold 0.86] [--cross-threshold 0.88] [--cap 8]
 *   npx tsx scripts/dedup-bank.ts --report      writes docs/phase-1/DEDUP_REPORT.md from the verdicts
 *   npx tsx scripts/dedup-bank.ts --apply       [--commit]   staging only; dry run without --commit
 *   npx tsx scripts/dedup-bank.ts --prod-sql    writes the prod SQL (never runs it)
 *   npx tsx scripts/dedup-bank.ts --status      review-queue counts on staging
 *
 * Files:
 *   scripts/data/dedup/emb-<model>-<recipe>.json   embedding cache, keyed by source_id + text hash (gitignored)
 *   scripts/data/dedup/candidates.json             clusters with stems and options, for the reviewer (gitignored)
 *   docs/phase-1/dedup-verdicts.json               reviewer verdicts: ids + one-line reasons, no stems (committed)
 *
 * Verdict file shape: { clusters: [{ id, verdict: "duplicate"|"distinct"|"mixed", keep: source_id,
 *   retire: [{ source_id, reason }], reason, distinct_note? }] }. A retire entry always names its keeper.
 *
 * Retirement follows the review-bank.ts "retire" convention exactly: review_status = 'rejected',
 * is_active = false, a review_notes line "[dedup-v1 <date>] RETIRED: Duplicate of <keeper>, which is kept (<reason>)."
 * Guards: only ai:* rows that are inactive and not approved are ever touched; Jade's (jade:*) and anything
 * approved or live are reported, never changed. Every changed row is copied to a staging backup table first,
 * and a rollback SQL file is written next to the prod SQL.
 *
 * STAGING ONLY for writes. Reads NEXT_PUBLIC_SUPABASE_URL_STAGING / SUPABASE_SERVICE_ROLE_KEY_STAGING and
 * SUPABASE_DB_PASSWORD_STAGING (pooler) from .env.local.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const has = (n: string) => args.includes(`--${n}`);
const STAGING_REF = "kwhaqhhwqykckarjbdod";
const DIR = "scripts/data/dedup";
const VERDICTS = "docs/phase-1/dedup-verdicts.json";
const REPORT = "docs/phase-1/DEDUP_REPORT.md";
const TAG = "dedup-v1";
const BACKUP = "_backup_dedup_questions_20261017";
const PROD_DIR = flag("prod-dir") ?? "data/review/prod-port";
const OLLAMA = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
const MODEL = flag("model") ?? "nomic-embed-text";
const RECIPE = (flag("recipe") ?? "stem_answer") as Recipe;
type Recipe = "stem" | "stem_answer" | "stem_options";

function loadEnv() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith("#") && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv();
function staging(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL_STAGING ?? process.env.SUPABASE_URL_STAGING;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY_STAGING;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL_STAGING / SUPABASE_SERVICE_ROLE_KEY_STAGING");
  if (!url.includes(STAGING_REF)) throw new Error(`Refusing: ${url} is not the staging project`);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
async function stagingPg() {
  const pw = process.env.SUPABASE_DB_PASSWORD_STAGING;
  if (!pw) throw new Error("SUPABASE_DB_PASSWORD_STAGING missing");
  const { Client } = await import("pg");
  const c = new Client({ connectionString: `postgresql://postgres.${STAGING_REF}:${encodeURIComponent(pw)}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`, ssl: { rejectUnauthorized: false } });
  await c.connect();
  return c;
}
const readJson = (p: string) => JSON.parse(readFileSync(resolve(p), "utf8"));
const writeJson = (p: string, v: unknown) => { mkdirSync(dirname(resolve(p)), { recursive: true }); writeFileSync(resolve(p), JSON.stringify(v, null, 1)); };
const sha = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 16);
function lit(v: string | null | undefined): string {
  if (v === null || v === undefined) return "NULL";
  let tag = "nrg";
  while (v.includes(`$${tag}$`)) tag += "x";
  return `$${tag}$${v}$${tag}$`;
}

// ─── Bank snapshot ───────────────────────────────────────────────────────────
type Q = {
  id: string; source_id: string; pool: "ai" | "jade" | "proto"; review_status: string; is_active: boolean; reviewed: boolean;
  created_at: string; domain: string | null; topic: string | null; stem: string; options: { text: string; correct: boolean; rationale: string | null }[];
  notes: string;
};
async function fetchBank(): Promise<Q[]> {
  const db = staging();
  const { data: doms } = await db.from("domains").select("id, code");
  const dom = new Map((doms ?? []).map(d => [d.id as number, d.code as string]));
  const topics: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("topics").select("id, name").range(from, from + 999);
    if (error) throw error; topics.push(...data!); if (data!.length < 1000) break;
  }
  const top = new Map(topics.map(t => [t.id as number, t.name as string]));
  const qs: any[] = [];
  for (const like of ["ai:%", "jade:%", "proto:%"]) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from("questions")
        .select("id, source_id, review_status, is_active, reviewed_by, created_at, domain_id, topic_id, body, review_notes")
        .like("source_id", like).order("source_id").range(from, from + 999);
      if (error) throw error; qs.push(...data!); if (data!.length < 1000) break;
    }
  }
  const opts = new Map<string, any[]>();
  for (let i = 0; i < qs.length; i += 200) {
    // 200 questions x 4 options stays under PostgREST's 1,000-row cap (300 silently truncated).
    const { data, error } = await db.from("question_options").select("question_id, body, is_correct, rationale, display_order").in("question_id", qs.slice(i, i + 200).map(q => q.id));
    if (error) throw error;
    for (const o of data!) { if (!opts.has(o.question_id)) opts.set(o.question_id, []); opts.get(o.question_id)!.push(o); }
  }
  const short = qs.filter(q => !(opts.get(q.id) ?? []).some(o => o.is_correct)).length;
  if (short) throw new Error(`${short} questions came back without a keyed option: option fetch truncated?`);
  return qs.map(q => ({
    id: q.id, source_id: q.source_id, pool: q.source_id.split(":")[0], review_status: q.review_status, is_active: q.is_active,
    reviewed: !!q.reviewed_by, created_at: q.created_at, domain: dom.get(q.domain_id) ?? null, topic: top.get(q.topic_id) ?? null,
    stem: q.body ?? "", notes: q.review_notes ?? "",
    options: (opts.get(q.id) ?? []).sort((a, b) => a.display_order - b.display_order).map(o => ({ text: o.body, correct: o.is_correct, rationale: o.rationale })),
  }));
}
function text(q: Q, recipe: Recipe): string {
  const ans = q.options.filter(o => o.correct).map(o => o.text).join(" / ");
  if (recipe === "stem") return q.stem;
  if (recipe === "stem_answer") return `${q.stem}\nAnswer: ${ans}`;
  return `${q.stem}\nOptions: ${q.options.map(o => o.text).join(" | ")}\nAnswer: ${ans}`;
}

// ─── Embeddings (Ollama, cached) ─────────────────────────────────────────────
const cachePath = (model: string, recipe: Recipe) => `${DIR}/emb-${model.replace(/[^a-z0-9.-]/gi, "_")}-${recipe}.json`;
async function ollamaEmbed(model: string, inputs: string[]): Promise<number[][]> {
  // nomic-embed-text expects a task prefix; mxbai works without one for symmetric similarity.
  const pre = model.startsWith("nomic") ? "clustering: " : "";
  const r = await fetch(`${OLLAMA}/api/embed`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model, input: inputs.map(s => pre + s), truncate: true }) });
  if (!r.ok) throw new Error(`ollama ${r.status}: ${await r.text()}`);
  return (await r.json()).embeddings;
}
async function embed(bank: Q[], model: string, recipe: Recipe) {
  const p = cachePath(model, recipe);
  const cache: Record<string, { h: string; v: number[] }> = existsSync(p) ? readJson(p) : {};
  const todo = bank.filter(q => cache[q.source_id]?.h !== sha(text(q, recipe)));
  console.log(`${model}/${recipe}: ${bank.length - todo.length} cached, ${todo.length} to embed`);
  for (let i = 0; i < todo.length; i += 64) {
    const chunk = todo.slice(i, i + 64);
    const vs = await ollamaEmbed(model, chunk.map(q => text(q, recipe)));
    chunk.forEach((q, j) => { cache[q.source_id] = { h: sha(text(q, recipe)), v: vs[j].map(x => Math.round(x * 1e5) / 1e5) }; });
    if ((i / 64) % 10 === 0) process.stdout.write(`  ${i + chunk.length}/${todo.length}\r`);
  }
  writeJson(p, cache);
  const out = new Map<string, Float32Array>();
  const norm = (v: Float32Array) => { let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1; for (let k = 0; k < v.length; k++) v[k] /= n; return v; };
  for (const q of bank) out.set(q.source_id, norm(Float32Array.from(cache[q.source_id].v)));
  // Centre on the bank mean (default). Every item is "a nursing exam question", which puts all raw
  // cosines in a narrow 0.85–0.97 band; removing the shared direction spreads them so a threshold means something.
  if (!has("no-center")) {
    const dim = out.values().next().value!.length, mean = new Float32Array(dim);
    for (const v of out.values()) for (let k = 0; k < dim; k++) mean[k] += v[k] / out.size;
    for (const v of out.values()) { for (let k = 0; k < dim; k++) v[k] -= mean[k]; norm(v); }
  }
  return out;
}
const dot = (a: Float32Array, b: Float32Array) => { let s = 0; for (let k = 0; k < a.length; k++) s += a[k] * b[k]; return s; };

// ─── Known duplicate pairs (for choosing model/recipe/threshold) ─────────────
// Earlier reviewer retirements recorded "Duplicate of <source_id>" in review_notes.
function knownPairs(bank: Q[]): [string, string][] {
  const ids = new Set(bank.map(q => q.source_id));
  const pairs: [string, string][] = [];
  for (const q of bank) {
    for (const m of q.notes.matchAll(/(?:RETIRED|FLAG \([^)]*duplicate[^)]*\))[^\n]*?[Dd]uplicat\w* (?:of|with) ((?:ai|proto|jade):[\w.:-]+\w)/g)) {
      if (ids.has(m[1]) && m[1] !== q.source_id) pairs.push([q.source_id, m[1]]);
    }
  }
  const seen = new Set<string>();
  return pairs.filter(([a, b]) => { const k = [a, b].sort().join("|"); if (seen.has(k)) return false; seen.add(k); return true; });
}
async function evaluate() {
  const bank = await fetchBank();
  const gold = knownPairs(bank);
  console.log(`${gold.length} known duplicate pairs from earlier review notes (${gold.filter(p => p.every(s => s.startsWith("ai:"))).length} ai-ai)`);
  const by = new Map(bank.map(q => [q.source_id, q]));
  for (const model of (flag("models") ?? "nomic-embed-text,mxbai-embed-large").split(",")) {
    for (const recipe of (flag("recipes") ?? "stem,stem_answer,stem_options").split(",") as Recipe[]) {
      const E = await embed(bank, model, recipe);
      // Each gold pair: cosine, and the partner's rank among the item's neighbours in its pool pair.
      const sims: number[] = [], ranks: number[] = [];
      for (const [a, b] of gold) {
        const va = E.get(a)!, s = dot(va, E.get(b)!);
        const pool = by.get(b)!.pool;
        let rank = 1; for (const q of bank) if (q.pool === pool && q.source_id !== a && q.source_id !== b && dot(va, E.get(q.source_id)!) > s) rank++;
        sims.push(s); ranks.push(rank);
      }
      // Background: the nearest-neighbour similarity for every AI item (most items are NOT duplicated).
      const ai = bank.filter(q => q.pool === "ai");
      const nn = ai.map(q => { let m = -1; const v = E.get(q.source_id)!; for (const r of ai) if (r !== q) m = Math.max(m, dot(v, E.get(r.source_id)!)); return m; }).sort((x, y) => x - y);
      const pct = (arr: number[], p: number) => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))];
      const sorted = [...sims].sort((x, y) => x - y);
      const top1 = ranks.filter(r => r === 1).length, top5 = ranks.filter(r => r <= 5).length;
      console.log(`${model.padEnd(18)} ${recipe.padEnd(12)} gold cos p10 ${pct(sorted, .1).toFixed(3)} median ${pct(sorted, .5).toFixed(3)} | partner rank1 ${top1}/${gold.length} top5 ${top5}/${gold.length} | AI nn-cos median ${pct(nn, .5).toFixed(3)} p90 ${pct(nn, .9).toFixed(3)} | gold-median above ${(nn.filter(x => x < pct(sorted, .5)).length / nn.length * 100).toFixed(0)}% of nn`);
    }
  }
}

// ─── Candidates and clusters ─────────────────────────────────────────────────
type Pair = { a: string; b: string; cos: number };
function components(nodes: string[], pairs: Pair[], thr: number): string[][] {
  const parent = new Map(nodes.map(n => [n, n]));
  const find = (x: string): string => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x)!)!); x = parent.get(x)!; } return x; };
  for (const p of pairs) if (p.cos >= thr) parent.set(find(p.a), find(p.b));
  const groups = new Map<string, string[]>();
  for (const n of nodes) { const r = find(n); if (!groups.has(r)) groups.set(r, []); groups.get(r)!.push(n); }
  return [...groups.values()].filter(g => g.length > 1);
}
// Union-find with a cap: a component larger than `cap` is re-split at a higher threshold until every piece fits.
function cluster(pairs: Pair[], thr: number, cap: number): { members: string[]; split_at: number }[] {
  const out: { members: string[]; split_at: number }[] = [];
  const go = (nodes: string[], t: number) => {
    const inside = new Set(nodes);
    const ps = pairs.filter(p => inside.has(p.a) && inside.has(p.b));
    for (const g of components(nodes, ps, t)) {
      if (g.length <= cap || t >= 0.995) out.push({ members: g, split_at: t });
      else go(g, Math.round((t + 0.01) * 1000) / 1000);
    }
  };
  go([...new Set(pairs.flatMap(p => [p.a, p.b]))], thr);
  return out;
}
async function candidates() {
  const thr = Number(flag("threshold") ?? 0.65), cap = Number(flag("cap") ?? 12);
  // Cross-pool thresholds: AI vs Jade decides retirements (Jade's original wins), so it is set lower for recall;
  // AI vs prototype-import is report-only.
  const xthrJade = Number(flag("jade-threshold") ?? 0.6), xthrProto = Number(flag("proto-threshold") ?? 0.7);
  const xthr = (pool: string) => pool === "jade" ? xthrJade : xthrProto;
  const bank = await fetchBank();
  const E = await embed(bank, MODEL, RECIPE);
  const by = new Map(bank.map(q => [q.source_id, q]));
  // Retired items are already out of the queue; they are kept only as cross references.
  const ai = bank.filter(q => q.pool === "ai" && q.review_status !== "rejected");
  const others = bank.filter(q => q.pool !== "ai" && q.review_status !== "rejected");
  const within: Pair[] = [], cross: Pair[] = [];
  for (let i = 0; i < ai.length; i++) {
    const v = E.get(ai[i].source_id)!;
    for (let j = i + 1; j < ai.length; j++) { const c = dot(v, E.get(ai[j].source_id)!); if (c >= thr) within.push({ a: ai[i].source_id, b: ai[j].source_id, cos: c }); }
    for (const o of others) { const c = dot(v, E.get(o.source_id)!); if (c >= xthr(o.pool)) cross.push({ a: ai[i].source_id, b: o.source_id, cos: c }); }
  }
  // Keep an edge only when one item is among the other's k nearest AI neighbours: duplicates are near-neighbours,
  // and this stops generic "hub" items (four-client prioritisation, delegation) chaining whole topics together.
  const knn = Number(flag("knn") ?? 3);
  const nbrs = new Map<string, Pair[]>();
  for (const p of within) for (const s of [p.a, p.b]) { if (!nbrs.has(s)) nbrs.set(s, []); nbrs.get(s)!.push(p); }
  const top = new Set<Pair>();
  for (const ps of nbrs.values()) ps.sort((x, y) => y.cos - x.cos).slice(0, knn).forEach(p => top.add(p));
  const allWithin = within.length;
  const kept = within.filter(p => top.has(p));
  within.length = 0; within.push(...kept);
  const clustered = cluster(within, thr, cap);
  const where = new Map<string, number>(); clustered.forEach((c, i) => c.members.forEach(m => where.set(m, i)));
  const severed = within.filter(p => where.get(p.a) !== where.get(p.b));
  console.log(`${allWithin} AI-AI pairs >= ${thr}; ${kept.length} kept by top-${knn}; ${severed.length} cut by the size cap (listed per cluster as "links")`);
  const clusters = clustered.map((c, i) => {
    const members = c.members.sort();
    const ps = within.filter(p => members.includes(p.a) && members.includes(p.b)).sort((x, y) => y.cos - x.cos);
    return { id: `A${String(i + 1).padStart(3, "0")}`, split_at: c.split_at, max_cos: +ps[0].cos.toFixed(3), pairs: ps.map(p => [p.a, p.b, +p.cos.toFixed(3)]), members,
      links: severed.filter(p => members.includes(p.a) !== members.includes(p.b)).map(p => [p.a, p.b, +p.cos.toFixed(3)]) };
  }).sort((x, y) => y.max_cos - x.max_cos).map((c, i) => ({ ...c, id: `A${String(i + 1).padStart(3, "0")}` }));
  // Cross-pool: one entry per (AI item, target pool), so an AI item with several Jade (or proto) matches is judged once.
  // J### = against Jade's questions (retirement candidates), P### = against the prototype import (report only).
  const xa = new Map<string, Pair[]>();
  for (const p of cross) { const k = `${p.a}|${p.b.split(":")[0]}`; if (!xa.has(k)) xa.set(k, []); xa.get(k)!.push(p); }
  const xclusters = (["jade", "proto"] as const).flatMap(pool => [...xa.entries()].filter(([k]) => k.endsWith(`|${pool}`))
    .map(([k, ps]) => ({ ai: k.split("|")[0], target_pool: pool, matches: ps.sort((x, y) => y.cos - x.cos).slice(0, 4).map(p => [p.b, +p.cos.toFixed(3)]) }))
    .sort((x, y) => (y.matches[0][1] as number) - (x.matches[0][1] as number))
    .map((c, i) => ({ id: `${pool === "jade" ? "J" : "P"}${String(i + 1).padStart(3, "0")}`, ...c })));
  const show = (s: string) => { const q = by.get(s)!; return { source_id: s, pool: q.pool, status: q.review_status, active: q.is_active, reviewed: q.reviewed, domain: q.domain, topic: q.topic, created_at: q.created_at, stem: q.stem, options: q.options.map(o => `${o.correct ? "*" : " "} ${o.text}`), has_all_rationales: q.options.every(o => (o.rationale ?? "").length > 20) }; };
  const items: Record<string, unknown> = {};
  for (const c of clusters) for (const m of [...c.members, ...c.links.flatMap(l => [l[0], l[1]] as string[])]) items[m] = show(m);
  for (const c of xclusters) { items[c.ai] = show(c.ai); for (const [s] of c.matches) items[s as string] = show(s as string); }
  writeJson(`${DIR}/candidates.json`, { generated_at: new Date().toISOString(), model: MODEL, recipe: RECIPE, threshold: thr, jade_threshold: xthrJade, proto_threshold: xthrProto, cap, knn,
    ai_items: ai.length, within_pairs: within.length, cross_pairs: cross.length, clusters, cross_clusters: xclusters, items });
  const sizes = clusters.reduce((m, c) => (m[c.members.length] = (m[c.members.length] ?? 0) + 1, m), {} as Record<number, number>);
  console.log(`${MODEL}/${RECIPE} thr ${thr}: ${within.length} AI-AI pairs → ${clusters.length} clusters (${clusters.reduce((s, c) => s + c.members.length, 0)} items; sizes ${JSON.stringify(sizes)}); cross thr jade ${xthrJade} / proto ${xthrProto}: ${cross.length} pairs over ${xclusters.length} AI items (jade ${xclusters.filter(c => c.target_pool === "jade").length}, proto ${xclusters.filter(c => c.target_pool === "proto").length}) → ${DIR}/candidates.json`);
}

// ─── Reviewer batches ────────────────────────────────────────────────────────
// --batches writes scripts/data/dedup/batches/<kind>NN.in.json for reviewers (docs/phase-1/DEDUP_BRIEF.md);
// each reviewer writes the matching .out.json; --merge folds them into docs/phase-1/dedup-verdicts.json.
async function batches() {
  const cand = readJson(`${DIR}/candidates.json`);
  const perBatch = Number(flag("items-per-batch") ?? 130);
  const out: Record<string, any[]> = {};
  let n = 0, size = 0, cur: any[] = [];
  const flush = (kind: string) => { if (cur.length) { out[`${kind}${String(n).padStart(2, "0")}`] = cur; n++; cur = []; size = 0; } };
  for (const c of cand.clusters) {
    const linked = [...new Set((c.links as [string, string, number][]).flatMap(([a, b]) => [a, b]).filter(x => !c.members.includes(x)))];
    cur.push({ id: c.id, members: c.members, pairs: c.pairs, links: c.links, items: Object.fromEntries([...c.members, ...linked].map(s => [s, cand.items[s] ?? null])) });
    size += c.members.length + linked.length;
    if (size >= perBatch) flush("a");
  }
  flush("a"); n = 0;
  // Orphans: items the size cap split off into no cluster at all. Each is judged against the members it linked to.
  const mem = new Set(cand.clusters.flatMap((c: any) => c.members));
  const orph = new Map<string, Set<string>>();
  for (const c of cand.clusters) for (const [a, b] of c.links as [string, string, number][]) for (const [x, y] of [[a, b], [b, a]]) if (!mem.has(x)) { if (!orph.has(x)) orph.set(x, new Set()); orph.get(x)!.add(y); }
  [...orph.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([o, ys], i) => {
    const members = [o, ...ys];
    cur.push({ id: `O${String(i + 1).padStart(3, "0")}`, orphan: o, members, pairs: [], links: [], items: Object.fromEntries(members.map(s => [s, cand.items[s] ?? null])) });
  });
  flush("o"); n = 0;
  for (const pool of ["jade", "proto"]) {
    const kind = pool === "jade" ? "j" : "p";
    for (const c of cand.cross_clusters.filter((x: any) => x.target_pool === pool)) {
      cur.push({ id: c.id, ai: c.ai, matches: c.matches, items: Object.fromEntries([c.ai, ...c.matches.map((m: any) => m[0])].map((s: string) => [s, cand.items[s] ?? null])) });
      size += 1 + c.matches.length;
      if (size >= perBatch * 1.5) flush(kind);
    }
    flush(kind); n = 0;
  }
  for (const [name, clusters] of Object.entries(out)) writeJson(`${DIR}/batches/${name}.in.json`, { batch: name, clusters });
  console.log(`Wrote ${Object.keys(out).length} batches to ${DIR}/batches: ${Object.entries(out).map(([k, v]) => `${k}=${v.length}`).join(" ")}`);
}
async function merge() {
  const { readdirSync } = await import("node:fs");
  const all = readdirSync(resolve(`${DIR}/batches`));
  const files = all.filter(f => f.endsWith(".out.json")).sort();
  const missing = all.filter(f => f.endsWith(".in.json") && !files.includes(f.replace(".in.json", ".out.json")));
  if (missing.length && !has("partial")) throw new Error(`no verdicts yet for ${missing.join(", ")} (pass --partial to merge anyway)`);
  const prev = existsSync(VERDICTS) ? readJson(VERDICTS) : {};
  const clusters: any[] = [], cross: any[] = [];
  for (const f of files) {
    const batch = readJson(`${DIR}/batches/${f.replace(".out.json", ".in.json")}`).clusters;
    const inIds = new Set<string>(batch.map((c: any) => c.id));
    const doc = readJson(`${DIR}/batches/${f}`);
    for (const v of doc.clusters ?? doc) {
      if (!inIds.has(v.id)) throw new Error(`${f}: verdict for ${v.id}, which is not in its batch`);
      const c = batch.find((x: any) => x.id === v.id);
      if (c.ai) v.ai = c.ai;
      for (const g of v.groups ?? []) for (const s of [g.keep, ...(g.retire ?? []).map((r: any) => r.source_id)]) if (!(s in c.items)) throw new Error(`${f} ${v.id}: ${s} is not in that cluster`);
      if (v.match && !(v.match in c.items)) throw new Error(`${f} ${v.id}: match ${v.match} is not in that entry`);
      (/^[AO]/.test(String(v.id)) ? clusters : cross).push(v);
      inIds.delete(v.id);
    }
    if (inIds.size) throw new Error(`${f}: no verdict for ${[...inIds].join(", ")}`);
  }
  const cand = readJson(`${DIR}/candidates.json`);
  writeJson(VERDICTS, { ...prev, candidates: { model: cand.model, recipe: cand.recipe, threshold: cand.threshold, jade_threshold: cand.jade_threshold, proto_threshold: cand.proto_threshold, cap: cand.cap, knn: cand.knn, generated_at: cand.generated_at },
    clusters: clusters.sort((a, b) => a.id.localeCompare(b.id)), cross: cross.sort((a, b) => a.id.localeCompare(b.id)) });
  console.log(`Merged ${files.length} batch files → ${VERDICTS}: ${clusters.length} AI clusters, ${cross.length} cross-pool entries.`);
}

// ─── Verdicts → retirements ──────────────────────────────────────────────────
// AI cluster verdict: { id, verdict: duplicate|mixed|distinct, reason, groups: [{ keep, retire: [{ source_id, reason }], reason }] }
// Cross verdict:      { id, ai, verdict: duplicate|distinct, match?: <jade/proto source_id>, reason }
type Group = { keep: string; retire: { source_id: string; reason: string }[]; reason?: string };
type Verdict = { id: string; verdict: "duplicate" | "distinct" | "mixed"; reason: string; groups?: Group[]; match?: string; ai?: string };
type Retire = { source_id: string; keeper: string; reason: string; cluster: string };
const NOT_A_KEEPER = ["jade:nrg-qbank-starter-56:"];
function retirements(bank: Q[]) {
  const doc = readJson(VERDICTS);
  const by = new Map(bank.map(q => [q.source_id, q]));
  const problems: string[] = [], reported: (Retire & { why: string })[] = [];
  const want = new Map<string, Retire>();
  // 1. AI items duplicating Jade's questions: Jade's original wins.
  for (const v of (doc.cross ?? []) as Verdict[]) {
    if (!v.id.startsWith("J") || v.verdict !== "duplicate") continue;
    if (!v.ai || !v.match) { problems.push(`${v.id}: duplicate verdict needs ai and match`); continue; }
    // nrg-qbank-starter-56 was never live on prod and carries a known miskey pattern (PROGRESS 2026-10-05), so it does
    // not out-rank an AI item; those pairs are reported, and the AI item is left to its AI-AI cluster verdict.
    if (NOT_A_KEEPER.some(p => v.match!.startsWith(p))) { reported.push({ source_id: v.ai, keeper: v.match, reason: v.reason, cluster: v.id, why: "Jade item never live (qbank-starter-56): reported only" }); continue; }
    want.set(v.ai, { source_id: v.ai, keeper: v.match, reason: v.reason, cluster: v.id });
  }
  // 2. AI-AI groups. If the AI keeper itself duplicates a Jade question, its group is retired in favour of that Jade item.
  for (const v of (doc.clusters ?? []) as Verdict[]) {
    for (const g of v.groups ?? []) {
      for (const r of g.retire ?? []) {
        if (want.has(r.source_id)) continue;
        want.set(r.source_id, { source_id: r.source_id, keeper: g.keep, reason: r.reason, cluster: v.id });
      }
    }
  }
  const list: Retire[] = [];
  for (const r of want.values()) {
    const q = by.get(r.source_id);
    if (!q) { problems.push(`${r.cluster}: ${r.source_id} not found`); continue; }
    if (!by.has(r.keeper)) { problems.push(`${r.cluster}: keeper ${r.keeper} not found`); continue; }
    if (q.pool !== "ai") { problems.push(`${r.cluster}: ${r.source_id} is not an AI item; refusing`); continue; }
    if (q.is_active || q.review_status === "approved") { reported.push({ ...r, why: "approved/live: reported, not changed" }); continue; }
    list.push(r);
  }
  // Chains (A retired for B, B retired for C) point at the final keeper.
  const retired = new Map(list.map(x => [x.source_id, x]));
  for (const x of list) {
    let k = x.keeper, hops = 0;
    while (retired.has(k) && hops++ < 20) k = retired.get(k)!.keeper;
    if (retired.has(k)) { problems.push(`${x.source_id}: keeper cycle`); continue; }
    if (k !== x.keeper) { x.reason = `${x.reason}; ${x.keeper} is itself a duplicate of ${k}`; x.keeper = k; }
  }
  for (const x of list) if (by.get(x.keeper)!.review_status === "rejected" && !retired.has(x.keeper)) problems.push(`${x.source_id}: keeper ${x.keeper} was already retired earlier`);
  return { list, problems, reported };
}
const noteFor = (r: { keeper: string; reason: string }, date: string) => `[${TAG} ${date}] RETIRED: Duplicate of ${r.keeper}, which is kept (${r.reason.replace(/\.$/, "")}).`;

async function apply() {
  const commit = has("commit");
  const bank = await fetchBank();
  const { list, problems } = retirements(bank);
  if (problems.length) { console.error(problems.join("\n")); console.error("Refusing: fix the verdict file first."); process.exit(1); }
  const date = flag("date") ?? "2026-10-17";
  const by = new Map(bank.map(q => [q.source_id, q]));
  const todo = list.filter(r => by.get(r.source_id)!.review_status !== "rejected");
  console.log(`${list.length} retirements in verdicts; ${list.length - todo.length} already retired; ${todo.length} to apply.`);
  writeRollback(list);
  if (!commit) { console.log("DRY RUN (add --commit)."); return; }
  const c = await stagingPg();
  try {
    await c.query("BEGIN");
    await c.query(`CREATE TABLE IF NOT EXISTS public.${BACKUP} AS SELECT * FROM public.questions WITH NO DATA`);
    await c.query(`ALTER TABLE public.${BACKUP} ENABLE ROW LEVEL SECURITY`);
    let n = 0;
    for (const r of todo) {
      // Back up the row exactly as it is now (once), then retire it behind the same guards the prod SQL uses.
      await c.query(`INSERT INTO public.${BACKUP} SELECT q.* FROM public.questions q WHERE q.source_id = $1 AND NOT EXISTS (SELECT 1 FROM public.${BACKUP} b WHERE b.source_id = q.source_id)`, [r.source_id]);
      const u = await c.query(`UPDATE public.questions q SET review_status = 'rejected', is_active = false, review_notes = concat_ws(E'\\n', q.review_notes, $2::text), updated_at = now()
        WHERE q.source_id = $1 AND q.source_id LIKE 'ai:%' AND q.is_active = false AND q.review_status <> 'approved' AND q.review_status <> 'rejected'`, [r.source_id, noteFor(r, date)]);
      n += u.rowCount ?? 0;
    }
    if (n !== todo.length) throw new Error(`expected ${todo.length} updates, got ${n}; rolled back`);
    await c.query("COMMIT");
    console.log(`APPLIED on staging: ${n} retired; backup in public.${BACKUP}.`);
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { await c.end(); }
}
function writeRollback(list: { source_id: string }[]) {
  const ids = list.map(r => lit(r.source_id)).join(",\n  ");
  const sql = [
    `-- NRG dedup-v1 rollback (staging). Restores review_status, is_active, review_notes and updated_at from public.${BACKUP}.`,
    `-- Generated by scripts/dedup-bank.ts. Safe to re-run; touches only rows present in the backup table.`,
    "BEGIN;",
    `UPDATE public.questions q SET review_status = b.review_status, is_active = b.is_active, review_notes = b.review_notes, updated_at = b.updated_at`,
    `FROM public.${BACKUP} b WHERE b.id = q.id AND q.source_id IN (\n  ${ids}\n);`,
    "COMMIT;", "",
  ].join("\n");
  writeFileSync(resolve("scripts/sql/dedup-v1-rollback-staging.sql"), sql);
  console.log("Wrote scripts/sql/dedup-v1-rollback-staging.sql");
}
async function prodSql() {
  const bank = await fetchBank();
  const { list, problems } = retirements(bank);
  if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
  const date = flag("date") ?? "2026-10-17";
  const out = [
    "-- NRG: semantic dedup (dedup-v1) of the AI bank, staging -> prod. Generated by scripts/dedup-bank.ts --prod-sql.",
    "-- RUN AFTER ai-port.sql (the AI-bank port): the guards expect the ported, pending AI rows.",
    "-- Keyed by source_id. Touches only ai:* rows that are inactive and not approved/rejected; anything live is skipped.",
    "BEGIN;",
    `CREATE TABLE IF NOT EXISTS public.${BACKUP} AS SELECT * FROM public.questions WITH NO DATA;`,
    `ALTER TABLE public.${BACKUP} ENABLE ROW LEVEL SECURITY;`,
    "CREATE TEMP TABLE _dedup_log (source_id text, n int) ON COMMIT DROP;",
  ];
  for (const r of list) {
    const s = lit(r.source_id);
    out.push(`INSERT INTO public.${BACKUP} SELECT q.* FROM public.questions q WHERE q.source_id = ${s} AND NOT EXISTS (SELECT 1 FROM public.${BACKUP} b WHERE b.source_id = q.source_id);`);
    out.push(`WITH u AS (UPDATE public.questions q SET review_status = 'rejected', is_active = false, review_notes = concat_ws(E'\\n', q.review_notes, ${lit(noteFor(r, date))}), updated_at = now() WHERE q.source_id = ${s} AND q.is_active = false AND q.review_status NOT IN ('approved', 'rejected') RETURNING 1) INSERT INTO _dedup_log SELECT ${s}, count(*) FROM u;`);
  }
  out.push(`-- Expected: n = 1 for all ${list.length} rows. n = 0 means a guard skipped it (live, approved, already rejected, or missing).`,
    "SELECT n, count(*) FROM _dedup_log GROUP BY 1 ORDER BY 1;", "COMMIT;", "");
  mkdirSync(resolve(PROD_DIR), { recursive: true });
  writeFileSync(resolve(`${PROD_DIR}/dedup-v1-prod.sql`), out.join("\n"));
  const rb = [
    `-- NRG dedup-v1 rollback (prod). Restores the retired rows from public.${BACKUP}.`,
    "BEGIN;",
    `UPDATE public.questions q SET review_status = b.review_status, is_active = b.is_active, review_notes = b.review_notes, updated_at = b.updated_at FROM public.${BACKUP} b WHERE b.id = q.id;`,
    "COMMIT;", "",
  ].join("\n");
  writeFileSync(resolve(`${PROD_DIR}/dedup-v1-prod-rollback.sql`), rb);
  console.log(`Wrote ${PROD_DIR}/dedup-v1-prod.sql (${list.length} retirements) and dedup-v1-prod-rollback.sql`);
  if (has("test-on-staging")) {
    // Syntax/mapping check against staging, rolled back. Staging rows are already retired, so the guard is relaxed.
    const c = await stagingPg();
    try {
      await c.query("BEGIN");
      await c.query(out.join("\n").replace(/^BEGIN;$/m, "").replace(/^COMMIT;$/m, "").replace(/AND q\.review_status NOT IN \('approved', 'rejected'\)/g, "AND q.review_status <> 'approved'").replace(new RegExp(BACKUP, "g"), "_dedup_dryrun_backup"));
      const r = await c.query("SELECT n, count(*)::int AS c FROM _dedup_log GROUP BY 1 ORDER BY 1");
      console.log("Dry run on staging (rolled back):", JSON.stringify(r.rows));
    } finally { await c.query("ROLLBACK"); await c.end(); }
  }
}

// ─── Report ──────────────────────────────────────────────────────────────────
async function report() {
  const doc = readJson(VERDICTS);
  const cand = readJson(`${DIR}/candidates.json`);
  const bank = await fetchBank();
  const by = new Map(bank.map(q => [q.source_id, q]));
  const short = (s: string) => s.replace(/^ai:ai-renr-2000-20260918:/, "ai:…:");
  const brief = (s: string) => { const t = (by.get(s)?.stem ?? "").replace(/\s+/g, " "); return t.length > 110 ? t.slice(0, 107) + "…" : t; };
  const cl: Verdict[] = doc.clusters ?? [], xc: (Verdict & { note?: string })[] = doc.cross ?? [];
  const jx = xc.filter(v => v.id.startsWith("J")), px = xc.filter(v => v.id.startsWith("P"));
  const count = (vs: { verdict: string }[], k: string) => vs.filter(v => v.verdict === k).length;
  const { list, reported } = retirements(bank);
  const esc = (s: string) => String(s ?? "").replace(/\|/g, "/").replace(/\s+/g, " ");
  const cc = (id: string) => cand.clusters.find((x: any) => x.id === id) ?? cand.cross_clusters.find((x: any) => x.id === id);
  // Pair-level precision by cosine band: a candidate pair is confirmed when both items sit in the same duplicate group.
  const groupOf = new Map<string, string>();
  for (const v of cl) (v.groups ?? []).forEach((g, i) => [g.keep, ...g.retire.map(r => r.source_id)].forEach(s => groupOf.set(s, `${v.id}/${i}`)));
  const bands = [0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 1.01];
  const bandRow = (pairs: [string, string, number][], isDup: (a: string, b: string) => boolean) => bands.slice(0, -1).map((lo, i) => {
    const inBand = pairs.filter(p => p[2] >= lo && p[2] < bands[i + 1]); const d = inBand.filter(p => isDup(p[0], p[1])).length;
    return `${d}/${inBand.length}${inBand.length ? ` (${Math.round(d / inBand.length * 100)}%)` : ""}`;
  });
  const aiPairs = cand.clusters.flatMap((c: any) => c.pairs) as [string, string, number][];
  const xPairs = (pool: string) => cand.cross_clusters.filter((c: any) => c.target_pool === pool).map((c: any) => [c.ai, c.matches[0][0], c.matches[0][1]]) as [string, string, number][];
  const xDup = new Set(xc.filter(v => v.verdict === "duplicate").map(v => v.id));
  const xIsDup = (pool: string) => (a: string) => { const c = cand.cross_clusters.find((x: any) => x.ai === a && x.target_pool === pool); return !!c && xDup.has(c.id); };
  const L: string[] = [];
  L.push("# Semantic dedup report (dedup-v1)", "", `Generated by \`npx tsx scripts/dedup-bank.ts --report\` on ${new Date().toISOString().slice(0, 10)}. Staging only (\`${STAGING_REF}\`). Verdicts: \`${VERDICTS}\`. Reviewer brief: \`docs/phase-1/DEDUP_BRIEF.md\`.`, "");
  L.push(doc.method_md ?? "", "");
  L.push("## Counts", "", "| | AI-AI clusters | AI vs Jade (J) | AI vs prototype import (P) |", "|---|---|---|---|",
    `| Candidates | ${cl.length} clusters, ${cl.reduce((s, c) => s + (cc(c.id)?.members.length ?? 0), 0)} items, ${aiPairs.length} judged pairs | ${jx.length} AI items | ${px.length} AI items |`,
    `| duplicate | ${count(cl, "duplicate")} | ${count(jx, "duplicate")} | ${count(px, "duplicate")} |`,
    `| mixed (some members duplicate) | ${count(cl, "mixed")} | — | — |`,
    `| distinct | ${count(cl, "distinct")} | ${count(jx, "distinct")} | ${count(px, "distinct")} |`,
    `| AI items retired on staging | ${list.filter(r => r.cluster.startsWith("A")).length} | ${list.filter(r => r.cluster.startsWith("J")).length} | 0 (report only) |`,
    `| Duplicates reported, not changed (approved/live AI item, or Jade item never live) | ${reported.filter(r => r.cluster.startsWith("A")).length} | ${reported.filter(r => r.cluster.startsWith("J")).length} | — |`, "",
    `**Total AI items retired: ${list.length}.**`, "");
  L.push("## Precision by similarity band", "", "Confirmed duplicates / candidate pairs, per cosine band (mean-centred mxbai-embed-large, stem + answer). Cross-pool rows use each AI item's closest match.", "",
    `| | ${bands.slice(0, -1).map((b, i) => `${b.toFixed(2)}–${i === bands.length - 2 ? "1" : bands[i + 1].toFixed(2)}`).join(" | ")} |`, `|---|${bands.slice(0, -1).map(() => "---").join("|")}|`,
    `| AI-AI pairs | ${bandRow(aiPairs, (a, b) => !!groupOf.get(a) && groupOf.get(a) === groupOf.get(b)).join(" | ")} |`,
    `| AI vs Jade | ${bandRow(xPairs("jade"), xIsDup("jade")).join(" | ")} |`,
    `| AI vs proto | ${bandRow(xPairs("proto"), xIsDup("proto")).join(" | ")} |`, "");
  L.push("## Retired AI items (AI-AI duplicates)", "", "| Cluster | Retired | Keeper | Reason |", "|---|---|---|---|");
  for (const r of list.filter(r => r.cluster.startsWith("A")).sort((a, b) => a.cluster.localeCompare(b.cluster))) L.push(`| ${r.cluster} | ${short(r.source_id)} | ${short(r.keeper)} | ${esc(r.reason)} |`);
  L.push("", "Keeper stems (short), for orientation:", "");
  for (const k of [...new Set(list.filter(r => r.cluster.startsWith("A")).map(r => r.keeper))].sort()) L.push(`- ${short(k)}: ${esc(brief(k))}`);
  L.push("", "## AI items retired as duplicates of Jade's questions (Jade's original wins)", "", "| Entry | Retired AI item | Jade's question | Jade item on staging | Reason |", "|---|---|---|---|---|");
  for (const r of list.filter(r => r.cluster.startsWith("J"))) L.push(`| ${r.cluster} | ${short(r.source_id)} | ${r.keeper} | ${by.get(r.keeper)?.is_active ? "approved, live" : "approved, inactive (live on prod for most sets)"} | ${esc(r.reason)} |`);
  if (reported.length) {
    L.push("", "## Duplicates reported, not changed (approved/live AI items; Jade items that were never live)", "", "| Cluster | Item | Duplicate of | Note |", "|---|---|---|---|");
    for (const r of reported) L.push(`| ${r.cluster} | ${short(r.source_id)} | ${short(r.keeper)} | ${esc(r.reason)} |`);
  }
  const jnotes = jx.filter(v => v.note);
  if (jnotes.length) { L.push("", "## Notes on Jade's own questions (reported to Jade; nothing changed)", ""); for (const v of jnotes) L.push(`- ${v.id} (${short(v.ai ?? "")}): ${esc(v.note!)}`); }
  L.push("", "## AI items that duplicate a prototype-import question (report only)", "", "The prototype pool is a separate import decision; nothing in it was changed. If both pools go live, these pairs repeat.", "",
    "| Entry | AI item | Prototype item | Reason |", "|---|---|---|---|");
  for (const v of px.filter(v => v.verdict === "duplicate")) L.push(`| ${v.id} | ${short(v.ai ?? "")} | ${v.match ?? ""} | ${esc(v.reason)} |`);
  L.push("", "## AI-AI candidate clusters judged distinct or partly distinct", "", "| Cluster | Verdict | Size | Why |", "|---|---|---|---|");
  for (const v of cl.filter(v => v.verdict !== "duplicate")) L.push(`| ${v.id} | ${v.verdict} | ${cc(v.id)?.members.length ?? "?"} | ${esc(v.reason)} |`);
  L.push("", doc.notes_md ?? "", "");
  writeFileSync(resolve(REPORT), L.join("\n"));
  console.log(`Wrote ${REPORT}`);
}

async function status() {
  const c = await stagingPg();
  try {
    const r = await c.query(`SELECT split_part(source_id, ':', 1) AS pool, review_status, is_active, count(*)::int AS n FROM public.questions
      WHERE source_id ~ '^(ai|jade|proto):' GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`);
    for (const x of r.rows) console.log(`${x.pool.padEnd(6)} ${x.review_status.padEnd(14)} active=${x.is_active} ${x.n}`);
    const d = await c.query(`SELECT count(*)::int AS n FROM public.questions WHERE review_notes LIKE '%[${TAG} %'`);
    console.log(`rows carrying a [${TAG}] note: ${d.rows[0].n}`);
  } finally { await c.end(); }
}

(async () => {
  if (has("embed")) { const bank = await fetchBank(); await embed(bank, MODEL, RECIPE); return; }
  if (has("eval")) return evaluate();
  if (has("candidates")) return candidates();
  if (has("batches")) return batches();
  if (has("merge")) return merge();
  if (has("report")) return report();
  if (has("apply")) return apply();
  if (has("prod-sql")) return prodSql();
  if (has("status")) return status();
  console.error("Use --embed, --eval, --candidates, --report, --apply [--commit], --prod-sql or --status (see header).");
  process.exit(2);
})().catch(e => { console.error("FATAL:", e.message ?? e); process.exit(1); });
