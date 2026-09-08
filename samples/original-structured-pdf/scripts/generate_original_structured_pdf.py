"""Generate the original text-layer PDF used for structured-import acceptance.

The output is intentionally git-ignored. The script and expected structure are
the reproducible, reviewable source of truth; no Cambridge material is used.
"""

from pathlib import Path

from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
OUTPUT_PATH = REPOSITORY_ROOT / "local-data" / "import-samples" / "original-reading-structured.pdf"


def footer(canvas, document):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColorRGB(0.35, 0.39, 0.45)
    canvas.drawString(22 * mm, 12 * mm, "IELTS Workbench - Original structured-import sample")
    canvas.drawRightString(188 * mm, 12 * mm, f"Page {document.page}")
    canvas.restoreState()


def build_pdf(output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="Cover", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=23, leading=28, alignment=TA_CENTER, spaceAfter=14))
    styles.add(ParagraphStyle(name="Passage", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=15, leading=19, spaceBefore=6, spaceAfter=8, textColor="#12304A"))
    styles.add(ParagraphStyle(name="Group", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=11, leading=14, spaceBefore=8, spaceAfter=5, textColor="#285A69"))
    styles.add(ParagraphStyle(name="BodyText2", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.4, leading=13.2, spaceAfter=6))
    styles.add(ParagraphStyle(name="Instruction", parent=styles["BodyText"], fontName="Helvetica-Oblique", fontSize=9, leading=12, leftIndent=8, spaceAfter=5, textColor="#3D4852"))
    styles.add(ParagraphStyle(name="Question", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.2, leading=12.5, leftIndent=8, firstLineIndent=-8, spaceAfter=4))

    document = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        leftMargin=22 * mm,
        rightMargin=22 * mm,
        topMargin=18 * mm,
        bottomMargin=20 * mm,
        title="Original Reading Structured Import Sample",
        author="IELTS Workbench",
        subject="Original multi-passage and multi-question-group import acceptance sample",
    )
    story = []

    def p(text: str, style: str = "BodyText2") -> None:
        story.append(Paragraph(text, styles[style]))

    p("Original Reading Structured Import Sample", "Cover")
    p("This document is original test data created for IELTS Workbench. It is not an official IELTS paper and contains no Cambridge content.", "Instruction")
    p("READING PASSAGE 1", "Passage")
    p("The Lantern Ledger", "Passage")
    p("On the island of Merrow, volunteers keep a ledger of public lanterns. Each entry records the lamp's location, the hour it was checked, and whether its glass needed cleaning. The list began as a modest safety project, but it soon became a record of how different streets are used after sunset.")
    p("The same sentence appears in every field notebook: Careful records make hidden patterns visible. The phrase is deliberately repeated in later passages so annotation identity can be tested by stable content blocks rather than matching text alone.")
    p("A retired engineer designed a simple paper symbol for wind, rain, and clear weather. Volunteers use the symbol before writing any repair note. This lets the group compare failures without claiming that weather alone caused them.")
    p("The passage continues on the next PDF page. A structure editor should be able to combine source fragments from both pages into one Passage.", "Instruction")
    story.append(PageBreak())

    p("READING PASSAGE 1 - continued", "Passage")
    p("During the first winter, the team found that lamps near the ferry were checked more often than lamps beside the closed market. They did not move the lamps. Instead, they changed the inspection timetable and published a short monthly summary at the library.")
    p("Questions 1-3 / TRUE FALSE NOT GIVEN", "Group")
    p("Do the following statements agree with the passage? Write TRUE, FALSE, or NOT GIVEN.", "Instruction")
    p("1 The ledger records when each lantern was checked.", "Question")
    p("2 Volunteers replaced every lamp during the first winter.", "Question")
    p("3 The retired engineer previously worked for the ferry company.", "Question")
    p("Questions 4-6 / Short Answer", "Group")
    p("Answer the questions using NO MORE THAN TWO WORDS from the passage.", "Instruction")
    p("4 Where was the monthly summary displayed?", "Question")
    p("5 Which place had lamps checked most often?", "Question")
    p("6 What did the paper symbol record alongside rain and clear weather?", "Question")
    story.append(PageBreak())

    p("READING PASSAGE 2", "Passage")
    p("A Garden After Closing", "Passage")
    p("A small botanical garden began opening one path for two hours after its main gates closed. The evening route was not created to increase visitor numbers. Researchers wanted to learn which flowers released scent after daylight and whether quiet foot traffic disturbed moths.")
    p("Staff placed low amber markers along the path. White lamps were avoided because they changed the insects' behaviour. Visitors received a card with three possible observations and returned it before leaving.")
    p("Questions 7-9 / Multiple Choice", "Group")
    p("Choose the correct option A, B, or C. Shared options: A research purpose; B visitor comfort; C ticket sales.", "Instruction")
    p("7 Why was the evening route created?", "Question")
    p("8 What best explains the amber markers?", "Question")
    p("9 Which possible motive does the passage explicitly reject?", "Question")
    p("This passage continues on page 4, where its second question group shares a page with the beginning of Passage 3.", "Instruction")
    story.append(PageBreak())

    p("READING PASSAGE 2 - continued", "Passage")
    p("Careful records make hidden patterns visible. In this garden, however, the repeated sentence belongs to a different Passage and therefore a different stable content block from the identical sentence in Passage 1.")
    p("Questions 10-13 / Short Answer", "Group")
    p("Answer using NO MORE THAN THREE WORDS.", "Instruction")
    p("10 How long was the route open after closing?", "Question")
    p("11 Which insects were observed?", "Question")
    p("12 What colour were the route markers?", "Question")
    p("13 What lighting colour did staff avoid?", "Question")
    story.append(Spacer(1, 5 * mm))
    p("READING PASSAGE 3", "Passage")
    p("The Workshop Clock", "Passage")
    p("A community workshop inherited a mechanical clock with no maker's mark. Rather than restore it immediately, members documented every removable part and photographed the sequence in which pieces were lifted from the case.")
    p("This same-page transition is intentional: the final questions for Passage 2 and the first body fragment for Passage 3 must be assigned separately during manual confirmation.", "Instruction")
    story.append(PageBreak())

    p("READING PASSAGE 3 - continued", "Passage")
    p("The spring barrel was intact, but an improvised wooden spacer had changed the angle of one gear. The team kept the spacer in a labelled envelope because it revealed how an earlier owner had solved a problem with limited tools.")
    p("A local metalworker produced a reversible support, allowing the clock to run without drilling the original frame. The restored clock now operates for demonstrations only, and a digital timer controls ordinary workshop sessions.")
    p("Questions 14-18 / TRUE FALSE NOT GIVEN", "Group")
    p("Write TRUE, FALSE, or NOT GIVEN.", "Instruction")
    p("14 The clock displayed the name of its maker.", "Question")
    p("15 Members photographed the order in which parts were removed.", "Question")
    p("16 The wooden spacer was thrown away after inspection.", "Question")
    p("17 A metalworker drilled the original frame.", "Question")
    p("18 The clock is used to time every workshop session.", "Question")
    story.append(PageBreak())

    p("READING PASSAGE 3 - questions", "Passage")
    p("Questions 19-22 / Sentence Completion", "Group")
    p("Complete each sentence using NO MORE THAN TWO WORDS from the passage.", "Instruction")
    p("19 The clock had no ________ identifying its producer.", "Question")
    p("20 The wooden spacer changed the angle of a ________.", "Question")
    p("21 The new support was designed to be ________.", "Question")
    p("22 Normal sessions are controlled by a ________.", "Question")
    p("End of reading content.", "Instruction")
    story.append(PageBreak())

    p("ANSWER KEY", "Passage")
    answers = [
        "1: TRUE", "2: FALSE", "3: NOT GIVEN", "4: library", "5: ferry", "6: wind",
        "7: A", "8: A", "9: C", "10: two hours", "11: moths", "12: amber", "13: white",
        "14: FALSE", "15: TRUE", "16: FALSE", "17: FALSE", "18: FALSE",
        "19: maker's mark", "20: gear", "21: reversible", "22: digital timer",
    ]
    for answer in answers:
        p(answer, "Question")

    document.build(story, onFirstPage=footer, onLaterPages=footer)


if __name__ == "__main__":
    build_pdf(OUTPUT_PATH)
    print(OUTPUT_PATH)
