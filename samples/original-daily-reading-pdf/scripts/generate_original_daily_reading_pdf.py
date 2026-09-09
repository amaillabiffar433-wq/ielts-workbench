"""Generate the original 3-passage, 40-question Reading text-layer PDF."""

from __future__ import annotations

import json
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
MODULE_PATH = REPOSITORY_ROOT / "samples" / "original-daily-reading-pack" / "modules" / "reading.json"
OUTPUT_PATH = REPOSITORY_ROOT / "local-data" / "import-samples" / "original-daily-reading-complete.pdf"


def footer(canvas, document):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#5B6770"))
    canvas.drawString(18 * mm, 11 * mm, "IELTS Workbench - original complete Reading sample")
    canvas.drawRightString(192 * mm, 11 * mm, f"Page {document.page}")
    canvas.restoreState()


def answer_label(question: dict) -> str:
    question_type = question["type"]
    if question_type in {"single-choice", "matching"}:
        correct_id = question.get("correctOptionId")
        option = next((item for item in question.get("options", []) if item["id"] == correct_id), None)
        return option["label"] if option else "NOT PROVIDED"
    if question_type == "multiple-choice":
        correct_ids = set(question.get("correctOptionIds", []))
        labels = [item["label"] for item in question.get("options", []) if item["id"] in correct_ids]
        return " / ".join(labels) if labels else "NOT PROVIDED"
    if "correctAnswer" in question:
        return str(question["correctAnswer"]).upper()
    answers = question.get("acceptableAnswers", [])
    return " / ".join(answers) if answers else "NOT PROVIDED"


def completion_text(block: dict) -> str:
    parts = []
    for part in block["parts"]:
        parts.append(part.get("text", "") if part["kind"] == "text" else f"[{part['questionId'].rsplit('q', 1)[-1]} ______]")
    return "".join(parts)


def build_pdf(output_path: Path) -> None:
    module = json.loads(MODULE_PATH.read_text(encoding="utf-8"))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="Cover", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=22, leading=27, alignment=TA_CENTER, spaceAfter=14))
    styles.add(ParagraphStyle(name="Passage", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=15, leading=19, spaceBefore=5, spaceAfter=8, textColor="#12304A"))
    styles.add(ParagraphStyle(name="Group", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=11.5, leading=14, spaceBefore=8, spaceAfter=5, textColor="#285A69"))
    styles.add(ParagraphStyle(name="Body2", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.3, leading=13, spaceAfter=6))
    styles.add(ParagraphStyle(name="Instruction", parent=styles["BodyText"], fontName="Helvetica-Oblique", fontSize=9, leading=12, leftIndent=7, spaceAfter=6, textColor="#3D4852"))
    styles.add(ParagraphStyle(name="Question", parent=styles["BodyText"], fontName="Helvetica", fontSize=9, leading=12, leftIndent=10, firstLineIndent=-10, spaceAfter=4))
    styles.add(ParagraphStyle(name="Option", parent=styles["BodyText"], fontName="Helvetica", fontSize=8.5, leading=11, leftIndent=18, firstLineIndent=-8, spaceAfter=2))
    styles.add(ParagraphStyle(name="Cell", parent=styles["BodyText"], fontName="Helvetica", fontSize=8, leading=10))

    document = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=18 * mm,
        title="Rivermark Reading Practice",
        author="IELTS Workbench",
        subject="Original three-passage Reading import and daily-use acceptance sample",
    )
    story = [
        Paragraph(module["title"], styles["Cover"]),
        Paragraph("ORIGINAL ENGINEERING SAMPLE - 3 PASSAGES - QUESTIONS 1-40", styles["Group"]),
        Paragraph("Written from scratch for IELTS Workbench. This is not an official IELTS paper and contains no Cambridge or third-party test content.", styles["Instruction"]),
        Spacer(1, 5 * mm),
    ]

    for passage_index, section in enumerate(module["sections"], start=1):
        story.append(Paragraph(f"READING PASSAGE {passage_index}", styles["Passage"]))
        story.append(Paragraph(section["title"], styles["Passage"]))
        for block in section["contentBlocks"]:
            if block["kind"] == "heading":
                continue
            story.append(Paragraph(block["text"], styles["Body2"]))
        story.append(PageBreak())

        for group_index, group in enumerate(section["questionGroups"]):
            story.append(Paragraph(group.get("title", "Questions"), styles["Group"]))
            story.append(Paragraph(group["instructions"].replace("\n", "<br/>"), styles["Instruction"]))
            for context in group.get("contextBlocks", []):
                if context["type"] == "completion":
                    if context.get("title"):
                        story.append(Paragraph(context["title"], styles["Group"]))
                    story.append(Paragraph(completion_text(context), styles["Body2"]))
                elif context["type"] == "table":
                    cells = [[Paragraph(cell["text"] + (f" [{cell['questionId'].rsplit('q', 1)[-1]} ______]" if cell.get("questionId") else ""), styles["Cell"]) for cell in row["cells"]] for row in context["rows"]]
                    table = Table(cells, repeatRows=1 if context["hasHeaderRow"] else 0, hAlign="LEFT")
                    table.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#7A8A91")), ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#DDEAF0")), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
                    story.extend([table, Spacer(1, 3 * mm)])
            for question in group["questions"]:
                question_block = [Paragraph(
                    f"{question['number']} {question['prompt'].replace('{{blank}}', '________')}",
                    styles["Question"],
                )]
                options = question.get("options", [])
                if options:
                    question_block.append(Paragraph(
                        "<br/>".join(f"{option['label']} {option['text']}" for option in options),
                        styles["Option"],
                    ))
                story.append(KeepTogether(question_block))
            if group_index < len(section["questionGroups"]) - 1:
                story.append(Spacer(1, 3 * mm))
        story.append(PageBreak())

    story.append(Paragraph("ANSWER KEY", styles["Passage"]))
    all_questions = [question for section in module["sections"] for group in section["questionGroups"] for question in group["questions"]]
    for start in range(0, len(all_questions), 10):
        rows = []
        for question in all_questions[start:start + 10]:
            rows.append([Paragraph(str(question["number"]), styles["Cell"]), Paragraph(answer_label(question), styles["Cell"])])
        table = Table(rows, colWidths=[18 * mm, 120 * mm], hAlign="LEFT")
        table.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#9AA5AA")), ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#EEF3F5")), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 5), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
        story.extend([table, Spacer(1, 4 * mm)])
    story.append(Paragraph("All passage text, questions, options, structure and answers in this document are original.", styles["Instruction"]))
    document.build(story, onFirstPage=footer, onLaterPages=footer)


if __name__ == "__main__":
    build_pdf(OUTPUT_PATH)
    print(OUTPUT_PATH)
