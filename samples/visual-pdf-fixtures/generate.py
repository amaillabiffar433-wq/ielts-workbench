"""Six wholly original PDF fixtures. No third-party exam content. Copy-only output."""
from pathlib import Path
from io import BytesIO
import argparse
import json
import hashlib
import textwrap
import fitz
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

WIDTH, HEIGHT = 595, 842


def lines(c, text, x=48, y=748, width=76, leading=18):
    c.setFont("Helvetica", 11)
    for line in textwrap.wrap(text, width):
        c.drawString(x, y, line)
        y -= leading
    return y


def passage(c, label, columns=False):
    c.setFont("Helvetica-Bold", 17)
    c.drawString(48, 794, f"Original Reading Fixture {label}")
    c.setFont("Helvetica-Bold", 14)
    c.drawString(48, 765, "READING PASSAGE 1 - The Rain Garden")
    paragraphs = [
        "A community workshop built a rain garden beside its library. Water first enters a tank, where large particles settle. The water then travels through gravel before reaching the plants. This simple design reduces the demand for treated water.",
        "Every morning, volunteers record the water level and compare it with the previous day. They write the figures on a paper chart. A coloured marker on the tank helps new volunteers read the scale correctly without moving the lid.",
        "The project began as a small experiment. Participants reused old containers, measured the available space and discussed safe access. They placed a broad path between the garden and the workshop, so visitors could observe the process without touching equipment.",
        "In the second season, the group added a shallow gravel bed. Several plants grew more slowly in the shade, while others adapted to the cooler conditions. The volunteers kept these observations separate from measurements because impressions are not precise data.",
        "A useful record should explain how each observation was made. The team therefore kept a short checklist next to the chart. It described the measuring tool, the time of day and the steps needed to return the equipment to its original position.",
        "The rain garden remains a learning project rather than a commercial system. Visitors are encouraged to ask questions about the route taken by the water. The final display shows the tank, the gravel bed and the planted area in that order.",
    ]
    if columns:
        for column, x in enumerate([48, 325]):
            y = 720
            for index, paragraph in enumerate(paragraphs[column * 3:column * 3 + 3]):
                y = lines(c, f"{'LEFT' if column == 0 else 'RIGHT'} {index + 1}. {paragraph}", x, y, 34, 16) - 15
    else:
        y = 724
        for paragraph in paragraphs:
            y = lines(c, paragraph, 48, y, 80, 16) - 18
    c.setFont("Helvetica", 9)
    c.drawString(48, 28, "Wholly original QA material. Not an IELTS examination or Cambridge publication.")
    c.showPage()


def questions(c, kind):
    c.setFont("Helvetica-Bold", 17)
    c.drawString(48, 790, "Questions 18-19")
    y = lines(c, "Complete the answers below. Choose ONE WORD ONLY from the passage for each answer.", y=750)
    if kind == "D":
        c.setLineWidth(1)
        c.rect(48, 410, 495, 260)
        c.line(48, 618, 543, 618)
        c.line(48, 540, 543, 540)
        c.line(220, 410, 220, 618)
        c.line(380, 410, 380, 540)
        c.drawString(150, 642, "MERGED HEADER: WATER TREATMENT")
        c.drawString(64, 581, "First container")
        c.drawString(247, 581, "18. __________")
        c.drawString(64, 477, "Filter materials")
        c.drawString(239, 492, "19. __________")
        c.drawString(400, 482, "Plants")
        c.rect(239, 429, 119, 32)
        c.drawString(247, 441, "Nested note")
    elif kind == "E":
        c.rect(70, 407, 455, 260)
        c.setFont("Helvetica-Bold", 12)
        for x, y, title in [(100, 590, "Library"), (350, 590, "18. ______"), (100, 460, "Plants"), (350, 460, "19. ______")]:
            c.rect(x, y - 20, 120, 62)
            c.drawString(x + 7, y + 3, title)
        c.setLineWidth(9)
        c.line(270, 435, 270, 645)
        c.setLineWidth(1)
        c.drawString(80, 690, "Rain garden plan - label the treatment areas")
        c.drawString(377, 548, "water inlet")
        c.drawString(375, 423, "filter bed")
    elif kind == "F":
        for y, text in [(644, "Rainwater enters"), (534, "18. ______ (settling container)"), (424, "19. ______ (filter material)"), (314, "Water reaches plants")]:
            c.roundRect(128, y - 30, 340, 60, 8)
            c.drawString(145, y - 3, text)
            if y > 314:
                c.line(298, y - 30, 298, y - 73)
                c.line(290, y - 65, 298, y - 73)
                c.line(306, y - 65, 298, y - 73)
    else:
        lines(c, "18. Water first enters a __________.", y=y-46)
        lines(c, "19. Water then travels through __________ before reaching the plants.", y=y-110)
        lines(c, "Keep the original question context visible while answering. This deliberately simple original question group is used to verify selection, persistence and scoring.", y=y-205)
    c.setFont("Helvetica", 9)
    c.drawString(48, 28, f"Original fixture {kind}; editorial answer key is in README, not printed for the learner.")
    c.showPage()


def generate(output):
    output.mkdir(parents=True, exist_ok=True)
    records = []
    for kind, name in [("A", "text"), ("B", "two-column"), ("C", "scan"), ("D", "merged-table"), ("E", "map"), ("F", "flow-chart")]:
        destination = output / f"{kind}-{name}.pdf"
        if destination.exists():
            raise FileExistsError(f"Will not overwrite {destination}")
        buffer = BytesIO()
        c = canvas.Canvas(buffer, pagesize=(WIDTH, HEIGHT), invariant=1)
        passage(c, kind, kind == "B")
        questions(c, kind)
        c.save()
        data = buffer.getvalue()
        if kind == "C":
            # Create an image-only PDF from this newly generated original; there is no text layer.
            source = fitz.open(stream=data, filetype="pdf")
            scanned = BytesIO()
            c = canvas.Canvas(scanned, pagesize=(WIDTH, HEIGHT), invariant=1)
            for page in source:
                pixels = page.get_pixmap(matrix=fitz.Matrix(2, 2))
                c.drawImage(ImageReader(BytesIO(pixels.tobytes("png"))), 0, 0, WIDTH, HEIGHT)
                c.showPage()
            c.save()
            data = scanned.getvalue()
        destination.write_bytes(data)
        doc = fitz.open(stream=data, filetype="pdf")
        for index, page in enumerate(doc):
            page.get_pixmap(matrix=fitz.Matrix(0.9, 0.9)).save(str(output / f"{kind}-page-{index+1}.png"))
        records.append({"file": destination.name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(), "text_lengths": [len(page.get_text()) for page in doc], "answers": {"18": "tank", "19": "gravel"}})
    (output / "manifest.json").write_text(json.dumps(records, indent=2), encoding="utf-8")
    print(json.dumps(records, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path)
    generate(parser.parse_args().output)
