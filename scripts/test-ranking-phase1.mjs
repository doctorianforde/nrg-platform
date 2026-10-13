// Ranking v2, phase 1 gate — question_attempts + record_practice_answers, against STAGING only.
// T34 style: creates throwaway users, prints PASS/FAIL per assertion, then deletes the users (their attempts,
// sessions and XP go with them). Secrets come from .env.local; nothing is hardcoded.
//
// The "XP unchanged" checks describe the old rules, so the run holds ranking_config.rules_live at 0 (shadow mode) and puts
// back whatever value staging had at the start.
//
//   node scripts/test-ranking-phase1.mjs
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const SB = env.NEXT_PUBLIC_SUPABASE_URL_STAGING;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY_STAGING;
const SR = env.SUPABASE_SERVICE_ROLE_KEY_STAGING;
if (!SB?.includes("kwhaqhhwqykckarjbdod")) throw new Error("refusing: not the staging project");

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass: !!pass });
  console.log(`${pass ? "PASS" : "FAIL"} | ${name}${detail ? ` | ${detail}` : ""}`);
};

async function call(path, { method = "GET", body, anon = false, token } = {}) {
  const headers = { apikey: anon || token ? ANON : SR, Authorization: `Bearer ${token ?? (anon ? ANON : SR)}` };
  if (method !== "GET") { headers["Content-Type"] = "application/json"; headers.Prefer = "return=representation"; }
  const res = await fetch(`${SB}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch { /* 204 */ }
  return { status: res.status, data };
}
const rpc = (fn, args, token) => call(`/rest/v1/rpc/${fn}`, { method: "POST", body: args, token, anon: !token });

async function createUser(role) {
  const email = `rank-${role}-${randomBytes(4).toString("hex")}@e2e-test.example.com`;
  const password = randomBytes(12).toString("base64url") + "a1";
  const u = await call("/auth/v1/admin/users", { method: "POST", body: { email, password, email_confirm: true } });
  if (!u.data?.id) throw new Error(`user create failed: ${JSON.stringify(u.data)}`);
  await call(`/rest/v1/profiles?id=eq.${u.data.id}`, { method: "PATCH", body: { role, full_name: `${role} (ranking phase 1 test)` } });
  const t = await call("/auth/v1/token?grant_type=password", { anon: true, method: "POST", body: { email, password } });
  if (!t.data?.access_token) throw new Error(`sign-in failed: ${JSON.stringify(t.data)}`);
  return { uid: u.data.id, token: t.data.access_token };
}

const users = [];
let rulesLiveAtStart = null;
try {
  rulesLiveAtStart = Number((await call("/rest/v1/ranking_config?select=value&key=eq.rules_live")).data[0].value);
  await call("/rest/v1/ranking_config?key=eq.rules_live", { method: "PATCH", body: { value: 0 } });
  const a = await createUser("student"); users.push(a);
  const b = await createUser("student"); users.push(b);
  const teacher = await createUser("teacher"); users.push(teacher);

  // Six live standalone questions with their options, plus one inactive question.
  const qs = (await call("/rest/v1/questions?select=id,domain_id,question_options(id,is_correct)&is_active=eq.true&context=eq.standalone&question_type=eq.mcq&limit=6")).data;
  const inactive = (await call("/rest/v1/questions?select=id,question_options(id)&is_active=eq.false&limit=1")).data[0];
  const right = (q) => q.question_options.find((o) => o.is_correct).id;
  const wrong = (q) => q.question_options.find((o) => !o.is_correct).id;

  // ---- 1. A real session: 3 right, 2 wrong ----
  const answers = qs.slice(0, 5).map((q, i) => ({ question_id: q.id, option_ids: [i < 3 ? right(q) : wrong(q)] }));
  let r = await rpc("record_practice_answers", { p_answers: answers }, a.token);
  const sessionId = r.data?.id;
  check("student records a session", r.status === 200 && sessionId, `status=${r.status}`);
  check("server-graded count is 3 of 5", r.data?.correct_count === 3 && r.data?.total_answered === 5, `correct=${r.data?.correct_count} total=${r.data?.total_answered}`);

  r = await call(`/rest/v1/question_attempts?select=question_id,is_correct,domain_id,source,session_id,user_id&session_id=eq.${sessionId}`, { token: a.token });
  const rows = r.data ?? [];
  const match = answers.every((ans, i) => { const row = rows.find((x) => x.question_id === ans.question_id); return row && row.is_correct === (i < 3) && row.domain_id === qs[i].domain_id; });
  check("one attempt per answer, graded and tagged correctly", rows.length === 5 && match && rows.every((x) => x.source === "practice" && x.user_id === a.uid), `rows=${rows.length} match=${match}`);

  r = await call(`/rest/v1/xp_events?select=amount,reason&source_id=eq.${sessionId}`, { token: a.token });
  check("XP unchanged from today: 5 answers pay the 10 XP band", r.data?.length === 1 && r.data[0].amount === 10 && r.data[0].reason === "practice_session", JSON.stringify(r.data));

  // ---- 2. No direct writes ----
  r = await call("/rest/v1/question_attempts", { method: "POST", token: a.token, body: { user_id: a.uid, question_id: qs[0].id, option_ids: [right(qs[0])], is_correct: true, source: "practice" } });
  check("student cannot insert an attempt directly", r.status >= 400, `status=${r.status}`);
  r = await call(`/rest/v1/question_attempts?session_id=eq.${sessionId}`, { method: "PATCH", token: a.token, body: { is_correct: true } });
  const after = (await call(`/rest/v1/question_attempts?select=is_correct&session_id=eq.${sessionId}`)).data;
  check("student cannot flip an attempt to correct", after.filter((x) => x.is_correct).length === 3, `correct rows now=${after.filter((x) => x.is_correct).length} (status ${r.status})`);
  r = await call(`/rest/v1/question_attempts?session_id=eq.${sessionId}`, { method: "DELETE", token: a.token });
  const still = (await call(`/rest/v1/question_attempts?select=id&session_id=eq.${sessionId}`)).data;
  check("student cannot delete attempts", still.length === 5, `rows now=${still.length} (status ${r.status})`);

  // ---- 3. Privacy ----
  r = await call(`/rest/v1/question_attempts?select=id&user_id=eq.${a.uid}`, { token: b.token });
  check("another student cannot read A's attempts", r.status === 200 && r.data.length === 0, `rows=${r.data?.length}`);
  r = await call(`/rest/v1/question_attempts?select=id&user_id=eq.${a.uid}`, { token: teacher.token });
  check("staff can read A's attempts", r.data?.length === 5, `rows=${r.data?.length}`);
  r = await call("/rest/v1/question_attempts?select=id", { anon: true });
  check("anon reads nothing", r.status >= 400 || (Array.isArray(r.data) && r.data.length === 0), `status=${r.status}`);

  // ---- 4. Cannot submit for someone else; cannot inflate ----
  r = await rpc("record_practice_answers", { p_answers: [{ question_id: qs[5].id, option_ids: [right(qs[5])], user_id: a.uid, is_correct: true }] }, b.token);
  const bRows = (await call(`/rest/v1/question_attempts?select=user_id&session_id=eq.${r.data?.id}`)).data ?? [];
  check("a session is always the caller's (extra user_id ignored)", r.status === 200 && bRows.length === 1 && bRows[0].user_id === b.uid, `owner=${bRows[0]?.user_id === b.uid ? "B" : "?"}`);
  r = await rpc("record_practice_answers", { p_answers: [{ question_id: qs[0].id, option_ids: [wrong(qs[0])], is_correct: true }] }, b.token);
  check("a client 'is_correct' is ignored; wrong stays wrong", r.data?.correct_count === 0, `correct=${r.data?.correct_count}`);
  r = await rpc("record_practice_answers", { p_answers: [{ question_id: qs[0].id, option_ids: [right(qs[1])] }] }, b.token);
  check("option from another question is rejected", r.status >= 400, `status=${r.status} ${r.data?.message ?? ""}`);
  r = await rpc("record_practice_answers", { p_answers: [{ question_id: qs[0].id, option_ids: [right(qs[0]), wrong(qs[0])] }] }, b.token);
  check("choosing every option does not count as correct", r.data?.correct_count === 0, `correct=${r.data?.correct_count}`);
  r = await rpc("record_practice_answers", { p_answers: [{ question_id: inactive.id, option_ids: [inactive.question_options[0].id] }] }, b.token);
  check("inactive question is rejected", r.status >= 400, `status=${r.status}`);
  r = await rpc("record_practice_answers", { p_answers: [{ question_id: qs[1].id, option_ids: [right(qs[1])] }, { question_id: qs[1].id, option_ids: [right(qs[1])] }] }, b.token);
  check("the same question twice in one session is rejected", r.status >= 400, `status=${r.status}`);
  r = await rpc("record_practice_answers", { p_answers: [] }, b.token);
  check("empty session is rejected", r.status >= 400, `status=${r.status}`);
  r = await rpc("record_practice_answers", { p_answers: [{ question_id: qs[0].id, option_ids: [right(qs[0])] }] });
  check("anon cannot record", r.status >= 400, `status=${r.status}`);
} catch (e) {
  console.error("test error:", e.message);
  process.exitCode = 1;
} finally {
  if (rulesLiveAtStart !== null) await call("/rest/v1/ranking_config?key=eq.rules_live", { method: "PATCH", body: { value: rulesLiveAtStart } });
  for (const u of users) await call(`/auth/v1/admin/users/${u.uid}`, { method: "DELETE" });
  if (users.length) {
    const ids = users.map((u) => u.uid).join(",");
    const left = (await call(`/rest/v1/question_attempts?select=id&user_id=in.(${ids})`)).data ?? [];
    const xp = (await call(`/rest/v1/xp_events?select=id&user_id=in.(${ids})`)).data ?? [];
    check("cleanup: test users' attempts and XP removed", left.length === 0 && xp.length === 0, `attempts=${left.length} xp=${xp.length}`);
  }
  const failed = results.filter((x) => !x.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  if (failed) process.exitCode = 1;
}
