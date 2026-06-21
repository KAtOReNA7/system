# M1 local Docker PostgreSQL 16 workflow

This workflow standardizes local development across multiple computers.

## Environments

- Daily local development: `m1-local-dev`
- Controlled dry-run: `m1-local-dry-run`
- Both environments are local-only Docker PostgreSQL 16 instances.
- They are not formal, staging, production, shared development, or shared test databases.

The Docker container names use the environment names above. Database names use underscores:

- `m1_local_dev`
- `m1_local_dry_run`

## Credential Source

Each computer must use its own `.env.local`.

- `.env.local` is ignored by Git.
- Only `.env.example` and documentation templates may be committed.
- Do not commit real connection strings, passwords, `.env`, `.pgpass`, real bills, ledgers, operation confirmation Excel files, private Excel files, candidate package contents, or temporary database files.
- Do not use one-off manual password input as the primary workflow.

Create local credentials:

```powershell
.\tools\dev-db\New-M1LocalEnvFile.ps1
```

The generated file contains local-only Docker passwords and runtime URLs for `m1-local-dev`.

## Initialize Local Development Database

```powershell
.\tools\dev-db\Invoke-M1LocalDockerPostgres.ps1 -EnvironmentName m1-local-dev
```

This starts Docker PostgreSQL 16, creates local roles with passwords from `.env.local`, creates the local database when missing, then runs:

- Flyway migrate
- Flyway info
- Flyway validate
- Flyway second migrate

## Initialize Controlled Dry-run Database

Use a reset dry-run database when preparing mapping rehearsal gates:

```powershell
.\tools\dev-db\Invoke-M1LocalDockerPostgres.ps1 -EnvironmentName m1-local-dry-run -Reset
```

The reset operation is only for the local disposable `m1-local-dry-run` Docker container and volume.

## Run v0.2 Controlled Dry-run Gates

```powershell
.\tools\dev-db\Invoke-M1MappingV02DryRun.ps1 `
  -SummaryPath docs/analysis/m1-master-data/M1-local-docker-v0.2-dry-run-summary-v0.1.json `
  -ReportPath docs/analysis/m1-master-data/M1-local-docker-v0.2-dry-run-report-v0.1.md
```

The script reads the local v0.2 stage artifact, runs preflight, runs the controlled import template inside a transaction that ends in explicit `ROLLBACK`, and runs G06/G07 assertions. It then verifies that no mapping version was activated and `switch_mapping_version` was not called.

## Hard Stops

Stop immediately if any target appears formal, staging, production, shared development, or shared test. Do not import real bills, digital copyright ledgers, operation confirmation Excel files, operation confirmation results, candidate package contents, connection strings, passwords, or temporary database credentials into Git. Do not modify `db/migrations/` during local environment setup.
