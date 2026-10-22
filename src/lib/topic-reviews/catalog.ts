/**
 * The 15 topic reviews: which deck each comes from, the words that link a question to it, and its related reviews.
 * scripts/import-topic-reviews.ts copies keywords and related into topic_reviews, which is what the app reads, so edit
 * them here and re-run the importer with --apply.
 *
 * Keywords are whole-word, case-insensitive phrases matched against a question's topic name and stem. They name the
 * condition (or something only that condition has), never a general word that many questions use, so a link is a
 * strong hint rather than a guess. A link needs a score of 2 (a hit in the question's topic name counts 2, each hit in
 * the stem 1), so a stem that mentions a condition once in passing doesn't link. `exclude` vetoes a review (pregnancy
 * hypertension is not this hypertension review). Ties go to the review listed first.
 */
export type CatalogEntry = {
  deck: string;
  slug: string;
  title: string;
  system: string;
  keywords: string[];
  exclude?: string[];
  related: string[];
};

export const CATALOG: CatalogEntry[] = [
  {
    deck: "htn", slug: "hypertension", title: "Hypertension and Cardiovascular Risk", system: "Cardiovascular",
    keywords: ["hypertension", "hypertensive", "high blood pressure", "antihypertensive", "antihypertensives", "DASH diet", "lisinopril", "enalapril", "amlodipine", "losartan", "hydrochlorothiazide"],
    exclude: ["pregnancy", "pregnant", "preeclampsia", "pre-eclampsia", "eclampsia", "gestational", "postpartum", "antenatal", "HELLP"],
    related: ["heart-failure", "acs-mi", "stroke", "renal"],
  },
  {
    deck: "heart_failure", slug: "heart-failure", title: "Heart Failure and Fluid Overload", system: "Cardiovascular",
    keywords: ["heart failure", "CHF", "congestive cardiac failure", "fluid overload", "pulmonary edema", "pulmonary oedema", "digoxin", "furosemide", "BNP"],
    related: ["hypertension", "acs-mi", "renal", "copd"],
  },
  {
    deck: "acs_mi", slug: "acs-mi", title: "ACS and Myocardial Infarction", system: "Cardiovascular",
    keywords: ["myocardial infarction", "MI", "STEMI", "NSTEMI", "acute coronary syndrome", "ACS", "angina", "troponin", "nitroglycerin", "coronary artery disease", "chest pain"],
    exclude: ["sickle", "acute chest syndrome"],
    related: ["heart-failure", "hypertension", "stroke"],
  },
  {
    deck: "stroke", slug: "stroke", title: "Stroke and Transient Ischemic Attack", system: "Neurological",
    keywords: ["stroke", "CVA", "cerebrovascular accident", "TIA", "transient ischemic attack", "transient ischaemic attack", "hemiplegia", "hemiparesis", "aphasia", "dysphagia", "FAST"],
    related: ["hypertension", "acs-mi", "meningitis", "trauma"],
  },
  {
    deck: "meningitis", slug: "meningitis", title: "Meningitis and Neurologic Infections", system: "Neurological",
    keywords: ["meningitis", "meningococcal", "encephalitis", "Kernig", "Brudzinski", "nuchal rigidity", "lumbar puncture", "droplet precautions"],
    related: ["stroke", "tb", "hiv", "env-vector"],
  },
  {
    deck: "renal", slug: "renal", title: "Renal Disorders", system: "Renal / Urinary",
    keywords: ["acute kidney injury", "AKI", "chronic kidney disease", "CKD", "renal failure", "kidney failure", "dialysis", "hemodialysis", "haemodialysis", "peritoneal dialysis", "glomerulonephritis", "nephrotic syndrome", "AV fistula", "arteriovenous fistula", "urinary tract infection", "UTI", "pyelonephritis"],
    related: ["hypertension", "heart-failure", "endocrine"],
  },
  {
    deck: "trauma", slug: "trauma", title: "Trauma Emergencies", system: "Multi-system",
    keywords: ["trauma", "primary survey", "ABCDE", "hypovolemic shock", "hypovolaemic shock", "hemorrhagic shock", "tension pneumothorax", "pneumothorax", "head injury", "traumatic brain injury", "spinal cord injury", "burns", "burn injury", "triage"],
    related: ["msk", "stroke", "renal"],
  },
  {
    deck: "cancer", slug: "cancer", title: "Neoplastic Disorders and Cancer Nursing", system: "Oncology",
    keywords: ["cancer", "carcinoma", "oncology", "chemotherapy", "radiation therapy", "radiotherapy", "neutropenia", "neutropenic", "tumour", "tumor", "leukemia", "leukaemia", "lymphoma", "mastectomy", "metastasis", "metastatic", "palliative"],
    related: ["hiv", "gi-hep", "endocrine"],
  },
  {
    deck: "tb", slug: "tb", title: "Tuberculosis", system: "Respiratory / Infectious disease",
    keywords: ["tuberculosis", "TB", "Mantoux", "tuberculin", "isoniazid", "rifampicin", "rifampin", "DOTS", "directly observed therapy", "airborne precautions", "N95"],
    related: ["hiv", "copd", "meningitis"],
  },
  {
    deck: "hiv", slug: "hiv", title: "HIV/AIDS and Confidentiality", system: "Immune / Infectious disease",
    keywords: ["HIV", "AIDS", "antiretroviral", "ART", "ARV", "CD4", "viral load", "PEP", "post-exposure prophylaxis", "PrEP", "opportunistic infection", "Pneumocystis"],
    related: ["tb", "meningitis", "cancer"],
  },
  {
    deck: "msk", slug: "msk", title: "Musculoskeletal Disorders", system: "Musculoskeletal",
    keywords: ["fracture", "fractures", "osteoporosis", "osteoarthritis", "rheumatoid arthritis", "gout", "compartment syndrome", "traction", "plaster cast", "hip replacement", "arthroplasty", "osteomyelitis", "amputation", "fat embolism"],
    related: ["trauma", "endocrine", "cancer"],
  },
  {
    deck: "endocrine", slug: "endocrine", title: "Endocrine and Metabolic Disorders", system: "Endocrine",
    keywords: ["diabetes", "diabetic", "DKA", "diabetic ketoacidosis", "HHS", "hyperosmolar", "hypoglycemia", "hypoglycaemia", "hyperglycemia", "hyperglycaemia", "insulin", "metformin", "HbA1c", "thyroid", "hypothyroidism", "hyperthyroidism", "thyroidectomy", "Addison", "Cushing", "diabetes insipidus", "SIADH"],
    related: ["renal", "hypertension", "msk"],
  },
  {
    deck: "env_vector", slug: "env-vector", title: "Environmental and Vector-Borne Threats", system: "Environmental health",
    keywords: ["dengue", "chikungunya", "Zika", "malaria", "yellow fever", "leptospirosis", "Aedes", "mosquito", "vector-borne", "heat stroke", "heatstroke", "snakebite", "rabies"],
    related: ["meningitis", "gi-hep", "trauma"],
  },
  {
    deck: "gi_hep", slug: "gi-hep", title: "GI and Hepatobiliary Disorders", system: "Gastrointestinal",
    keywords: ["hepatitis", "cirrhosis", "liver failure", "hepatic encephalopathy", "esophageal varices", "oesophageal varices", "ascites", "paracentesis", "cholecystitis", "cholelithiasis", "gallstones", "pancreatitis", "peptic ulcer", "GI bleed", "gastrointestinal bleeding", "appendicitis", "bowel obstruction", "colostomy", "ileostomy", "inflammatory bowel disease", "Crohn", "ulcerative colitis", "lactulose"],
    related: ["cancer", "env-vector", "endocrine"],
  },
  {
    deck: "copd", slug: "copd", title: "COPD and Chronic Respiratory Disease", system: "Respiratory",
    keywords: ["COPD", "chronic obstructive pulmonary disease", "emphysema", "chronic bronchitis", "asthma", "pursed-lip breathing", "pursed lip breathing", "bronchodilator", "salbutamol", "albuterol", "inhaler", "spirometry"],
    related: ["tb", "heart-failure", "hiv"],
  },
];

/** Acronyms (two or more capitals: "MI", "FAST", "PrEP", "HbA1c") must match exactly, or "fast" and "art" would link. */
export const isAcronym = (k: string) => (k.match(/[A-Z]/g)?.length ?? 0) >= 2;

const esc = (k: string) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
const wordRe = (ks: string[], flags: string) =>
  ks.length ? new RegExp(`(?<![A-Za-z0-9])(?:${ks.map(esc).join("|")})(?![A-Za-z0-9])`, flags) : null;

/** How many times a review's keywords occur in `text` (whole words; acronyms case-sensitive, the rest not). */
export function keywordHits(text: string, keywords: string[]): number {
  let n = 0;
  for (const re of [wordRe(keywords.filter(isAcronym), "g"), wordRe(keywords.filter((k) => !isAcronym(k)), "gi")]) {
    if (re) n += text.match(re)?.length ?? 0;
  }
  return n;
}

export type ReviewLink = { slug: string; title: string; keywords: string[]; exclude?: string[] };

export const MIN_LINK_SCORE = 2;

/** A question's score for one review (0 when an exclude term appears). */
export function linkScore(q: { body: string; topicName?: string | null }, r: Pick<ReviewLink, "keywords" | "exclude">): number {
  const topic = q.topicName ?? "";
  if (r.exclude?.length && keywordHits(`${topic} ${q.body}`, r.exclude) > 0) return 0;
  return 2 * keywordHits(topic, r.keywords) + keywordHits(q.body, r.keywords);
}

/** The review a question belongs to: the highest score of at least MIN_LINK_SCORE, or null. */
export function reviewForQuestion<R extends ReviewLink>(q: { body: string; topicName?: string | null }, reviews: R[]): R | null {
  let best: R | null = null;
  let bestScore = MIN_LINK_SCORE - 1;
  for (const r of reviews) {
    const score = linkScore(q, r);
    if (score > bestScore) { best = r; bestScore = score; }
  }
  return best;
}
