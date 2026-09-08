# Original structured Reading PDF

This folder defines the original, reproducible PDF used to accept the manual-confirmation structured import flow. It contains no Cambridge or third-party test material.

Generate the git-ignored PDF from the repository root:

```powershell
python samples/original-structured-pdf/scripts/generate_original_structured_pdf.py
```

The output is `local-data/import-samples/original-reading-structured.pdf`. It has seven text-layer pages: three passages, two question groups per passage, Questions 1-22, Question 18 in Passage 3, a same-page Passage 2/Passage 3 transition on page 4, and a separate answer key on page 7. `expected-structure.json` is the human-checkable target for the import wizard; it is not injected into the app or database.

The PDF deliberately repeats one sentence in Passage 1 and Passage 2. This supports annotation identity checks without making text equality an identity mechanism.
