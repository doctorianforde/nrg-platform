// Probe: what do user_role()/is_admin() return for a real teacher JWT?
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const SB = env.NEXT_PUBLIC_SUPABASE_URL_STAGING, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY_STAGING, SR = env.SUPABASE_SERVICE_ROLE_KEY_STAGING;
const H = (k, t) => ({ apikey: k, Authorization: `Bearer ${t ?? k}`, "Content-Type": "application/json" });

const email = `probe-${randomBytes(4).toString("hex")}@e2e-test.example.com`, password = randomBytes(12).toString("base64url") + "a1";
const u = await (await fetch(`${SB}/auth/v1/admin/users`, { method: "POST", headers: H(SR), body: JSON.stringify({ email, password, email_confirm: true }) })).json();
console.log("user id:", u.id);
let pr = await fetch(`${SB}/rest/v1/profiles`, { method: "POST", headers: { ...H(SR), Prefer: "return=representation" }, body: JSON.stringify({ id: u.id, role: "teacher", full_name: "probe" }) });
console.log("profile insert:", pr.status, JSON.stringify(await pr.json()));
const t = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: H(ANON), body: JSON.stringify({ email, password }) })).json();
const tok = t.access_token;
console.log("token obtained:", !!tok);
for (const fn of ["user_role", "is_admin"]) {
  const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, { method: "POST", headers: H(ANON, tok), body: "{}" });
  console.log(`rpc ${fn}:`, r.status, JSON.stringify(await r.json()));
}
// grants visible to this role
const g = await (await fetch(`${SB}/rest/v1/questions?select=id&limit=1`, { headers: H(ANON, tok) })).json();
console.log("teacher select questions:", Array.isArray(g) ? `ok ${g.length} rows` : JSON.stringify(g));
// cleanup
await fetch(`${SB}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: H(SR) });
console.log("probe user deleted");
