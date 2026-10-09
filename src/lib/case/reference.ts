import type { Stage } from "@/lib/case";

/**
 * Adult reference ranges for the case player's reference panel. Matched by lab label and, where units vary
 * between labs, by the unit in the reported value, so a range is never shown against a value in other units.
 * Blood glucose is mg/dL (project rule). A case can override any of these with `reference` on a lab item.
 * Vital signs are deliberately absent: knowing normal vitals is part of what the case tests. The one exception is a
 * bedside glucose recorded with the vitals, which is a laboratory-type value.
 */
const LIBRARY: { label: RegExp; unit?: RegExp; name: string; range: string }[] = [
  { label: /lithium/i, unit: /mmol\/L/i, name: "Serum lithium", range: "0.6–1.2 mmol/L (maintenance)" },
  { label: /^sodium|\bna\b/i, unit: /mmol\/L|mEq\/L/i, name: "Sodium", range: "135–145 mmol/L" },
  { label: /potassium|\bk\b/i, unit: /mmol\/L|mEq\/L/i, name: "Potassium", range: "3.5–5.0 mmol/L" },
  { label: /chloride/i, unit: /mmol\/L|mEq\/L/i, name: "Chloride", range: "98–106 mmol/L" },
  { label: /bicarbonate|hco3/i, unit: /mmol\/L|mEq\/L/i, name: "Bicarbonate", range: "22–29 mmol/L" },
  { label: /urea|bun/i, unit: /mmol\/L/i, name: "Urea", range: "2.5–7.8 mmol/L" },
  { label: /urea|bun/i, unit: /mg\/dL/i, name: "Blood urea nitrogen", range: "7–20 mg/dL" },
  { label: /creatinine/i, unit: /µmol\/L|umol\/L|micromol/i, name: "Creatinine", range: "60–110 µmol/L" },
  { label: /creatinine/i, unit: /mg\/dL/i, name: "Creatinine", range: "0.6–1.2 mg/dL" },
  { label: /magnesium/i, unit: /mmol\/L/i, name: "Magnesium", range: "0.7–1.0 mmol/L" },
  { label: /calcium/i, unit: /mmol\/L/i, name: "Calcium (total)", range: "2.2–2.6 mmol/L" },
  { label: /phosphate/i, unit: /mmol\/L/i, name: "Phosphate", range: "0.8–1.5 mmol/L" },
  { label: /glucose|\brbs\b|\bfbs\b|blood sugar|cbg/i, unit: /mg\/dL/i, name: "Blood glucose", range: "70–99 mg/dL fasting; under 140 mg/dL random" },
  { label: /haemoglobin|hemoglobin|\bhb\b|\bhgb\b/i, unit: /g\/dL/i, name: "Haemoglobin", range: "12.0–15.5 g/dL (female); 13.5–17.5 g/dL (male)" },
  { label: /white|wbc/i, name: "White cell count", range: "4.0–11.0 × 10⁹/L" },
  { label: /platelet/i, name: "Platelets", range: "150–400 × 10⁹/L" },
  { label: /\binr\b/i, name: "INR", range: "0.8–1.2 (no anticoagulant)" },
  { label: /digoxin/i, unit: /ng\/mL/i, name: "Digoxin", range: "0.5–2.0 ng/mL" },
  { label: /^ph\b|arterial ph/i, name: "Arterial pH", range: "7.35–7.45" },
  { label: /paco2|pco2/i, unit: /mm ?Hg/i, name: "PaCO₂", range: "35–45 mm Hg" },
  { label: /pao2|po2/i, unit: /mm ?Hg/i, name: "PaO₂", range: "80–100 mm Hg" },
  { label: /albumin/i, unit: /g\/L/i, name: "Albumin", range: "35–50 g/L" },
  { label: /hba1c|a1c/i, name: "HbA1c", range: "Below 5.7%" },
];

export type ReferenceRange = { name: string; range: string };

/** Reference ranges for every lab result in the given (already revealed) stages, in order of first appearance. */
export function rangesFor(stages: Stage[]): ReferenceRange[] {
  const out: ReferenceRange[] = [];
  const glucose = /glucose|\brbs\b|\bfbs\b|blood sugar|cbg/i;
  const items = (s: Stage) => [...s.vitals.filter((v) => glucose.test(v.label)), ...s.labs.flatMap((g) => g.items)] as { label: string; value: string; reference?: string }[];
  for (const s of stages) for (const item of items(s)) {
    const ref = item.reference
      ? { name: item.label, range: item.reference }
      : LIBRARY.filter((l) => l.label.test(item.label) && (!l.unit || l.unit.test(item.value))).map((l) => ({ name: l.name, range: l.range }))[0];
    if (ref && !out.some((r) => r.name === ref.name)) out.push(ref);
  }
  return out;
}
