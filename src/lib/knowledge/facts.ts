/**
 * "Golden nuggets" for the floating Nursing Knowledge widget.
 *
 * `front` is the prompt, `back` is the reveal. Keep `back` to one or two lines —
 * the widget is a small card, not a textbook.
 *
 * CLINICAL ACCURACY: these are study prompts shown to candidates preparing for a
 * registration exam, so every one needs a nursing sign-off before it is treated as
 * authoritative. Generate the review PDF with:
 *
 *     npx tsx scripts/knowledge-facts-pdf.ts
 *
 * Reference ranges are given in SI units (mmol/L, g/L) to match Caribbean and UK
 * laboratory reporting, and they vary slightly between laboratories — the widget
 * teaches the shape of a value, not a local reference range.
 */
export type KnowledgeFact = {
  category: KnowledgeCategory;
  front: string;
  back: string;
};

export const KNOWLEDGE_CATEGORIES = [
  "Vital Signs",
  "Lab Values",
  "Medication Safety",
  "Prioritisation",
  "Infection Control",
  "Fluids & Electrolytes",
  "Respiratory",
  "Cardiac",
  "Neuro",
  "Maternal & Newborn",
  "Paediatrics",
  "Mental Health",
  "Caribbean Focus",
  "Mnemonics",
  "Safety",
] as const;
export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

export const FACTS: readonly KnowledgeFact[] = [
  // ── Vital Signs ─────────────────────────────────────────────────────────
  { category: "Vital Signs", front: "Normal adult vitals you must know", back: "T 36.5–37.5°C · P 60–100 bpm · R 12–20/min · BP <120/80 · SpO₂ ≥95%" },
  { category: "Vital Signs", front: "Normal newborn heart and respiratory rate", back: "HR 110–160 bpm · RR 30–60/min. Both are far faster than an adult's — count for a full minute." },
  { category: "Vital Signs", front: "What counts as a hypertensive crisis?", back: "BP ≥180/120 mmHg. Treat as an emergency and look for end-organ signs: headache, visual change, chest pain." },
  { category: "Vital Signs", front: "How is orthostatic hypotension defined?", back: "A fall of ≥20 mmHg systolic or ≥10 mmHg diastolic within 3 minutes of standing. Check lying, sitting, standing." },
  { category: "Vital Signs", front: "Mean arterial pressure — the number that matters for perfusion", back: "MAP ≈ (systolic + 2 × diastolic) ÷ 3. Organs need roughly ≥65 mmHg to perfuse." },
  { category: "Vital Signs", front: "Cushing's triad signals what?", back: "Rising intracranial pressure: hypertension with a widening pulse pressure, bradycardia, and irregular respirations. A late and ominous sign." },
  { category: "Vital Signs", front: "Minimum acceptable adult urine output", back: "0.5 mL/kg/hour, or roughly 30 mL/hour. Less than that is oliguria — report it." },
  { category: "Vital Signs", front: "Why take an apical pulse for a full minute?", back: "Because an irregular rhythm cannot be extrapolated from 15 seconds. Always a full minute before digoxin and in any arrhythmia." },
  { category: "Vital Signs", front: "Pulse pressure — and when it narrows", back: "Systolic minus diastolic, normally 30–40 mmHg. A narrowing pulse pressure can be an early shock sign." },
  { category: "Vital Signs", front: "Fever in an older adult", back: "May be absent. An older person with infection often presents with confusion, falls or reduced intake rather than a temperature." },

  // ── Lab Values ──────────────────────────────────────────────────────────
  { category: "Lab Values", front: "Serum potassium — the classic RENR value", back: "3.5–5.0 mmol/L. Below 3.5 → hypokalaemia: flattened T waves, weakness, arrhythmia." },
  { category: "Lab Values", front: "Serum sodium", back: "135–145 mmol/L. Sodium problems present neurologically: confusion, headache, seizures." },
  { category: "Lab Values", front: "Total serum calcium", back: "2.1–2.6 mmol/L. Low calcium → tingling, tetany, Trousseau's and Chvostek's signs." },
  { category: "Lab Values", front: "Serum magnesium", back: "0.7–1.0 mmol/L. Low magnesium makes hypokalaemia refractory — replace magnesium or the potassium won't correct." },
  { category: "Lab Values", front: "Fasting blood glucose", back: "3.9–5.5 mmol/L normally. Fasting ≥7.0 mmol/L on two occasions supports a diabetes diagnosis." },
  { category: "Lab Values", front: "HbA1c — what it tells you", back: "Average glycaemia over about 3 months. ≥6.5% is diagnostic of diabetes; most adults aim below 7%." },
  { category: "Lab Values", front: "Haemoglobin reference range", back: "Roughly 130–170 g/L in men and 120–155 g/L in women. Below that is anaemia — look for the cause." },
  { category: "Lab Values", front: "Platelet count", back: "150–400 × 10⁹/L. Below 50 raises real bleeding risk; below 20 is spontaneous bleeding territory." },
  { category: "Lab Values", front: "White cell count", back: "4–11 × 10⁹/L. A left shift (more neutrophils) suggests bacterial infection; a very low count means neutropenic precautions." },
  { category: "Lab Values", front: "Therapeutic INR on warfarin", back: "Usually 2.0–3.0. Above range means bleeding risk — the antidote is vitamin K." },
  { category: "Lab Values", front: "Therapeutic digoxin level", back: "0.5–2.0 ng/mL. Above 2.0 is toxic: nausea, visual halos or yellow vision, bradycardia, confusion." },
  { category: "Lab Values", front: "Therapeutic lithium level", back: "0.6–1.2 mmol/L — a narrow window. Above 1.5 is toxic: tremor, vomiting, ataxia, confusion." },
  { category: "Lab Values", front: "Troponin timing after myocardial infarction", back: "Begins rising about 3–4 hours after injury and peaks within about 24 hours. A single early normal value does not exclude an MI." },
  { category: "Lab Values", front: "What does a raised BNP suggest?", back: "Ventricular stretch — most often heart failure. It helps separate cardiac from respiratory breathlessness." },
  { category: "Lab Values", front: "Potassium above 6.5 mmol/L", back: "A medical emergency. Expect peaked T waves and a risk of fatal arrhythmia. Get an ECG and stop all potassium." },
  { category: "Lab Values", front: "Serum creatinine — what it reflects", back: "Kidney function. A rising creatinine with falling urine output is acute kidney injury; it also changes drug dosing." },
  { category: "Lab Values", front: "Reading a trend versus a single value", back: "A value inside range that has moved sharply can matter more than one just outside it. Always compare with the last result." },

  // ── Medication Safety ───────────────────────────────────────────────────
  { category: "Medication Safety", front: "The 5 Rights of medication administration", back: "Right patient · right drug · right dose · right route · right time. Two identifiers, every time." },
  { category: "Medication Safety", front: "When do you hold digoxin?", back: "If the adult apical pulse is below 60 bpm. Withhold, recheck, and report before giving." },
  { category: "Medication Safety", front: "Why does hypokalaemia matter on digoxin?", back: "Low potassium potentiates digoxin toxicity. Watch the potassium of anyone on digoxin and a diuretic." },
  { category: "Medication Safety", front: "Which tablets must never be crushed?", back: "Enteric-coated and extended- or sustained-release forms. Crushing them delivers the whole dose at once." },
  { category: "Medication Safety", front: "Mixing insulins in one syringe", back: "Draw clear before cloudy — regular before NPH — so the short-acting vial is never contaminated." },
  { category: "Medication Safety", front: "Rapid-acting insulin and mealtimes", back: "Onset is about 15 minutes. Food must be in front of the patient before you give it." },
  { category: "Medication Safety", front: "Antidotes worth memorising (1)", back: "Warfarin → vitamin K · Heparin → protamine sulfate · Opioids → naloxone." },
  { category: "Medication Safety", front: "Antidotes worth memorising (2)", back: "Paracetamol/acetaminophen → N-acetylcysteine · Benzodiazepines → flumazenil · Magnesium → calcium gluconate." },
  { category: "Medication Safety", front: "Giving IV potassium", back: "Never as a bolus or push. Always diluted, always on a pump, and watch the site — it is intensely irritant." },
  { category: "Medication Safety", front: "Classic ACE inhibitor adverse effects", back: "A dry persistent cough, hyperkalaemia, and — rarely but dangerously — angioedema. Stop and escalate for airway swelling." },
  { category: "Medication Safety", front: "Why are beta blockers risky in diabetes?", back: "They mask the adrenergic warning signs of hypoglycaemia — tremor and tachycardia. Sweating usually remains." },
  { category: "Medication Safety", front: "Never stop a beta blocker abruptly", back: "Abrupt withdrawal can cause rebound tachycardia, hypertension and ischaemia. Taper under supervision." },
  { category: "Medication Safety", front: "Furosemide — what to monitor", back: "Potassium, sodium and hydration. Push slowly: rapid IV administration risks ototoxicity." },
  { category: "Medication Safety", front: "Metformin and contrast imaging", back: "Usually withheld around iodinated contrast because of the lactic acidosis risk if kidney function drops." },
  { category: "Medication Safety", front: "Aminoglycosides such as gentamicin", back: "Nephrotoxic and ototoxic. Monitor trough levels, creatinine, and ask about hearing or balance change." },
  { category: "Medication Safety", front: "MAOIs and tyramine", back: "Aged cheese, cured meat, red wine and soy can trigger a hypertensive crisis. Strict dietary teaching is essential." },
  { category: "Medication Safety", front: "Which medicines are 'high alert'?", back: "Insulin, heparin and anticoagulants, opioids, and concentrated potassium. Most require an independent double-check." },
  { category: "Medication Safety", front: "A patient questions their medication", back: "Stop. Do not give it. Re-verify against the order — patients catch real errors." },
  { category: "Medication Safety", front: "Verbal orders", back: "Write it down and read it back to the prescriber. Never act on an unrepeated verbal order." },
  { category: "Medication Safety", front: "Nitroglycerin before you give it", back: "Check the blood pressure. Typically withheld if systolic is below 90 mmHg. Headache is expected, not an allergy." },

  // ── Prioritisation ──────────────────────────────────────────────────────
  { category: "Prioritisation", front: "The first framework for any 'what do you do first?'", back: "ABC — airway, then breathing, then circulation. An airway problem always outranks everything else." },
  { category: "Prioritisation", front: "Where does Maslow fit in prioritisation?", back: "Physiological needs before psychosocial ones. Pain and oxygen come before reassurance." },
  { category: "Prioritisation", front: "Actual versus potential problems", back: "An actual problem outranks a potential one — unless the potential one is airway, breathing or circulation." },
  { category: "Prioritisation", front: "Which patient do you see first?", back: "The unstable one, the acute change over the chronic state, and the unexpected finding over the expected one." },
  { category: "Prioritisation", front: "When the options are assess or intervene", back: "Assess first, unless the situation is immediately life-threatening. You cannot treat what you have not established." },
  { category: "Prioritisation", front: "A patient is in immediate danger — do you leave to get help?", back: "No. Stay and call for help from the room. Never leave an unsafe patient unattended." },
  { category: "Prioritisation", front: "What can never be delegated by a registered nurse?", back: "Assessment, teaching, evaluation, clinical judgement, and the care of an unstable patient." },
  { category: "Prioritisation", front: "Delegating to unlicensed assistive personnel", back: "Suits stable, predictable, routine tasks with a clear expected outcome — and you remain accountable for the outcome." },
  { category: "Prioritisation", front: "A trend versus a snapshot", back: "Three readings drifting the wrong way beat one abnormal number. Always look back before you act." },
  { category: "Prioritisation", front: "The single most reliable early warning sign", back: "A change in level of consciousness or new confusion. It precedes most deterioration." },

  // ── Infection Control ───────────────────────────────────────────────────
  { category: "Infection Control", front: "The single most effective infection control measure", back: "Hand hygiene, before and after every patient contact. Nothing else comes close." },
  { category: "Infection Control", front: "Who gets standard precautions?", back: "Every patient, every time, regardless of diagnosis. They assume all blood and body fluid is infectious." },
  { category: "Infection Control", front: "Airborne precautions — which conditions and what PPE?", back: "Tuberculosis, measles, varicella. N95 respirator and a negative-pressure room with the door closed." },
  { category: "Infection Control", front: "Droplet precautions", back: "Influenza, pertussis, meningococcal disease. A surgical mask within about a metre, and a private room if possible." },
  { category: "Infection Control", front: "Contact precautions", back: "MRSA, C. difficile, scabies. Gown and gloves on entry, dedicated equipment." },
  { category: "Infection Control", front: "Why soap and water for C. difficile?", back: "Alcohol gel does not kill spores. Wash with soap and water, and clean the room with a sporicidal agent." },
  { category: "Infection Control", front: "Order for putting PPE on", back: "Gown, mask or respirator, eye protection, then gloves." },
  { category: "Infection Control", front: "Order for taking PPE off", back: "Gloves, eye protection, gown, then mask — leaving the most contaminated item first and the airway protection last." },
  { category: "Infection Control", front: "Sterile field rules that catch people out", back: "Anything below waist level is contaminated, a 2.5 cm border is unsterile, and moisture wicks contamination through." },
  { category: "Infection Control", front: "Caring for a neutropenic patient", back: "Protective precautions: no unwashed raw food, no fresh flowers or standing water, and no visitors with any infection." },
  { category: "Infection Control", front: "Needle safety", back: "Never recap a used needle. Dispose at the point of use, in a sharps container you can see." },

  // ── Fluids & Electrolytes ───────────────────────────────────────────────
  { category: "Fluids & Electrolytes", front: "Name the isotonic fluids", back: "0.9% sodium chloride and lactated Ringer's. They stay in the extracellular space and expand volume." },
  { category: "Fluids & Electrolytes", front: "What is the risk with hypotonic fluid?", back: "0.45% saline pulls water into cells — dangerous where cerebral oedema is a concern." },
  { category: "Fluids & Electrolytes", front: "Signs of hypovolaemia", back: "Dry mucous membranes, poor skin turgor, tachycardia, falling BP, concentrated urine, thirst." },
  { category: "Fluids & Electrolytes", front: "Signs of fluid overload", back: "Crackles, raised jugular venous pressure, bounding pulse, peripheral oedema, sudden weight gain." },
  { category: "Fluids & Electrolytes", front: "The quickest fluid-balance measure at the bedside", back: "Daily weight, same scale, same time, same clothing. About 1 kg gained equals about 1 litre retained." },
  { category: "Fluids & Electrolytes", front: "Emergency treatment of hyperkalaemia", back: "Calcium to stabilise the myocardium, insulin with dextrose to shift potassium into cells, then something to remove it." },
  { category: "Fluids & Electrolytes", front: "Correcting sodium — why slowly?", back: "Rapid correction of chronic hyponatraemia can cause osmotic demyelination. Slow and monitored." },
  { category: "Fluids & Electrolytes", front: "Two bedside signs of hypocalcaemia", back: "Trousseau's sign — carpal spasm with a BP cuff — and Chvostek's sign, facial twitch on tapping the facial nerve." },

  // ── Respiratory ─────────────────────────────────────────────────────────
  { category: "Respiratory", front: "Oxygen target in COPD", back: "Usually 88–92%. Over-oxygenating a CO₂ retainer can suppress the drive to breathe." },
  { category: "Respiratory", front: "The most ominous sign in acute asthma", back: "A silent chest. No wheeze means too little air is moving — escalate immediately." },
  { category: "Respiratory", front: "Classic presentation of pulmonary embolism", back: "Sudden breathlessness, pleuritic chest pain, tachycardia, sometimes haemoptysis. Think about it after immobility or surgery." },
  { category: "Respiratory", front: "Chest drain — what does bubbling mean?", back: "Continuous bubbling in the water seal suggests an air leak. Keep the unit upright and below chest level; never clamp for long." },
  { category: "Respiratory", front: "What stays at a tracheostomy bedside?", back: "The obturator, a spare tube of the same size, one a size smaller, and suction ready." },
  { category: "Respiratory", front: "Positioning for breathlessness", back: "Upright, high Fowler's or leaning forward on a table. Sitting up reduces the work of breathing before any drug does." },

  // ── Cardiac ─────────────────────────────────────────────────────────────
  { category: "Cardiac", front: "MONA — acute chest pain", back: "Morphine · Oxygen · Nitrates · Aspirin. Relieve pain, then reassess — and get the ECG early." },
  { category: "Cardiac", front: "Left versus right heart failure", back: "Left backs up into the lungs: crackles, orthopnoea. Right backs up systemically: oedema, raised JVP, ascites." },
  { category: "Cardiac", front: "Atrial fibrillation — the rhythm and the risk", back: "Irregularly irregular, with no clear P waves. The real danger is clot formation and stroke, hence anticoagulation." },
  { category: "Cardiac", front: "Adult chest compressions", back: "Rate 100–120 per minute, depth 5–6 cm, 30:2 with ventilation, and full recoil between compressions." },
  { category: "Cardiac", front: "Which chest pain is not cardiac?", back: "Never assume. Pain reproducible on palpation or clearly positional is less likely cardiac, but an ECG and troponin settle it." },

  // ── Neuro ───────────────────────────────────────────────────────────────
  { category: "Neuro", front: "Glasgow Coma Scale range", back: "3 to 15. Eight or less means the airway is at risk — think intubation." },
  { category: "Neuro", front: "First action in a seizure", back: "Protect the airway and the head, turn them to the side, and time it. Never force anything into the mouth." },
  { category: "Neuro", front: "Raised intracranial pressure — positioning", back: "Head of bed elevated about 30°, head midline and neutral. Avoid neck flexion and hip flexion." },
  { category: "Neuro", front: "Stroke — why the time of onset matters", back: "Thrombolysis is time-limited. The last time the patient was seen normal decides what treatment is possible." },
  { category: "Neuro", front: "The earliest sign of neurological deterioration", back: "A change in level of consciousness. Pupil changes and vital sign changes come later." },

  // ── Maternal & Newborn ──────────────────────────────────────────────────
  { category: "Maternal & Newborn", front: "When is APGAR scored, and out of what?", back: "At 1 and 5 minutes. Five categories scored 0–2, so a maximum of 10." },
  { category: "Maternal & Newborn", front: "How is preeclampsia defined?", back: "New hypertension — BP ≥140/90 — after 20 weeks' gestation, with proteinuria or other organ involvement." },
  { category: "Maternal & Newborn", front: "Preeclampsia with severe features", back: "BP ≥160/110, severe headache, visual disturbance, epigastric or right upper quadrant pain. Escalate urgently." },
  { category: "Maternal & Newborn", front: "First sign of magnesium sulfate toxicity", back: "Loss of deep tendon reflexes, then respiratory depression. Stop the infusion; the antidote is calcium gluconate." },
  { category: "Maternal & Newborn", front: "Late decelerations mean what?", back: "Uteroplacental insufficiency. Reposition to the left side, give oxygen, stop oxytocin, increase IV fluid, and call for help." },
  { category: "Maternal & Newborn", front: "Variable decelerations mean what?", back: "Cord compression. Reposition first; consider amnioinfusion if they persist." },
  { category: "Maternal & Newborn", front: "Early decelerations mean what?", back: "Head compression during a contraction. They mirror the contraction and are benign." },
  { category: "Maternal & Newborn", front: "Postpartum haemorrhage — the first action", back: "Massage the fundus. Most early haemorrhage is uterine atony, and a boggy uterus is the clue." },
  { category: "Maternal & Newborn", front: "Where should the fundus be after birth?", back: "Firm, midline, at or just below the umbilicus. Boggy means atony; displaced to the side usually means a full bladder." },
  { category: "Maternal & Newborn", front: "How much weight may a newborn lose?", back: "Up to about 10% in the first week, regained by roughly two weeks. More than that needs review." },

  // ── Paediatrics ─────────────────────────────────────────────────────────
  { category: "Paediatrics", front: "Croup versus epiglottitis", back: "Croup: barking cough, gradual. Epiglottitis: drooling, tripod posture, rapid onset — never inspect the throat, keep them calm." },
  { category: "Paediatrics", front: "Dehydration signs in an infant", back: "Sunken fontanelle, no tears, dry mucosa, fewer wet nappies, lethargy. Weight is the most objective measure." },
  { category: "Paediatrics", front: "Never add medication to a full bottle of feed", back: "If the infant does not finish it, the dose is unknown. Give it separately." },
  { category: "Paediatrics", front: "Why do children decompensate suddenly?", back: "They compensate with tachycardia for a long time, then fall off quickly. Bradycardia in a sick child is pre-arrest." },
  { category: "Paediatrics", front: "Paediatric doses", back: "Weight-based, and always double-checked. A decimal point error in paediatrics is a tenfold error." },

  // ── Mental Health ───────────────────────────────────────────────────────
  { category: "Mental Health", front: "A patient hints at suicide — what do you do?", back: "Ask directly and specifically about intent, plan and means. Asking does not plant the idea; it establishes risk." },
  { category: "Mental Health", front: "Neuroleptic malignant syndrome", back: "Fever, lead-pipe rigidity, altered mental state, autonomic instability. Stop the antipsychotic — it is life-threatening." },
  { category: "Mental Health", front: "Serotonin syndrome", back: "Agitation, hyperreflexia, clonus, hyperthermia, often after combining serotonergic drugs. Stop the agents and escalate." },
  { category: "Mental Health", front: "Lithium and hydration", back: "Dehydration, salt restriction and NSAIDs all raise lithium levels. Steady fluid and salt intake keeps it safe." },
  { category: "Mental Health", front: "Tardive dyskinesia", back: "Involuntary repetitive movements, often of face and tongue, after long-term antipsychotics. It may not reverse — report early." },
  { category: "Mental Health", front: "Therapeutic communication — what to avoid", back: "Avoid 'why' questions, false reassurance, and giving advice. Use open questions, silence, and reflection." },
  { category: "Mental Health", front: "Restraint principles", back: "Last resort, least restrictive option, prescribed, time-limited, with documented monitoring and frequent review." },

  // ── Caribbean Focus ─────────────────────────────────────────────────────
  { category: "Caribbean Focus", front: "Sickle cell crisis — the priorities", back: "Hydration, oxygen, and adequate analgesia, usually opioid. Under-treating the pain is the commonest error." },
  { category: "Caribbean Focus", front: "What precipitates a sickle cell crisis?", back: "Dehydration, hypoxia, cold, infection, acidosis and physical stress. Prevention teaching centres on fluids and avoiding cold." },
  { category: "Caribbean Focus", front: "Dengue warning signs", back: "Severe abdominal pain, persistent vomiting, mucosal bleeding, lethargy, and a rising haematocrit with falling platelets." },
  { category: "Caribbean Focus", front: "Which analgesic in dengue?", back: "Paracetamol. Avoid aspirin and NSAIDs — they worsen the bleeding risk." },
  { category: "Caribbean Focus", front: "Chikungunya — the distinguishing feature", back: "Severe, often prolonged polyarthralgia alongside fever. Care is supportive; joint pain can persist for months." },
  { category: "Caribbean Focus", front: "Leptospirosis and flooding", back: "Consider it after freshwater or floodwater exposure, especially with rodent contact. Fever with jaundice and renal impairment is the red flag." },
  { category: "Caribbean Focus", front: "Why is hypertension such a priority regionally?", back: "It is highly prevalent in Caribbean populations and drives stroke, heart failure and chronic kidney disease. Adherence teaching is central." },
  { category: "Caribbean Focus", front: "Type 2 diabetes foot care teaching", back: "Inspect daily including between the toes, never walk barefoot, well-fitting closed shoes, and never self-treat corns." },

  // ── Mnemonics ───────────────────────────────────────────────────────────
  { category: "Mnemonics", front: "SBAR — handing over safely", back: "Situation · Background · Assessment · Recommendation. It forces you to state what you actually want to happen." },
  { category: "Mnemonics", front: "SAMPLE — the rapid history", back: "Signs · Allergies · Medications · Past history · Last intake · Events leading up." },
  { category: "Mnemonics", front: "PQRST — assessing pain", back: "Provocation · Quality · Region and radiation · Severity · Timing." },
  { category: "Mnemonics", front: "RACE — fire response", back: "Rescue anyone in danger · Alarm · Contain by closing doors · Extinguish or evacuate." },
  { category: "Mnemonics", front: "PASS — using an extinguisher", back: "Pull the pin · Aim at the base · Squeeze · Sweep side to side." },

  // ── Safety ──────────────────────────────────────────────────────────────
  { category: "Safety", front: "Preventing falls — the highest-yield actions", back: "Bed low and brakes on, call bell within reach, non-slip footwear, clear path to the toilet, and timed toileting rounds." },
  { category: "Safety", front: "Before any procedure or transfusion", back: "Two patient identifiers plus an independent check. Never use room number as an identifier." },
  { category: "Safety", front: "A transfusion reaction begins — first action", back: "Stop the transfusion immediately, keep the IV line with saline via fresh tubing, then assess and report." },
  { category: "Safety", front: "When is a transfusion reaction most likely?", back: "In the first 15 minutes. Stay with the patient and monitor closely through that window." },
  { category: "Safety", front: "Documenting an error", back: "Record what happened, the patient's condition, and who was notified — factually. Never document 'error' as an opinion or blame." },
  { category: "Safety", front: "Informed consent — the nurse's role", back: "The prescriber explains the procedure and risks. The nurse witnesses the signature and confirms the patient understands." },
] as const;

/** Deterministic rotation offset so the widget doesn't always open on the same fact. */
export function factAt(index: number): KnowledgeFact {
  return FACTS[((index % FACTS.length) + FACTS.length) % FACTS.length];
}
