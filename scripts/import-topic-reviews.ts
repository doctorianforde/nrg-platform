/**
 * Jade's topic-review slide decks → content/topic-reviews/<slug>.json, and optionally into STAGING's topic_reviews.
 *
 *   npx tsx scripts/import-topic-reviews.ts            parse the 15 decks, write the JSON, print a completeness report
 *   npx tsx scripts/import-topic-reviews.ts --apply    also upsert them into staging (new reviews land as drafts; a
 *                                                      re-import replaces content but never changes status)
 *
 * Source: OKComputer_NRG_Website/{nrg_htn_review,nrg_medical_surgical_reviews} (gitignored, so the JSON is what travels).
 * Each deck is ten 1280×720 slides of absolutely positioned text boxes. Their element ids are semantic (x-title + x-body,
 * stepN-text, *-strip/seq/opposite-text callouts, pipe tables), so the text is recovered exactly and laid out again as
 * rows and columns that stack on a phone. The completeness check fails the run if any word of the source text is lost.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import yaml from "js-yaml";
import { CATALOG } from "../src/lib/topic-reviews/catalog";
import type { ReviewBlock, ReviewColumn, ReviewQuestion, ReviewSlide, TopicReviewDoc } from "../src/lib/topic-reviews/types";

const ROOT = resolve(__dirname, "..");
const SRC = join(ROOT, "OKComputer_NRG_Website");
const OUT = join(ROOT, "content/topic-reviews");
const apply = process.argv.includes("--apply");

type El = { id: string; x: number; y: number; w: number; h: number; html: string };
type Page = { pageType?: string; elements?: Array<{ elementId: string; elementType: string; bounds?: number[]; content?: { text?: unknown } }> };

// ── HTML clean-up ────────────────────────────────────────────────────────────────────────────────────────────────────

const BULLET = /^\s*(?:&#8226;|&bull;|•)\s*/;

/** Keep strong/em/b/i/br; colour spans become tr-warn / tr-good; every other tag and all attributes go. */
function inline(html: string): string {
  return html
    .replace(/<span[^>]*color:\s*\$accent[^>]*>([\s\S]*?)<\/span>/gi, '<span class="tr-warn">$1</span>')
    .replace(/<span[^>]*color:\s*\$success[^>]*>([\s\S]*?)<\/span>/gi, '<span class="tr-good">$1</span>')
    .replace(/<(\/?)(strong|em|b|i)\b[^>]*>/gi, (_m, close, tag) => `<${close}${{ b: "strong", i: "em" }[tag.toLowerCase() as "b" | "i"] ?? tag.toLowerCase()}>`)
    .replace(/<br\s*\/?>/gi, "<br>")
    .replace(/<(?!\/?(strong|em|br|span)\b|span class="tr-)[^>]*>/gi, "")
    .replace(/<span(?! class="tr-(warn|good)")[^>]*>/gi, "")
    .replace(/(?:&nbsp;|\s)+/g, " ")
    .trim();
}

/** The source's <p> lines. */
function lines(html: string): string[] {
  const parts = /<p\b/i.test(html) ? html.split(/<\/p>/i).map((p) => p.replace(/^[\s\S]*?<p\b[^>]*>/i, "")) : html.split(/<br\s*\/?>|\n/i);
  return parts.map(inline).filter((l) => l.replace(/<[^>]+>/g, "").trim() !== "");
}

/** Lines → HTML; runs of bullet lines become a list, and a line holding several "•" items is split into them. */
function blockHtml(html: string): string {
  const out: string[] = [];
  let list: string[] = [];
  const flush = () => { if (list.length) out.push(`<ul>${list.map((l) => `<li>${l}</li>`).join("")}</ul>`); list = []; };
  for (const l of lines(html)) {
    // "• 2. Decreased contractility" inside a numbered sequence is a numbered step, not a bullet (a deck typo).
    if (BULLET.test(l) && /^\d+\.\s/.test(plain(l.replace(BULLET, "")))) { flush(); out.push(`<p>${l.replace(BULLET, "")}</p>`); continue; }
    if (BULLET.test(l)) list.push(...l.split(/\s*(?:&#8226;|&bull;|•)\s*/).map((s) => s.trim()).filter(Boolean));
    else { flush(); out.push(`<p>${l}</p>`); }
  }
  flush();
  return out.join("");
}

const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const isPipe = (html: string) => lines(html).length > 0 && lines(html).every((l) => plain(l).startsWith("|"));
const cells = (line: string) => line.split("|").map((c) => c.trim()).filter((c, i, a) => !(c === "" && (i === 0 || i === a.length - 1)));

// ── one slide ────────────────────────────────────────────────────────────────────────────────────────────────────────

const SKIP = /^(nrg-logo|slide-num|page-num|label-nrg)$/;
// The decks use bare "<" and ">" in values ("<0.04 ng/mL", ">400 diagnostic"). Escape any that don't start or end a tag,
// or the tag clean-up would delete the text between them.
const TAG = /^<\/?[a-zA-Z][^<>]*>/;
function escapeStray(html: string): string {
  let out = "";
  for (let i = 0; i < html.length; i++) {
    const c = html[i];
    if (c === "<") { const m = html.slice(i).match(TAG); if (m) { out += m[0]; i += m[0].length - 1; } else out += "&lt;"; }
    else if (c === ">") out += "&gt;";
    else out += c;
  }
  return out;
}
// Question-slide labels the reader draws itself ("RENR Practice Question", "CORRECT ANSWER: B. …", "Why the others are
// wrong"): not counted in the completeness check, since the answer letter is kept and the option text appears once.
const QUESTION_LABELS = /^(page-title|pq-title|ans-title|correct-text|rat-title|why-title|opt[A-D]-letter)$/;
const HEADING = /-(title|label|header-text)$/;
const CALLOUT = /(strip|seq|opposite|report|sys|formula)-text$/;

function texts(page: Page): El[] {
  return (page.elements ?? [])
    .filter((e) => e.elementType === "text" && !SKIP.test(e.elementId))
    .map((e) => {
      const [x = 0, y = 0, w = 0, h = 0] = e.bounds ?? [];
      return { id: e.elementId, x, y, w, h, html: escapeStray(String(e.content?.text ?? "")) };
    });
}

function tone(heading: string): "plain" | "warn" | "good" {
  // Red only for real alarms. (The decks also put ⚠ on "Risk Factors", which is not an alert.)
  if (/&#128680;|🚨|unsafe|alert|toxicity|danger|report immediately/i.test(heading)) return "warn";
  if (/restores|&#9989;/i.test(heading)) return "good";
  return "plain";
}

type Placed = { x: number; y: number; w: number; h: number; block: ReviewBlock };

function parseContent(els: El[], kind: string): { slide: ReviewSlide; used: Set<string> } {
  const used = new Set<string>();
  const take = (e: El) => { used.add(e.id); return e; };
  const title = plain(els.find((e) => e.id === "page-title")?.html ?? "");
  const subEl = els.find((e) => e.id === "page-subtitle");
  els.filter((e) => e.id === "page-title" || e.id === "page-subtitle").forEach(take);
  const rest = els.filter((e) => !used.has(e.id));

  // Headings: *-title/-label/-header-text that aren't table header rows.
  const headings = rest.filter((e) => HEADING.test(e.id) && !isPipe(e.html));
  const tableHeads = rest.filter((e) => isPipe(e.html) && /header/.test(e.id));
  const bodies = rest.filter((e) => !headings.includes(e) && !tableHeads.includes(e));

  // The element directly above `e` in the same column (left edges within 40px, gap under 40px).
  const above = <T extends El>(e: El, pool: T[]) =>
    pool.filter((h) => !used.has(h.id) && Math.abs(h.x - e.x) <= 40 && h.y < e.y && e.y - (h.y + h.h) <= 40)
      .sort((a, b) => b.y - a.y)[0];

  const placed: Placed[] = [];
  const steps: El[] = [];
  for (const b of bodies.sort((a, z) => a.y - z.y || a.x - z.x)) {
    if (/(^|-)step\d+-text$/.test(b.id)) { steps.push(take(b)); continue; }
    if (isPipe(b.html)) {
      const th = above(b, tableHeads);
      const head = th ? cells(plain(take(th).html)) : [];
      const top = th ?? b;
      const hd = above(top, headings);
      const rows = lines(b.html).map((l) => cells(l));
      placed.push({ x: Math.min(b.x, top.x), y: (hd ?? top).y, w: b.w, h: b.y + b.h - (hd ?? top).y,
        block: { type: "table", heading: hd ? inline(take(hd).html.replace(/<\/?p[^>]*>/g, " ")) : null, header: head, rows } });
      take(b);
      continue;
    }
    const hd = above(b, headings);
    if (!hd && (CALLOUT.test(b.id) || (b.w >= 1000 && /^<p><strong>NRG [^<]*:<\/strong>/.test(b.html.trim())))) {
      placed.push({ ...b, block: { type: "callout", html: blockHtml(take(b).html) } });
      continue;
    }
    const heading = hd ? inline(take(hd).html.replace(/<\/?p[^>]*>/g, " ")) : null;
    placed.push({ x: b.x, y: (hd ?? b).y, w: Math.max(b.w, hd?.w ?? 0), h: b.y + b.h - (hd ?? b).y,
      block: { type: "panel", heading, html: blockHtml(take(b).html), tone: tone(heading ?? "") } });
  }
  // A heading with nothing under it stands alone (rare: a one-line card).
  for (const h of headings.filter((h) => !used.has(h.id))) {
    placed.push({ ...h, block: { type: "panel", heading: null, html: blockHtml(take(h).html), tone: tone(h.html) } });
  }
  if (steps.length) {
    const s = steps.sort((a, b) => a.y - b.y || a.x - b.x);
    const x = Math.min(...s.map((e) => e.x)), y = Math.min(...s.map((e) => e.y));
    placed.push({ x, y, w: Math.max(...s.map((e) => e.x + e.w)) - x, h: Math.max(...s.map((e) => e.y + e.h)) - y,
      block: { type: "flow", items: s.map((e) => lines(e.html).join(" — ")) } });
  }

  // Rows: blocks whose vertical spans overlap. Columns within a row: blocks whose horizontal spans overlap.
  const rows: Placed[][] = [];
  for (const p of placed.sort((a, b) => a.y - b.y)) {
    const row = rows.find((r) => r.some((q) => p.y < q.y + q.h - 8 && q.y < p.y + p.h - 8));
    if (row) row.push(p); else rows.push([p]);
  }
  const outRows: ReviewColumn[][] = rows.map((r) => {
    const cols: Placed[][] = [];
    for (const p of r.sort((a, b) => a.x - b.x)) {
      const col = cols.find((c) => c.some((q) => p.x < q.x + q.w - 8 && q.x < p.x + p.w - 8));
      if (col) col.push(p); else cols.push([p]);
    }
    const widths = cols.map((c) => Math.max(...c.map((p) => p.w)));
    const total = widths.reduce((a, b) => a + b, 0);
    return cols.map((c, i) => ({ width: Math.round((widths[i] / total) * 100) / 100, blocks: c.sort((a, b) => a.y - b.y).map((p) => p.block) }));
  });
  return { slide: { kind, title, subtitle: subEl ? plain(subEl.html) : null, rows: outRows }, used };
}

function parseQuestion(els: El[]): { q: ReviewQuestion; used: Set<string> } {
  const used = new Set<string>();
  const get = (re: RegExp) => { const e = els.find((x) => re.test(x.id)); if (e) used.add(e.id); return e; };
  get(/^(page-title|pq-title)$/);
  const stem = get(/^(stem-body|q-text)$/);
  let options: ReviewQuestion["options"] = [];
  const optBody = get(/^opt-body$/);
  if (optBody) {
    options = lines(optBody.html).map((l) => {
      const m = plain(l).match(/^([A-D])[.)]\s*/);
      return { letter: m?.[1] ?? "?", html: l.replace(/^\s*<strong>\s*[A-D][.)]\s*<\/strong>\s*/, "").replace(/^[A-D][.)]\s*/, "") };
    });
  } else {
    for (const L of ["A", "B", "C", "D"]) {
      get(new RegExp(`^opt${L}-letter$`));
      const t = get(new RegExp(`^opt${L}-text$`));
      if (t) options.push({ letter: L, html: inline(t.html.replace(/<\/?p[^>]*>/g, " ")) });
    }
  }
  const ans = get(/^(ans-title|correct-text)$/);
  const answer = plain(ans?.html ?? "").match(/CORRECT ANSWER:\s*([A-D])/i)?.[1] ?? "";
  get(/^rat-title$/);
  const rat = get(/^rat-body$/);
  get(/^why-title$/);
  const whyEl = get(/^why-body$/);
  const why = whyEl ? lines(whyEl.html).map((l) => {
    const m = plain(l).match(/^([A-D])\s*[:.)]/);
    return { letter: m?.[1] ?? "?", html: l.replace(/^\s*<strong>\s*[A-D]\s*[:.)]\s*<\/strong>\s*/, "") };
  }) : [];
  return { q: { stem: blockHtml(stem?.html ?? ""), options, answer, rationale: blockHtml(rat?.html ?? ""), why }, used };
}

// ── decks ────────────────────────────────────────────────────────────────────────────────────────────────────────────

const KIND: Array<[RegExp, string]> = [
  [/cover/, "cover"], [/anp/, "anp"], [/dysfunction/, "dysfunction"], [/patho/, "patho"], [/signs/, "signs"],
  [/assessment/, "assessment"], [/management/, "management"], [/care_?plan/, "careplan"], [/renr/, "renr"], [/question/, "question"],
];

function words(s: string): string[] {
  return plain(s).replace(/&[a-z#0-9]+;/gi, " ").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1);
}

const problems: string[] = [];
const docs: TopicReviewDoc[] = [];

for (const deckFile of [join(SRC, "nrg_htn_review/nrg_htn_review.pptd"), ...readdirSync(join(SRC, "nrg_medical_surgical_reviews")).filter((f) => f.endsWith(".pptd")).sort().map((f) => join(SRC, "nrg_medical_surgical_reviews", f))]) {
  const deck = yaml.load(readFileSync(deckFile, "utf8")) as { title: string; pages: string[] };
  const key = basename(deckFile, ".pptd").replace(/^nrg_/, "").replace(/_review$/, "");
  const cat = CATALOG.find((c) => c.deck === key);
  if (!cat) { problems.push(`${key}: not in CATALOG`); continue; }

  const slides: ReviewSlide[] = [];
  let question: ReviewQuestion | null = null;
  let system = "";
  let sourceWords: string[] = [];
  let keptText = "";

  for (const rel of deck.pages) {
    const page = yaml.load(readFileSync(join(deckFile, "..", rel), "utf8")) as Page;
    const kind = KIND.find(([re]) => re.test(rel))?.[1] ?? "other";
    const els = texts(page);
    sourceWords.push(...els.filter((e) => kind !== "question" || !QUESTION_LABELS.test(e.id)).flatMap((e) => words(e.html)));
    if (kind === "cover") {
      const sub = els.find((e) => /title-sub|subtitle/.test(e.id));
      system = plain(sub?.html ?? "").split("|")[0].trim();
      keptText += " " + els.map((e) => e.html).join(" ");   // cover text becomes the page header
      continue;
    }
    const { used, ...parsed } = kind === "question" ? (() => { const r = parseQuestion(els); question = r.q; return r; })() : (() => { const r = parseContent(els, kind); slides.push(r.slide); return r; })();
    void parsed;
    const missed = els.filter((e) => !used.has(e.id) && !/-letter$/.test(e.id));
    if (missed.length) problems.push(`${key}/${basename(rel)}: unplaced ${missed.map((m) => m.id).join(", ")}`);
  }
  if (!question) problems.push(`${key}: no practice question`);
  else {
    const q = question as ReviewQuestion;
    if (q.options.length !== 4 || !q.answer || !q.options.some((o) => o.letter === q.answer) || !q.rationale) problems.push(`${key}: practice question incomplete (${q.options.length} options, answer "${q.answer}")`);
  }

  const doc: TopicReviewDoc = { slug: cat.slug, title: cat.title, system: system || cat.system, slides, question, source: `${basename(join(deckFile, ".."))}/${basename(deckFile)}` };
  // Only text values count (not keys, block types or tones), so a lost "Type 1 DM" can't be covered by a "type" key.
  const values = (v: unknown): string[] => typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(values)
    : v && typeof v === "object" ? Object.entries(v).filter(([k]) => !["type", "tone", "kind", "slug", "source", "width", "letter", "answer"].includes(k)).flatMap(([, x]) => values(x)) : [];
  keptText += " " + values({ slides: doc.slides, question: doc.question }).join(" ");
  // Completeness: every word of the source (multiset) must survive into the output.
  const have = new Map<string, number>();
  for (const w of words(keptText)) have.set(w, (have.get(w) ?? 0) + 1);
  const lost: string[] = [];
  for (const w of sourceWords) { const n = have.get(w) ?? 0; if (n > 0) have.set(w, n - 1); else lost.push(w); }
  if (lost.length) problems.push(`${key}: ${lost.length} source words not in the output: ${lost.slice(0, 15).join(" ")}`);
  docs.push(doc);
  console.log(`${cat.slug.padEnd(16)} ${doc.slides.length} slides, ${doc.slides.reduce((n, s) => n + s.rows.flat().reduce((m, c) => m + c.blocks.length, 0), 0)} blocks, question ${question ? "yes" : "no"}`);
}

if (problems.length) { console.error(`\n${problems.length} problem(s):\n- ${problems.join("\n- ")}`); process.exitCode = 1; }
else console.log(`\n${docs.length} decks parsed, every source word kept.`);

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
for (const d of docs) writeFileSync(join(OUT, `${d.slug}.json`), JSON.stringify(d, null, 1) + "\n");
console.log(`wrote ${docs.length} files to content/topic-reviews/`);

if (apply && !problems.length) {
  const env = Object.fromEntries(readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
  const url = env.NEXT_PUBLIC_SUPABASE_URL_STAGING;
  if (new URL(url).hostname !== "kwhaqhhwqykckarjbdod.supabase.co") throw new Error("refusing: not the staging project");
  const sb = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY_STAGING, { auth: { persistSession: false } });
  (async () => {
    for (const d of docs) {
      const cat = CATALOG.find((c) => c.slug === d.slug)!;
      const row = { slug: d.slug, title: d.title, system: d.system, slides: d.slides, question: d.question, keywords: cat.keywords, exclude: cat.exclude ?? [], related: cat.related, source: d.source, sort_order: CATALOG.indexOf(cat), updated_at: new Date().toISOString() };
      const { error } = await sb.from("topic_reviews").upsert(row, { onConflict: "slug" });
      console.log(`${error ? "FAILED" : "upserted"} ${d.slug}${error ? `: ${error.message}` : ""}`);
      if (error) process.exitCode = 1;
    }
  })();
}
