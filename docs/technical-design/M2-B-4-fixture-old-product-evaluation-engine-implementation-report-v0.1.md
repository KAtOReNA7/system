# M2-B-4 fixture old-product evaluation engine implementation report v0.1

## 1. Scope

This round implements the technical-line M2-B-4 fixture old-product evaluation core engine vertical slice.

The implementation moves M2 from static fixture display toward a replaceable business evaluation skeleton. It remains fixture-only and synthetic-only. It is not a real-data evaluation, local dry-run execution, database persistence flow, migration, export, task system, mapping activation, or formal evaluation.

## 2. Implemented business capabilities

Implemented in fixture/synthetic scope:

- input snapshot construction;
- lifecycle classification;
- income summary;
- base, optimistic, and pessimistic forecast scenarios;
- rating calculation;
- risk identification;
- operating suggestions;
- synthetic backtest shape;
- unified `oldProductEvaluationResult` object;
- CLI JSON output.

All thresholds and calibration values are explicitly fixture-only / non-formal and must not be treated as formal business rules.

## 3. Core engine files

- `src/domain/oldProductEvaluation/fixtureEngine.js`
- `src/fixtures/m2OldProductEvaluationFixture.js`
- `src/repositories/oldProductEvaluationFixtureRepository.js`

The engine consumes only embedded synthetic fixture inputs. It does not read `data/`, stage JSON, operations confirmation body, environment files, database connection strings, or private files.

## 4. CLI

Added:

- `scripts/run-m2-old-product-fixture-evaluation.mjs`
- npm script: `evaluate:m2:old-products:fixture`

The CLI prints JSON to stdout:

- `mode="fixture"`;
- `syntheticOnly=true`;
- `notForFormalDecision=true`;
- all database, Docker, migration, write/export/task/formal/local_dry_run guards remain false.

## 5. API integration

The existing M2 old-product fixture repository now uses generated engine results.

The existing API routes remain unchanged:

- `GET /api/m2/old-products/evaluations/overview`
- `GET /api/m2/old-products/evaluations`
- `GET /api/m2/old-products/evaluations/{standardWorkId}`
- `GET /api/m2/old-products/readiness-gaps`
- `GET /api/m2/old-products/algorithm-versions`
- `GET /api/m2/old-products/backtests`
- `GET /api/m2/old-products/backtests/{backtestBatchId}`

Detail responses keep prior compatible sections and add `oldProductEvaluationResult`, `resultId`, `status`, `invalidationState`, `warnings`, `generatedAt`, `syntheticOnly`, and `notForFormalDecision`.

No write API, export API, evaluation task API, formal mode, or `local_dry_run` mode was added.

## 6. PRD alignment

The vertical slice aligns with M2 PRD fixture/synthetic scope:

- old-product work-level evaluation;
- lifecycle identification;
- historical income summary;
- remaining copyright-period forecast;
- three forecast scenarios;
- S+ / S / A / B / C / D / E rating;
- risks and suggestions;
- backtest shape;
- algorithm version traceability;
- input snapshot traceability;
- formal data blocking retained.

## 7. Tests

Added:

- `test/m2-old-product-evaluation-engine.test.js`

Existing API tests were retained and passed.

Coverage includes:

- input snapshot construction;
- lifecycle labels;
- income summary and incomplete-month exclusion;
- forecast scenarios;
- rating;
- risks;
- suggestions;
- synthetic backtest shape;
- API output compatibility;
- CLI parseable JSON;
- no database/Docker/network/subprocess entrypoint in CLI;
- fixture-only / synthetic-only / not-for-formal-decision markers.

## 8. Generated fixture evaluation report

Added:

- `docs/analysis/m1-master-data/M2-B-4-fixture-old-product-evaluation-engine-generated-report-v0.1.md`
- `docs/analysis/m1-master-data/M2-B-4-fixture-old-product-evaluation-engine-generated-summary-v0.1.json`

These are public fixture/synthetic summaries only. They do not contain real business data.

## 9. Validation result

Passed locally:

- `npm run evaluate:m2:old-products:fixture`
- `npm run check:no-real-data`
- `npm run lint`
- `npm run build`
- `npm test`
- `npm run smoke`
- `npm run test:e2e`

Smoke and E2E were executed because repository/API output shape was enriched, even though no UI redesign was performed.

## 10. Not implemented

This round does not implement:

- real-data evaluation;
- local dry-run execution;
- local non-formal persistence;
- database repository;
- migration;
- formal evaluation;
- export;
- evaluation task creation/cancel/retry/execution;
- mapping activation;
- `switch_mapping_version`;
- page redesign.

## 11. Safety boundary

Confirmed:

- no database connection;
- no Docker execution;
- no `data/` read;
- no real bill read;
- no digital copyright ledger read;
- no operations confirmation Excel read;
- no operations confirmation body read;
- no stage JSON body read;
- no database connection string read;
- no `.env.local` read;
- no real data import;
- no `mapping_version` activation;
- no `switch_mapping_version`;
- no formal data migration;
- no `db/migrations/` modification;
- no write API;
- no formal mode;
- no `local_dry_run` mode;
- no export API;
- no evaluation task API.

## 12. Why this was not split into smaller task numbers

This round stayed within the approved low-risk technical boundary. The work consisted of fixture-only engine implementation, fixture data organization, tests, CLI, and public documentation. No high-risk input, persistence, formal mode, real data, DB connection, Docker execution, migration, or write capability was needed.

## 13. Recommended next step

Recommended next line: technical.

Recommended next task: M2-B-5 fixture evaluation admin/API integration polish and report consistency review.

Still blocked:

- local dry-run execution;
- DB persistence;
- M2-C formal readiness;
- M2-D formal evaluation.
