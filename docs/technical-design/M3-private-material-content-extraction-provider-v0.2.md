# M3 private material content extraction provider v0.2

Generated: 2026-06-28

## Purpose

This v0.2 design enhances the local-only M3 private material dry-run extraction provider. It keeps the existing supported primary material formats and adds two targeted improvements:

- optional local converter support for legacy `.doc`;
- manual transcript companion support for `.jpg`, `.jpeg` and `.png`.

This remains a local private dry-run capability. It is not formal M3 execution and does not authorize database use, migration changes, OCR, real search, ChatGPT web usage, Chrome plugin usage or browser automation.

## Format Strategy

- `.txt` and `.md`: direct local text read.
- `.docx`: lightweight local XML extraction from `word/document.xml`.
- `.doc`: optional local converter path. The runner may use `soffice`, `libreoffice`, `antiword` or `catdoc` when present. These tools are optional and are not CI requirements. If no converter exists, the runner falls back to metadata-only.
- `.jpg`, `.jpeg` and `.png`: no OCR. If a same-stem `.txt` or `.md` exists, it is treated as a manual transcript. Without a companion transcript, images remain metadata-only with `visualExtractionRequired = true`.
- `.pdf`, `.pptx` and `.xlsx`: metadata-only in this version unless a future safe local parser is designed.

## Legacy DOC Statuses

The `.doc` path can emit:

- `parsed_from_legacy_doc_text`;
- `legacy_doc_converter_unavailable`;
- `legacy_doc_conversion_failed`;
- `accepted_legacy_doc_metadata_only`.

When a converter creates temporary output, it must write under an ignored private temp path such as `data/private-output/m3-dry-run/tmp/`. Temporary files are local-only and must be cleaned after conversion.

## Image Manual Transcript

Image primary materials remain supported. The runner does not call OCR or a vision model.

If a same-stem transcript exists:

- `parseStatus = parsed_from_image_manual_transcript`;
- `visualExtractionRequired = false`;
- `manualTranscriptProvided = true`;
- extracted text may feed local field extraction.

If no transcript exists:

- `parseStatus = accepted_image_metadata_only`;
- `visualExtractionRequired = true`;
- `manualExtractionRequired = true`.

## Output Fields

The extractor and runner include these extraction fields:

- `extractionProvider`;
- `extractionProviderAvailable`;
- `extractionAttempted`;
- `extractionFailureReason`;
- `manualTranscriptProvided`;
- `converterUsed`;
- `privateTempFileCreated`;
- `privateTempFileCleaned`;
- `extractionStatus`;
- `extractedTextAvailable`;
- `extractedTextLengthBucket`;
- `extractedFieldCandidates`;
- `extractionWarnings`;
- `extractionLimitations`;
- `manualExtractionRequired`;
- `visualExtractionRequired`;
- `legacyDocExtractionRequired`.

## Safety Boundary

- No raw text is printed to the console.
- No raw text is written to public docs.
- No real title, author, channel, filename or material body is written to committed reports.
- Private input and output remain under ignored local paths.
- Private output may contain local-only extraction candidates, but must not be committed.
- OCR is not called.
- ChatGPT web is not called.
- Chrome plugin and browser automation are not called.
- Real search is not called.
- No database connection is made.
- No migration is written.
- No formal execution result is produced.

## Readiness And Rating Boundary

Metadata-only or partially extracted materials can still remain readiness-blocked. When readiness is blocked, the runner suppresses candidate rating output:

- `rating = null`;
- `ratingStatus = not_generated_due_to_readiness_blocked`;
- `candidateRatingGenerated = false`.

`E` remains a valid candidate rating only after a real evaluation exists. It is not used as a placeholder for missing extraction.

## Validation Scope

Tests cover:

- `.docx` still parses through XML extraction;
- `.doc` converter unavailable fallback;
- `.doc` mock converter success;
- `.doc` mock converter failure;
- `.jpg` and `.png` manual transcript companions;
- `.jpeg` metadata-only without companion;
- image paths do not trigger OCR;
- converter temp output is scoped to private output tmp;
- public summaries do not contain raw extracted text;
- readiness-blocked results do not output `E`;
- no-real-data guard still passes.
