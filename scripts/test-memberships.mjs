// Paid plans by bank transfer (20261109180000), against STAGING only. Throwaway users, receipts and audit rows are
// deleted at the end.   node scripts/test-memberships.mjs
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const SB = env.NEXT_PUBLIC_SUPABASE_URL_STAGING, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY_STAGING, SR = env.SUPABASE_SERVICE_ROLE_KEY_STAGING;
if (new URL(SB).hostname !== "kwhaqhhwqykckarjbdod.supabase.co") throw new Error("refusing: not the staging project");

const results = []; const check = (n, p, d = "") => { results.push(!!p); console.log(`${p ? "PASS" : "FAIL"} | ${n}${d !== "" ? ` | ${d}` : ""}`); };
async function call(path, { method = "GET", body, token, raw, type, prefer } = {}) {
  const headers = { apikey: token && token !== SR ? ANON : SR, Authorization: `Bearer ${token ?? SR}` };
  if (token === "anon") { headers.apikey = ANON; headers.Authorization = `Bearer ${ANON}`; }
  if (raw !== undefined) headers["Content-Type"] = type; else if (method !== "GET") headers["Content-Type"] = "application/json";
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${SB}${path}`, { method, headers, body: raw !== undefined ? raw : body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch {} return { status: res.status, data };
}
const rpc = (fn, token, body = {}) => call(`/rest/v1/rpc/${fn}`, { method: "POST", token, body });
const upload = (token, path, bytes, type = "image/png") => call(`/storage/v1/object/payment-receipts/${path}`, { method: "POST", token, raw: bytes, type });
const PNG = Buffer.from("89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D4944415478DA63F8FFFF3F0005FE02FE0DEFD4A70000000049454E44AE426082", "hex");
const today = new Date().toISOString().slice(0, 10);
const plus = (d, m) => { const x = new Date(d); x.setUTCMonth(x.getUTCMonth() + m); return x; };
const near = (a, b, mins = 10) => Math.abs(new Date(a) - new Date(b)) < mins * 60_000;

const users = [], files = [];
async function createUser(role) {
  const email = `member-${role}-${randomBytes(4).toString("hex")}@e2e-test.example.com`, password = randomBytes(12).toString("base64url") + "a1";
  const u = await call("/auth/v1/admin/users", { method: "POST", body: { email, password, email_confirm: true } });
  if (!u.data?.id) throw new Error(`create ${role}: ${u.status}`);
  users.push(u.data.id);
  await call(`/rest/v1/profiles?id=eq.${u.data.id}`, { method: "PATCH", body: { role, subscription_tier: "free" } });
  const t = (await call("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password }, token: "anon" })).data;
  return { uid: u.data.id, email, token: t.access_token };
}
const tier = async (u) => (await call(`/rest/v1/profiles?select=effective_plan&id=eq.${u.uid}`, { token: u.token })).data?.[0]?.effective_plan;

try {
  let r = await call("/rest/v1/membership_plans?select=code,name,months,price_ttd&order=sort_order", { token: "anon" });
  check("anyone can read the plans: 1 month TT$200, 3 months TT$500", r.status === 200 && r.data.length === 2 && Number(r.data[0].price_ttd) === 200 && Number(r.data[1].price_ttd) === 500 && r.data[1].months === 3, JSON.stringify(r.data));
  r = await call("/rest/v1/membership_settings?select=key", { token: "anon" });
  check("anyone can read the bank-detail settings", r.status === 200 && r.data.length >= 5, `${r.data?.length}`);

  const s = await createUser("student"), o = await createUser("student"), t = await createUser("teacher"), a = await createUser("admin");
  check("a new student is on the free plan", (await tier(s)) === "free");

  // Uploads (R8)
  const p1 = `${s.uid}/receipt-${randomBytes(3).toString("hex")}.png`; files.push(p1);
  r = await upload(s.token, p1, PNG);
  check("a student uploads a receipt into their own folder", r.status === 200, `status=${r.status}`);
  r = await upload(s.token, p1, PNG);
  check("the same receipt cannot be replaced", r.status >= 400, `status=${r.status}`);
  r = await upload(s.token, `${o.uid}/x.png`, PNG);
  check("a student cannot upload into someone else's folder", r.status >= 400, `status=${r.status}`);
  r = await upload(s.token, `${s.uid}/note.txt`, Buffer.from("hello"), "text/plain");
  check("only JPEG, PNG or PDF are accepted", r.status >= 400, `status=${r.status}`);
  r = await call(`/storage/v1/object/authenticated/payment-receipts/${p1}`, { token: s.token });
  check("a student cannot read receipts back (admins only, via signed links)", r.status >= 400, `status=${r.status}`);

  // Submitting (R12, R13)
  r = await rpc("submit_membership_request", s.token, { p_plan: "nope", p_paid_on: today, p_method: "bank_transfer", p_reference: "abc123", p_receipt_path: p1 });
  check("an unknown plan is refused", r.status >= 400, r.data?.message);
  r = await rpc("submit_membership_request", s.token, { p_plan: "one_month", p_paid_on: "2099-01-01", p_method: "bank_transfer", p_reference: "abc123", p_receipt_path: p1 });
  check("a payment date in the future is refused", r.status >= 400, r.data?.message);
  r = await rpc("submit_membership_request", s.token, { p_plan: "one_month", p_paid_on: today, p_method: "bank_transfer", p_reference: "abc123", p_receipt_path: `${s.uid}/missing.png` });
  check("a receipt that was never uploaded is refused", r.status >= 400, r.data?.message);
  r = await rpc("submit_membership_request", t.token, { p_plan: "one_month", p_paid_on: today, p_method: "bank_transfer", p_reference: "abc123", p_receipt_path: p1 });
  check("staff cannot buy plans", r.status >= 400, r.data?.message);
  r = await rpc("submit_membership_request", s.token, { p_plan: "one_month", p_paid_on: today, p_method: "bank_transfer", p_reference: "TT-123 456", p_receipt_path: p1 });
  const req1 = r.data;
  check("a valid request is created pending, priced at TT$200", r.status === 200 && req1?.status === "pending" && Number(req1.amount_ttd) === 200 && req1.reference_norm === "tt123456", JSON.stringify(req1 && { s: req1.status, a: req1.amount_ttd, n: req1.reference_norm }));
  const p2 = `${s.uid}/receipt2.png`; files.push(p2); await upload(s.token, p2, PNG);
  r = await rpc("submit_membership_request", s.token, { p_plan: "three_months", p_paid_on: today, p_method: "bank_transfer", p_reference: "zz", p_receipt_path: p2 });
  check("a second request while one is pending is refused", r.status >= 400, r.data?.message);
  r = await call("/rest/v1/membership_requests", { method: "POST", token: s.token, body: { user_id: s.uid, plan_code: "one_month", amount_ttd: 1, paid_on: today, method: "bank_transfer", reference: "xx", receipt_path: p2 } });
  check("a student cannot insert a request directly", r.status >= 400, `status=${r.status}`);
  r = await call(`/rest/v1/membership_requests?id=eq.${req1.id}`, { method: "PATCH", token: s.token, body: { status: "approved" }, prefer: "return=representation" });
  check("a student cannot approve their own request", r.status >= 400 || (Array.isArray(r.data) && r.data.length === 0), `status=${r.status}`);
  r = await call("/rest/v1/memberships", { method: "POST", token: s.token, body: { user_id: s.uid, plan_code: "three_months", status: "active", starts_at: new Date().toISOString(), expires_at: "2099-01-01" } });
  check("a student cannot give themselves a membership", r.status >= 400, `status=${r.status}`);
  r = await call(`/rest/v1/membership_requests?select=id`, { token: o.token });
  check("another student cannot see the request", r.status === 200 && r.data.length === 0, `rows=${r.data?.length}`);

  // Approving (R2, R3, R5)
  const ok = { payment_found: true, amount_matches: true, plan_correct: true };
  r = await rpc("approve_membership", t.token, { p_request: req1.id, p_checklist: ok });
  check("a teacher cannot approve", r.status >= 400, r.data?.message);
  r = await rpc("approve_membership", a.token, { p_request: req1.id, p_checklist: { payment_found: true } });
  check("approval without the full checklist is refused", r.status >= 400, r.data?.message);
  r = await rpc("approve_membership", a.token, { p_request: req1.id, p_checklist: { ...ok, sneaky: "x" } });
  const exp1 = r.data?.expires_at;
  check("an admin approves: plan active for 1 month", r.status === 200 && near(exp1, plus(Date.now(), 1)), JSON.stringify(r.data));
  check("the student now has full access", (await tier(s)) === "premium");
  r = await rpc("approve_membership", a.token, { p_request: req1.id, p_checklist: ok });
  check("approving the same request twice is refused (no double months)", r.status >= 400, r.data?.message);
  const saved = (await call(`/rest/v1/membership_requests?select=checklist&id=eq.${req1.id}`)).data?.[0]?.checklist;
  check("only known checklist keys are saved", saved && !("sneaky" in saved) && saved.payment_found === true, JSON.stringify(saved));
  const prof = (await call(`/rest/v1/profiles?select=subscription_tier&id=eq.${s.uid}`)).data?.[0]?.subscription_tier;
  check("approval never writes the profile's own plan (it stays free)", prof === "free", prof);

  // Early renewal with a flagged receipt (R4, R11)
  r = await rpc("submit_membership_request", s.token, { p_plan: "three_months", p_paid_on: today, p_method: "online_banking", p_reference: "renew-1", p_receipt_path: p2 });
  const req2 = r.data;
  check("a renewal can be submitted while the plan is active", r.status === 200 && Number(req2?.amount_ttd) === 500, r.data?.message ?? "");
  await call(`/rest/v1/membership_requests?id=eq.${req2.id}`, { method: "PATCH", body: { receipt_check: { result: "flagged", warnings: ["test"] } } });
  r = await rpc("approve_membership", a.token, { p_request: req2.id, p_checklist: ok });
  check("a flagged receipt needs the extra bank-statement tick", r.status >= 400, r.data?.message);
  r = await rpc("approve_membership", a.token, { p_request: req2.id, p_checklist: { ...ok, warnings_reviewed: true } });
  check("an early renewal adds 3 months to the current expiry", r.status === 200 && r.data.extended === true && near(r.data.expires_at, plus(exp1, 3)), JSON.stringify(r.data));

  // Rejecting and refunding (R6, R14)
  const p3 = `${o.uid}/r.png`; files.push(p3); await upload(o.token, p3, PNG);
  const req3 = (await rpc("submit_membership_request", o.token, { p_plan: "one_month", p_paid_on: today, p_method: "cash_deposit", p_reference: "TT123456", p_receipt_path: p3 })).data;
  r = await rpc("reject_membership", a.token, { p_request: req3.id, p_reason: "   " });
  check("a rejection needs a reason", r.status >= 400, r.data?.message);
  r = await rpc("reject_membership", a.token, { p_request: req3.id, p_reason: "Payment not found on the statement." });
  check("an admin rejects with a reason", r.status < 300, `status=${r.status}`);
  check("the rejected student stays on the free plan", (await tier(o)) === "free");
  r = await rpc("record_membership_refund", a.token, { p_request: req3.id, p_on: today, p_reference: "REF-9" });
  check("a refund is recorded on the rejected request", r.status < 300, `status=${r.status}`);

  // Revoking, then a fresh start (R4)
  r = await rpc("revoke_membership", a.token, { p_user: s.uid, p_reason: "Account shared" });
  check("an admin revokes the plan", r.status < 300 && (await tier(s)) === "free", `status=${r.status}`);
  const p4 = `${s.uid}/r4.png`; files.push(p4); await upload(s.token, p4, PNG);
  const req4 = (await rpc("submit_membership_request", s.token, { p_plan: "one_month", p_paid_on: today, p_method: "bank_transfer", p_reference: "again", p_receipt_path: p4 })).data;
  r = await rpc("approve_membership", a.token, { p_request: req4.id, p_checklist: ok });
  check("after a revoke, a new plan starts from today", r.status === 200 && r.data.extended === false && near(r.data.expires_at, plus(Date.now(), 1)), JSON.stringify(r.data));

  // Admin overview and audit (R9)
  r = await rpc("membership_admin_overview", s.token);
  check("a student cannot read the admin overview", r.status >= 400, `status=${r.status}`);
  r = await rpc("membership_admin_overview", a.token);
  check("the admin overview lists the requests with emails", r.status === 200 && r.data.requests.some((x) => x.id === req1.id && x.email === s.email), `${r.data?.requests?.length}`);
  const audit = (await call(`/rest/v1/membership_audit?select=action&user_id=in.(${s.uid},${o.uid})`)).data ?? [];
  const count = (k) => audit.filter((x) => x.action === k).length;
  check("every decision is audited (3 approve, 1 reject, 1 refund, 1 revoke)", count("approve") === 3 && count("reject") === 1 && count("refund") === 1 && count("revoke") === 1, JSON.stringify(audit.map((x) => x.action)));
  r = await call(`/rest/v1/membership_audit?select=id`, { token: s.token });
  check("students cannot read the audit log", r.status === 200 && r.data.length === 0, `rows=${r.data?.length}`);
} catch (e) {
  console.error("test error:", e.stack ?? e.message);
  results.push(false);
} finally {
  if (files.length) await call("/storage/v1/object/payment-receipts", { method: "DELETE", body: { prefixes: files } });
  if (users.length) await call(`/rest/v1/membership_audit?user_id=in.(${users.join(",")})`, { method: "DELETE" });
  for (const id of users) await call(`/auth/v1/admin/users/${id}`, { method: "DELETE" });
  if (users.length) {
    const ids = users.join(",");
    const left = [
      ...((await call(`/rest/v1/membership_requests?select=id&user_id=in.(${ids})`)).data ?? []),
      ...((await call(`/rest/v1/memberships?select=user_id&user_id=in.(${ids})`)).data ?? []),
      ...((await call(`/rest/v1/membership_audit?select=id&user_id=in.(${ids})`)).data ?? []),
    ];
    check("cleanup: requests, memberships, audit rows and receipts removed", left.length === 0, `rows=${left.length}`);
  }
  const failed = results.filter((x) => !x).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  if (failed) process.exitCode = 1;
}
