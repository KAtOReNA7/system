# M3 Private Completion Pack Regeneration v0.1

Generated: 2026-06-28

## Purpose

M3 private field completion packs live under `data/private-output/**`. They are local private output and must not be committed to GitHub. This document records how a new machine can regenerate the private completion pack after `git pull origin main`.

This workflow is local-only. It is not M3 formal execution.

## Why The Pack Is Not Committed

The field completion pack may contain user-filled private fields, private material-derived context, or local review output. Committing it would risk leaking private topic materials, true titles, authors, material text, private filenames or complete work details.

Committed files may describe the workflow, commands and schemas only. They must not include private field values.

## New Machine Recovery Steps

Run:

```bash
git pull origin main
npm ci
npm run check:no-real-data
npm run m3:private-completion-bootstrap
```

Private input materials must be placed in:

```text
data/private-input/m3-material-dry-run/
```

Supported primary material formats:

```text
.doc, .docx, .pdf, .pptx, .jpg, .jpeg, .png, .txt, .md, .xlsx
```

The bootstrap requires 3 to 5 private primary material groups. Optional `.txt` or `.md` files with the same stem can act as companion text, but they are still private input and must not be committed.

## Bootstrap Behavior

Command:

```bash
npm run m3:private-completion-bootstrap
```

Behavior:

- checks `data/private-input/m3-material-dry-run/`;
- stops if the directory is missing or does not contain 3 to 5 supported primary material groups;
- runs private dry-run when private input is ready;
- generates the M3 field completion pack;
- prints only aggregate, anonymous and private-path output;
- does not print true filenames, titles, authors or material text;
- does not connect to a database;
- does not write migrations;
- does not call OCR, real search, ChatGPT web, Chrome plugin or browser automation.

If a completion pack already exists, bootstrap does not overwrite it by default. Overwrite local private output only with explicit user intent:

```bash
npm run m3:private-completion-bootstrap -- --force
```

## Output Paths

Bootstrap writes private output only under:

```text
data/private-output/m3-dry-run/
```

Expected completion pack paths:

```text
data/private-output/m3-dry-run/M3-private-material-field-completion-pack-v0.1.json
data/private-output/m3-dry-run/M3-private-material-field-completion-pack-v0.1.md
```

These files remain private and ignored by Git.

## Apply Boundary

Apply is a separate step and requires user authorization after the user fills the completion pack:

```bash
npm run m3:field-completion-apply
```

or with an explicit pack:

```bash
npm run m3:field-completion-apply -- data/private-output/m3-dry-run/M3-private-material-field-completion-pack-v0.1.md
```

Apply remains local private execution. It is not M3 formal execution.

## Safety Rules

- Do not commit `data/private-input/**`.
- Do not commit `data/private-output/**`.
- Do not commit private Excel/CSV/JSON/Markdown packs.
- Do not commit Word/PDF/PPT/JPG/PNG original materials.
- Do not write true titles, authors, material text, webpage full text or complete work details into public docs.
- Do not connect to production, shared or staging-like databases.
- Do not run migrations in this workflow.
- Do not use `git add .`.
- Do not touch stash.
- Do not force push.
