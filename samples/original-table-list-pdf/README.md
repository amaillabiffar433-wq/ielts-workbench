# Original Reading table/list PDF

This folder defines the original PDF used to accept manual table/list context editing. It contains no Cambridge or third-party test content.

Generate the git-ignored PDF from the repository root:

```powershell
python samples/original-table-list-pdf/scripts/generate_original_table_list_pdf.py
```

The output is `local-data/import-samples/original-reading-table-list.pdf`. The source has a normal text layer, one original Reading passage, an ordered list, a rectangular table with a header row and row labels, Questions 17–19 as short-answer slots (including Question 18 inside the table), and an original answer key. Two distinct cells deliberately contain the same text `manual check` so annotation isolation can be verified by stable cell ID.

`expected-structure.json` is a human-readable acceptance target only. The application does not load it, infer layout from it, or inject it as a finished pack.
