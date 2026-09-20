/**
 * Build the clinical review PDF for the Nursing Knowledge facts.
 *
 *   npx tsx scripts/knowledge-facts-pdf.ts
 *   npx tsx scripts/knowledge-facts-pdf.ts --out /tmp/facts.pdf
 *
 * Reads `src/lib/knowledge/facts.ts` directly, so the PDF is always exactly what the
 * widget shows — there is no second copy of the content to fall out of step.
 *
 * Rendering uses headless Chrome, which is already on this machine, rather than
 * adding a PDF dependency to the app. Falls back to leaving the HTML in place if
 * Chrome cannot be found, so the content is never lost.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { FACTS, KNOWLEDGE_CATEGORIES, type KnowledgeCategory } from "../src/lib/knowledge/facts";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const OUT = resolve(flag("out") ?? "docs/phase-1/nursing-knowledge-facts-for-review.pdf");

const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const generated = new Date().toLocaleDateString("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const byCategory = new Map<KnowledgeCategory, typeof FACTS[number][]>();
for (const fact of FACTS) {
  const list = byCategory.get(fact.category) ?? [];
  list.push(fact);
  byCategory.set(fact.category, list);
}

let n = 0;
const sections = KNOWLEDGE_CATEGORIES.filter((c) => byCategory.has(c))
  .map((category) => {
    const rows = byCategory
      .get(category)!
      .map((fact) => {
        n += 1;
        return `<tr>
          <td class="num">${n}</td>
          <td class="ok"></td>
          <td class="prompt">${esc(fact.front)}</td>
          <td class="answer">${esc(fact.back)}</td>
          <td class="note"></td>
        </tr>`;
      })
      .join("");
    return `<section>
      <h2>${esc(category)} <span class="count">${byCategory.get(category)!.length} facts</span></h2>
      <table>
        <thead>
          <tr><th class="num">#</th><th class="ok">OK</th><th>Prompt (front of card)</th><th>Answer (reveal)</th><th class="note">Correction / comment</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
  })
  .join("");

const summary = KNOWLEDGE_CATEGORIES.filter((c) => byCategory.has(c))
  .map((c) => `<li><span>${esc(c)}</span><span>${byCategory.get(c)!.length}</span></li>`)
  .join("");

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>NRG Nursing Knowledge — facts for clinical review</title>
<style>
  @page { size: A4; margin: 14mm 12mm 16mm; }
  * { box-sizing: border-box; }
  body { font: 10pt/1.45 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #1a1a2e; margin: 0; }
  h1 { font-size: 19pt; margin: 0 0 2mm; color: #4a1d6a; }
  .sub { color: #555; margin: 0 0 5mm; font-size: 9.5pt; }
  .callout { border: 1px solid #e9d5ff; background: #faf5ff; border-radius: 3mm; padding: 4mm 5mm; margin: 0 0 6mm; }
  .callout h3 { margin: 0 0 2mm; font-size: 11pt; color: #4a1d6a; }
  .callout p { margin: 0 0 2mm; }
  .callout p:last-child { margin: 0; }
  ul.summary { list-style: none; padding: 0; margin: 0 0 6mm; column-count: 3; column-gap: 8mm; font-size: 9pt; }
  ul.summary li { display: flex; justify-content: space-between; border-bottom: 1px dotted #ddd; padding: 0.6mm 0; break-inside: avoid; }
  ul.summary span:last-child { color: #6b2d8b; font-weight: 600; }
  section { break-inside: auto; margin-bottom: 5mm; }
  h2 { font-size: 12pt; color: #6b2d8b; margin: 5mm 0 2mm; padding-bottom: 1mm; border-bottom: 1.5px solid #6b2d8b; break-after: avoid; }
  h2 .count { float: right; font-size: 8.5pt; font-weight: 400; color: #888; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th { text-align: left; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.4pt; color: #666; border-bottom: 1px solid #ccc; padding: 1.5mm 1.5mm; font-weight: 600; }
  td { padding: 1.8mm 1.5mm; border-bottom: 1px solid #eee; vertical-align: top; break-inside: avoid; }
  tr { break-inside: avoid; }
  td.num, th.num { width: 8mm; color: #999; font-size: 8pt; text-align: right; }
  td.ok, th.ok { width: 9mm; text-align: center; }
  td.ok::before { content: ""; display: inline-block; width: 3.6mm; height: 3.6mm; border: 1px solid #999; border-radius: 0.6mm; }
  td.prompt { width: 33%; font-weight: 600; }
  td.answer { width: 42%; }
  td.note, th.note { width: 22mm; border-left: 1px solid #eee; }
  .footer { margin-top: 8mm; border-top: 1px solid #ddd; padding-top: 3mm; font-size: 8.5pt; color: #666; }
  .sign { margin-top: 6mm; display: flex; gap: 10mm; }
  .sign div { flex: 1; border-top: 1px solid #333; padding-top: 1.5mm; font-size: 8.5pt; }
</style></head>
<body>
  <h1>Nursing Knowledge — facts for clinical review</h1>
  <p class="sub">NRG Platform · ${FACTS.length} facts · generated ${generated}</p>

  <div class="callout">
    <h3>What this is, and what is being asked</h3>
    <p>These are the prompts shown in the floating <strong>Nursing Knowledge</strong> card on the
    NRG platform. Students see the <em>prompt</em> first and tap to reveal the <em>answer</em>.</p>
    <p><strong>Please confirm each one is clinically correct and appropriate for RENR candidates.</strong>
    Tick the OK box, or write a correction in the right-hand column. Anything left unticked will be
    treated as not yet approved.</p>
    <p>Two notes on the content. Reference ranges are given in <strong>SI units</strong> (mmol/L, g/L)
    to match Caribbean and UK laboratory reporting, and they vary slightly between laboratories — the
    intent is to teach the shape of a value, not a local reference range. Where a number is a clinical
    threshold rather than a range, please check it against current local guidance.</p>
    <p>These facts were drafted to be standard, textbook-level and high-yield. They have
    <strong>not</strong> yet had a nursing sign-off, which is what this document is for.</p>
  </div>

  <h2 style="margin-top:0">Contents</h2>
  <ul class="summary">${summary}</ul>

  ${sections}

  <div class="footer">
    Source of truth: <code>src/lib/knowledge/facts.ts</code>. Regenerate this document with
    <code>npx tsx scripts/knowledge-facts-pdf.ts</code> — it reads the same file the app does, so
    this PDF and the widget cannot disagree.
    <div class="sign">
      <div>Reviewed by (print name)</div>
      <div>Signature</div>
      <div>Date</div>
    </div>
  </div>
</body></html>`;

mkdirSync(dirname(OUT), { recursive: true });
const htmlPath = OUT.replace(/\.pdf$/, "") + ".html";
writeFileSync(htmlPath, html);

const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) {
  console.error(
    `Could not find Chrome, Chromium or Edge. The HTML is at:\n  ${htmlPath}\nOpen it and print to PDF manually.`
  );
  process.exit(1);
}

execFileSync(
  chrome,
  [
    "--headless",
    "--disable-gpu",
    "--no-pdf-header-footer",
    `--print-to-pdf=${OUT}`,
    `file://${htmlPath}`,
  ],
  { stdio: "pipe" }
);
unlinkSync(htmlPath);

const counts = KNOWLEDGE_CATEGORIES.filter((c) => byCategory.has(c))
  .map((c) => `${c} ${byCategory.get(c)!.length}`)
  .join(" · ");
console.log(`Wrote ${OUT}`);
console.log(`${FACTS.length} facts across ${byCategory.size} categories`);
console.log(counts);
