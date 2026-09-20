// T34 — RLS end-to-end test against STAGING (nrg-platform-staging)
// Creates 4 temporary users (student, teacher×2, admin), exercises RLS as each
// role plus anon, prints PASS/FAIL per assertion, then cleans up all test data.
// Secrets are read from .env.local — none are hardcoded here.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const SB = env.NEXT_PUBLIC_SUPABASE_URL_STAGING;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY_STAGING;
const SR = env.SUPABASE_SERVICE_ROLE_KEY_STAGING;

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass: !!pass, detail: String(detail) });
  console.log(`${pass ? "PASS" : "FAIL"} | ${name} | ${detail}`);
};

async function call(path, { method = "GET", body, anon = false, token } = {}) {
  const headers = { apikey: anon ? ANON : SR };
  headers.Authorization = token ? `Bearer ${token}` : `Bearer ${anon ? ANON : SR}`;
  if (method !== "GET") {
    headers["Content-Type"] = "application/json";
    headers.Prefer = "return=representation";
  }
  const res = await fetch(`${SB}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch { /* empty body (204) */ }
  return { status: res.status, data };
}

const mkpw = () => randomBytes(12).toString("base64url") + "a1";

async function createUser(role) {
  const email = `${role}-${randomBytes(4).toString("hex")}@e2e-test.example.com`;
  const password = mkpw();
  const u = await call("/auth/v1/admin/users", { method: "POST", body: { email, password, email_confirm: true } });
  if (!u.data?.id) throw new Error(`user create failed for ${role}: ${JSON.stringify(u)}`);
  // A signup trigger auto-creates the profile with role='student' — set the real role.
  await call(`/rest/v1/profiles?id=eq.${u.data.id}`, { method: "PATCH", body: { role, full_name: `${role} (E2E T34)` } });
  const t = await call("/auth/v1/token?grant_type=password", { anon: true, method: "POST", body: { email, password } });
  if (!t.data?.access_token) throw new Error(`sign-in failed for ${role}: ${JSON.stringify(t)}`);
  return { role, uid: u.data.id, email, token: t.data.access_token };
}

try {
  // ---- setup ----
  const student = await createUser("student");
  const teacher1 = await createUser("teacher");
  const teacher2 = await createUser("teacher");
  const admin = await createUser("admin");
  const users = [student, teacher1, teacher2, admin];

  const domain = await call("/rest/v1/domains?select=id&order=display_order&limit=1");
  const domainId = domain.data[0].id;
  const activeCount = (await call("/rest/v1/questions?select=id&is_active=eq.true")).data.length;
  const totalCount = (await call("/rest/v1/questions?select=id")).data.length;

  // ---- 1. STUDENT ----
  let r = await call("/rest/v1/questions?select=id,body&limit=10", { token: student.token });
  check("student reads questions (limit 10)", r.status === 200 && Array.isArray(r.data) && r.data.length === 10,
    `status=${r.status} rows=${r.data?.length} (total bank=${totalCount}, active=${activeCount})`);

  r = await call("/rest/v1/questions", { method: "POST", token: student.token, body: { body: "RLS E2E student insert", domain_id: domainId, created_by: student.uid } });
  check("student INSERT question blocked", r.status >= 400, `status=${r.status} code=${r.data?.code ?? "n/a"}`);

  r = await call(`/rest/v1/profiles?select=id&id=neq.${student.uid}`, { token: student.token });
  check("student cannot read other profiles", r.status === 200 && r.data.length === 0, `status=${r.status} rows=${r.data?.length}`);
  r = await call(`/rest/v1/profiles?select=id&id=eq.${student.uid}`, { token: student.token });
  check("student CAN read own profile", r.status === 200 && r.data.length === 1, `status=${r.status} rows=${r.data?.length}`);

  // ---- 2. TEACHER ----
  r = await call("/rest/v1/questions", { method: "POST", token: teacher1.token, body: { body: "RLS E2E teacher insert", domain_id: domainId, created_by: teacher1.uid } });
  const t1q = r.data?.[0]?.id;
  check("teacher INSERT question succeeds", r.status === 201 && !!t1q, `status=${r.status} id=${t1q ?? "none"}`);

  r = await call(`/rest/v1/questions?id=eq.${t1q}`, { method: "PATCH", token: teacher2.token, body: { body: "hijacked by teacher2" } });
  check("other teacher UPDATE blocked", Array.isArray(r.data) && r.data.length === 0, `status=${r.status} affected_rows=${Array.isArray(r.data) ? r.data.length : "n/a"} (PostgREST: 200 + empty = RLS denied)`);
  r = await call(`/rest/v1/questions?id=eq.${t1q}&select=body`, { token: teacher1.token });
  check("question unchanged after blocked UPDATE", r.data?.[0]?.body === "RLS E2E teacher insert", `body=${JSON.stringify(r.data?.[0]?.body)}`);

  r = await call(`/rest/v1/questions?id=eq.${t1q}`, { method: "PATCH", token: teacher1.token, body: { body: "edited by owner teacher1" } });
  check("own-teacher UPDATE succeeds", r.status === 200, `status=${r.status}`);

  // Changed deliberately by 20260919030000 (staff-initiated messaging): a teacher
  // needs the student roster to choose who to write to. Other staff stay private.
  r = await call("/rest/v1/profiles?select=id,role", { token: teacher1.token });
  {
    const ids = new Set((r.data ?? []).map((p) => p.id));
    check(
      "teacher reads students + own row, but not other staff",
      r.status === 200 && ids.has(teacher1.uid) && ids.has(student.uid) && !ids.has(teacher2.uid) && !ids.has(admin.uid),
      `status=${r.status} rows=${r.data?.length} own=${ids.has(teacher1.uid)} student=${ids.has(student.uid)} otherTeacher=${ids.has(teacher2.uid)} admin=${ids.has(admin.uid)}`
    );
  }

  // ---- 3. ADMIN ----
  r = await call("/rest/v1/questions?select=id", { token: admin.token });
  check("admin reads all questions", r.status === 200 && r.data.length >= totalCount, `status=${r.status} rows=${r.data?.length} (bank=${totalCount})`);

  r = await call(`/rest/v1/questions?id=eq.${t1q}`, { method: "PATCH", token: admin.token, body: { is_active: false } });
  check("admin UPDATE question succeeds", r.status === 200 && r.data?.[0]?.is_active === false, `status=${r.status} is_active=${r.data?.[0]?.is_active}`);
  await call(`/rest/v1/questions?id=eq.${t1q}`, { method: "PATCH", token: admin.token, body: { is_active: true } });

  r = await call("/rest/v1/profiles?select=id", { token: admin.token });
  check("admin reads all profiles", r.status === 200 && r.data.length === users.length, `status=${r.status} rows=${r.data?.length} (test users=${users.length})`);

  // ---- 4. UNAUTHENTICATED ----
  r = await call("/rest/v1/questions?select=id&limit=1", { anon: true });
  check("anon read blocked (0 rows)", r.status === 200 && Array.isArray(r.data) && r.data.length === 0, `status=${r.status} rows=${r.data?.length}`);

  r = await call("/rest/v1/profiles?select=id&limit=1", { anon: true });
  check("anon profile read blocked (0 rows)", r.status === 200 && r.data.length === 0, `status=${r.status} rows=${r.data?.length}`);

  // ---- cleanup ----
  await call(`/rest/v1/questions?created_by=in.(${users.map((u) => u.uid).join(",")})`, { method: "DELETE" });
  for (const u of users) await call(`/auth/v1/admin/users/${u.uid}`, { method: "DELETE" });
  const leftover = await call("/rest/v1/profiles?select=id");
  check("cleanup: profiles empty again", leftover.data.length === 0, `profiles=${leftover.data.length}`);
} catch (e) {
  console.error("E2E test error:", e.message);
  process.exitCode = 1;
} finally {
  const fs = await import("node:fs");
  fs.writeFileSync(new URL("../VALIDATION_RESULTS.json", import.meta.url), JSON.stringify(results, null, 2));
}
