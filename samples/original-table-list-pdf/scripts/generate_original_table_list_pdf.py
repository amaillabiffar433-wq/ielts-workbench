"""Generate an original text-layer PDF for table/list import acceptance."""

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
OUTPUT_PATH = REPOSITORY_ROOT / "local-data" / "import-samples" / "original-reading-table-list.pdf"


def footer(canvas, document):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#5B6770"))
    canvas.drawString(20 * mm, 12 * mm, "IELTS Workbench - Original table/list sample")
    canvas.drawRightString(190 * mm, 12 * mm, f"Page {document.page}")
    canvas.restoreState()


def build_pdf(output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="Cover", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=22, leading=27, alignment=TA_CENTER, spaceAfter=14))
    styles.add(ParagraphStyle(name="Passage", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=15, leading=19, spaceBefore=5, spaceAfter=8, textColor="#12304A"))
    styles.add(ParagraphStyle(name="Group", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=12, leading=15, spaceBefore=8, spaceAfter=6, textColor="#285A69"))
    styles.add(ParagraphStyle(name="Body2", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.8, leading=14, spaceAfter=7))
    styles.add(ParagraphStyle(name="Instruction", parent=styles["BodyText"], fontName="Helvetica-Oblique", fontSize=9.2, leading=13, leftIndent=7, spaceAfter=6, textColor="#3D4852"))
    styles.add(ParagraphStyle(name="Question", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.5, leading=13, leftIndent=9, firstLineIndent=-9, spaceAfter=5))
    styles.add(ParagraphStyle(name="Cell", parent=styles["BodyText"], fontName="Helvetica", fontSize=8.8, leading=11))

    document = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=18 * mm,
        bottomMargin=20 * mm,
        title="Original Reading Table and List Sample",
        author="IELTS Workbench",
        subject="Original manual structured-context acceptance sample",
    )
    story = []

    def p(text: str, style: str = "Body2") -> None:
        story.append(Paragraph(text, styles[style]))

    p("Original Reading Table and List Sample", "Cover")
    p("This original document was written for IELTS Workbench acceptance. It is not an official IELTS paper and contains no Cambridge material.", "Instruction")
    p("READING PASSAGE 1", "Passage")
    p("The Harbour Ledger", "Passage")
    p("At Greyhaven harbour, a small volunteer team records the condition of navigation boards used by local crews. The ledger is kept for maintenance planning rather than law enforcement. Each observation is checked by one team and filed by a separate desk, which helps the group find transcription mistakes without treating either record as automatically correct.")
    p("Morning checks begin at the east gate. A field team compares the board number with a printed route list, then sends a short note to the records room. Evening checks are handled differently: the west desk receives calls from crews and enters the confirmed time in the ledger. Pages awaiting clarification are placed in a blue folder, never mixed with completed pages.")
    p("The team publishes a monthly summary, but personal names and vessel identifiers are removed. This allows residents to see recurring maintenance delays while keeping the working ledger local and limited to its original purpose.")
    p("Questions 17-19 / Table Completion", "Group")
    p("Complete the table. Use NO MORE THAN TWO WORDS for each answer.", "Instruction")
    p("Before completing the ledger table, follow these steps:", "Body2")
    story.append(ListFlowable([
        ListItem(Paragraph("Identify the row label before reading across the columns.", styles["Body2"])),
        ListItem(Paragraph("Keep the wording from the passage within the stated word limit.", styles["Body2"])),
        ListItem(Paragraph("Leave uncertain records for a manual check rather than guessing.", styles["Body2"])),
    ], bulletType="1", start="1", leftIndent=18, bulletFontName="Helvetica-Bold", bulletFontSize=9))
    story.append(Spacer(1, 4 * mm))

    cell = lambda text: Paragraph(text, styles["Cell"])
    table_data = [
        [cell("Ledger record"), cell("Primary action"), cell("Responsible team or place")],
        [cell("Morning board check"), cell("Compare with route list"), cell("17 __________")],
        [cell("Evening call record"), cell("Enter confirmed time"), cell("18 __________")],
        [cell("Uncertain page"), cell("manual check"), cell("19 __________")],
        [cell("Duplicate review note"), cell("manual check"), cell("Keep separate")],
    ]
    table = Table(table_data, colWidths=[45 * mm, 59 * mm, 56 * mm], repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#DDEAF0")),
        ("BACKGROUND", (0, 1), (0, -1), colors.HexColor("#EEF3F5")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#12304A")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.6, colors.HexColor("#7A8A91")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(table)
    story.append(Spacer(1, 5 * mm))
    p("17 Which team performs the morning comparison?", "Question")
    p("18 Which desk enters the confirmed evening time?", "Question")
    p("19 Where are pages awaiting clarification placed?", "Question")
    story.append(PageBreak())

    p("SOURCE CHECK PAGE", "Passage")
    p("The source table on page 1 is intentionally regular: five rows and three columns, one header row, and a row label in the first column. The phrase manual check appears in two separate cells. During import, each cell must receive its own stable ID even though the text is identical.", "Body2")
    p("The list is intentionally single-level and ordered. The table has no merged cells, nested tables, images, formulas, or hidden answer data. These omissions define the MVP boundary rather than an automatic reconstruction claim.", "Body2")
    p("Human confirmation checklist", "Group")
    story.append(ListFlowable([
        ListItem(Paragraph("Create one paragraph context block for the instruction before the list.", styles["Body2"])),
        ListItem(Paragraph("Create one ordered list with three stable list-item IDs.", styles["Body2"])),
        ListItem(Paragraph("Create a 5 by 3 table, enable the header row and row headers, then bind Questions 17, 18, and 19 to their cells.", styles["Body2"])),
        ListItem(Paragraph("Preview the practice layout before formal installation.", styles["Body2"])),
    ], bulletType="1", start="1", leftIndent=18, bulletFontName="Helvetica-Bold", bulletFontSize=9))
    story.append(PageBreak())

    p("ANSWER KEY", "Passage")
    p("17 field team", "Question")
    p("18 west desk", "Question")
    p("19 blue folder", "Question")
    p("All passage text, questions, layout, and answers in this sample are original.", "Instruction")

    document.build(story, onFirstPage=footer, onLaterPages=footer)


if __name__ == "__main__":
    build_pdf(OUTPUT_PATH)
    print(OUTPUT_PATH)
