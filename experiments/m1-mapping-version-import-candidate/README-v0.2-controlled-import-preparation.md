# M1 mapping_version v0.2 controlled import preparation

This directory contains experiment-only artifacts for local/development/test controlled import preparation.

Do not copy these files into `db/migrations/`.
Do not run these scripts against production, staging, or any shared formal database.
Do not activate `mapping_version`.
Do not call `switch_mapping_version`.
Do not import real bills, digital copyright ledgers, or ops confirmation Excel files.
Do not commit connection strings, passwords, `.env`, `.pgpass`, temporary database files, or `.codex-work` output.

## v0.2 status

- v0.2 readiness: PASS
- G06: PASS
- G07: PASS
- raw_work_id_mapping plan rows: 300
- historical_volume_mapping plan rows: 52
- audit source record count: 353
- `161280`, `161284`, `161290`: historical_volume_mapping to `161260/audio_copyright`
- forward-only physical model migration: not required
- automatic main regular raw ID selection: not required and not allowed

## Files

Reusable public experiment files:

- `00_preflight_gate.sql`: preflight gates using temporary tables.
- `01_controlled_import_candidate.sql`: transaction-wrapped dry-run template ending in `ROLLBACK`.
- `03_rehearsal_assertions.sql`: v0.1 assertion script retained for traceability.
- `03_rehearsal_assertions_v0.2.sql`: v0.2 G06/G07 assertion script.
- `G07-mapping-strategy-overlay-v0.2.json`: public overlay describing the G07 strategy change.

Local detailed stage files:

- `mapping_import_stage-v0.1.json`
- `mapping_import_stage-v0.2.json`

The stage files contain full candidate import detail. Keep them local unless the user explicitly authorizes committing them.

## Required dry-run gates

Before any local/development/test dry-run:

1. Confirm the target database is not production, staging, or any formal/shared database.
2. Confirm credentials are local/development/test only.
3. Run Flyway `migrate`, `info`, `validate`, and a second `migrate`.
4. Run `00_preflight_gate.sql`; all gates must pass.
5. Run `01_controlled_import_candidate.sql` inside a transaction and ensure it reaches `ROLLBACK`.
6. Run `03_rehearsal_assertions_v0.2.sql`; G06 and G07 must pass and it must reach `ROLLBACK`.
7. Confirm no mapping version is active and `switch_mapping_version` was not called.

## Failure handling

Stop immediately and report if any of these occur:

- Docker/local DB environment is unavailable.
- Flyway migration, info, validate, or second migrate fails.
- preflight has any FAIL.
- dry-run script does not enter transaction or does not ROLLBACK.
- G06 or G07 assertion fails.
- target environment appears to be production/staging/formal.
- a connection string, password, or private artifact would be written to the repository.

## Authorization boundary

Current authorization covers preparation only. It does not authorize formal database writes, mapping version activation, real bill import, or formal data migration.
