"""Optional ADR PDF export: python -m pip install reportlab; python scripts/export-adrs.py."""
from pathlib import Path
from html import escape
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak

root = Path(__file__).resolve().parent.parent
target = root / "output" / "pdf" / "marksync-task1-adrs.pdf"
target.parent.mkdir(parents=True, exist_ok=True)
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="BodyADR", fontName="Helvetica", fontSize=10, leading=15, spaceAfter=9, textColor=colors.HexColor("#26352f"), alignment=TA_LEFT))
styles["Title"].fontSize = 24
styles["Title"].leading = 29
styles["Title"].textColor = colors.HexColor("#285840")
styles["Heading2"].textColor = colors.HexColor("#285840")
story = []
for index, source in enumerate(sorted((root / "docs" / "adr").glob("*.md"))):
    if index:
        story.append(PageBreak())
    for block in source.read_text(encoding="utf-8").split("\n\n"):
        text = block.strip()
        if not text:
            continue
        if text.startswith("# "):
            story.append(Paragraph(escape(text[2:]), styles["Title"]))
            story.append(Spacer(1, 15))
        elif text.startswith("## "):
            story.append(Paragraph(escape(text[3:]), styles["Heading2"]))
        elif text.startswith("- "):
            for line in text.splitlines():
                story.append(Paragraph("&#8226; " + escape(line.removeprefix("- ")), styles["BodyADR"]))
        else:
            story.append(Paragraph(escape(text.replace("\n", " ")), styles["BodyADR"]))

def footer(canvas, doc):
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#6c7e70"))
    canvas.drawString(48, 27, "MARKSYNC / TASK 1 / PROPOSED ADRs - GROUP REVIEW REQUIRED")
    canvas.drawRightString(547, 27, str(doc.page))

SimpleDocTemplate(str(target), pagesize=(595, 842), rightMargin=48, leftMargin=48, topMargin=45, bottomMargin=48, title="MarkSync Task 1 - Architectural Decision Records", author="ASE project").build(story, onFirstPage=footer, onLaterPages=footer)
print(target)
