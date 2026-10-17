/**
 * Rationale-view option classes (Case Study V3 s.11): colour plus a text label, never colour alone. Correct is listed
 * first. Shared by the case review, tutor-mode feedback and the released mock-exam review. Safe to import anywhere
 * (no server code).
 */
export type OptionTypeStyle = { label: string; className: string; order: number };

export const OPTION_TYPE: Record<string, OptionTypeStyle> = {
  correct: { label: "Correct answer", className: "border-green-600 bg-green-50 text-green-900", order: 0 },
  close: { label: "Close", className: "border-yellow-500 bg-yellow-50 text-yellow-900", order: 1 },
  priority: { label: "Priority / sequencing", className: "border-orange-500 bg-orange-50 text-orange-900", order: 2 },
  incorrect: { label: "Incorrect", className: "border-red-500 bg-red-50 text-red-900", order: 3 },
  unsafe: { label: "Unsafe", className: "border-red-700 bg-red-100 text-red-950", order: 4 },
  not_asked: { label: "Correct statement, not what was asked", className: "border-slate-500 bg-slate-50 text-slate-900", order: 5 },
};

/** An option whose type is unknown (no `distractor_type` yet: prod before the migration, human-written and prototype
 *  questions): shown plainly, with no colour class or label, so nothing is mislabelled. */
export const NEUTRAL_OPTION: OptionTypeStyle = { label: "", className: "border-border bg-card text-card-foreground", order: 6 };

/**
 * The class to show for one option. `is_correct` is the authority: a keyed option is always "Correct answer", even with
 * no type, and a non-keyed option is never shown as correct whatever its type says. A non-keyed option with no (or an
 * unrecognised) type is neutral.
 */
export function optionTypeFor(o: { is_correct?: boolean | null; distractor_type?: string | null }): OptionTypeStyle {
  if (o.is_correct) return OPTION_TYPE.correct;
  const t = o.distractor_type ? OPTION_TYPE[o.distractor_type] : undefined;
  return t && t !== OPTION_TYPE.correct ? t : NEUTRAL_OPTION;
}
