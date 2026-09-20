/**
 * Propose a cluster for every cluster-less topic, and write the review document.
 *
 *   npx tsx scripts/propose-topic-clusters.ts            # write the doc
 *   npx tsx scripts/propose-topic-clusters.ts --apply    # apply to STAGING
 *
 * Read-only unless --apply is passed. --apply refuses to run against prod.
 *
 * WHY THIS WORKS ON SEGMENTS, NOT TOPICS
 *
 * The imported prototype topics are named "Clinical area / Sub-topic", e.g.
 * "Oncology & Hematologic Disorders / Cancer Grading and Staging". 726 topics
 * carry no cluster, but they share only 101 distinct first segments — so the
 * decision is 101 judgements, not 726. Mapping a segment assigns every topic
 * under it.
 *
 * The sub-topic half is kept. It was tempting to collapse 726 topics down to the
 * 101 parents, but 673 of the 726 name a real clinical sub-topic; only 53 (7%)
 * merely restate the question's RENR domain, which is already stored on the
 * question. Collapsing would throw away genuine content to fix a different
 * problem.
 *
 * The five existing clusters are reused rather than extended. Every segment has
 * an obvious home in one of them, so this needs no schema change and no second
 * taxonomy. If the clusters later need to be finer, splitting cluster 1 by body
 * system is a separate product decision.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const APPLY = process.argv.includes("--apply");
const OUT = "docs/phase-1/TOPIC_CLUSTER_PROPOSAL.md";

function env(): { url: string; key: string } {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL_STAGING!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY_STAGING!;
  if (!url || !key) throw new Error("staging url/key missing from .env.local");
  // Guard: this script must never be pointed at production.
  if (/cdvubijjepwmhhkgppbl/.test(url)) throw new Error("refusing to run against prod");
  return { url, key };
}

/**
 * Segment → cluster id. Ordered: the FIRST pattern that matches wins, so the
 * specific paediatric/obstetric rules must precede the body-system ones
 * ("Pediatric Cardiovascular Disorders" is maternal-child, not med-surg).
 *
 * 1 Medical-surgical and community health priorities
 * 2 Safety, infection control, and core procedures
 * 3 Maternal-child and family nursing
 * 4 Management, legal, and professionalism
 * 5 Psychosocial and therapeutic communication
 */
const RULES: Array<[RegExp, number, string]> = [
  // ── 3 · maternal-child, neonatal, paediatric, family ──────────────────────
  [/^(pediatric|paediatric|child|newborn|neonatal|prematurity|preterm|birth asphyxia|rds$)/i, 3, "paediatric / neonatal"],
  [/^(obstetric|antenatal|intrapartum|postpartum|puerperal|ectopic|miscarriage|anemia in pregnancy|hypertensive disorders of pregnancy|gestational diabetes|congenital anomalies|physiologic jaundice)/i, 3, "obstetric"],
  [/^(family dynamics|dengue in children|sickle cell in children)/i, 3, "child & family"],
  // ── 5 · psychosocial and therapeutic communication ────────────────────────
  [/^(schizophrenia|anxiety|substance abuse|therapeutic communication|grief|bereavement|mental health|psychiatric)/i, 5, "psychosocial"],
  // ── 4 · management, legal, professionalism ────────────────────────────────
  [/^(nursing theorists|nursing profession|nursing research|nursing ethics|nursing bodies|nursing leadership|nursing process|legal nursing|professional conduct|delegation|clinical decision making|quality improvement|documentation|scope of practice)/i, 4, "professional"],
  // ── 2 · safety, infection control, core procedures ────────────────────────
  [/^(wound care|medication administration|iv therapy|cpr|infection prevention|infection control|fluid balance|holistic assessment|nutrition support|patient safety|dosage|oxygen therapy|positioning|specimen|vital signs)/i, 2, "core procedure"],
  // ── 1 · medical-surgical and community health (everything clinical else) ──
  [/./, 1, "medical-surgical (default)"],
];

const clusterFor = (segment: string) => RULES.find(([re]) => re.test(segment))!;

async function main() {
  const { url, key } = env();
  const h = { apikey: key, Authorization: `Bearer ${key}` };
  const all = async (q: string) => {
    const out: Record<string, unknown>[] = [];
    for (let o = 0; ; o += 1000) {
      const r = await fetch(`${url}/rest/v1/${q}&offset=${o}&limit=1000`, { headers: h });
      const j = await r.json();
      if (!Array.isArray(j) || j.length === 0) break;
      out.push(...j);
      if (j.length < 1000) break;
    }
    return out;
  };

  const clusters = (await all("topic_clusters?select=id,name&order=id")) as { id: number; name: string }[];
  const topics = (await all("topics?select=id,name,cluster_id&order=id")) as { id: number; name: string; cluster_id: number | null }[];
  const questions = (await all("questions?select=topic_id&order=topic_id")) as { topic_id: number }[];

  const perTopic = new Map<number, number>();
  for (const q of questions) perTopic.set(q.topic_id, (perTopic.get(q.topic_id) ?? 0) + 1);

  const orphans = topics.filter((t) => t.cluster_id === null);
  type Seg = { label: string; topics: number; questions: number; cluster: number; why: string; ids: number[] };
  const segs = new Map<string, Seg>();
  for (const t of orphans) {
    // Split on a SPACED " / " - the parent/child separator. A bare "/" also
    // appears inside single names ("HIV/AIDS", "Fluid Balance & I/O Management",
    // "Renal Disorders (GN/Nephritic/UTI)") and splitting on that truncates them.
    const label = (t.name.split(" / ")[0] ?? "").trim();
    const [, cluster, why] = clusterFor(label);
    const s = segs.get(label.toLowerCase()) ?? { label, topics: 0, questions: 0, cluster, why, ids: [] };
    s.topics++;
    s.questions += perTopic.get(t.id) ?? 0;
    s.ids.push(t.id);
    segs.set(label.toLowerCase(), s);
  }
  const rows = [...segs.values()].sort((a, b) => b.questions - a.questions);
  const byCluster = new Map<number, { topics: number; questions: number; segs: number }>();
  for (const r of rows) {
    const c = byCluster.get(r.cluster) ?? { topics: 0, questions: 0, segs: 0 };
    c.topics += r.topics;
    c.questions += r.questions;
    c.segs++;
    byCluster.set(r.cluster, c);
  }

  if (APPLY) {
    let n = 0;
    for (const r of rows) {
      const res = await fetch(`${url}/rest/v1/topics?id=in.(${r.ids.join(",")})`, {
        method: "PATCH",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify({ cluster_id: r.cluster }),
      });
      if (!res.ok) throw new Error(`PATCH failed for "${r.label}": ${res.status} ${await res.text()}`);
      n += r.ids.length;
    }
    console.log(`applied: ${n} topics given a cluster across ${rows.length} segments`);
    const after = (await all("topics?select=id&cluster_id=is.null")) as unknown[];
    console.log(`topics still without a cluster: ${after.length}`);
    return;
  }

  const clusterName = new Map(clusters.map((c) => [c.id, c.name]));
  const L: string[] = [];
  L.push("# Proposal — give the 726 cluster-less topics a clinical area", "");
  L.push("**Created:** 2026-09-20 · **Status:** awaiting Jade's sign-off");
  L.push(`**Scope:** ${orphans.length} topics holding ${rows.reduce((n, r) => n + r.questions, 0).toLocaleString()} questions on staging`, "");
  L.push("## The problem in one line", "");
  L.push(`Of ${topics.length.toLocaleString()} topics on staging, ${orphans.length} have no \`cluster_id\`, and they carry`);
  L.push(`${rows.reduce((n, r) => n + r.questions, 0).toLocaleString()} of the ${questions.length.toLocaleString()} questions in the bank. Anything that filters or`);
  L.push('targets study by clinical area cannot see them — the review screen shows their Area as "—".', "");
  L.push("## Why this is 101 decisions and not 726", "");
  L.push('The imported topics are named `Clinical area / Sub-topic`, for example');
  L.push("`Oncology & Hematologic Disorders / Cancer Grading and Staging`. The 726 topics share");
  L.push(`just **${rows.length} distinct first segments**, so mapping a segment assigns every topic under it.`, "");
  L.push("## Two things this proposal deliberately does NOT do", "");
  L.push("**It does not collapse the topics.** 726 topics for 4,630 questions looks like sprawl, and");
  L.push("349 of them hold a single question. But the sub-topic half is real content: only 53 of 726");
  L.push("(7%) merely restate the question's RENR domain, which is already stored on the question.");
  L.push("The other 673 name a genuine clinical sub-topic. Collapsing them would discard teaching");
  L.push("detail to fix a different problem. Topic granularity is worth revisiting once there is");
  L.push("usage data showing which topics students actually practise.", "");
  L.push("**It does not add new clusters.** Every segment has an obvious home in the five that");
  L.push("already exist, so this needs no schema change and creates no second taxonomy. The");
  L.push("split is more even than expected - the two biggest areas take a third of the bank each");
  L.push("(1,553 and 1,524 questions) rather than one swallowing everything. If the areas later");
  L.push("need to be finer, splitting cluster 1 by body system is a separate product decision.", "");
  L.push("## Where the questions would land", "");
  L.push("| Cluster | Segments | Topics | Questions |", "|---|---:|---:|---:|");
  for (const [id, c] of [...byCluster.entries()].sort((a, b) => b[1].questions - a[1].questions))
    L.push(`| ${id} — ${clusterName.get(id)} | ${c.segs} | ${c.topics} | ${c.questions.toLocaleString()} |`);
  L.push("");
  L.push("## The calls worth arguing about", "");
  L.push("Most rows are mechanical. These are the ones where a nurse might reasonably disagree:", "");
  L.push("- **Gynaecology sits in med-surg.** `Uterine Fibroids` (34 questions), `Cervical Cancer`");
  L.push("  (33), `Breast Cancer` (26) and `Prostate Cancer` (26) are mapped to cluster 1, not to");
  L.push("  maternal-child. Cluster 3 is read here as pregnancy, birth and children; gynae");
  L.push("  oncology is closer to med-surg. Say if you would rather have a women's health area.");
  L.push("- **`Dengue` vs `Dengue in Children`** split across clusters 1 and 3 respectively. Both");
  L.push("  are Caribbean-relevant and both are worth keeping; the split follows the age group.");
  L.push("- **`Substance Abuse & Withdrawal Safety`** is mapped to psychosocial (5) rather than");
  L.push("  core procedures (2), on the basis that the questions are about assessment and");
  L.push("  therapeutic response rather than a procedure.");
  L.push("- **`Nutrition Support & Feeding` and `Holistic Assessment & Vital Signs`** are mapped to");
  L.push("  cluster 2 as core nursing procedures; they could equally be read as med-surg.", "");
  L.push("## The mapping — please correct anything wrong", "");
  L.push("Ordered by question count, so the rows that matter most are at the top. The rule column");
  L.push("says which pattern matched; `medical-surgical (default)` means nothing more specific did,");
  L.push("so those are the rows most worth a second look.", "");
  L.push("| Questions | Topics | Clinical area (first segment) | → Cluster | Matched rule |", "|---:|---:|---|---|---|");
  for (const r of rows)
    L.push(`| ${r.questions} | ${r.topics} | ${r.label} | ${r.cluster} — ${clusterName.get(r.cluster)} | ${r.why} |`);
  L.push("");
  L.push("## Separate issues found while measuring this", "");
  L.push("These are not fixed by the mapping and need their own decision.", "");
  L.push("1. **Two naming conventions now sit in one table.** The 494 curated topics are single");
  L.push("   words (`Cardiac`, `Renal`, `Medication safety`); the imported 726 are compound");
  L.push("   (`Cardiovascular Disorders / Heart Failure`). Students would see both styles in one");
  L.push("   list. Worth deciding whether to unify before any of this goes live.");
  L.push("2. **56 topics are bare abbreviations** — `COPD`, `CAP`, `T2DM`, `CKD`, `TB`, `BPH`,");
  L.push("   `RDS`, `IHD & ACS`, `HIV`. These would display to students as-is and should be spelled out.");
  L.push("3. **Near-duplicates at different granularity**, e.g. `COPD` (25 questions) alongside");
  L.push("   `Chronic Respiratory Disease (COPD)` (1), and `Intrapartum Care & Delivery Prep` (51)");
  L.push("   alongside a bare `Intrapartum Care` (1). Merging each pair is safe and would remove");
  L.push("   a handful of one-question topics.");
  L.push("4. **Every topic in both environments has `domain_id` NULL** — pre-existing, not caused");
  L.push("   by this import. The migrate script never sets it and topics are de-duplicated by name");
  L.push("   alone. Question-level domain is set correctly, so nothing is broken today, but the");
  L.push("   column is dead weight until it is either populated or dropped.", "");
  L.push("---", "");
  L.push("Regenerate with `npx tsx scripts/propose-topic-clusters.ts`.");
  L.push("Apply to staging with `--apply` (it refuses to run against production).");
  writeFileSync(OUT, L.join("\n") + "\n");
  console.log(`wrote ${OUT}`);
  console.log(`${orphans.length} cluster-less topics · ${rows.length} segments · ${rows.reduce((n, r) => n + r.questions, 0)} questions`);
  for (const [id, c] of [...byCluster.entries()].sort((a, b) => a[0] - b[0]))
    console.log(`  cluster ${id}: ${c.segs} segments, ${c.topics} topics, ${c.questions} questions`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
