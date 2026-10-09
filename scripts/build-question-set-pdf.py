# Renders a generate-questions.ts output JSON as a PDF: questions, then colour-coded rationales.
# Usage: python3 scripts/build-question-set-pdf.py data/generated/<run>.json <out>.pdf  (needs reportlab)
import json, sys
from xml.sax.saxutils import escape as esc
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import inch

SRC, OUT = sys.argv[1], sys.argv[2]
d = json.load(open(SRC))
items = d["items"]

INK = colors.HexColor("#1f2933"); MUTED = colors.HexColor("#52606d"); ACCENT = colors.HexColor("#0b6e4f"); RULE = colors.HexColor("#d9dee5")
# Case Study V3 s.11 colours; the text label is always shown next to the colour
TYPES = {
    "correct":   ("CORRECT",               colors.HexColor("#1e8449"), colors.HexColor("#e9f7ef")),
    "close":     ("CLOSE",                 colors.HexColor("#b7950b"), colors.HexColor("#fef9e7")),
    "priority":  ("PRIORITY / SEQUENCING", colors.HexColor("#ca6f1e"), colors.HexColor("#fdf2e9")),
    "incorrect": ("INCORRECT / UNSAFE",    colors.HexColor("#b03a2e"), colors.HexColor("#fdedec")),
    "not_asked": ("CORRECT STATEMENT, NOT ASKED", colors.HexColor("#4a6785"), colors.HexColor("#eef2f7")),
}
ORDER = ["correct", "close", "priority", "incorrect"]
DOM = {"NP": "Nursing Practice", "CDM": "Clinical Decision Making", "NLM": "Leadership and Management", "PC": "Professional Conduct",
       "HPMW": "Health Promotion", "COM": "Communication", "PD": "Professional Development"}
TAX = {"AP": "Application", "ASE": "Analysis", "KC": "Knowledge"}

ss = getSampleStyleSheet()
T = ParagraphStyle("T", parent=ss["Title"], fontName="Helvetica-Bold", fontSize=21, alignment=0, textColor=INK, spaceAfter=4)
H = ParagraphStyle("H", parent=ss["Heading1"], fontName="Helvetica-Bold", fontSize=15, textColor=ACCENT, spaceBefore=6, spaceAfter=8)
B = ParagraphStyle("B", parent=ss["BodyText"], fontName="Helvetica", fontSize=10.3, leading=14.2, textColor=INK, spaceAfter=4)
TAG = ParagraphStyle("TAG", parent=B, fontSize=8, textColor=MUTED, spaceAfter=2)
OPT = ParagraphStyle("OPT", parent=B, leftIndent=18, firstLineIndent=-14, spaceAfter=2)
SM = ParagraphStyle("SM", parent=B, fontSize=9, leading=12.2, spaceAfter=0)
LBL = ParagraphStyle("LBL", parent=SM, fontName="Helvetica-Bold", fontSize=7.6, textColor=colors.white, alignment=1)

def tags(it):
    return f"Q{it['spec']} · {DOM[it['domain']]} · {TAX[it['taxonomy']]} · {esc(it['topic'])}"

story = [Paragraph("RENR Practice Set: 10 Questions", T),
         Paragraph("Generated to MCQ authoring standard v0.1 (entry-level scope, plain-text findings, one correct / close / priority / incorrect option per item). "
                   "Part 1 is the student view. Part 2 is the rationale view shown after the learner finishes.", ParagraphStyle("s", parent=B, textColor=MUTED, fontSize=9.5)),
         Paragraph("Status: AI-generated (Claude), passed the pipeline validator 10/10 with 0 warnings. Not yet reviewed by Jade; not in any database.", ParagraphStyle("s2", parent=TAG, fontSize=8.5)),
         Spacer(1, 10), Paragraph("Part 1: Questions", H)]

for it in items:
    block = [Paragraph(tags(it), TAG), Paragraph(f"<b>{it['spec']}.</b> {esc(it['stem'])}", B)]
    block += [Paragraph(f"<b>{o['label']}.</b>&nbsp; {esc(o['text'])}", OPT) for o in it["options"]]
    block.append(Spacer(1, 10))
    story.append(KeepTogether(block))

story += [PageBreak(), Paragraph("Part 2: Answers and rationales", H),
          Paragraph("Each option shows its type as a coloured label with the text name. The correct answer comes first, then close, priority and incorrect.", ParagraphStyle("s3", parent=B, textColor=MUTED, fontSize=9.2)),
          Spacer(1, 6)]

for it in items:
    key = it["correct"][0]
    text = {o["label"]: o["text"] for o in it["options"]}
    rat = dict(it["distractor_rationales"]); rat[key] = it["rationale_correct"]
    by_type = {t: l for l, t in it["option_types"].items()}
    rows, styles = [], [("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 6), ("LINEBELOW", (0, 0), (-1, -2), 0.4, colors.white)]
    order = sorted(it["option_types"], key=lambda l: (ORDER + ["not_asked"]).index(it["option_types"][l]))
    for r, l in enumerate(order):
        t = it["option_types"][l]; name, fg, bg = TYPES[t]
        rows.append([Paragraph(name, LBL), Paragraph(f"<b>{l}. {esc(text[l])}</b><br/>{esc(rat[l])}", SM)])
        styles += [("BACKGROUND", (0, r), (0, r), fg), ("BACKGROUND", (1, r), (1, r), bg), ("VALIGN", (0, r), (0, r), "MIDDLE")]
    tb = Table(rows, colWidths=[1.05 * inch, 5.85 * inch]); tb.setStyle(TableStyle(styles))
    story.append(KeepTogether([Paragraph(tags(it), TAG),
                               Paragraph(f"<b>{it['spec']}. Answer: {key}</b>", B), tb, Spacer(1, 12)]))

def footer(c, doc):
    c.saveState(); c.setFont("Helvetica", 8); c.setFillColor(MUTED)
    c.drawString(0.8 * inch, 0.5 * inch, "NRG · RENR practice set · draft for review")
    c.drawRightString(7.7 * inch, 0.5 * inch, f"Page {doc.page}"); c.restoreState()

SimpleDocTemplate(OUT, pagesize=letter, leftMargin=0.8 * inch, rightMargin=0.8 * inch, topMargin=0.7 * inch, bottomMargin=0.8 * inch,
                  title="RENR Practice Set: 10 Questions", author="NRG").build(story, onFirstPage=footer, onLaterPages=footer)
print("wrote", OUT)
