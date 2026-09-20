/**
 * Regenerate docs/phase-1/COPYRIGHT_REVIEW_LIST.md.
 *
 *   npx tsx scripts/list-copyright-items.ts
 *
 * Emits IDENTIFIERS ONLY — prototype id, domain, taxonomy, topic. It deliberately
 * never writes a stem, an option or a rationale into the tracked document, because
 * the thing under review is the text itself and Git history is hard to purge.
 *
 * Reads from OKComputer_NRG_Website/app/src/data/, which is gitignored. Two groups:
 *   saunders_*.ts        — headers self-document "Source: Saunders Q&A Review"
 *   gapFillingQuestions  — verbatim classic NCLEX items, no rationales
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const DATA = "OKComputer_NRG_Website/app/src/data";
const OUT = "docs/phase-1/COPYRIGHT_REVIEW_LIST.md";

const decode = (s: string) =>
  s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\n/g, " ");

/** Top-level {...} blocks, string-aware so braces inside prose don't fool it. */
function objectBlocks(src: string): string[] {
  const out: string[] = [];
  let depth = 0, start = -1, q: string | null = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === "\\") { i++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === "`") { q = c; continue; }
    if (c === "{") { if (depth === 0) start = i; depth++; }
    else if (c === "}") { depth--; if (depth === 0 && start >= 0) { out.push(src.slice(start, i + 1)); start = -1; } }
  }
  return out;
}

type Item = { id: string; domain: string; taxonomy: string; topic: string; hasRationale: boolean };

function itemsIn(file: string): Item[] {
  const text = readFileSync(`${DATA}/${file}`, "utf8");
  const out: Item[] = [];
  for (const b of objectBlocks(text)) {
    const id = b.match(/["']?id["']?\s*:\s*(\d+)/);
    if (!id) continue;
    const dom = b.match(/["']?domain["']?\s*:\s*['"]([A-Z]+)['"]/);
    const tax = b.match(/["']?taxonomy["']?\s*:\s*['"]([A-Z]+)['"]/);
    const top = b.match(/["']?topic["']?\s*:\s*(['"])((?:\\.|(?!\1)[^\\])*)\1/);
    const rat = b.match(/["']?rationale["']?\s*:\s*(['"])((?:\\.|(?!\1)[^\\])*)\1/);
    out.push({
      id: id[1],
      domain: dom?.[1] ?? "",
      taxonomy: tax?.[1] ?? "",
      topic: top ? decode(top[2]) : "",
      hasRationale: Boolean(rat && rat[2].trim()),
    });
  }
  return out;
}

const families: { file: string; header: string; items: Item[] }[] = [];
for (const file of readdirSync(DATA).filter((f) => f.startsWith("saunders_")).sort()) {
  const header = (readFileSync(`${DATA}/${file}`, "utf8").split("\n").filter((l) => l.startsWith("//"))[1] ?? "")
    .replace("//", "").trim();
  const items = itemsIn(file);
  if (items.length) families.push({ file, header, items });
}
families.push({
  file: "gapFillingQuestions.ts",
  header: "verbatim classic NCLEX items; 100% empty rationales",
  items: itemsIn("gapFillingQuestions.ts"),
});

const total = families.reduce((n, f) => n + f.items.length, 0);
const L: string[] = [];
L.push("# Copyright review list — questions held back from import", "");
L.push("**Created:** 2026-09-20 · **Status:** awaiting an Ian/Jade decision");
L.push(`**Count:** ${total} questions across ${families.length} files`, "");
L.push("These items were excluded from `scripts/data/proto-import-clean.csv` and were");
L.push("**never imported** to any environment. They sit only in the local, gitignored");
L.push("`scripts/data/proto-quarantine.csv`.", "");
L.push("## Why this list holds identifiers and not questions", "");
L.push("The concern is the text itself, so reproducing the stems here would commit the");
L.push("very material in question to a Git history that is hard to purge. Each row below");
L.push("is enough to find an item in the prototype source and no more.", "");
L.push("## The two problems are different", "");
L.push("**1. Saunders-derived — 145 items, 18 files.** Each file self-documents its origin");
L.push('in a header comment reading "Source: Saunders Q&A Review (paraphrased for RENR');
L.push('format)". Paraphrasing a copyrighted question bank produces a derivative work; it');
L.push("does not clear the rights. All 145 carry rationales, so they are otherwise usable");
L.push("content — which is why they are tempting, and why they need a decision.", "");
L.push("**2. Verbatim NCLEX — 124 items, 1 file.** `gapFillingQuestions.ts` reproduces");
L.push("classic free-circulating NCLEX items word for word, and **none has a rationale**");
L.push("(0 of 124). Provenance is unclear and teaching value is low without explanations.", "");
L.push("## Recommendation", "");
L.push("**Drop both sets rather than rewrite them.** The staging bank already holds 4,728");
L.push("clean, RENR-tagged, rationale-complete questions. These 269 are a ~5% gain against");
L.push("a real legal exposure and a large amount of Jade's time. A rewrite deep enough to");
L.push("clear the derivative-work problem amounts to writing new questions — and if he is");
L.push("writing new questions, the 50 high-yield RENR topics are a better target than");
L.push("reworking someone else's.", "");
L.push("If any are kept they need either a documented licence, or a rewrite done by someone");
L.push("who has not read the original.", "");
L.push("## The list", "");
for (const f of families) {
  const byTopic = new Map<string, Item[]>();
  for (const i of f.items) {
    const t = i.topic || "(untagged)";
    byTopic.set(t, [...(byTopic.get(t) ?? []), i]);
  }
  L.push(`### \`${f.file}\` — ${f.items.length} item${f.items.length === 1 ? "" : "s"}`, "");
  L.push(`Header in source: _${f.header}_  `);
  L.push(`Rationales present: ${f.items.filter((i) => i.hasRationale).length} of ${f.items.length}`, "");
  L.push("| Topic | Domain | Taxonomy | Prototype ids |", "|---|---|---|---|");
  for (const [topic, items] of [...byTopic.entries()].sort()) {
    const ids = items.map((i) => i.id);
    const shown = ids.length > 12 ? `${ids.slice(0, 12).join(", ")} … (+${ids.length - 12} more)` : ids.join(", ");
    L.push(`| ${topic.replace(/\|/g, "\\|")} | ${items[0].domain} | ${items[0].taxonomy} | ${shown} |`);
  }
  L.push("");
}
L.push("---", "");
L.push("Regenerate with `npx tsx scripts/list-copyright-items.ts`. That script reads the");
L.push("prototype source and emits identifiers only — it never copies question text into a");
L.push("tracked file.");

writeFileSync(OUT, L.join("\n") + "\n");
console.log(`wrote ${OUT} — ${total} items across ${families.length} files, identifiers only`);
