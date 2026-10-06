# Builds docs/phase-1/NRG_Question_Pipeline_Guide.pdf. Needs reportlab (pip install reportlab).
# Usage: python3 scripts/build-pipeline-guide.py docs/phase-1/NRG_Question_Pipeline_Guide.pdf
from reportlab.lib.pagesizes import letter
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
                                Preformatted, PageBreak, KeepTogether)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import inch
import sys

OUT = sys.argv[1]
INK = colors.HexColor("#1f2933")
ACCENT = colors.HexColor("#0b6e4f")
MUTED = colors.HexColor("#52606d")
CODEBG = colors.HexColor("#f2f4f7")
RULE = colors.HexColor("#d9dee5")
WARN = colors.HexColor("#fff6e5")

ss = getSampleStyleSheet()
H1 = ParagraphStyle("H1", parent=ss["Heading1"], fontName="Helvetica-Bold", fontSize=17, textColor=ACCENT, spaceBefore=14, spaceAfter=8, keepWithNext=1)
H2 = ParagraphStyle("H2", parent=ss["Heading2"], fontName="Helvetica-Bold", fontSize=12.5, textColor=INK, spaceBefore=12, spaceAfter=5, keepWithNext=1)
B = ParagraphStyle("B", parent=ss["BodyText"], fontName="Helvetica", fontSize=10, leading=14, textColor=INK, spaceAfter=6)
SM = ParagraphStyle("SM", parent=B, fontSize=8.8, leading=11.5, spaceAfter=0)
BUL = ParagraphStyle("BUL", parent=B, leftIndent=14, bulletIndent=4, spaceAfter=3)
CODE = ParagraphStyle("CODE", fontName="Courier", fontSize=8.3, leading=10.6, textColor=INK)
TITLE = ParagraphStyle("T", parent=H1, fontSize=24, spaceBefore=0, spaceAfter=4, textColor=INK)
SUB = ParagraphStyle("S", parent=B, fontSize=11, textColor=MUTED)

story = []
def h1(t): story.append(Paragraph(t, H1))
def h2(t): story.append(Paragraph(t, H2))
def p(t): story.append(Paragraph(t, B))
def bullets(items):
    for it in items: story.append(Paragraph(it, BUL, bulletText="•"))
def steps(items):
    for i, it in enumerate(items, 1): story.append(Paragraph(it, BUL, bulletText=f"{i}."))
def code(t):
    pre = Preformatted(t.strip("\n"), CODE)
    tb = Table([[pre]], colWidths=[6.9 * inch])
    tb.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), CODEBG), ("BOX", (0, 0), (-1, -1), 0.5, RULE),
                            ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                            ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    story.append(tb); story.append(Spacer(1, 7))
def note(t):
    tb = Table([[Paragraph(t, B)]], colWidths=[6.9 * inch])
    tb.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), WARN), ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#f0c36d")),
                            ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                            ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]))
    story.append(tb); story.append(Spacer(1, 8))
def table(rows, widths):
    data = [[Paragraph(c, SM) for c in r] for r in rows]
    data[0] = [Paragraph(f"<b>{c}</b>", SM) for c in rows[0]]
    tb = Table(data, colWidths=[w * inch for w in widths], repeatRows=1)
    tb.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e6f2ed")),
                            ("GRID", (0, 0), (-1, -1), 0.4, RULE), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                            ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                            ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    story.append(tb); story.append(Spacer(1, 8))

G = "npx tsx scripts/generate-questions.ts"

# ── Cover ─────────────────────────────────────────────────────────────
story.append(Paragraph("NRG Question Generation Pipeline", TITLE))
story.append(Paragraph("How to run it in three modes: provider-agnostic, Kimi, and Claude (Sonnet / Opus)", SUB))
story.append(Paragraph("Script: scripts/generate-questions.ts · Rules: scripts/generation-rules.json (MCQ standard v0.1) · October 2026", SM))
story.append(Spacer(1, 10))

h1("1. What the pipeline does")
p("The script turns a short config into RENR-style multiple-choice questions and refuses anything that breaks the "
  "MCQ authoring standard. The model only writes. The script plans, checks and stores. That split is what makes the three "
  "modes interchangeable: whichever AI writes the items, the same validator decides whether they are kept.")
steps([
    "<b>Plan.</b> The script works out exactly how many items go to each RENR domain, taxonomy level and topic cluster, and numbers them as <i>specs</i>.",
    "<b>Write.</b> A model writes one item per spec as JSON: stem, four options, the key, a type and a rationale for every option.",
    "<b>Validate.</b> Every item is checked against the rules (section 7). Failures are retried (API modes) or listed with the reason (subscription modes).",
    "<b>Review sheet.</b> Kept items are saved as JSON plus a readable .md sheet with each option's type shown.",
    "<b>Insert (optional).</b> <font face='Courier'>--insert --env staging</font> writes them to staging as <font face='Courier'>is_ai_generated=true, is_active=false</font>. Nothing reaches students until a teacher approves it in /teacher/review.",
])

h1("2. Choosing a mode")
table([
    ["", "A. Provider-agnostic", "B. Kimi", "C. Claude (Sonnet / Opus)"],
    ["Who writes the items", "Any API: OpenAI, Gemini, Groq, OpenRouter, a local Ollama model, and others", "Kimi K3 in Kimi Code CLI, on your Allegretto plan", "Claude Code on your Max plan; Sonnet for drafting, Opus for hard items and review"],
    ["Cost", "Pay per token on that provider", "Covered by Allegretto (5-hour and weekly limits)", "Covered by Max (session and weekly limits)"],
    ["Needs an API key", "Yes", "No (optional API fallback)", "No (optional API fallback)"],
    ["How it runs", "Fully scripted: one command", "Agent loop: brief, write, validate, fix", "Agent loop with subagents in parallel"],
    ["Best for", "Large unattended batches when someone else's API is cheapest", "Default bulk drafting on a flat-rate plan", "Quality-sensitive batches and second-pass review of Kimi output"],
], [1.25, 1.85, 1.85, 1.95])
p("<b>Recommendation:</b> use B or C first, since you already pay for both plans. Use C for a batch that matters "
  "(Analysis-level items, anything going to Jade soon) and B for volume. Use A only when a batch is too big for "
  "the plan limits, or to try another model.")

h1("3. Setup common to every mode")
h2("3.1 One-time")
bullets([
    "Node 20+ in the repo folder (<font face='Courier'>npx tsx</font> runs the script; nothing to build).",
    "<font face='Courier'>.env.local</font> already has the staging Supabase keys the script uses for <font face='Courier'>--dedup-db</font> and <font face='Courier'>--insert</font>. Add an AI key only for the API routes (section 4).",
    "Copy <font face='Courier'>docs/phase-1/generation-config.example.json</font> to a new file per batch and edit <font face='Courier'>title</font>, <font face='Courier'>total</font>, <font face='Courier'>audience</font> and <font face='Courier'>topic_emphasis</font>.",
])
h2("3.2 Always start with the plan")
code(f"""
{G} --config gen.json --plan-only
""")
p("This prints the domain / taxonomy / cluster counts and calls nothing. If the mix looks wrong, change the weights in the config before spending any model time.")
h2("3.3 Safety rules (all modes)")
bullets([
    "Insert into <b>staging</b> only. Prod needs <font face='Courier'>--env prod</font> <i>and</i> <font face='Courier'>CONFIRM_PROD=yes</font>, and is Ian's decision, not an agent's.",
    "Never edit <font face='Courier'>generation-rules.json</font> or the script to make a failing item pass. Fix the item.",
    "Generated files go in <font face='Courier'>data/generated/</font>, which git ignores. Questions are content, not code.",
])


h1("4. Mode A: provider-agnostic (API)")
p("One command does everything: plan, call the model in batches of 5, validate, retry failures up to 3 times, save. "
  "Choose the provider with <font face='Courier'>--provider</font>, and put the key in <font face='Courier'>.env.local</font>.")
table([
    ["--provider", "Key / env vars", "Default model"],
    ["openai", "OPENAI_API_KEY", "gpt-4o"],
    ["gemini", "GEMINI_API_KEY", "gemini-2.0-flash"],
    ["compatible", "AI_BASE_URL, AI_API_KEY, AI_MODEL (any OpenAI-compatible endpoint: Groq, Together, OpenRouter, Mistral, DeepSeek, LM Studio)", "AI_MODEL"],
    ["ollama", "OLLAMA_HOST (default http://localhost:11434), OLLAMA_MODEL", "none: --model required"],
    ["kimi / anthropic", "See modes B and C (API fallback)", ""],
    ["mock", "None: fake items, no network. Use it to check the setup.", ""],
], [1.2, 4.2, 1.5])
code(f"""
# 0. check the setup without spending anything
{G} --config gen.json --provider mock

# 1. small trial batch, saved locally, checked against what is already on staging
{G} --config gen.json \\
  --provider openai --model gpt-4o-mini --total 10 --dedup-db --env staging

# 2. full batch, then insert into staging as pending review
{G} --config gen.json \\
  --provider compatible --insert --env staging
""")
p("Useful knobs: <font face='Courier'>--batch 3</font> if the model truncates long JSON; <font face='Courier'>--max-calls 40</font> "
  "to cap spend; <font face='Courier'>--temperature 0.5</font> for less variety; <font face='Courier'>--no-json-mode</font> if a "
  "compatible endpoint rejects <font face='Courier'>response_format</font>.")

h1("5. Mode B: Kimi (Allegretto plan)")
h2("5.1 Subscription route (default): Kimi Code CLI")
p("Kimi Code writes the items in the terminal under your Allegretto membership, and the script only validates them. Allegretto unlocks the 1M-token "
  "context, so one session can hold the whole brief.")
p("<b>One-time:</b> install Kimi Code, open it in the repo and sign in with your Kimi account.")
code("""
curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash
cd ~/Desktop/NRG && kimi
/login            # choose Kimi Code OAuth (your membership), not an API key
""")
p("<b>Each batch:</b>")
steps([
    f"Write the brief (no model call): <font face='Courier'>{G} --config gen.json --prompt-out data/generated/setA.brief.md</font>",
    "In Kimi Code, paste the agent prompt from section 8, with <font face='Courier'>setA</font> and <font face='Courier'>gen.json</font> filled in.",
    "Kimi writes <font face='Courier'>data/generated/setA.items.json</font>, runs the validator, rewrites only the failed specs and repeats until 0 failures (at most 3 rounds).",
    "You read <font face='Courier'>data/generated/setA.md</font> (the review sheet) and decide whether to insert.",
])
note("<b>Keep the config identical</b> between the <font face='Courier'>--prompt-out</font> run and the validate run. Spec numbers come from "
     "the plan, so a different <font face='Courier'>total</font> or different weights would match items to the wrong specs.")
p("<b>Size:</b> about 25 to 50 items per Kimi session works well. For 200, write the brief once and ask Kimi to fill it batch by batch "
  "(the brief is already split into batches of 5), validating after every 25. Allegretto's 5-hour window "
  "covers a few hundred requests; if Kimi reports a limit, stop and resume later. The items file keeps what's done.")
h2("5.2 API fallback")
code(f"""
# .env.local:  MOONSHOT_API_KEY=...   (pay-as-you-go key from platform.kimi.ai)
{G} --config gen.json \\
  --provider kimi --model kimi-k3 --effort high --dedup-db --env staging
""")
p("The script sends no temperature to Kimi unless you pass <font face='Courier'>--temperature</font>, because some Kimi models accept only "
  "one fixed value. <font face='Courier'>--effort</font> maps to Kimi's <font face='Courier'>reasoning_effort</font> (low / high / max). "
  "This route is tested against a local fake server, not yet against Moonshot itself; run <font face='Courier'>--total 5</font> first.")


h1("6. Mode C: Claude, Sonnet or Opus (Max plan)")
h2("6.1 Subscription route (default): Claude Code")
p("This works the same way as mode B, with one advantage: Claude Code can split the brief across <b>subagents</b> that write in parallel, "
  "then check and fix their output as one batch. Choose the model by job:")
table([
    ["Job", "Model", "Why"],
    ["Drafting most items (Knowledge, Application)", "Sonnet", "Fast, uses less of the Max allowance, and good enough when the validator is the gate"],
    ["Analysis / Synthesis items, leadership and priority scenarios", "Opus", "Better at close-vs-priority distractors and multi-step clinical reasoning"],
    ["Second-pass review of a finished batch (any mode)", "Opus", "Catches clinical errors and weak distractor types the regex rules cannot"],
], [2.6, 0.9, 3.4])
p("<b>Each batch:</b>")
steps([
    f"Write the brief: <font face='Courier'>{G} --config gen.json --prompt-out data/generated/setB.brief.md</font>",
    "Open Claude Code in the repo (<font face='Courier'>claude</font>, or the VS Code extension). Pick the main model with <font face='Courier'>/model</font> (Opus for the coordinator is a good default).",
    "Paste the agent prompt from section 8 and add the Claude line: <i>\"Split the brief into groups of 10 specs and give each group to a Sonnet subagent; write Analysis-level specs (taxonomy ASE) with Opus.\"</i>",
    "Claude merges the subagents' items into one <font face='Courier'>setB.items.json</font>, validates, fixes failed specs and reports.",
    "Optional review pass, same session or a new one: <i>\"Act as an RENR item reviewer. Read data/generated/setB.md and list any item whose key is clinically wrong, whose distractor types are mislabelled, or that tests above entry-level scope. Do not edit; just list.\"</i>",
])
h2("6.2 API fallback")
code(f"""
# .env.local:  ANTHROPIC_API_KEY=...
# (only for unattended runs; the Max plan does not include API credit)
{G} --config gen.json \\
  --provider anthropic --model claude-sonnet-5-5 --effort high
{G} --config gen.json \\
  --provider anthropic --model claude-opus-5-5 --effort high --batch 3
""")
p("Current Claude models reject <font face='Courier'>temperature</font>, so the script no longer sends it. Depth is set with "
  "<font face='Courier'>--effort</font> (low / medium / high / xhigh / max; default high). Opus 5.5 defaults to <i>medium</i> if "
  "effort is not sent, so the script always sends it. A safety decline or a truncated reply is reported as a failed batch and retried.")

h1("7. What the validator rejects")
p("These rules apply in every mode. In API modes a failing item is regenerated. In subscription modes the reason is printed so the agent can fix the item.")
table([
    ["Rule", "Rejected when"],
    ["Shape", "Not exactly 4 options labelled A to D; not exactly one key; blank option; \"all/none of the above\"; select-all-that-apply"],
    ["Option types", "option_types is not exactly one each of correct / close / priority / incorrect, or the key isn't typed correct"],
    ["Rationales", "Correct-answer rationale under 60 characters; any distractor rationale under 30"],
    ["Scope", "Critical-care / ICU terms, nurse practitioner / advanced-practice terms, the abbreviation NP (anywhere, rationales included)"],
    ["Units", "Blood glucose given in mmol/L. Caribbean practice uses mg/dL (e.g. 54 mg/dL, not 3.0 mmol/L)"],
    ["Visual flagging", "Bold or italic markdown, arrows or warning symbols, labels like (high), (low), (abnormal), (elevated) in the stem or options"],
    ["Length cue", "Option lengths spread wider than 1.4x, or the key is more than 12 characters longer than the distractor average"],
    ["Duplicates", "Stem identical to, or 70%+ word overlap with, one already in this batch or (with --dedup-db) in the database"],
], [1.3, 5.6])
p("Batch-level checks are printed as <font face='Courier'>checks</font> and saved in the JSON: the % of items where the key is the longest "
  "option (warns over 35%), the spread of correct-answer positions (warns if any letter is over 35%), and a count of rejections by rule.")
p("<b>Switches waiting on Jade</b> (all off, in <font face='Courier'>switches_pending_jade</font>): block nursing-diagnosis items, drop "
  "the difficulty field, regional rather than Trinidad-and-Tobago wording, require abbreviations to be expanded, extra forbidden patterns. "
  "Flipping one changes both the prompt and the validator; no code change is needed.")


story.append(PageBreak())
h1("8. The agent prompt (modes B and C)")
p("Paste this into Kimi Code or Claude Code. Replace <font face='Courier'>setA</font> and <font face='Courier'>gen.json</font>.")
code("""
You are writing RENR practice questions for the NRG platform.

1. Read data/generated/setA.brief.md. Its "System prompt" section is your
   authoring standard and JSON schema; follow it exactly. Its "Item specs"
   section lists every spec number with its domain, taxonomy and cluster.
2. Write ONE file, data/generated/setA.items.json, shaped {"items":[...]},
   one item per spec, using the spec numbers given. Every item needs
   option_types (one each of correct/close/priority/incorrect) and a
   rationale for every option that cites data in the stem.
3. Validate (no model call, no database write):
     npx tsx scripts/generate-questions.ts --config gen.json \\
       --provider file --input data/generated/setA.items.json \\
       --dedup-db --env staging --out data/generated/setA.json
4. Read "failures" in data/generated/setA.json. Rewrite ONLY those specs in
   setA.items.json, then run step 3 again. Stop at 0 failures or after 3
   rounds.
5. Do not edit scripts/, generation-rules.json or the config to make items
   pass. Do not call any AI API. Do not use --insert.
6. Report: items kept / total, the "checks" line, any spec still failing
   and why, and any item you are clinically unsure of.
""")
p("Then read <font face='Courier'>data/generated/setA.md</font>. If you're happy with it, insert into staging yourself (same config, same items file):")
code(f"""
{G} --config gen.json \\
  --provider file --input data/generated/setA.items.json --insert --env staging
""")
note("<b>Option types in the database:</b> <font face='Courier'>question_options.distractor_type</font> exists on staging only. The script writes it only when "
     "<font face='Courier'>store_option_types</font> is true in the rules file. Leave it false until the colour-coded rationale view is built; "
     "the types are still in the JSON and the review sheet.")

h1("9. Reading the output")
table([
    ["File", "What it is"],
    ["setA.json", "Everything: config, plan, kept items, checks, failures (with reasons) and warnings"],
    ["setA.md", "Review sheet: each item with its tags, the options labelled [CORRECT] / [CLOSE] / [PRIORITY] / [INCORRECT], and every rationale"],
    ["setA.brief.md / setA.items.json", "Subscription modes only: what the agent was given, and what it wrote"],
], [2.0, 4.9])
p("Warnings don't block an item. The usual ones are a model re-tagging a spec's domain or taxonomy (the planned tag is kept) and abbreviations that aren't "
  "expanded (logged only, until the abbreviation switch is on).")

h1("10. Troubleshooting")
table([
    ["Symptom", "Fix"],
    ["Every item fails with the same rule", "The model ignored that rule. Check the failures in the JSON. In API modes, try --batch 3 or a stronger model."],
    ["\"no JSON object in response\"", "The model wrapped the JSON in prose or ran out of room. Lower --batch; for compatible endpoints try --no-json-mode."],
    ["\"response hit max_tokens\" (Claude API)", "Lower --batch to 3."],
    ["\"model declined\" (Claude API)", "A safety classifier stopped the batch. It is retried. If it repeats, check that the topic is phrased clinically."],
    ["Many \"duplicate / near-duplicate stem\"", "The pool is saturated for that cluster. Change topic_emphasis or the cluster weights."],
    ["file mode: a spec says \"no item returned\"", "The items file is missing that spec number, or the config changed since --prompt-out."],
    ["Missing SUPABASE_URL_STAGING", "Run from the repo root so .env.local is picked up."],
    ["Kimi or Claude plan limit hit mid-batch", "Stop. The items file keeps what's done. Resume in the next window and ask the agent to fill only the missing specs."],
], [2.3, 4.6])

h1("11. Flag reference")
table([
    ["Flag", "Meaning"],
    ["--config P", "Batch config (title, total, audience, weights, rules file paths)"],
    ["--total / --title / --audience", "Override the config"],
    ["--plan-only", "Print the distribution and stop"],
    ["--prompt-out P", "Write the full system prompt and all spec batches to P, then stop (subscription modes)"],
    ["--provider", "anthropic · kimi · openai · gemini · ollama · compatible · mock · file"],
    ["--input P", "With --provider file: the {\"items\":[...]} file the agent wrote"],
    ["--model / --effort / --temperature", "Model choice, reasoning depth (anthropic, kimi), sampling (not sent to Claude)"],
    ["--batch N / --max-calls N", "Items per request (default 5) / cap on requests (default 200)"],
    ["--dedup-db", "Also reject stems already in the target database"],
    ["--insert --env staging", "Write kept items to staging as inactive, pending teacher review"],
    ["--rules P", "Use a different rules file (default scripts/generation-rules.json)"],
    ["--out P", "Output JSON path (the .md sheet is written next to it)"],
    ["--no-json-mode", "Don't send response_format (compatible and kimi)"],
], [2.3, 4.6])

def footer(c, d):
    c.saveState(); c.setFont("Helvetica", 8); c.setFillColor(MUTED)
    c.drawString(0.8 * inch, 0.5 * inch, "NRG · Question generation pipeline guide")
    c.drawRightString(7.7 * inch, 0.5 * inch, f"Page {d.page}")
    c.restoreState()

doc = SimpleDocTemplate(OUT, pagesize=letter, leftMargin=0.8 * inch, rightMargin=0.8 * inch, topMargin=0.7 * inch, bottomMargin=0.8 * inch,
                        title="NRG Question Generation Pipeline", author="NRG")
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print("wrote", OUT)
