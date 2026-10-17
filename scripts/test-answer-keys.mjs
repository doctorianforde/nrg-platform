// Answer keys hidden from user tokens (migration 20261012170000_hide_answer_keys).
//
//   node scripts/test-answer-keys.mjs                         # staging (default)
//   CONFIRM_PROD=1 node scripts/test-answer-keys.mjs --target prod
//   CONFIRM_PROD=1 node scripts/test-answer-keys.mjs --target prod --pre   # BEFORE the migration: keys still readable
//
// Targets: staging uses *_STAGING env vars from .env.local; prod uses NEXT_PUBLIC_SUPABASE_URL /
// NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY. The project ref in the URL (and in the keys, when they are
// JWTs) must match the target, or the script refuses to run.
//
// Impact (written so it is safe on prod): two throwaway users (keys-student-*/keys-teacher-*@e2e-test.example.com) are
// created and ALWAYS deleted in `finally`, even on failure; deleting them cascades every row they produced (practice
// session, question_attempts, xp_events/xp_shadow, badges, case attempt + responses), and the script then verifies none
// is left. Nothing writes to shared content (questions, options, cases, sets): those are only read, with the service
// role, to pick a question and a case dynamically. Only the throwaway student earns XP/badges, and it is hidden from the
// classmates' badge wall (show_badges = false) for the few seconds it exists. Real users are never touched.
//
// --pre: run before the migration is applied. The key-hiding checks are then EXPECTED to be open; they print as
// "PRE-OK" when a key is still readable (the state before the migration) and the run passes if every one is open and
// the grading paths work. Without --pre, the same checks must be closed. Run --pre first, apply, then run without it.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const argVal = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const TARGET = argVal("--target") ?? "staging";
const PRE = args.includes("--pre");
const REFS = { staging: "kwhaqhhwqykckarjbdod", prod: "cdvubijjepwmhhkgppbl" };
if (!REFS[TARGET]) { console.error(`unknown --target ${TARGET} (staging | prod)`); process.exit(2); }
if (TARGET === "prod" && process.env.CONFIRM_PROD !== "1") {
  console.error("refusing: --target prod needs CONFIRM_PROD=1 in the environment (creates and deletes two throwaway users on prod).");
  process.exit(2);
}

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sfx = TARGET === "staging" ? "_STAGING" : "";
const SB = env[`NEXT_PUBLIC_SUPABASE_URL${sfx}`], ANON = env[`NEXT_PUBLIC_SUPABASE_ANON_KEY${sfx}`], SR = env[`SUPABASE_SERVICE_ROLE_KEY${sfx}`];
const REF = REFS[TARGET];
if (!SB || !ANON || !SR) { console.error(`refusing: missing URL/anon/service-role env vars for ${TARGET}`); process.exit(2); }
if (new URL(SB).hostname !== `${REF}.supabase.co`) { console.error(`refusing: URL is not the ${TARGET} project (${REF})`); process.exit(2); }
for (const [name, key] of [["anon key", ANON], ["service-role key", SR]]) {
  // Legacy keys are JWTs carrying the project ref; new-style sb_* keys are opaque (the URL check above covers them).
  const parts = key.split(".");
  if (parts.length !== 3) continue;
  let ref; try { ref = JSON.parse(Buffer.from(parts[1], "base64url").toString()).ref; } catch {}
  if (ref && ref !== REF) { console.error(`refusing: the ${name} belongs to project ${ref}, not ${TARGET} (${REF})`); process.exit(2); }
}
console.log(`target: ${TARGET} (${REF})${PRE ? " — PRE mode: expecting keys still readable" : ""}\n`);

const results = [];
const check = (n, p, d = "") => { results.push(!!p); console.log(`${p ? "PASS" : "FAIL"} | ${n}${d !== "" ? ` | ${d}` : ""}`); };
const skip = (n, why) => console.log(`SKIP | ${n} | ${why}`);
// A key-hiding check: closed (status >= 400) after the migration; open (200) before it.
const keyCheck = (n, r) => {
  const closed = r.status >= 400;
  if (!PRE) return check(n, closed, `status=${r.status}`);
  results.push(!closed);
  console.log(`${closed ? "FAIL" : "PRE-OK"} | ${n} | status=${r.status}${closed ? " (already closed — is the migration applied?)" : " (still open, as expected before the migration)"}`);
};

async function call(path, { method = "GET", body, token } = {}) {
  const headers = { apikey: token ? ANON : SR, Authorization: `Bearer ${token ?? SR}` };
  if (method !== "GET") { headers["Content-Type"] = "application/json"; headers.Prefer = "return=representation"; }
  const res = await fetch(`${SB}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch {} return { status: res.status, data };
}

const users = [];
async function createUser(role) {
  const email = `keys-${role}-${randomBytes(4).toString("hex")}@e2e-test.example.com`, password = randomBytes(12).toString("base64url") + "a1";
  const u = await call("/auth/v1/admin/users", { method: "POST", body: { email, password, email_confirm: true } });
  if (!u.data?.id) throw new Error(`could not create ${role} user: ${u.status} ${JSON.stringify(u.data).slice(0, 120)}`);
  users.push({ uid: u.data.id });
  const p = await call(`/rest/v1/profiles?id=eq.${u.data.id}`, { method: "PATCH", body: { role, subscription_tier: "premium", show_badges: false } });
  if (p.status >= 400) await call(`/rest/v1/profiles?id=eq.${u.data.id}`, { method: "PATCH", body: { role, subscription_tier: "premium" } }); // before trophies
  const t = await call("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password }, token: ANON });
  if (!t.data?.access_token) throw new Error(`could not sign in ${role} user: ${t.status}`);
  const x = users[users.length - 1]; x.token = t.data.access_token; return x;
}

try {
  const s = await createUser("student"), t = await createUser("teacher");

  // ---- 1. Keys are not readable with a user token ----
  for (const [who, u] of [["student", s], ["teacher", t]]) {
    keyCheck(`${who} cannot read is_correct`, await call("/rest/v1/question_options?select=id,is_correct&limit=1", { token: u.token }));
    keyCheck(`${who} cannot read option rationales`, await call("/rest/v1/question_options?select=id,rationale&limit=1", { token: u.token }));
    keyCheck(`${who} cannot read option types`, await call("/rest/v1/question_options?select=id,distractor_type&limit=1", { token: u.token }));
    keyCheck(`${who} cannot read explanations`, await call("/rest/v1/questions?select=id,explanation&limit=1", { token: u.token }));
    keyCheck(`${who}: select=* is refused rather than leaking`, await call("/rest/v1/question_options?select=*&limit=1", { token: u.token }));
    const r = await call("/rest/v1/questions?select=id,body,question_options(id,body,display_order)&is_active=eq.true&limit=2", { token: u.token });
    check(`${who} can still read stems and option text`, r.status === 200 && r.data.length >= 1 && r.data[0].question_options.length > 0, `status=${r.status} rows=${r.data?.length}`);
  }

  // ---- 2. Grading still works without the user reading keys (question and case picked dynamically) ----
  let qs = await call("/rest/v1/questions?select=id,question_options(id,is_correct)&is_active=eq.true&context=eq.standalone&limit=20");
  if (qs.status >= 400) qs = await call("/rest/v1/questions?select=id,question_options(id,is_correct)&is_active=eq.true&limit=20"); // no `context` column yet
  const q = (qs.data ?? []).find((x) => x.question_options.some((o) => o.is_correct));
  if (!q) skip("practice grading still works", "no active standalone question with a keyed option on this project");
  else {
    const right = q.question_options.filter((o) => o.is_correct).map((o) => o.id);
    const r = await call("/rest/v1/rpc/record_practice_answers", { method: "POST", token: s.token, body: { p_answers: [{ question_id: q.id, option_ids: right }] } });
    check("practice grading still works", r.status === 200 && r.data?.correct_count === 1, `status=${r.status}`);
  }

  // Prefer a published (active) case answered by the student; otherwise a staff preview of any case with questions.
  const cases = (await call("/rest/v1/case_studies?select=id,case_code,is_active,case_study_questions(count)&order=is_active.desc,case_code")).data ?? [];
  const cs = (Array.isArray(cases) ? cases : []).find((c) => c.case_study_questions?.[0]?.count > 0);
  if (!cs) skip("case grading still works", "no case study with questions on this project");
  else {
    const who = cs.is_active ? s : t;
    let r = await call("/rest/v1/rpc/start_case_attempt", { method: "POST", token: who.token, body: { p_case_id: cs.id } });
    const att = r.data;
    if (r.status !== 200 || !att?.id) check("case grading still works", false, `start_case_attempt status=${r.status} ${JSON.stringify(r.data).slice(0, 80)}`);
    else {
      const cq = (await call(`/rest/v1/case_study_questions?select=questions(question_options(id,is_correct))&case_study_id=eq.${cs.id}&display_order=eq.${att.next_position}`)).data?.[0];
      const opt = cq?.questions?.question_options?.find((o) => o.is_correct)?.id;
      if (!opt) skip("case grading still works", `${cs.case_code}: current question has no keyed option`);
      else {
        r = await call("/rest/v1/rpc/answer_case_question", { method: "POST", token: who.token, body: { p_attempt_id: att.id, p_option_id: opt } });
        check("case grading still works", r.status === 200, `${cs.case_code} as ${cs.is_active ? "student" : "teacher (preview)"}, status=${r.status}`);
      }
    }
  }
} catch (e) { console.error("test error:", e.stack); process.exitCode = 1; }
finally {
  const uids = users.map((u) => u.uid);
  for (const uid of uids) {
    await call(`/rest/v1/case_attempts?student_id=eq.${uid}`, { method: "DELETE" });
    const d = await call(`/auth/v1/admin/users/${uid}`, { method: "DELETE" });
    if (d.status >= 300) console.error(`CLEANUP WARNING: could not delete throwaway user ${uid} (status ${d.status}) — delete it by hand`);
  }
  // Confirm nothing the throwaway users produced is left behind.
  if (uids.length) {
    const inList = `in.(${uids.join(",")})`, left = [];
    for (const [table, col] of [["profiles", "id"], ["practice_sessions", "student_id"], ["question_attempts", "user_id"], ["xp_events", "user_id"],
      ["xp_shadow", "user_id"], ["user_badges", "user_id"], ["case_attempts", "student_id"]]) {
      const r = await call(`/rest/v1/${table}?select=${col}&${col}=${inList}`);
      if (r.status === 200 && r.data.length) left.push(`${table}:${r.data.length}`);
    }
    console.log(left.length ? `CLEANUP WARNING: rows left behind: ${left.join(", ")}` : "\ncleanup: throwaway users and all their rows deleted");
    if (left.length) process.exitCode = 1;
  }
  const failed = results.filter((x) => !x).length;
  console.log(`\n${results.length - failed}/${results.length} passed${PRE ? " (PRE mode)" : ""}`);
  if (failed) process.exitCode = 1;
}
