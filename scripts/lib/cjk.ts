/**
 * Stray CJK tokens emitted by the prototype's question generators.
 *
 * Found 2026-09-20 during pre-import screening. The intent is unambiguous in
 * context, so these are repaired inline rather than quarantined.
 *
 * This lives in one place because two scripts have to agree on it:
 *   - scripts/audit-prototype-data.ts writes the repaired text to the import CSV
 *   - scripts/fix-explanation-letters.ts matches DB option text back to the
 *     prototype source to work out how the options were shuffled
 *
 * When they disagreed, the fixer could not match the repaired option against the
 * raw source and silently skipped the row, leaving its explanation pointing at
 * the wrong option letters.
 *
 * Anything CJK that is NOT in this table is quarantined by the audit rather than
 * shipped — see the unrepaired-CJK guard there.
 */

/** Patterns are whitespace-tolerant because repairCjk inserts a word boundary first. */
const CJK_REPAIRS: Array<[RegExp, string]> = [
  [/not\s*替代/g, "not a substitute"],
  [/永久\s*NPO/g, "permanent NPO"],
  [/定向\s*strategies/g, "orientation strategies"],
  // "...the researcher knows participants' identities but承诺不 to link them..."
  [/承诺不/g, "promises not"],
];

export const CJK = /[　-鿿]/;

export function repairCjk(s: string): string {
  // Scoped to strings that actually contain CJK so the rest of the corpus comes
  // through byte-identical - the whitespace tidy at the end would otherwise
  // rewrite thousands of untouched stems.
  if (!CJK.test(s)) return s;
  // The generator emitted these tokens flush against the preceding word
  // ("...observation, and定向 strategies"), so substituting first yields
  // "andorientation". Insert a boundary against adjacent NON-CJK characters
  // only - matching \S on both sides would split 定向 itself into "定 向".
  s = s
    .replace(/([^\s　-鿿])([　-鿿])/g, "$1 $2")
    .replace(/([　-鿿])([^\s　-鿿])/g, "$1 $2");
  for (const [re, to] of CJK_REPAIRS) s = s.replace(re, to);
  return s.replace(/\s+([,.;:)])/g, "$1").replace(/\s{2,}/g, " ").trim();
}
