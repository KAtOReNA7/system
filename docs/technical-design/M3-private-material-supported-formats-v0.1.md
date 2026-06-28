# M3 private material supported formats v0.1

Generated: 2026-06-28

## Purpose

This note defines the first local private-material dry-run input format policy for M3. It is a local, non-formal dry-run boundary. It does not authorize formal execution, database use, migration changes, OCR, real search, ChatGPT web usage or browser automation.

## Supported Primary Material Formats

The dry-run accepts these extensions as primary topic materials:

- `.doc`
- `.docx`
- `.pdf`
- `.pptx`
- `.jpg`
- `.jpeg`
- `.png`
- `.txt`
- `.md`
- `.xlsx`

`doc`, `jpg`, `jpeg` and `png` are accepted primary material formats. They are not rejected by preflight and they count toward the 3-5 material-group requirement.

## First-Version Parse Policy

- `.txt` and `.md`: parsed as text when they are primary materials.
- `.doc`: accepted as legacy Word metadata-only material unless a same-stem `.txt` or `.md` companion exists.
- `.jpg`, `.jpeg` and `.png`: accepted as image metadata-only material unless a same-stem `.txt` or `.md` companion exists.
- `.docx`, `.pdf` and `.pptx`: accepted as document metadata-only material when stable local parsing is not available.
- `.xlsx`: accepted as spreadsheet metadata-only material in the current runner unless a future safe parser is added.

The metadata-only path emits readiness blockers, research questions and manual extraction requests. It does not fabricate title, author, source, heat, forecast or rating values.

## Companion Text

A same-stem `.txt` or `.md` file can enhance parsing for a binary primary material. It is not required for accepting `.doc`, `.jpg`, `.jpeg` or `.png` as supported material formats. Companion text does not count as a separate material group when a same-stem primary material exists.

## Explicit Non-Goals

- No OCR is run in this version.
- No Chrome plugin or browser automation is called.
- No ChatGPT web call is made.
- No real search is called.
- No raw material full text is written to public docs.
- No private input or private output is committed.
- No formal M3 execution result is generated.

## Rating Boundary

When readiness is blocked, the runner suppresses candidate rating output:

- `rating = null`
- `ratingStatus = not_generated_due_to_readiness_blocked`
- `candidateRatingGenerated = false`

`E` remains a valid lowest rating only after an effective evaluation exists. It is not used as a placeholder for unassessable material.
