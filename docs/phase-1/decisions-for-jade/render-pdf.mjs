// Renders decisions-for-jade.html to docs/phase-1/Decisions_for_Jade.pdf. Playwright isn't a project dependency:
//   npm i --no-save playwright@1.49.1 && node docs/phase-1/decisions-for-jade/render-pdf.mjs \
//     "$PWD/docs/phase-1/decisions-for-jade/decisions-for-jade.html" docs/phase-1/Decisions_for_Jade.pdf
import { chromium } from "playwright";
const [src, out] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage();
await p.goto("file://" + src, { waitUntil: "networkidle" });
await p.evaluate(() => document.fonts.ready);
await p.pdf({
  path: out, format: "Letter", printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
  headerTemplate: "<span></span>",
  footerTemplate: '<div style="width:100%;font-size:8px;color:#8b6ba8;font-family:Helvetica,Arial,sans-serif;padding:0 0.75in;display:flex;justify-content:space-between"><span>NRG Platform · Decisions for Jade · 22 October 2026</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>',
});
await b.close();
console.log("wrote", out);
