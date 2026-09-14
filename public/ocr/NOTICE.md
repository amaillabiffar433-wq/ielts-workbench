# Offline English OCR assets

English LSTM model: tesseract-ocr/tessdata_fast, commit `87416418657359cb625c412a48b6e1d6d41c29bd`.
Source: https://github.com/tesseract-ocr/tessdata_fast
File: https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/87416418657359cb625c412a48b6e1d6d41c29bd/eng.traineddata
SHA-256: `7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2`.
License: Apache 2.0, reproduced in tessdata-LICENSE.txt. No modifications to model.

Runtime: tesseract.js 6.0.1 and its locked tesseract.js-core dependency, Apache 2.0.
Source: https://github.com/naptha/tesseract.js and https://github.com/naptha/tesseract.js-core
`scripts/prepare-ocr.mjs` copies worker, four bundled WASM implementations and full licenses from the locked dependencies at build time.
The runtime directory is generated, not a source checkout. Model and runtime ship in the desktop frontend assets.
No CDN, cloud service, external account or user toolchain is required at runtime.

Configuration follows https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md
English only, LSTM engine, no legacy language data, cache disabled. OCR output is always user-editable and not an answer key.
