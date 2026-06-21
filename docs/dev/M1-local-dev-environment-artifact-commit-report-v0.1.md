# M1 local development environment artifact commit report v0.1

## Scope

- Line: auxiliary tooling preparation.
- Worktree: `D:\porject\system-worktrees\m1-local-env-public-submit-20260621-20260621-191459`
- Branch: `codex/m1-local-env-tools-20260621-20260621-191459`
- Base: `origin/main`

## Submitted Artifacts

- `.gitignore`
- `.env.example`
- `tools/dev-db/New-M1LocalEnvFile.ps1`
- `tools/dev-db/Invoke-M1LocalDockerPostgres.ps1`
- `tools/dev-db/Invoke-M1MappingV02DryRun.ps1`
- `docs/dev/M1_LOCAL_DOCKER_POSTGRES.md`
- `docs/analysis/m1-master-data/M1-local-docker-v0.2-dry-run-report-v0.1.md`
- `docs/analysis/m1-master-data/M1-local-docker-v0.2-dry-run-summary-v0.1.json`
- `docs/dev/M1-local-dev-environment-artifact-commit-report-v0.1.md`
- `docs/dev/M1-local-dev-environment-artifact-commit-summary-v0.1.json`

## Guardrail Results

- `.gitignore` covers `.env`, `.env.*`, `.env.local`, `.pgpass`, `dump/`, `dumps/`, `backup/`, `backups/`, `pgdata/`, `*.db`, `*.dump`, `*.backup`, `*.bak`, `*.sqlite`, and `*.sqlite3`.
- `.gitignore` does not blanket ignore `db/`.
- `db/migrations/` is not ignored.
- `.env.example` contains only blank values and local Docker template metadata; it contains no real password or real connection string.
- dev-db PowerShell scripts contain no real connection string or real password, target local Docker PostgreSQL 16, reject non-local/formal/staging/production/shared targets, and do not modify `db/migrations/`.
- The v0.2 dry-run report and summary agree: preflight passed, controlled import rolled back, G06/G07 passed, active mapping count is 0, `switch_mapping_version` was not called, no formal/staging/production/shared database was connected, no real data was imported, and `db/migrations/` was not modified.

## Validation

- `npm ci`: passed.
- `npm run check:no-real-data`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm test`: passed.
- `npm run smoke`: passed in fixture mode.
- PowerShell parse check: passed.
- Sensitive scan: no blocking leak; explanatory hits were limited to guardrail text, variable names, dynamic local credential generation logic, and local stage artifact file names.

## Not Submitted

- `.env.local`
- `.env`
- `.pgpass`
- `data/`
- `.codex-work/`
- `experiments/m1-mapping-version-import-candidate/mapping_import_stage-v0.1.json`
- `experiments/m1-mapping-version-import-candidate/mapping_import_stage-v0.2.json`
- Operations-line legacy delta files
- Real bills, ledgers, private Excel files, candidate package contents, connection strings, passwords, temporary database files, and database data directories

## Execution Boundary

- Main worktree was not pulled, merged, rebased, stashed, deleted from, committed, or pushed.
- No Docker command was executed during this isolation-submit turn.
- No database connection was opened during this isolation-submit turn.
- No real data was read or imported.
- `mapping_version` was not activated.
- `switch_mapping_version` was not called.
- `db/migrations/` and historical Flyway migrations were not modified.
