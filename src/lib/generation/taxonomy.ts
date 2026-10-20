/**
 * The fixed RENR classification axes every content generator plans against.
 * Pure data, no imports: shared by the CLI generators (scripts/) and, later, the teacher UI.
 *
 * Topics (~1,200, each in one cluster) live in the database (`topics`), not here.
 */

export const DOMAINS = [
  { code: "NP",   name: "Nursing Practice",                             pct: 30 },
  { code: "CDM",  name: "Clinical Decision Making and Intervention",    pct: 20 },
  { code: "NLM",  name: "Nursing Leadership and Management",            pct: 15 },
  { code: "PC",   name: "Professional Conduct",                         pct: 10 },
  { code: "HPMW", name: "Health Promotion and Maintenance of Wellness", pct: 10 },
  { code: "COM",  name: "Communication",                                pct: 10 },
  { code: "PD",   name: "Professional Development",                     pct: 5  },
] as const;

export const TAXONOMY = [
  { code: "AP",  name: "Application",                       pct: 50, db: "application" },
  { code: "ASE", name: "Analysis / Synthesis / Evaluation", pct: 30, db: "analysis" },
  { code: "KC",  name: "Knowledge / Comprehension",         pct: 20, db: "knowledge" },
] as const;

export const CLUSTERS = [
  { code: "MEDSURG",  name: "Medical-surgical and community health priorities", pct: 30, examples: "cardiac, endocrine, renal, respiratory, infectious disease, trauma, cancer" },
  { code: "SAFETY",   name: "Safety, infection control, and core procedures",   pct: 22, examples: "PPE, medication safety, dosage calculation, IV therapy, oxygen, CPR, wound care" },
  { code: "MATCHILD", name: "Maternal-child and family nursing",                pct: 22, examples: "antenatal, obstetric emergencies, postpartum, newborn, growth and development, pediatrics" },
  { code: "MGMT",     name: "Management, legal, and professionalism",           pct: 14, examples: "nursing process, assessment, prioritization, delegation, ethics, legal practice" },
  { code: "PSYCHSOC", name: "Psychosocial and therapeutic communication",       pct: 12, examples: "therapeutic responses, psychosis, anxiety, substance use, family counselling, culture" },
] as const;

/** Case-study specialties: the case-code prefix (NRG-MS-001). Weights mirror content/case-studies/catalog.json. */
export const CASE_SPECIALTIES = [
  { code: "MS", name: "Medical-surgical" },
  { code: "PD", name: "Paediatric" },
  { code: "OB", name: "Maternal / obstetric" },
  { code: "MH", name: "Mental health" },
  { code: "CH", name: "Community health" },
] as const;

/** Stand-alone MCQs store easy/medium/hard; cases use low/moderate/high (V3 standard). */
export const MCQ_DIFFICULTIES = ["easy", "medium", "hard"] as const;
export const CASE_DIFFICULTIES = ["low", "moderate", "high"] as const;

/** The generators a request can target. Add a kind here and in request.ts to plug in a new one (e.g. flashcards). */
export const GENERATOR_KINDS = [
  { kind: "mcq",        name: "Stand-alone questions", maxCount: 200 },
  { kind: "case_study", name: "Unfolding case studies", maxCount: 10 },
] as const;

export type DomainCode = (typeof DOMAINS)[number]["code"];
export type TaxonomyCode = (typeof TAXONOMY)[number]["code"];
export type ClusterCode = (typeof CLUSTERS)[number]["code"];
export type SpecialtyCode = (typeof CASE_SPECIALTIES)[number]["code"];
export type McqDifficulty = (typeof MCQ_DIFFICULTIES)[number];
export type CaseDifficulty = (typeof CASE_DIFFICULTIES)[number];
export type GeneratorKind = (typeof GENERATOR_KINDS)[number]["kind"];

export const DOMAIN_CODES = DOMAINS.map(d => d.code) as DomainCode[];
export const TAXONOMY_CODES = TAXONOMY.map(t => t.code) as TaxonomyCode[];
export const CLUSTER_CODES = CLUSTERS.map(c => c.code) as ClusterCode[];
export const SPECIALTY_CODES = CASE_SPECIALTIES.map(s => s.code) as SpecialtyCode[];
