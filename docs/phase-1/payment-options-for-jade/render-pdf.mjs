// Renders payment-options.html to docs/phase-1/NRG_Payment_Options_for_Jade.pdf. Playwright isn't a project dependency: either
//   npm i --no-save playwright@1.49.1 && node docs/phase-1/feature-status/render-pdf.mjs
// or point PLAYWRIGHT at an existing playwright / playwright-core entry file:
//   PLAYWRIGHT=/path/to/playwright-core/index.mjs node docs/phase-1/feature-status/render-pdf.mjs
import { fileURLToPath } from "node:url";
import path from "node:path";
const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, "payment-options.html");
const out = path.join(here, "..", "NRG_Payment_Options_for_Jade.pdf");
const { chromium } = await import(process.env.PLAYWRIGHT ?? "playwright");
const b = await chromium.launch();
const p = await b.newPage();
await p.goto("file://" + src, { waitUntil: "load" });
await p.evaluate(() => document.fonts.ready);
const updated = await p.evaluate(() => document.querySelector('meta[name="updated"]')?.getAttribute("content") ?? "");
await p.pdf({
  path: out, format: "Letter", printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
  headerTemplate: "<span></span>",
  footerTemplate: `<div style="width:100%;font-size:8px;color:#8b6ba8;font-family:Helvetica,Arial,sans-serif;padding:0 0.75in;display:flex;justify-content:space-between"><span>NRG Platform · How students pay · ${updated}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
});
await b.close();
console.log("wrote", out);
