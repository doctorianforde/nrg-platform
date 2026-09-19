// Targeted probe: teacher2 PATCH teacher1's question — inspect body + aftermath
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const SB = env.NEXT_PUBLIC_SUPABASE_URL_STAGING, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY_STAGING, SR = env.SUPABASE_SERVICE_ROLE_KEY_STAGING;
const H = (k, t) => ({ apikey: k, Authorization: `Bearer ${t ?? k}`, "Content-Type": "application/json" });

async function mkuser(role) {
  const email = `probe-${role}-${randomBytes(4).toString("hex")}@e2e-test.example.com`, password = randomBytes(12).toString("base64url") + "a1";
  const u = await (await fetch(`${SB}/auth/v1/admin/users`, { method: "POST", headers: H(SR), body: JSON.stringify({ email, password, email_confirm: true }) })).json();
  await fetch(`${SB}/rest/v1/profiles?id=eq.${u.id}`, { method: "PATCH", headers: H(SR), body: JSON.stringify({ role }) });
  const t = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: H(ANON), body: JSON.stringify({ email, password }) })).json();
  return { uid: u.id, token: t.access_token };
}
const domainId = (await (await fetch(`${SB}/rest/v1/domains?select=id&limit=1`, { headers: H(SR) })).json())[0].id;

const t1 = await mkuser("teacher"), t2 = await mkuser("teacher");
const q = await (await fetch(`${SB}/rest/v1/questions`, { method: "POST", headers: { ...H(ANON, t1.token), Prefer: "return=representation" }, body: JSON.stringify({ body: "probe question owned by t1", domain_id: domainId, created_by: t1.uid }) })).json();
const qid = q[0].id;

const patch = await fetch(`${SB}/rest/v1/questions?id=eq.${qid}`, { method: "PATCH", headers: { ...H(ANON, t2.token), Prefer: "return=representation" }, body: JSON.stringify({ body: "hijacked by t2" }) });
const patchBody = await patch.json();
const after = await (await fetch(`${SB}/rest/v1/questions?id=eq.${qid}&select=body`, { headers: H(ANON, t1.token) })).json();
console.log("teacher2 PATCH status:", patch.status);
console.log("teacher2 PATCH returned rows:", Array.isArray(patchBody) ? patchBody.length : patchBody);
console.log("question body after attempt:", JSON.stringify(after));

// cleanup
await fetch(`${SB}/rest/v1/questions?id=eq.${qid}`, { method: "DELETE", headers: H(SR) });
await fetch(`${SB}/auth/v1/admin/users/${t1.uid}`, { method: "DELETE", headers: H(SR) });
await fetch(`${SB}/auth/v1/admin/users/${t2.uid}`, { method: "DELETE", headers: H(SR) });
console.log("cleanup done");
