# Original Complete Reading PDF

This generator turns the original Rivermark engineering pack into a text-layer PDF for the human-confirmed PDF import workflow. It is not an official IELTS paper and contains no third-party material.

Run from the repository root:

```powershell
python samples/original-daily-reading-pdf/scripts/generate_original_daily_reading_pdf.py
```

The output is written to the Git-ignored path `local-data/import-samples/original-daily-reading-complete.pdf`. The generated document contains three passages, forty numbered questions, explicit group ranges, option lines, structured-context text, and an answer key. It deliberately remains a source document: the application must show rule candidates and require human confirmation rather than silently install inferred structure.
