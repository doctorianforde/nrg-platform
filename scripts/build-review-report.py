# Builds the bank-review report from data/review/<pool>/bNNNN.{in,out,applied}.json:
#   data/review/flags.csv                      every flagged question, for Jade
#   data/review/NRG_Bank_Review_Report.pdf     progress, flag register, and a seeded sample of before/after rewrites
# Usage: python3 scripts/build-review-report.py [--sample 24]   (needs reportlab)
import csv, glob, json, os, random, sys
from collections import Counter
from xml.sax.saxutils import escape as esc
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import inch

SAMPLE = int(sys.argv[sys.argv.index("--sample") + 1]) if "--sample" in sys.argv else 24
POOL_SIZE = {"ai": 2000, "proto": 4798, "jade": 516}

rows = []  # (pool, batch, before, after, applied)
for out in sorted(glob.glob("data/review/*/b*.out.json")):
    pool, batch = out.split("/")[-2], os.path.basename(out)[:5]
    src = json.load(open(out.replace(".out.json", ".in.json")))["items"]
    by_id = {x["id"]: x for x in src}
    applied = os.path.exists(out.replace(".out.json", ".applied.json"))
    for it in json.load(open(out))["items"]:
        rows.append((pool, batch, by_id[it["id"]], it, applied))

done = [r for r in rows if r[4] or r[0] == "jade"]
CANON = {"clinical-key", "negative-stem", "scope", "duplicate", "image", "needs-jade"}
ALIAS = {"out-of-scope": "scope", "disputed_clinical": "clinical-key", "duplicate-suspect": "duplicate", "stem-polarity": "negative-stem"}
for r in rows:
    fl = [ALIAS.get(f, f) for f in (r[3].get("flags") or [])]
    r[3]["flags"] = [f if f in CANON else "other" for f in fl] or (["other"] if r[3]["verdict"] == "flag" else [])
flags = [r for r in done if r[3]["verdict"] == "flag"]

with open("data/review/flags.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["pool", "source_id", "flags", "note", "proposed_rewrite", "stem"])
    for pool, batch, b, a, _ in flags:
        w.writerow([pool, b["source_id"], ";".join(a.get("flags") or []), a.get("flag_note", ""), "yes" if a.get("stem") else "no", b["stem"]])

INK = colors.HexColor("#1f2933"); MUTED = colors.HexColor("#52606d"); ACCENT = colors.HexColor("#0b6e4f"); RULE = colors.HexColor("#d9dee5")
TYPES = {"correct": ("CORRECT", "#1e8449", "#e9f7ef"), "close": ("CLOSE", "#b7950b", "#fef9e7"),
         "priority": ("PRIORITY", "#ca6f1e", "#fdf2e9"), "incorrect": ("INCORRECT", "#b03a2e", "#fdedec"),
         "not_asked": ("TRUE, NOT ASKED", "#4a6785", "#eef2f7")}
ss = getSampleStyleSheet()
T = ParagraphStyle("T", parent=ss["Title"], fontName="Helvetica-Bold", fontSize=20, alignment=0, textColor=INK, spaceAfter=4)
H = ParagraphStyle("H", parent=ss["Heading1"], fontName="Helvetica-Bold", fontSize=14, textColor=ACCENT, spaceBefore=10, spaceAfter=6, keepWithNext=1)
B = ParagraphStyle("B", parent=ss["BodyText"], fontName="Helvetica", fontSize=9.6, leading=13, textColor=INK, spaceAfter=4)
SM = ParagraphStyle("SM", parent=B, fontSize=8.4, leading=11, spaceAfter=0)
TAG = ParagraphStyle("TAG", parent=B, fontSize=8, textColor=MUTED, spaceAfter=2)
LBL = ParagraphStyle("LBL", parent=SM, fontName="Helvetica-Bold", fontSize=7, textColor=colors.white, alignment=1)

def table(data, widths, header=True):
    t = Table([[Paragraph(str(c), SM) for c in r] for r in data], colWidths=[w * inch for w in widths], repeatRows=1 if header else 0)
    st = [("GRID", (0, 0), (-1, -1), 0.4, RULE), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4)]
    if header: st.append(("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e6f2ed")))
    t.setStyle(TableStyle(st)); return t

story = [Paragraph("NRG Question Bank Review", T),
         Paragraph("Against MCQ authoring standard v0.1. Rewrites are applied on <b>staging only</b>; no rewrite reaches production until Ian signs off. "
                   "Jade's own questions are proposals only and are never applied automatically.", B),
         Paragraph("<b>Production action taken (Ian's instruction, 2026-10-05):</b> six live questions in the soft-launch mock set were keyed to a wrong, "
                   "in five cases unsafe, option (q35, q50, q66, q70, q71, q75). They were deactivated on prod and stay off until Jade confirms the corrected keys. "
                   "The same miskey pattern affects 24 questions in the starter-56 set, which exists only on staging and was never live.", B), Spacer(1, 6)]

story.append(Paragraph("Progress", H))
prog = [["Pool", "In bank", "Reviewed", "Rewritten", "Flagged", "Remaining"]]
for pool, size in POOL_SIZE.items():
    p = [r for r in done if r[0] == pool]; fl = sum(1 for r in p if r[3]["verdict"] == "flag")
    prog.append([pool, size, len(p), f"{len(p) - fl}" + (" proposed" if pool == "jade" else ""), fl, size - len(p)])
story.append(table(prog, [1.0, 1.0, 1.0, 1.0, 1.0, 1.0]))

story.append(Paragraph("What the review changed", H))
story.append(Paragraph("Every reviewed question now has: four options of one type each (correct / close / priority / incorrect, shown in colour after the attempt), "
                       "a rationale written for its own option (the old AI rationales were often attached to the wrong option), options of parallel length "
                       "so the longest option is no longer a giveaway, blood glucose in mg/dL, no bold or (high)/(low) labels on findings, entry-level scope, "
                       "and no gender the original question didn't state. Reviewers were not allowed to change which answer is keyed.", B))

cats = Counter(f for r in flags for f in (r[3].get("flags") or ["unlabelled"]))
story.append(Paragraph(f"Flagged for Jade: {len(flags)} questions", H))
story.append(Paragraph("Flagged questions were not edited. They are set to <i>needs_changes</i> and kept out of circulation. Full list: data/review/flags.csv.", B))
story.append(table([["Reason", "Count", "Meaning"]] + [[k, v, {
    "clinical-key": "Reviewer believes the keyed answer is wrong, outdated or disputed; a proposed fix is included where possible",
    "negative-stem": "Asks for the wrong/avoided option; can't be typed one-of-each. Policy decision pending (Ian/Jade)",
    "scope": "Beyond entry-level RN (critical care, prescribing, specialist interpretation)",
    "duplicate": "Same scenario as another item", "duplicate-suspect": "Same scenario as another item",
    "image": "Depends on an image or chart not in the text", "needs-jade": "Needs content only Jade can supply"}.get(k, "")] for k, v in cats.most_common()], [1.4, 0.6, 4.9]))

story.append(PageBreak()); story.append(Paragraph("Flag register", H))
reg = [["Question", "Reason", "Reviewer's note"]]
for pool, batch, b, a, _ in flags:
    reg.append([esc(b["source_id"].split(":")[-1]) + f"<br/><font color='#52606d'>{pool}</font>", esc(", ".join(a.get("flags") or [])), esc(a.get("flag_note", ""))])
story.append(table(reg, [1.1, 1.0, 4.8]))

story.append(PageBreak()); story.append(Paragraph(f"Sample of {SAMPLE} rewrites (before and after)", H))
story.append(Paragraph("Drawn at random (seed 2026) from the rewritten questions, so it's representative rather than chosen.", B))
ok = [r for r in done if r[3]["verdict"] == "ok"]
random.Random(2026).shuffle(ok)
for pool, batch, b, a, _ in ok[:SAMPLE]:
    before = [Paragraph(f"<b>BEFORE</b> &nbsp;{esc(b['stem'])}", SM)] + [Paragraph(f"{'&#10003;' if o['is_correct'] else '&nbsp;&nbsp;'} {o['label']}. {esc(o['text'])}", SM) for o in b["options"]]
    rat = dict(a["distractor_rationales"]); rat[a["correct"][0]] = a["rationale_correct"]
    after_rows, st = [], [("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 4), ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]
    for i, o in enumerate(a["options"]):
        name, fg, bg = TYPES[a["option_types"][o["label"]]]
        after_rows.append([Paragraph(name, LBL), Paragraph(f"<b>{o['label']}. {esc(o['text'])}</b><br/>{esc(rat[o['label']])}", SM)])
        st += [("BACKGROUND", (0, i), (0, i), colors.HexColor(fg)), ("BACKGROUND", (1, i), (1, i), colors.HexColor(bg)), ("VALIGN", (0, i), (0, i), "MIDDLE")]
    at = Table(after_rows, colWidths=[0.85 * inch, 6.05 * inch]); at.setStyle(TableStyle(st))
    story.append(KeepTogether([Paragraph(f"{esc(b['source_id'])} &middot; {pool} &middot; change: {esc(a.get('changes', ''))}", TAG), *before, Spacer(1, 3),
                               Paragraph(f"<b>AFTER</b> &nbsp;{esc(a['stem'])}", SM), Spacer(1, 2), at, Spacer(1, 12)]))

def footer(c, d):
    c.saveState(); c.setFont("Helvetica", 8); c.setFillColor(MUTED)
    c.drawString(0.8 * inch, 0.5 * inch, "NRG · question bank review · staging"); c.drawRightString(7.7 * inch, 0.5 * inch, f"Page {d.page}"); c.restoreState()
SimpleDocTemplate("data/review/NRG_Bank_Review_Report.pdf", pagesize=letter, leftMargin=0.8 * inch, rightMargin=0.8 * inch, topMargin=0.7 * inch, bottomMargin=0.8 * inch,
                  title="NRG Question Bank Review").build(story, onFirstPage=footer, onLaterPages=footer)
print(f"reviewed {len(done)}, flagged {len(flags)} -> data/review/NRG_Bank_Review_Report.pdf, data/review/flags.csv")
