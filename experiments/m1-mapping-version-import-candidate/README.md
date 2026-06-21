# M1 mapping_version import candidate experiment

This directory contains only controlled-import preparation artifacts for local isolated database rehearsal.

Do not copy these files into `db/migrations/`.
Do not run these scripts against a production or shared database.
Do not activate `mapping_version`.
Do not import real bills.

Generated at: 2026-06-21T15:26:47.218+08:00
Candidate: m1_mapping_candidate_v0.1_20260621 / MVC-M1-V0.1-20260621

Files:

- `mapping_import_stage-v0.1.json`: candidate payload for local rehearsal.
- `00_preflight_gate.sql`: preflight gates using temporary tables.
- `01_controlled_import_candidate.sql`: transaction-wrapped dry-run template ending in `ROLLBACK`.

Known gates before any real write:

- 1 duplicate effective mapping row(s) must be folded into audit provenance instead of duplicated DB mapping rows.
- 1 same-standard/same-business regular raw-ID group(s) require local rehearsal because current `raw_work_id_mapping` has a unique constraint on `(mapping_version_id, standard_work_id, business_form)`.
- 23 amount-blank rows remain outside mapping scope and still block formal data migration release.
