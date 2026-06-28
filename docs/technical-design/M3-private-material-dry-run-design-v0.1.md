# M3 private material dry-run design v0.1

Generated: 2026-06-28

## Purpose

The private material dry-run will use a small set of user-provided local topic materials to validate field extraction, research questions, structured evidence entry, readiness, comparables, author ranking, channel point forecast, rating explanation, workflow timeline and backtest anchor snapshots.

The dry-run is local only. It does not write formal data, does not create a formal result, does not submit private material and does not enter formal execution.

## First Batch Recommendation

Prepare 3-5 private topic materials:

- at least one publication topic;
- at least one web original topic;
- at least one materially complete topic;
- at least one sparse topic;
- at least one topic with clear external heat;
- at least one topic with same-name audio risk;
- at least one topic with adaptation signal or clearly missing adaptation signal.

## Allowed Input Formats

- `.docx`
- `.pdf`
- `.pptx`
- `.txt`
- `.md`
- `.xlsx` topic material table
- manually pasted text

## Private Input Directories

Recommended local-only directories:

- `data/private-input/m3-material-dry-run/`
- `data/private-output/m3-dry-run/`

These paths are intentionally under `data/`, which is ignored by Git in this repository.

## Naming Convention

Use neutral local filenames:

- `M3-private-material-dry-run-input-001.<ext>`
- `M3-private-material-dry-run-input-002.<ext>`
- `M3-private-material-dry-run-input-003.<ext>`

Do not use real work title, author, channel or commercial terms in filenames that might appear in logs.

## Forbidden Public Outputs

Do not commit:

- original topic material files;
- extracted full text;
- private Excel, CSV or JSON details;
- real topic-name lists;
- external webpage full text;
- real work names, author names, channel names or raw billing rows.

## Private Output Package

Recommended local-only output paths:

- `data/private-output/m3-dry-run/M3-private-material-dry-run-result-v0.1.xlsx`
- `data/private-output/m3-dry-run/M3-private-material-dry-run-result-v0.1.json`

These outputs must stay untracked and ignored.

## Suggested Sheets

- `00_说明`
- `01_物料字段抽取`
- `02_readiness`
- `03_research_questions`
- `04_external_evidence`
- `05_comparables_author`
- `06_channel_forecast`
- `07_rating_explanation`
- `08_workflow`
- `09_backtest_anchor`
- `10_user_feedback`

## Dry-Run Procedure

1. Confirm the worktree is clean.
2. Confirm private input and output paths are ignored.
3. Place 3-5 private materials under the private input directory.
4. Run the local dry-run script after separate authorization.
5. Inspect private output package locally.
6. Generate only aggregate sanitized notes for public docs if needed.
7. Keep private outputs untracked.
8. Do not run formal execution.

## Gate

The first private dry-run may start only after the user provides or identifies the 3-5 private materials and explicitly authorizes local private-material reading.
