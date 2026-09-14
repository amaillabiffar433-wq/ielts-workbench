# Original Visual PDF fixtures

All prose, tables, map and flow-chart in `generate.py` were created for IELTS Workbench QA. No Cambridge content or third-party examination is included. They are not official IELTS tests.

Generate into a NEW output folder (the generator refuses to overwrite PDFs):

```powershell
python samples/visual-pdf-fixtures/generate.py --output output/visual-pdf-fixtures-20260912
```

Dependencies: reportlab and PyMuPDF. Generated PDFs and page renders are local test artifacts, not private packs.

Six files: A plain text, B left/right columns, C raster-only scan (both pages have zero text-layer characters), D merged and nested table, E map, F flow-chart. Each file has a passage page and a question page. Q18 = `tank`, Q19 = `gravel`, one word each.

Native acceptance: Quick Import passage page 1; capture question page 2 into the question group; C captures page 1 as passage as well. Create 18–19 short-answer controls, enter answer key, validate/install, answer, quit fully and reopen. OCR can be tested on C page 1 and a region of page 2. B must read LEFT rows before RIGHT rows or explicitly warn of uncertainty.
