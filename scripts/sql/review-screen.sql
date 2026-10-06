-- NRG: rule-based screen of AI-generated / prototype-import questions against MCQ standard v0.1.
-- READ-ONLY. Run in the Supabase SQL editor (staging first). Nothing here changes data.
-- Written 2026-10-04. Mirrors the rules in scripts/generation-rules.json.
-- Result 1 = counts by source family. Result 2 = one row per flagged question (export as CSV).
-- Counts are keyword hits, not verdicts: a human (Jade) decides what is actually out of scope.

-- ===== 1. Counts by source family (proto = prototype imports, ai = generated bank) =====
WITH o AS (
  SELECT question_id,
    count(*) n_opts, count(*) FILTER (WHERE is_correct) n_correct,
    max(length(body)) maxlen, min(length(body)) minlen,
    max(length(body)) FILTER (WHERE is_correct) clen,
    avg(length(body)) FILTER (WHERE NOT is_correct) wavg,
    count(*) FILTER (WHERE NOT is_correct AND (rationale IS NULL OR length(btrim(rationale))<30)) wrong_no_rat,
    count(*) FILTER (WHERE NOT is_correct AND rationale ILIKE '%misses the main nursing priority%') wrong_generic,
    string_agg(body,' | ') txt
  FROM public.question_options GROUP BY 1),
q AS (
  SELECT q.id, split_part(q.source_id,':',1) fam, q.body, q.explanation, o.*,
    coalesce(q.body,'')||' | '||coalesce(o.txt,'')||' | '||coalesce(q.explanation,'') AS alltxt
  FROM public.questions q LEFT JOIN o ON o.question_id=q.id
  WHERE q.is_ai_generated)
SELECT fam, count(*) n,
  count(*) FILTER (WHERE alltxt ~* '(critical care|intensive care|\mICU\M|\mCCU\M|\mNICU\M|\mPICU\M|vasopressor|inotrope|arterial line|swan.?ganz|mechanical ventilat|ventilator.?dependent)') critical_care,
  count(*) FILTER (WHERE alltxt ~* '(nurse practitioner|nursing practitioner|advanced[- ]practice)' OR alltxt ~ '\mNP\M') adv_practice,
  count(*) FILTER (WHERE alltxt ~* '(nurs(e|ing)[ -]diagnos|\mNANDA\M)') nursing_dx,          -- pending Jade
  count(*) FILTER (WHERE alltxt ~* '(trinidad|tobago|\mT&T\M)') tt_specific,                      -- pending Jade
  count(*) FILTER (WHERE (body||' '||coalesce(txt,'')) ~ '(\*\*|__|[↑↓▲▼])' OR (body||' '||coalesce(txt,'')) ~* '\((high|low|critical|abnormal|normal|elevated|decreased)\)') visual_flag,
  count(*) FILTER (WHERE wrong_no_rat>0) wrong_opt_no_rationale,
  count(*) FILTER (WHERE wrong_generic>0) generic_template_rationale,
  count(*) FILTER (WHERE n_opts<>4 OR n_correct<>1) bad_option_structure,
  count(*) FILTER (WHERE clen=maxlen AND clen>coalesce(wavg,0)+12) correct_longest_gap12,
  count(*) FILTER (WHERE maxlen::numeric/nullif(minlen,0)>1.4) len_spread_gt1_4
FROM q GROUP BY 1 ORDER BY 2 DESC;

-- ===== 2. One row per question hit by the settled hard rules (export as CSV for Jade) =====
SELECT q.source_id, q.review_status, q.is_active,
  array_remove(ARRAY[
   CASE WHEN a.alltxt ~* '(critical care|intensive care|\mICU\M|\mCCU\M|\mNICU\M|\mPICU\M|vasopressor|inotrope|arterial line|swan.?ganz|mechanical ventilat|ventilator.?dependent)' THEN 'critical_care' END,
   CASE WHEN a.alltxt ~* '(nurse practitioner|nursing practitioner|advanced[- ]practice)' OR a.alltxt ~ '\mNP\M' THEN 'adv_practice' END,
   CASE WHEN q.body ~ '(\*\*|__|[↑↓▲▼])' OR q.body ~* '\((high|low|critical|abnormal|normal|elevated|decreased)\)' THEN 'visual_flag' END
  ],NULL) AS flags,
  left(q.body,160) AS stem
FROM public.questions q
CROSS JOIN LATERAL (SELECT coalesce(q.body,'')||' | '||coalesce(q.explanation,'')||' | '||
  coalesce((SELECT string_agg(o.body,' | ') FROM public.question_options o WHERE o.question_id=q.id),'') AS alltxt) a
WHERE q.is_ai_generated AND (
  a.alltxt ~* '(critical care|intensive care|\mICU\M|\mCCU\M|\mNICU\M|\mPICU\M|vasopressor|inotrope|arterial line|swan.?ganz|mechanical ventilat|ventilator.?dependent|nurse practitioner|nursing practitioner|advanced[- ]practice)'
  OR a.alltxt ~ '\mNP\M' OR q.body ~ '(\*\*|__|[↑↓▲▼])' OR q.body ~* '\((high|low|critical|abnormal|normal|elevated|decreased)\)')
ORDER BY q.source_id;

-- ===== 3. Blueprint balance of the AI pool vs official RENR (NP30 CDM20 NLM15 PC10 HPMW10 COM10 PD5; KC20 AP50 ASE30) =====
WITH q AS (SELECT d.code dom, q.cognitive_level cl FROM public.questions q LEFT JOIN public.domains d ON d.id=q.domain_id WHERE q.is_ai_generated)
SELECT 'domain' kind, dom k, count(*) n, round(100.0*count(*)/(SELECT count(*) FROM q),1) pct FROM q GROUP BY dom
UNION ALL SELECT 'taxonomy', cl, count(*), round(100.0*count(*)/(SELECT count(*) FROM q),1) FROM q GROUP BY cl
ORDER BY 1,2;
