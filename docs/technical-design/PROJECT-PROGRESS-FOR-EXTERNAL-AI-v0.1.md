# Project progress handoff for external AI v0.1

Generated: 2026-06-22

Repository: `https://github.com/KAtOReNA7/system`

Local workspace checked: `E:\project\system`

Current branch: `main`

Current local HEAD and remote `main`: `463f86ecc1045a67c2d014d2fd4e59f55a8dcdcc`

Worktree state at audit start: clean

This file is a handoff artifact. It has been updated for authorized local real-data development mode. Local real-data reads, `data/**` reads, local DB/Docker, local migrations, strict reconciliation, backtests and algorithm calibration are now allowed when performed locally and without committing raw data or secrets.

## 1. One paragraph summary

This project is an audiobook product revenue evaluation and annual target system. The repository currently contains a completed staged M1+M2 engineering line, where "completed" means M1 data foundation/read-only admin/API/CI/schema/local tooling and M2 old-product evaluation fixture/productization/non-formal candidate plus FR-0 to FR-6 formal-readiness prototypes are complete. It is not yet a production/formal evaluation system: formal database authorization, formal real-data import and reconciliation, mapping activation, DB-backed M2 persistence, runtime formal task/export APIs, release/audit records, and actual formal evaluation remain blocked or deferred.

## 2. Hard boundaries for any next AI agent

Current mode allows local real-data development, but do not:

- connect to a remote production, shared, staging-like, or otherwise unapproved database;
- commit raw real data, private Excel/CSV, ledgers, database dumps, temporary database files, `.env`, `.pgpass`, or secrets;
- print passwords, full connection strings, raw rows, or complete sensitive work/channel/revenue details;
- touch stash;
- use `git add .`;
- present local real-data development candidates as final release-approved formal results.

Allowed locally: read user-provided real data and `data/**`, use local development DB, use local Docker/PostgreSQL, modify or add `db/migrations`, execute local migrations, import local real data, run strict reconciliation, backtests, and algorithm calibration. Non-local mapping activation, `switch_mapping_version`, production/shared DB access, and release publication still need explicit future authorization.

## 3. What was checked in this handoff audit

The local project was enumerated from Git-tracked files and hidden project files. Generated/runtime folders such as `.git`, `node_modules`, build outputs, coverage and logs were excluded from file inventory.

Inventory checked:

| Area | Count | Notes |
| --- | ---: | --- |
| Git-tracked files | 582 | Same as `rg --files --hidden` project inventory. |
| `docs/` | 287+ | PRD, technical design, analysis summaries, API contracts, closeout reports, and new aggregate M2 real-data reports. |
| `db/migrations/` | 81 | Base M1 migrations through `V0060_290`; new local development M2 migration is `V0070_000__m2_evaluation_persistence.sql`, not executed in this run. |
| `experiments/` | 143 | Flyway candidate, PostgreSQL 16 prototype, mapping import candidate evidence. |
| `tools/` | 43 | Dev DB helpers, smoke tools, analysis/calibration scripts. |
| `src/` | 28 | Node HTTP app, config, DB health/query, repositories, M2 domains, fixtures, and real-data development boundary helper. |
| `test/` | 27 | Node test coverage for M1/M2 API, engine, gates, fixture workflows, real-data dev boundary, and E2E. |
| `scripts/` | 7 | Guardrails, readiness checks, report generation, M2 fixture evaluation, and authorized local real-data aggregate runner. |
| `public/admin/` | 3 | Single-page admin prototype HTML/CSS/JS. |

Important caveat: this handoff now reflects authorized local real-data aggregate development. It includes source profiling, aggregate reconciliation, backtest/calibration summaries, and candidate-b metrics, but it does not include raw rows, work/channel names, secrets, or connection strings. No database connection was made for this handoff.

## 4. Repository and CI state

- Remote origin is `https://github.com/KAtOReNA7/system`.
- Local `main` matches remote `main` at `463f86e`.
- The latest commit adds M1+M2 completion audit artifacts:
  - `docs/technical-design/M1-M2-development-completion-audit-report-v0.1.md`
  - `docs/analysis/m1-master-data/M1-M2-development-completion-audit-summary-v0.1.json`
- CI workflow exists at `.github/workflows/ci.yml`.
- CI runs `npm ci`, installs Chromium, then runs `check:no-real-data`, `lint`, `build`, `test`, `smoke`, and `test:e2e`.
- `.gitignore` blocks local env files, database files, private business data, Excel/CSV files, local database folders and temporary artifacts.
- Pull request template requires explicit reporting for migrations, production DB, real data, `data` paths, env files, validation, operations artifacts, and private Excel/candidate packages.

## 5. Product and milestone state

### M1 data foundation

M1 is complete for staged engineering and M2-readiness:

- PRD v0.2 is structured with authoritative REQ/AT documents.
- Physical schema exists as 80 base M1 migrations through schema version `0060.290`; this sprint adds local development migration `V0070_000__m2_evaluation_persistence.sql`, not executed yet.
- Read-only M1 API exists for health, system status, works, mapping versions, and jobs.
- Minimal admin exists for system, works, mapping and jobs.
- CI and local safety guardrails exist.
- Local PostgreSQL 16/Docker development workflow is documented.
- mapping_version v0.2 was locally rehearsed and summarized, but not formally activated.

M1 is not complete as full formal real-data acceptance:

- local file-based real-data profiling and strict reconciliation were executed in aggregate form; formal DB import and formal DB reconciliation remain pending;
- formal database authorization is not open;
- mapping_version is not activated;
- `switch_mapping_version` was not called;
- revoke/reimport, backup/recovery and formal operational acceptance remain next-stage work.

### M2 old-product evaluation

M2 main development is complete for the staged repository boundary:

- M2-B fixture API/admin/productization complete.
- M2-C non-formal candidate-a calibration complete and frozen.
- M2-FR-0 to FR-6 formal-readiness fixture/prototype line complete.
- M2 final closeout and new-session handoff pack exist.

Frozen candidate:

`m2-c3-cleaned-bill-nonformal-v0.2/candidate-a`

This candidate is not a formal evaluation result and must not be used for formal business decisions.

M2 is not complete as formal evaluation:

- formal DB-backed M2 persistence is only modeled/design-candidate, not migrated;
- runtime formal task API is not implemented;
- runtime formal export API is not implemented;
- blocking manual reviews require business closure;
- formal audit/release/rollback records are not DB-backed;
- formal evaluation has not executed.

## 6. Current source implementation map

Runtime:

- `src/server.js`: starts the local HTTP server on `127.0.0.1`.
- `src/config.js`: only allows `local`, `test`, `ci`; validates role-specific database URLs and rejects `migration_owner`.
- `src/errors.js`: public error shape and secret/database URL sanitization.
- `src/db/health.js`: schema/version/view/system-state health check; returns degraded if DB is not configured/unavailable.
- `src/db/query.js`: small `pg` pool wrapper with configured role boundary.
- `src/http/app.js`: native HTTP routing, JSON responses, no-store headers, request IDs, admin static serving, M1 API, M2 fixture APIs and formal-mode blocking.
- `src/http/pagination.js`: safe positive integer pagination parsing.
- `src/http/staticAdmin.js`: serves only `/admin`, `/admin/`, `/admin/app.css`, `/admin/app.js`.

M1 repositories:

- `src/repositories/systemRepository.js`: read-only lifecycle, mapping readiness and bill import readiness.
- `src/repositories/workRepository.js`: read-only `v_basic_info_gap`.
- `src/repositories/mappingVersionRepository.js`: read-only mapping versions.
- `src/repositories/jobRepository.js`: read-only background task status.

M2 repositories:

- `src/repositories/oldProductEvaluationFixtureRepository.js`: old-product fixture list/detail/overview/gaps/backtests and strict filter validation.
- `src/repositories/m2BlockingReviewFixtureRepository.js`: fixture blocking review list/detail/action simulation plus advisory summary.
- `src/repositories/m2EvaluationTaskFixtureRepository.js`: fixture task list/detail/create/action simulation.
- `src/repositories/m2ExportFixtureRepository.js`: fixture export list/detail/create/release-action simulation.

M2 domain:

- `src/domain/oldProductEvaluation/fixtureEngine.js`: synthetic old-product evaluation engine.
- `src/domain/oldProductEvaluation/evaluationParameters.js`: baseline and calibrated non-formal parameter profiles.
- `src/domain/oldProductEvaluation/calibratedParameters.js`: aggregate-only non-formal candidate parameters.
- `src/domain/oldProductEvaluation/formalPersistenceSchema.js`: formal persistence model constants and required fields; no migration execution.
- `src/domain/oldProductEvaluation/formalReadinessGate.js`: readiness gate reasons/actions/statuses.
- `src/domain/oldProductEvaluation/blockingReviewWorkflow.js`: blocking review state machine.
- `src/domain/oldProductEvaluation/evaluationTaskWorkflow.js`: fixture task lifecycle and audit events.
- `src/domain/oldProductEvaluation/advisoryReviewDisplay.js`: advisory display semantics; advisory does not block formal eligibility by itself.
- `src/domain/oldProductEvaluation/exportReleaseGate.js`: fixture export eligibility, forbidden field checks and release gate simulation.

Admin:

- `public/admin/index.html`: sidebar and pages for M1 status/works/mapping/jobs plus M2 overview/list/detail/gaps/backtests/reviews/tasks/exports.
- `public/admin/app.js`: large single-page admin controller, fixture toggle, renderers, API calls and safe-state messaging.
- `public/admin/app.css`: responsive admin styling.

## 7. API surface currently implemented

M1:

- `GET /health`
- `GET /health/db`
- `GET /api/system/status`
- `GET /api/works`
- `GET /api/works/:id`
- `GET /api/mapping-versions`
- `GET /api/mapping-versions/:id`
- `GET /api/jobs`
- `GET /api/jobs/:id`

M2 old-product fixture:

- `GET /api/m2/old-products/evaluations/overview`
- `GET /api/m2/old-products/evaluations`
- `GET /api/m2/old-products/evaluations/:standardWorkId`
- `GET /api/m2/old-products/readiness-gaps`
- `GET /api/m2/old-products/algorithm-versions`
- `GET /api/m2/old-products/backtests`
- `GET /api/m2/old-products/backtests/:backtestBatchId`

M2 formal-readiness fixture/prototype:

- `GET /api/m2/formal-readiness/reviews`
- `GET /api/m2/formal-readiness/reviews/:reviewItemId`
- `POST /api/m2/formal-readiness/reviews/:reviewItemId/actions`
- `GET /api/m2/fixture/evaluation-tasks`
- `POST /api/m2/fixture/evaluation-tasks`
- `GET /api/m2/fixture/evaluation-tasks/:taskId`
- `POST /api/m2/fixture/evaluation-tasks/:taskId/actions`
- `GET /api/m2/fixture/advisory-reviews/summary`
- `GET /api/m2/fixture/exports`
- `POST /api/m2/fixture/exports`
- `GET /api/m2/fixture/exports/:exportId`
- `POST /api/m2/fixture/exports/:exportId/actions`

Formal mode is explicitly blocked for M2 APIs when requested via query/header. The expected public error is `formal_data_blocked`.

## 8. Tests and validation coverage

Configured package scripts:

- `npm run lint`: syntax checks JavaScript files under `src`, `test`, `tools/node`, `tools/dev-smoke`, `public/admin`.
- `npm run build`: same syntax check as lint.
- `npm test`: Node tests covering M1 API/admin/config/db-query/health and M2 fixture/domain workflows.
- `npm run smoke`: fixture-only API smoke path, no PostgreSQL by default.
- `npm run test:e2e`: Playwright admin E2E with no database URLs.
- `npm run check:no-real-data`: scans tracked/staged files for private data, env and database-secret patterns.

Test coverage exists for:

- M1 read-only API and admin;
- database-not-configured degradation;
- sensitive error sanitization;
- config role boundaries;
- M2 old-product fixture API and engine;
- calibrated non-formal parameters;
- no-DB readiness and local dry-run manifest validation;
- formal persistence schema constants;
- formal readiness gate;
- blocking review workflow;
- fixture task workflow;
- advisory review display;
- fixture export release gate;
- smoke safety;
- admin E2E.

## 9. Key evidence files for external AI

Read in this order:

1. `README.md`
2. `AGENTS.md`
3. `docs/technical-design/M1-M2-development-completion-audit-report-v0.1.md`
4. `docs/analysis/m1-master-data/M1-M2-development-completion-audit-summary-v0.1.json`
5. `docs/technical-design/M2-final-closeout-report-v0.1.md`
6. `docs/technical-design/M2-new-session-handoff-pack-v0.1.md`
7. `docs/prd/README.md`
8. `docs/prd/00-governance/scope.md`
9. `docs/prd/00-governance/traceability.md`
10. `docs/prd/70-acceptance/M1.md`
11. `docs/prd/20-evaluation/M2-old-product-evaluation-prd-v0.1.md`
12. `docs/technical-design/M2-formal-readiness-preparation-breakdown-v0.1.md`
13. `docs/technical-design/M2-FR-1-formal-persistence-data-model-v0.1.md`
14. `docs/technical-design/sql-candidates/M2-FR-1-formal-persistence-migration-candidate-v0.1.sql`
15. `src/http/app.js`
16. `src/domain/oldProductEvaluation/formalReadinessGate.js`
17. `src/domain/oldProductEvaluation/exportReleaseGate.js`
18. `test/m2-export-release-gate.test.js`

## 10. Current blockers and risks

Blocking for formal evaluation:

- Remote/formal database authorization is not open.
- Local file-based real-data import/profile/reconciliation is complete at aggregate level; formal DB import and formal DB reconciliation are not complete.
- Formal mapping_version is not activated.
- `switch_mapping_version` was not called.
- Formal readiness business closure or auditable waiver is incomplete.
- Local development persistence migration `V0070_000__m2_evaluation_persistence.sql` exists but has not executed.
- Runtime formal task API is not implemented.
- Runtime formal export API is not implemented.
- Formal audit/release/rollback is not DB-backed.

Not blockers for staged M1+M2 closeout:

- M1 full formal real-data acceptance remains outside staged closeout.
- M2 formal API contracts include future design surfaces.
- M2 fixture/admin/productization exists, but it is intentionally non-formal.
- Remote CI status must be rechecked after future pushes.

## 11. Selected next project route

The selected immediate route is:

`M2 authorized local real-data development sprint`

This route has begun and now includes aggregate local real-data source discovery, profiling, strict reconciliation, local DB-backed development preparation, backtesting, and algorithm calibration. The current direction remains:

- prioritize authorized local real-data development;
- keep CI fixture/no-DB compatible;
- continue from `m2-realdata-dev-candidate-b-v0.1` without overwriting candidate-a;
- do not enter M3 yet;
- do not continue M2-C5/C6;
- do not start FR-7.

The new master plan is:

`docs/technical-design/M2-next-stage-formalization-master-plan-v0.1.md`

The master plan has been updated for authorized local real-data development. It still does not authorize remote production/shared DB access, raw data commits, secret disclosure, or final release approval.

Current aggregate outputs:

- `docs/analysis/m2-real-data/M2-real-data-profile-summary-v0.1.md`
- `docs/analysis/m2-real-data/M2-strict-reconciliation-summary-v0.1.md`
- `docs/analysis/m2-real-data/M2-real-data-algorithm-calibration-summary-v0.1.md`
- `docs/analysis/m2-real-data/M2-realdata-dev-candidate-b-summary-v0.1.md`
- `docs/analysis/m2-real-data/M2-local-db-import-reconciliation-summary-v0.1.md`
- `docs/analysis/m2-real-data/M2-candidate-b-blocking-review-workflow-summary-v0.1.md`
- `docs/analysis/m2-real-data/M2-candidate-b-blocking-review-business-closure-plan-v0.1.md`
- `docs/analysis/m2-real-data/M2-candidate-b-readiness-closure-summary-v0.1.md`
- `docs/analysis/m2-real-data/M2-candidate-b-review-group-decision-policy-v0.1.md`
- `docs/analysis/m2-real-data/M2-candidate-b-review-user-decision-brief-v0.1.md`
- `docs/analysis/m2-real-data/M2-candidate-b-data-gap-remediation-summary-v0.1.md`
- `docs/analysis/m2-real-data/M2-candidate-b-expiry-waiver-policy-draft-v0.1.md`
- `docs/analysis/m2-real-data/M2-candidate-b-manual-exception-brief-v0.1.md`
- `docs/technical-design/M2-authorized-real-data-development-plan-v0.1.md`

Current implementation status:

- Local DB-backed import/reconciliation runner has been implemented at `scripts/m2-real-data/run_authorized_real_data_db_import.mjs`.
- Candidate-b review workflow runner has been implemented at `scripts/m2-real-data/run_candidate_b_review_workflow.mjs`.
- Local Docker/PostgreSQL execution has been validated with PostgreSQL 16 (`postgres:16-bookworm`), local migration state reaches `0070.000`, and DB-backed import/reconciliation passes.
- The local DB contains 3054 evaluation results, 3054 input snapshots, 11531 risks, 3863 suggestions, and 2844 review items.
- Review workflow summary shows 85 blocking review items, 2759 advisory review items, and all 2844 review items still `pending`; no automatic approval has been applied.
- The item-level private review pack exists locally, and the review acceleration flow now compresses the 85 blocking items into 4 group-level business decision groups.
- New group-level artifacts are `docs/analysis/m2-real-data/M2-candidate-b-review-group-decision-policy-v0.1.md`, `docs/analysis/m2-real-data/M2-candidate-b-review-user-decision-brief-v0.1.md`, and the gitignored local template `data/private-output/m2-review/candidate-b-group-decision-template.csv`.
- Remediation diagnostics now show 57 data-gap blockers with no safe auto-fix, 23 expiry blockers with a scoped waiver policy draft only, and 5 manual exception blockers that remain pending by default.
- The next step is user/business confirmation against the remediated private group template, not manual row-by-row entry for all 85 items; unconfirmed groups remain `pending`.
- These outputs are authorized local development evidence, not final release-approved formal results.

## 12. Suggested external AI kickoff prompt

Use this as the first message to an external AI tool:

```text
You are reviewing the KAtOReNA7/system repository for an audiobook product revenue evaluation system. The current local/remote HEAD is 463f86ecc1045a67c2d014d2fd4e59f55a8dcdcc on main. M1+M2 are complete only as staged engineering/fixture/non-formal/prototype work, and the project is now in authorized local real-data development mode. The first aggregate real-data sprint produced `m2-realdata-dev-candidate-b-v0.1`, sanitized profile/reconciliation/calibration reports under `docs/analysis/m2-real-data/`, and local dev migration `db/migrations/V0070_000__m2_evaluation_persistence.sql`. Local DB-backed import/reconciliation now passes against local PostgreSQL 16 (`postgres:16-bookworm`) with schema version `0070.000`; the DB contains 3054 evaluation results and 2844 review items. The candidate-b review workflow is queryable and all review items remain pending, including 85 blocking review items and 2759 advisory review items. The 85 blocking items are compressed into 4 group-level decision groups, and remediation diagnostics now show 57 data-gap blockers with no safe auto-fix, 23 expiry blockers with a scoped waiver policy draft only, and 5 manual exception blockers that remain pending by default. Continue from the remediated private group template and apply only user/business-confirmed group decisions after dry-run; do not rediscover candidate-b or return to row-by-row manual entry. You may read user-provided local real data and data/**, use local development DB/Docker/PostgreSQL, modify or add db/migrations, execute local migrations, import local real data, run strict reconciliation, backtests, and algorithm calibration. Do not connect to remote production/shared databases, do not commit raw data or secrets, do not print sensitive raw rows, do not use git add ., and do not touch stash. Candidate-a is only a non-formal baseline; candidate-b is an authorized local real-data development candidate, not a final release-approved result. Do not continue M2-C5/C6, do not open FR-7, and do not start M3 unless the user explicitly changes direction. Start by reading NEXT-CODEX-INSTRUCTION.md, README.md, AGENTS.md, docs/technical-design/M2-next-stage-formalization-master-plan-v0.1.md, docs/technical-design/M2-authorized-real-data-development-plan-v0.1.md, docs/analysis/m2-real-data/M2-local-db-import-reconciliation-summary-v0.1.md, docs/analysis/m2-real-data/M2-candidate-b-blocking-review-workflow-summary-v0.1.md, docs/analysis/m2-real-data/M2-candidate-b-review-group-decision-policy-v0.1.md, docs/analysis/m2-real-data/M2-candidate-b-data-gap-remediation-summary-v0.1.md, docs/analysis/m2-real-data/M2-candidate-b-expiry-waiver-policy-draft-v0.1.md, docs/analysis/m2-real-data/M2-candidate-b-manual-exception-brief-v0.1.md, and this handoff if available. Then continue with group decision dry-run/apply/reconciliation only after user confirmation; do not repeat the DB import unless review decisions or source data fixes require a local re-import.
```

## 13. Validation run for this handoff

Commands run after generating this document:

| Command | Result | Notes |
| --- | --- | --- |
| `npm run check:no-real-data` | Passed | Reported no violations in 582 Git-tracked/staged files. A separate fixed-string scan of new untracked aggregate outputs found no private workbook names, connection strings, absolute data paths, work-title headers, channel-name headers, or private keys. |
| `npm run lint` | Passed | Checked 60 JavaScript files. |
| `npm run build` | Passed | Same syntax check; checked 60 JavaScript files. |
| `npm test` | Initially failed | Default Python environment lacked `numpy`; failing test was `M2-C-3 dry-run CLI exposes variant and comparison flags without requiring product mode`. |
| `npm test` with temporary Python dependency path | Passed | Set `PYTHONPATH=%TEMP%\codex-system-pydeps`; all 182 tests passed. No repository files were changed for the dependency install. |
| `npm run smoke` | Passed | Fixture mode returned `realDataImported:false` and `formalDatabaseConnected:false`. |
| `npm run test:e2e` | Initially failed, then passed | Initial failure was missing Playwright Chromium cache. After `npx playwright install chromium`, all 13 E2E tests passed. |
| `npm run evaluate:m2:real-data:dev` | Passed | Generated sanitized aggregate profile, strict reconciliation, algorithm calibration, and `m2-realdata-dev-candidate-b-v0.1` reports. |

If a future AI runs `npm test` on a fresh machine and sees `ModuleNotFoundError: No module named 'numpy'`, it should provide Python dependencies through a local/temporary environment or documented project dependency setup before judging the code as failing.

## 14. Handoff conclusion

Current project progress is strong for a staged prototype/engineering closeout:

- M1 data foundation and read-only operational visibility are in place.
- M2 old-product fixture evaluation and formal-readiness prototypes are in place.
- The repository has clear guardrails against real-data leakage and accidental formalization.
- The next valuable work is not more M2 fixture iteration; it is user/business confirmation of the remediated group-level candidate-b review decisions, followed by local dry-run/apply/reconciliation and any required minimal source data fix if authorized.

The main risk for the next AI is misreading "M2 completed" as "formal evaluation completed." That is incorrect. M2 is complete only inside the repository's explicit non-formal/fixture/prototype boundary.
