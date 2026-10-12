// Answer keys hidden from user tokens (migration 20261012170000), against STAGING only. Throwaway users, cleaned up.
//   node scripts/test-answer-keys.mjs
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const SB = env.NEXT_PUBLIC_SUPABASE_URL_STAGING, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY_STAGING, SR = env.SUPABASE_SERVICE_ROLE_KEY_STAGING;
if (!SB?.includes("kwhaqhhwqykckarjbdod")) throw new Error("refusing: not the staging project");
const results = []; const check = (n, p, d = "") => { results.push(!!p); console.log(`${p ? "PASS" : "FAIL"} | ${n}${d !== "" ? ` | ${d}` : ""}`); };
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
  await call(`/rest/v1/profiles?id=eq.${u.data.id}`, { method: "PATCH", body: { role, subscription_tier: "premium" } });
  const t = await call("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password }, token: ANON });
  const x = { uid: u.data.id, token: t.data.access_token }; users.push(x); return x;
}
try {
  const s = await createUser("student"), t = await createUser("teacher");
  for (const [who, u] of [["student", s], ["teacher", t]]) {
    let r = await call("/rest/v1/question_options?select=id,is_correct&limit=1", { token: u.token });
    check(`${who} cannot read is_correct`, r.status >= 400, `status=${r.status}`);
    r = await call("/rest/v1/question_options?select=id,rationale&limit=1", { token: u.token });
    check(`${who} cannot read option rationales`, r.status >= 400, `status=${r.status}`);
    r = await call("/rest/v1/question_options?select=id,distractor_type&limit=1", { token: u.token });
    check(`${who} cannot read option types`, r.status >= 400, `status=${r.status}`);
    r = await call("/rest/v1/questions?select=id,explanation&limit=1", { token: u.token });
    check(`${who} cannot read explanations`, r.status >= 400, `status=${r.status}`);
    r = await call("/rest/v1/question_options?select=*&limit=1", { token: u.token });
    check(`${who}: select=* is refused rather than leaking`, r.status >= 400, `status=${r.status}`);
    r = await call("/rest/v1/questions?select=id,body,question_options(id,body,display_order)&is_active=eq.true&limit=2", { token: u.token });
    check(`${who} can still read stems and option text`, r.status === 200 && r.data.length === 2 && r.data[0].question_options.length > 0, `status=${r.status}`);
  }
  // Grading paths still work without the student being able to read keys.
  const q = (await call("/rest/v1/questions?select=id,question_options(id,is_correct)&is_active=eq.true&context=eq.standalone&limit=1")).data[0];
  const right = q.question_options.filter((o) => o.is_correct).map((o) => o.id);
  let r = await call("/rest/v1/rpc/record_practice_answers", { method: "POST", token: s.token, body: { p_answers: [{ question_id: q.id, option_ids: right }] } });
  check("practice grading still works", r.status === 200 && r.data.correct_count === 1, `status=${r.status}`);
  const cs = (await call("/rest/v1/case_studies?select=id&case_code=eq.NRG-PD-001")).data[0];
  r = await call("/rest/v1/rpc/start_case_attempt", { method: "POST", token: t.token, body: { p_case_id: cs.id } });
  const attempt = r.data?.id ?? r.data;
  const cq = (await call(`/rest/v1/case_study_questions?select=questions(question_options(id,is_correct))&case_study_id=eq.${cs.id}&display_order=eq.1`)).data[0];
  const opt = cq.questions.question_options.find((o) => o.is_correct).id;
  r = await call("/rest/v1/rpc/answer_case_question", { method: "POST", token: t.token, body: { p_attempt_id: attempt, p_option_id: opt } });
  check("case grading still works", r.status === 200, `status=${r.status} ${JSON.stringify(r.data).slice(0, 80)}`);
} catch (e) { console.error("test error:", e.stack); process.exitCode = 1; }
finally {
  for (const u of users) { await call(`/rest/v1/case_attempts?student_id=eq.${u.uid}`, { method: "DELETE" }); await call(`/auth/v1/admin/users/${u.uid}`, { method: "DELETE" }); }
  const failed = results.filter((x) => !x).length; console.log(`\n${results.length - failed}/${results.length} passed`); if (failed) process.exitCode = 1;
}
