# M3 private material content extraction provider v0.1

Generated: 2026-06-28

## Purpose

This design adds a local-only content extraction provider for the M3 private material dry-run. The provider improves safe text extraction where the format allows it, while preserving the prior format acceptance boundary for `.doc`, `.jpg`, `.jpeg` and `.png`.

This is not formal M3 execution. It does not authorize database connections, migration writes, real search, OCR, ChatGPT web usage, Chrome plugin usage or browser automation.

## Format Strategy

- `.txt` and `.md`: read as local text and emit `parseStatus = parsed_from_text`.
- `.docx`: attempt lightweight local extraction from `word/document.xml` inside the DOCX ZIP package. On success, emit `parseStatus = parsed_from_docx_text`; on failure, fall back to `accepted_docx_metadata_only`.
- `.xlsx`: accepted as spreadsheet metadata-only in this version. Structured cell extraction is deferred until a safe local parser is explicitly added.
- `.pdf`: accepted as PDF metadata-only in this version. Text PDF parsing can be added later only with a stable local parser. Scanned PDF OCR is not performed.
- `.doc`: accepted as legacy Word metadata-only. Old binary Word parsing is not attempted unless a separate safe local conversion path is designed.
- `.jpg`, `.jpeg` and `.png`: accepted as image metadata-only. They emit `visualExtractionRequired = true`; OCR and vision models are not called.
- `.pptx`: accepted as presentation metadata-only. Slide extraction is deferred.
- Same-stem `.txt` or `.md` companion files can enhance binary primary materials and emit `parsed_from_companion_text_enhanced`.

## Provider Output

Each extraction result includes:

- `extractionStatus`;
- `extractedTextAvailable`;
- `extractedTextLengthBucket`;
- `extractedFieldCandidates`;
- `extractionWarnings`;
- `extractionLimitations`;
- `manualExtractionRequired`;
- `visualExtractionRequired`;
- `legacyDocExtractionRequired`.

The runner may use extracted text internally to build field candidates, readiness, research questions, forecasts and rating explanations. Public summaries and committed docs must not contain raw extracted text.

## Runner Integration

The private dry-run runner calls the provider for each anonymous material group.

If text extraction succeeds, the runner passes the text into the existing material field extraction path and stores only sanitized field states in the result. If extraction is metadata-only, the runner generates manual extraction requests and keeps readiness blocked.

When readiness is blocked, the runner still suppresses candidate rating output:

- `rating = null`;
- `ratingStatus = not_generated_due_to_readiness_blocked`;
- `candidateRatingGenerated = false`.

The runner must not use `E` as a placeholder for unassessable material.

## Safety Boundary

- No raw text is printed to the console.
- No raw text is written to public docs.
- No real title, author, channel or material body is written to committed reports.
- Private input and private output remain under ignored local paths.
- Private output may contain local-only extraction candidates under `data/private-output/**`, but those files must not be committed.
- No OCR is performed.
- No real search is called.
- No ChatGPT web call is made.
- No Chrome plugin or browser automation is called.
- No database connection is made.
- No migration is written.
- No formal execution result is produced.

## Validation Scope

The provider is covered by fixture-only tests for:

- `.txt` and `.md` text parsing;
- synthetic `.docx` text extraction;
- invalid `.docx` metadata-only fallback;
- `.doc` legacy metadata-only;
- `.jpg`, `.jpeg` and `.png` image metadata-only;
- `.pdf` metadata-only;
- runner field extraction from `.docx` text;
- sanitized public summaries;
- rating suppression when readiness is blocked.
