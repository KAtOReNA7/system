# M3 private field completion pack format v0.1

Generated: 2026-06-28

## Purpose

This document defines the local private field completion pack format for M3 private material dry-runs. It improves the user workflow so a user can fill one pack format and run apply without manually syncing JSON and Markdown.

This remains local-only, non-formal and not for formal decision.

## Supported Formats

### JSON

The JSON pack remains the canonical machine-readable format:

- file name: `M3-private-material-field-completion-pack-v0.1.json`;
- location: `data/private-output/m3-dry-run/`;
- parser reads `rows[].userFields`;
- apply validates the fields before running completion apply.

### Markdown

The Markdown pack is now fillable directly:

- file name: `M3-private-material-field-completion-pack-v0.1.md`;
- location: `data/private-output/m3-dry-run/`;
- parser reads the fillable table with `anonymousMaterialId` and user field columns;
- users no longer need to copy Markdown values back into JSON.

### XLSX

XLSX is detected as a possible future format but is not enabled in this repository version. The current project has no committed `xlsx` or `exceljs` dependency, so this sprint does not add a heavy spreadsheet dependency. If XLSX is later required, it should be added through a separate dependency and security review.

## User Fill Rules

The user only needs to fill one of the supported private pack files. If both JSON and Markdown exist:

- apply auto-detects compatible packs;
- if the detected packs have equivalent user fields, apply can continue;
- if they conflict, apply stops and asks the user to specify the intended path.

Explicit path usage is supported:

```bash
npm run m3:field-completion-validate -- data/private-output/m3-dry-run/M3-private-material-field-completion-pack-v0.1.md
npm run m3:field-completion-apply -- data/private-output/m3-dry-run/M3-private-material-field-completion-pack-v0.1.md
```

## Required Fields

Each row must include:

- `title`;
- `author`;
- `source`: `publication` or `web_original`;
- `classification`;
- `wordCount` or `audioVolumeEstimate`;
- `heatSignalType` and `heatSignalValue`;
- `copyrightTermRange`;
- `targetChannels`;
- `sameNameAudioStatusCheckStatus`: must be `checked`;
- `sameNameAudioStatus`: `has`, `none`, or `unknown`;
- `completionStatus` when `source=web_original`.

Allowed `heatSignalType` values:

- `reads`;
- `collections`;
- `rating`;
- `ranking`;
- `searchHeat`;
- `socialHeat`;
- `platformHeat`;
- `manualHeat`.

`targetChannels` should be comma-separated.

## Safety Boundary

- Private packs must stay under `data/private-output/m3-dry-run/`.
- Private packs must not be committed.
- Console output must not print true titles, authors, material text, private filenames, webpage full text or complete work detail.
- Validation errors report only anonymous material id and field names.
- No database is connected.
- No migration is written.
- No OCR, real search, ChatGPT web, Chrome plugin or browser automation is called.
- No development recommendation, resource investment level, or forecast range is emitted.
- M3 formal execution remains blocked.

## Apply Behavior

Apply order:

1. If a path is provided, apply uses that path.
2. If no path is provided, apply searches private output for JSON, Markdown, then XLSX.
3. If JSON and Markdown both exist and conflict, apply stops.
4. Validator runs before completion apply.
5. Only a complete validated pack can produce after-completion private dry-run output.

The after-completion output remains private and ignored by Git.
