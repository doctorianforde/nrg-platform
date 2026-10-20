/**
 * NRG — generation requests: one front door to every content generator, in Jade's two modes.
 *
 *   auto      Jade picks domain / cluster / topic / taxonomy / difficulty (or, for cases, specialty / condition /
 *             population / setting / difficulty / domains). Empty axes fall back to the RENR blueprint.
 *   prompted  Jade writes what he wants. `interpret` turns it into the same selections, he confirms, then it runs.
 *
 * The request format, validation, planner and interpreter live in src/lib/generation/ (shared with the teacher UI).
 * This script only does I/O. It never publishes anything: MCQs land as is_active=false / pending review, cases as
 * drafts that go through the case reviewer and Jade's validation.
 *
 * Request files
 *   new --kind mcq|case_study --mode auto|prompted [--count N] [--title T] [--prompt "…" | --prompt-file P]
 *       [--domains NP,CDM] [--taxonomy ASE] [--clusters MATCHILD] [--topics "Postpartum;Newborn"] [--difficulty hard]
 *       [--specialties OB] [--conditions "Pre-eclampsia"] [--population "…"] [--setting "…"]
 *       [--primary-domains CDM] [--extension-domains NLM,COM] [--exclusions "…"]   --out req.json
 *   show <req.json>                               validate and print the request as Jade would confirm it
 *   interpret <req.json> [--with heuristic|anthropic|kimi|agent] [--interpretation agent-reply.json]
 *       heuristic (default): offline keyword matching, no API.   anthropic | kimi: one model call (API key in env).
 *       agent: writes <req>.interpret.md for a Claude Code / Kimi session; the session saves its JSON reply and
 *       you rerun with --interpretation <reply.json>. Topic names are matched against the staging topic list.
 *   confirm <req.json>                            Jade has accepted the interpretation (prompted mode)
 *   run <req.json> [-- …flags for the generator]  dispatches: mcq → generate-questions.ts --request,
 *                                                 case_study → plan-cases.ts --request
 *       e.g. run req.json -- --prompt-out data/generated/x.brief.md     (agent mode, no API)
 *            run req.json -- --provider anthropic --insert --env staging
 *
 * Queue (table generation_requests on STAGING; the teacher UI writes here once it exists)
 *   queue                                         list queued / awaiting requests
 *   pull <id> --out req.json                      download a queued request and mark it running
 *   finish <id> --status done|failed [--result result.json] [--error "…"]
 *   submit <req.json>                             insert a request file as queued (testing the queue without the UI)
 */
import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  applyInterpretation, heuristicInterpret, interpretSystemPrompt, parseInterpretation, type InterpretContext, type TopicRow,
} from "../src/lib/generation/interpret";
import { buildMcqPlan } from "../src/lib/generation/plan";
import { describeRequest, readyToRun, validateRequest, type GenerationRequest } from "../src/lib/generation/request";
import { loadRules } from "./lib/mcq-standard";

const argv = process.argv.slice(2);
const dd = argv.indexOf("--");
const args = dd >= 0 ? argv.slice(0, dd) : argv, passthrough = dd >= 0 ? argv.slice(dd + 1) : [];
const [cmd, target] = args;
const flag = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const list = (n: string, sep = ",") => flag(n)?.split(sep).map(s => s.trim()).filter(Boolean);

function loadEnv() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith("#") && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv();
const die = (msg: string): never => { console.error(msg); process.exit(2); };

function readRequest(p: string): GenerationRequest {
  if (!p || !existsSync(resolve(p))) die(`no request file at ${p}`);
  const v = validateRequest(JSON.parse(readFileSync(resolve(p), "utf8")));
  if (!v.ok) die(`✗ ${p}:\n  - ${v.errors.join("\n  - ")}`);
  v.warnings.forEach(w => console.log(`  ! ${w}`));
  return (v as { request: GenerationRequest }).request;
}
const writeRequest = (p: string, r: GenerationRequest) => writeFileSync(resolve(p), JSON.stringify(r, null, 2) + "\n");

/** Staging only: the queue and the topic list. Refuses any other project. */
function staging() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL_STAGING ?? process.env.SUPABASE_URL_STAGING ?? "";
  if (!url.includes("kwhaqhhwqykckarjbdod")) die("Refusing: staging URL missing or not the staging project");
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY_STAGING!, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function interpretContext(kind: GenerationRequest["kind"]): Promise<InterpretContext> {
  const ctx: InterpretContext = { allowSata: false };
  if (kind === "case_study") {
    const cat = JSON.parse(readFileSync("content/case-studies/catalog.json", "utf8")) as { conditions: { condition: string }[] };
    ctx.caseConditions = cat.conditions.map(c => c.condition);
    return ctx;
  }
  if (args.includes("--no-db")) return ctx;
  try {
    const db = staging();
    const rows: TopicRow[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from("topics").select("id, name, is_active, topic_clusters(code)").eq("is_active", true).range(from, from + 999);
      if (error) throw error;
      for (const t of data as any[]) rows.push({ id: t.id, name: t.name, cluster: t.topic_clusters?.code ?? null });
      if (data.length < 1000) break;
    }
    ctx.topics = rows;
    console.log(`  (${rows.length} topics loaded from staging for matching)`);
  } catch (e: any) { console.log(`  ! topic list unavailable (${e.message ?? e}); topics will stay as guidance`); }
  return ctx;
}

async function callModel(provider: string, system: string, user: string): Promise<string> {
  const post = async (url: string, headers: Record<string, string>, body: unknown) => {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text);
  };
  if (provider === "anthropic") {
    const key = process.env.ANTHROPIC_API_KEY ?? die("Missing ANTHROPIC_API_KEY");
    const r = await post("https://api.anthropic.com/v1/messages", { "x-api-key": key, "anthropic-version": "2023-06-01" },
      { model: flag("model") ?? "claude-sonnet-5-5", max_tokens: 4000, output_config: { effort: "low" }, system, messages: [{ role: "user", content: user }] });
    return r.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
  }
  if (provider === "kimi") {
    const key = process.env.MOONSHOT_API_KEY ?? die("Missing MOONSHOT_API_KEY");
    const base = (process.env.MOONSHOT_BASE_URL ?? "https://api.moonshot.ai/v1").replace(/\/$/, "");
    const r = await post(`${base}/chat/completions`, { authorization: `Bearer ${key}` },
      { model: flag("model") ?? "kimi-k3", response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: user }] });
    return r.choices[0].message.content;
  }
  return die(`unknown --with ${provider} (heuristic | anthropic | kimi | agent)`);
}
const extractJson = (t: string) => { const s = t.replace(/```(?:json)?/gi, ""); return JSON.parse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1)); };

function preview(req: GenerationRequest) {
  describeRequest(req).forEach(l => console.log("  " + l));
  if (req.kind === "mcq" && req.count) {
    const p = buildMcqPlan(req.count, req.selections, { withDifficulty: !loadRules().switches_pending_jade.drop_difficulty });
    const fmt = (o?: Record<string, number>) => o ? Object.entries(o).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(", ") : "";
    console.log(`  Plan: domains ${fmt(p.dCounts)} · taxonomy ${fmt(p.tCounts)} · ${p.topicCounts ? `topics ${fmt(p.topicCounts)}` : `clusters ${fmt(p.cCounts)}`}${p.difficultyCounts ? ` · difficulty ${fmt(p.difficultyCounts)}` : ""}`);
  }
  const blocked = readyToRun(req);
  console.log(blocked ? `  Not ready to run: ${blocked}` : "  Ready to run.");
}

async function main() {
  switch (cmd) {
    case "new": {
      const kind = flag("kind") as GenerationRequest["kind"], mode = flag("mode") ?? "auto";
      const prompt = flag("prompt-file") ? readFileSync(resolve(flag("prompt-file")!), "utf8") : flag("prompt");
      const sel: Record<string, unknown> = kind === "mcq" ? {
        domains: list("domains"), taxonomy: list("taxonomy"), clusters: list("clusters"), difficulty: list("difficulty"),
        topics: list("topics", ";")?.map(name => ({ name })), exclusions: flag("exclusions"),
      } : {
        specialties: list("specialties"), conditions: list("conditions", ";"), population: flag("population"), setting: flag("setting"),
        difficulty: list("difficulty"), primary_domains: list("primary-domains"), extension_domains: list("extension-domains"),
      };
      for (const k of Object.keys(sel)) if (sel[k] === undefined) delete sel[k];
      const raw = { kind, mode, ...(flag("count") ? { count: Number(flag("count")) } : {}), title: flag("title"), prompt, requested_by: flag("by") ?? "cli", selections: sel };
      const v = validateRequest(raw);
      if (!v.ok) die(`✗ ${v.errors.join("\n  - ")}`);
      // Topic names typed on the command line get their ids (and clusters) from the topic list where they match.
      const req = (v as { request: GenerationRequest }).request;
      if (req.kind === "mcq" && req.selections.topics?.length) {
        const ctx = await interpretContext("mcq");
        if (ctx.topics) req.selections.topics = req.selections.topics.map(t => {
          const hit = ctx.topics!.find(x => x.name.toLowerCase() === t.name.toLowerCase());
          return hit ? { id: hit.id, name: hit.name, ...(hit.cluster ? { cluster: hit.cluster } : {}) } : t;
        });
      }
      const out = flag("out") ?? die("--out <req.json> is required");
      writeRequest(out, req);
      console.log(`Wrote ${out}`); preview(req);
      if (req.mode === "prompted") console.log(`  Next: npx tsx scripts/generation-request.ts interpret ${out}`);
      return;
    }
    case "show": return preview(readRequest(target));
    case "interpret": {
      const req = readRequest(target);
      if (req.mode !== "prompted" || !req.prompt) die("only prompted requests (with a prompt) are interpreted");
      const how = flag("with") ?? (flag("interpretation") ? "agent" : "heuristic");
      const ctx = await interpretContext(req.kind);
      let res, by: string;
      if (flag("interpretation")) {
        res = parseInterpretation(req.kind, JSON.parse(readFileSync(resolve(flag("interpretation")!), "utf8")), ctx); by = flag("by") ?? "agent";
      } else if (how === "heuristic") {
        res = heuristicInterpret(req.kind, req.prompt!, ctx); by = "heuristic";
      } else if (how === "agent") {
        const brief = target.replace(/\.json$/, "") + ".interpret.md";
        writeFileSync(brief, `# Interpret a generation request\n\nFollow the instructions, then save ONLY the JSON reply to \`${target.replace(/\.json$/, "")}.interpretation.json\` and run:\n\n    npx tsx scripts/generation-request.ts interpret ${target} --interpretation ${target.replace(/\.json$/, "")}.interpretation.json --by agent:<your-name>\n\n## Instructions\n\n${interpretSystemPrompt(req.kind)}\n\n## The request\n\n${req.prompt}\n`);
        console.log(`Wrote ${brief} for an agent session.`); return;
      } else {
        const text = await callModel(how, interpretSystemPrompt(req.kind), req.prompt!);
        res = parseInterpretation(req.kind, extractJson(text), ctx); by = `${how}/${flag("model") ?? "default"}`;
      }
      const next = applyInterpretation(req, res, by);
      const v = validateRequest(next);
      if (!v.ok) die(`✗ interpretation produced an invalid request:\n  - ${v.errors.join("\n  - ")}`);
      writeRequest(target, next);
      console.log(`Interpreted ${target} (${by}). Show this to Jade:`); preview(next);
      res.notes.length && console.log(`  Read from the prompt: ${res.notes.join(" · ")}`);
      console.log(`  Next: edit the selections in ${target} if anything is wrong, then: npx tsx scripts/generation-request.ts confirm ${target}`);
      return;
    }
    case "confirm": {
      const req = readRequest(target);
      if (req.mode === "prompted") {
        if (!req.interpretation) die("interpret it first");
        req.interpretation!.confirmed = true;
      }
      writeRequest(target, req); console.log(`Confirmed ${target}.`); preview(req);
      return;
    }
    case "run": {
      const req = readRequest(target);
      const blocked = readyToRun(req); if (blocked) die(`Not ready: ${blocked}`);
      const script = req.kind === "mcq" ? "scripts/generate-questions.ts" : "scripts/plan-cases.ts";
      console.log(`→ npx tsx ${script} --request ${target} ${passthrough.join(" ")}`);
      const r = spawnSync("npx", ["tsx", script, "--request", target, ...passthrough], { stdio: "inherit" });
      if (req.kind === "case_study" && r.status === 0) console.log("Next: generator agents write each CASE_REQUEST per docs/phase-1/CASE_GEN_BRIEF.md (teacher_request included).");
      process.exit(r.status ?? 1);
    }
    case "queue": {
      const { data, error } = await staging().from("generation_requests").select("id, kind, mode, status, created_at, request").in("status", ["awaiting_confirmation", "queued", "running"]).order("created_at");
      if (error) die(error.message);
      if (!data!.length) console.log("Queue is empty.");
      for (const r of data!) console.log(`${r.id}  ${r.status.padEnd(21)} ${r.kind.padEnd(10)} ${r.mode.padEnd(8)} ${r.request.count ?? "?"} · ${r.request.title ?? (r.request.prompt ?? "").slice(0, 60)}`);
      return;
    }
    case "pull": {
      const db = staging();
      const { data, error } = await db.from("generation_requests").update({ status: "running", started_at: new Date().toISOString() }).eq("id", target).eq("status", "queued").select("request").maybeSingle();
      if (error) die(error.message);
      if (!data) die(`${target} is not queued (already running, done, or still awaiting confirmation)`);
      const out = flag("out") ?? `data/generated/request-${target.slice(0, 8)}.json`;
      writeRequest(out, data!.request); console.log(`Pulled ${target} → ${out} (now running)`); preview(readRequest(out));
      return;
    }
    case "finish": {
      const status = flag("status");
      if (status !== "done" && status !== "failed") die("--status done|failed");
      const result = flag("result") ? JSON.parse(readFileSync(resolve(flag("result")!), "utf8")) : null;
      const summary = result?.items ? { run_id: result.run_id, output: flag("result"), items: result.items.length, failures: result.failures?.length ?? 0, warnings: result.warnings?.length ?? 0 } : result;
      const { data, error } = await staging().from("generation_requests").update({ status, result: summary, error: flag("error") ?? null, finished_at: new Date().toISOString() }).eq("id", target).eq("status", "running").select("id").maybeSingle();
      if (error) die(error.message);
      if (!data) die(`${target} is not running`);
      console.log(`Marked ${target} ${status}.`);
      return;
    }
    case "submit": {
      const req = readRequest(target);
      const db = staging();
      const by = flag("requested-by") ?? die("--requested-by <profile uuid> (a staff profile on staging)");
      const status = req.mode === "prompted" && !req.interpretation?.confirmed ? "awaiting_confirmation" : "queued";
      const { data, error } = await db.from("generation_requests").insert({ kind: req.kind, mode: req.mode, request: req, status, requested_by: by }).select("id").single();
      if (error) die(error.message);
      console.log(`Submitted ${data!.id} as ${status}.`);
      return;
    }
    default:
      console.log(readFileSync(resolve("scripts/generation-request.ts"), "utf8").split("*/")[0]);
  }
}
main().catch(e => { console.error("FATAL:", e.message ?? e); process.exit(1); });
