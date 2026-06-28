# M3 private material dry-run safety check v0.1

Generated: 2026-06-28

## Purpose

This safety design defines the checks that must run before and after any future M3 private-material dry-run.

## Required Checks

1. File path check: inputs and outputs must be under ignored local `data/` paths.
2. Gitignore check: private input and output directories must be ignored.
3. Forbidden commit check: no `.docx`, `.pdf`, `.pptx`, `.xlsx`, `.csv`, private JSON, raw text, database or credential files may be staged.
4. Public docs check: original private material and extracted full text must not enter `docs/`.
5. Raw material check: raw material must not enter public reports or admin fixture payloads.
6. External webpage check: external webpage full text must not be saved.
7. Summary check: only short summaries and structured evidence fields are allowed.
8. Guard check: run `npm run check:no-real-data`.
9. Private output check: dry-run result files must stay ignored and untracked.
10. Git status check: run before and after dry-run.

## Run Order

Before dry-run:

- `git status --short`
- verify private input path is ignored;
- verify private output path is ignored;
- verify no staged files;
- verify no migration diff.

After dry-run:

- `git status --short`
- `git ls-files --others --exclude-standard`
- `npm run check:no-real-data`
- confirm no private outputs appear in tracked or staged files.

## Public Artifact Rule

Any public report from a private dry-run must be aggregate-only and sanitized. It may say how many private materials passed or failed a gate, but must not include real titles, author names, channel names, copied source text or full extracted text.

## Boundary

The future safety check does not connect to a database, does not write migrations, does not call real search, does not call ChatGPT web, does not call Chrome and does not enter formal execution.
