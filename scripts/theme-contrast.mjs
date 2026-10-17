// WCAG contrast of each student theme, computed from the tokens in src/lib/theme/themes.ts (the same values the CSS
// is generated from, including the dark remap of Tailwind's palettes). Needs Node >= 22.18 (built-in TypeScript type
// stripping for the import below). Usage: node --no-warnings scripts/theme-contrast.mjs   Exit 1 if any text pair is under 4.5:1.
import { createRequire } from "node:module";
import { THEME_LIST, darkPalette, hslToHex } from "../src/lib/theme/themes.ts";

const colors = createRequire(import.meta.url)("tailwindcss/colors");

const rgb = (c) => (c.startsWith("#") ? [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) : c.split(" ").map(Number));
const lum = (c) => {
  const [r, g, b] = rgb(c).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

let failed = 0;
for (const t of THEME_LIST) {
  const k = (name) => hslToHex(t.tokens[name]);
  const card = k("card");
  const pal = (name, step) => (t.dark ? darkPalette(colors[name], card)[step] : colors[name][step]);
  const text = [
    ["body text on page (foreground / muted)", k("foreground"), k("muted")],
    ["body text on card", k("card-foreground"), card],
    ["secondary text on card (muted-foreground)", k("muted-foreground"), card],
    ["secondary text on page", k("muted-foreground"), k("muted")],
    ["primary button label", k("primary-foreground"), k("primary")],
    ["primary button label, hover", k("primary-foreground"), k("primary-hover")],
    ["primary as link text on card", k("primary"), card],
    ["brand-700 text on card", t.brand[700], card],
    ["brand-700 text on brand-50 tint", t.brand[700], t.brand[50]],
    ["brand-800 on brand-100 (pills)", t.brand[800], t.brand[100]],
    ["header title on gradient middle", k("header-foreground"), k("header-via")],
    ["header title on gradient start", k("header-foreground"), k("header-from")],
    ["header title on gradient end", k("header-foreground"), k("header-to")],
    ["header subtitle on gradient middle", k("header-muted"), k("header-via")],
    ["rationale: correct (green-900 / green-50)", pal("green", "900"), pal("green", "50")],
    ["rationale: close (yellow-900 / yellow-50)", pal("yellow", "900"), pal("yellow", "50")],
    ["rationale: priority (orange-900 / orange-50)", pal("orange", "900"), pal("orange", "50")],
    ["rationale: incorrect (red-900 / red-50)", pal("red", "900"), pal("red", "50")],
    ["rationale: not asked (slate-900 / slate-50)", pal("slate", "900"), pal("slate", "50")],
    ["error box (red-800 / red-50)", pal("red", "800"), pal("red", "50")],
    ["success box (green-800 / green-50)", pal("green", "800"), pal("green", "50")],
  ];
  const ui = [
    ["focus ring vs card (non-text, >= 3)", k("ring"), card],
    ["correct border green-600 vs card (non-text)", pal("green", "600"), card],
    ["incorrect border red-500 vs card (non-text)", pal("red", "500"), card],
  ];
  console.log(`\n${t.name}${t.dark ? " (dark)" : ""}`);
  for (const [label, fg, bg] of text) {
    const r = ratio(fg, bg);
    if (r < 4.5) failed++;
    console.log(`  ${r >= 7 ? "AAA" : r >= 4.5 ? "AA " : "FAIL"} ${r.toFixed(2).padStart(5)}  ${label}`);
  }
  for (const [label, fg, bg] of ui) {
    const r = ratio(fg, bg);
    console.log(`  ${r >= 3 ? "ok  " : "low "} ${r.toFixed(2).padStart(5)}  ${label}`);
  }
}
console.log(failed ? `\n${failed} text pair(s) under 4.5:1` : "\nAll text pairs meet WCAG AA (4.5:1).");
process.exit(failed ? 1 : 0);
