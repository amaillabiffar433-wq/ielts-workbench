import { describe, expect, it } from "vitest";
import { analyzePdfLayout, pdfFragments } from "./pdfLayout";
import type { PdfTextFragment } from "./pdfImportModel";

const column = (x: number, prefix: string): PdfTextFragment[] => Array.from({ length: 6 }, (_, index) => ({ x, y: 700 - index * 22, width: 190, height: 12, text: `${prefix} row ${index + 1} describes an original river study.` }));
describe("conservative PDF column order", () => {
  it("extracts width, height and coordinates and rejects malformed fragments", () => {
    expect(pdfFragments([{ str: "One", transform: [1, 0, 0, 12, 50, 700], width: 40, height: 12 }, null, { str: "bad" }])).toEqual([{ text: "One", x: 50, y: 700, width: 40, height: 12 }]);
  });
  it("keeps a single column in stable top-to-bottom order", () => {
    const result = analyzePdfLayout(column(50, "single").reverse(), 600);
    expect(result.kind).toBe("single-column");
    expect(result.text.indexOf("row 1")).toBeLessThan(result.text.indexOf("row 6"));
  });
  it("orders complete left column before right rather than interleaving equal-y lines", () => {
    const result = analyzePdfLayout([...column(330, "RIGHT"), ...column(50, "LEFT")], 600);
    expect(result.kind).toBe("two-column");
    expect(result.text.indexOf("LEFT row 6")).toBeLessThan(result.text.indexOf("RIGHT row 1"));
    expect(result.confidence).toBeLessThan(1);
  });
  it("warns for three columns or spanning body material instead of asserting reliable order", () => {
    const three = [20, 210, 400].flatMap((x) => column(x, "column").map((item) => ({ ...item, width: 120 })));
    expect(analyzePdfLayout(three, 600).kind).toBe("complex");
    expect(analyzePdfLayout([...column(50, "left"), ...column(330, "right"), { x: 30, y: 650, width: 530, height: 12, text: "A merged body row" }], 600).kind).toBe("complex");
  });
  it("flags absent or sparse text without throwing, allowing image-only imports", () => {
    expect(analyzePdfLayout([], 600)).toMatchObject({ kind: "scan", text: "", confidence: 0 });
  });
  it("keeps spanning and short page headings before both columns", () => {
    const result = analyzePdfLayout([...column(50, "LEFT"), ...column(330, "RIGHT"), { x: 50, y: 780, width: 160, height: 17, text: "Original fixture" }, { x: 50, y: 750, width: 340, height: 14, text: "Reading Passage title" }], 600);
    expect(result.kind).toBe("two-column");
    expect(result.text.indexOf("Original fixture")).toBeLessThan(result.text.indexOf("Reading Passage title"));
    expect(result.text.indexOf("LEFT row 6")).toBeLessThan(result.text.indexOf("RIGHT row 1"));
  });
});
