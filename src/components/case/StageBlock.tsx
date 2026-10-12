import type { Stage } from "@/lib/case";

/**
 * One stage of an unfolding case. Every value is rendered identically — no colour, weight or labels —
 * so the student decides what is abnormal (V3 s.5).
 */
export function StageBlock({ stage, isOpening, isLatest, showNewTag = true }: { stage: Stage; isOpening?: boolean; isLatest?: boolean; showNewTag?: boolean }) {
  const hasData = stage.vitals.length > 0 || stage.assessment.length > 0 || stage.labs.length > 0 || stage.medications.length > 0;
  return (
    <section className={`rounded-xl border bg-card p-5 shadow-sm ${isLatest ? "border-brand-300" : "border-border"}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-heading text-sm font-semibold text-card-foreground">{stage.time_label}</span>
        {!isOpening && showNewTag ? <span className="text-xs font-semibold uppercase tracking-wide text-brand-700">New information</span> : null}
      </div>
      {stage.narrative ? <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-card-foreground">{stage.narrative}</p> : null}
      {hasData ? (
        <div className="mt-4 space-y-4">
          {stage.vitals.length > 0 ? (
            <DataTable caption="Observations" rows={stage.vitals.map((v) => [v.label, v.value])} />
          ) : null}
          {stage.assessment.length > 0 ? (
            <DataTable caption="Physical assessment" rows={stage.assessment.map((a) => [a.system, a.finding])} />
          ) : null}
          {stage.labs.map((g) => (
            <DataTable key={g.category} caption={g.category} rows={g.items.map((i) => [i.label, i.value])} />
          ))}
          {stage.medications.length > 0 ? <MedicationTable meds={stage.medications} /> : null}
        </div>
      ) : null}
    </section>
  );
}

/** Medications as charted at this point in the case. Plain text, like every other value: no highlighting. */
function MedicationTable({ meds }: { meds: Stage["medications"] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-sm">
        <caption className="mb-1 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Medications</caption>
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="py-1 pr-3 font-normal">Drug</th><th className="py-1 pr-3 font-normal">Dose and route</th>
            <th className="py-1 pr-3 font-normal">Frequency</th><th className="py-1 font-normal">Status</th>
          </tr>
        </thead>
        <tbody>
          {meds.map((m, i) => (
            <tr key={i} className="border-t border-border align-top">
              <td className="py-1.5 pr-3 text-card-foreground">{m.name}</td>
              <td className="py-1.5 pr-3 text-card-foreground">{m.dose} {m.route}</td>
              <td className="py-1.5 pr-3 text-card-foreground">{m.frequency}</td>
              <td className="py-1.5 text-card-foreground">{m.status ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DataTable({ caption, rows }: { caption: string; rows: string[][] }) {
  return (
    <table className="w-full text-sm">
      <caption className="mb-1 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{caption}</caption>
      <tbody>
        {rows.map(([k, v], i) => (
          <tr key={i} className="border-t border-border">
            <th scope="row" className="w-40 py-1.5 pr-3 text-left align-top font-normal text-muted-foreground">{k}</th>
            <td className="py-1.5 text-card-foreground">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
