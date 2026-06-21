# M1 phase closeout and M2 readiness audit v0.1

Generated: 2026-06-21

Scope: PRD-aligned read-only audit of the current repository at `2254331738db41fdd0060cf919850ad58e12f644`. This audit did not connect to any database, did not execute Docker, did not import real data, did not activate `mapping_version`, did not call `switch_mapping_version`, and did not modify `db/migrations/`.

## 1. PRD baseline

Adopted baseline:

- Primary M1 acceptance baseline: `docs/prd/70-acceptance/M1.md`, because it is M1-specific, marked `FROZEN`, and defines the M1 acceptance cases and completion standard.
- Governing rule basis: `docs/prd/README.md`, because it states current PRD version `v0.2`, current stage `M1 工程冻结准备`, and authoritative rules as stable `REQ-*` entries in domain documents.
- Supplemental M1 requirement sources: `docs/prd/10-data-foundation/overview.md`, `docs/prd/10-data-foundation/bill-import.md`, `docs/prd/10-data-foundation/data-quality.md`, `docs/prd/10-data-foundation/work-master-data.md`, `docs/prd/10-data-foundation/classification-and-tags.md`, `docs/prd/20-evaluation/common-evaluation-rules.md`, `docs/prd/40-platform/platform-baseline.md`, and `docs/prd/60-validation/pending-data-decisions.md`.

Selection rationale:

- `70-acceptance/M1.md` is the most direct M1验收 source.
- Domain docs contain stable `REQ-*` IDs and are explicitly identified as authoritative by `docs/prd/README.md`.
- Older or broader PRD files are used only for context where they do not conflict with the `REQ-*` documents.
- Where implementation reports conflict with PRD, PRD is the problem baseline and reports are used only as completion evidence.

Key PRD constraint: M1 formal completion requires complete or near-complete real bill copies, strict reconciliation, real-data cases, and no synthetic substitute for formal acceptance. Current implementation evidence supports engineering/local readiness, not formal M1 business-data closure.

## 2. Git gate

| Gate | Result |
| --- | --- |
| Worktree status | clean at audit start |
| Current HEAD | `2254331738db41fdd0060cf919850ad58e12f644` |
| `origin/main` | `2254331738db41fdd0060cf919850ad58e12f644` |
| Ahead / behind | `0 / 0` |
| Tracked diff | none |
| Staged diff | none |
| `db/migrations/` diff | none |

Evidence commands executed before audit:

- `git status --branch --short --untracked-files=all`
- `git rev-parse HEAD`
- `git ls-remote origin refs/heads/main`
- `git diff --name-only`
- `git diff --cached --name-only`
- `git rev-list --left-right --count HEAD...origin/main`

## 3. PRD alignment matrix

| PRD item | Current implementation status | Evidence path | Completion | Blocks M2 old-product evaluation? | Recommended action |
| --- | --- | --- | --- | --- | --- |
| M1 goal: trusted, traceable, revocable, recoverable data foundation | Physical model, migration directory, read-only app, local tooling, and mapping v0.2 dry-run exist. Formal data foundation is not activated with real data. | `docs/prd/10-data-foundation/overview.md`; `docs/technical-design/M1-Flyway正式迁移目录冻结回归报告-v0.1.md`; `docs/analysis/m1-master-data/M1-mapping-version-v0.2-local-dev-readiness-review-summary-v0.1.json` | Partial; engineering/local readiness complete, formal data incomplete | Blocks formal M2-C/M2-D; does not block fixture/local M2-A/M2-B | Keep M1 engineering closed as staged; require formal data authorization before formal evaluation |
| `REQ-DATA-IMPORT-001` / `AT-M1-001` bill fields and amount semantics | Analysis confirmed seven-field bill shape and exact decimal requirement; model uses exact numeric evidence. No formal import of real bills has occurred. | `docs/prd/10-data-foundation/bill-import.md`; `docs/analysis/m1-real-bills/summary.json`; `docs/prd/60-validation/pending-data-decisions.md`; `docs/technical-design/M1-Flyway正式迁移目录冻结回归报告-v0.1.md` | Model and analysis ready; formal data not loaded | Blocks formal M2 | Formal readiness task must authorize real bill import and reconciliation |
| `REQ-DATA-IMPORT-002` / `AT-M1-002` files and batches | `import_file`, batch, fingerprint, staging, and related model exist; read-only app has no upload/import UI or API. | `db/migrations/`; `docs/technical-design/M1-物理数据模型-v0.3.md`; `docs/api/M1-api-contract-v0.1.md` | Partial | Blocks formal M2 | Implement and validate controlled upload/import workflow when authorized |
| `REQ-DATA-IMPORT-003` / `AT-M1-003` business atomicity | Migration functions and local synthetic validations cover atomic switch patterns; no formal real-bill import atomicity acceptance has run. | `docs/technical-design/M1-Flyway正式迁移目录冻结回归报告-v0.1.md`; `experiments/m1-flyway-candidate/reports/validation-results.json` | Local model validation complete; formal acceptance incomplete | Blocks formal M2 | Run formal-data rehearsal only after explicit authorization |
| `REQ-DATA-IMPORT-004` / `AT-M1-004` strict reconciliation | Reconciliation fields and validations are modeled; real bill totals are analyzed. No formal import reconciliation has been executed. | `docs/analysis/m1-real-bills/summary.json`; `docs/technical-design/M1-数据库迁移方案-v0.1.md`; `db/migrations/V0060_050__function_assert_mapping_coverage.sql` | Partial | Blocks formal M2 | Produce formal readiness report and execute controlled import with strict reconciliation |
| `REQ-DATA-IMPORT-005` / `AT-M1-005` file retention | Metadata model exists; retention/deletion behavior has not been proven in an application workflow. | `docs/prd/10-data-foundation/bill-import.md`; `db/migrations/V0020_010__table_import_file.sql` | Partial | Blocks formal M2 only if import is needed for official run | Add import-file operational workflow and retention evidence |
| `REQ-DATA-IMPORT-006` / `AT-M1-006` cutoff month | PRD decision resolved: 2026-05 incomplete, latest complete month 2026-04. Model includes cutoff month structures/views. No formal active data cutoff has been applied. | `docs/prd/60-validation/pending-data-decisions.md`; `docs/analysis/m1-master-data/summary.json`; `db/migrations/V0050_010__table_month_completeness_confirmation.sql`; `db/migrations/V0060_260__view_v_bill_cutoff_months.sql` | Requirement resolved; formal data pending | Blocks formal M2 | Import month completeness confirmation into authorized non-formal/formal environment as appropriate |
| `REQ-DATA-IMPORT-007` / `AT-M1-007` revoke and reimport | Revoke model/function and impact records exist; not tested against real imported batches in formal data. | `db/migrations/V0060_070__function_revoke_bill_batch.sql`; `db/migrations/V0050_020__table_batch_impact_record.sql`; `experiments/m1-flyway-candidate/reports/validation-results.json` | Model/local validation partial | Blocks formal M2 completion standard | Add authorized revoke/reimport acceptance rehearsal before formal closeout |
| `REQ-DQ-001` to `REQ-DQ-003` data quality blocking and local fix flow | Real bill/master-data analysis and ops confirmations identified/resolved several blockers; candidate mapping prep passed. Full formal import still not performed. | `docs/analysis/m1-master-data/M1-候选映射构建准备摘要-v0.1.json`; `docs/analysis/m1-master-data/ops-confirmation-v2.3-filled-validation/completion-summary.json`; `docs/prd/10-data-foundation/data-quality.md` | Mostly ready for candidate mapping; formal data not applied | Blocks formal M2 | Keep private details out of Git; run formal readiness gate before official import |
| `REQ-WORK-001` to `REQ-WORK-006` standard work ID, business form, launch month, merge, regular ID uniqueness | Mapping candidate v0.2 local dry-run passed; G06/G07 passed; raw/historical counts match expected. Candidate not activated. | `docs/analysis/m1-master-data/M1-mapping-version-v0.2-controlled-import-readiness-summary-v0.1.json`; `docs/analysis/m1-master-data/M1-mapping-version-v0.2-local-dev-readiness-review-summary-v0.1.json` | Local non-formal validation complete; formal activation pending | Blocks formal M2 | After authorization, import and activate mapping in the correct environment; do not call switch in this audit line |
| `AT-M1-024` / `AT-M1-025` G07-related merge and raw ID uniqueness | v0.1 found physical identity-rule conflict; v0.2 moved `161280` / `161284` / `161290` to historical mapping and passed dry-run. | `docs/analysis/m1-master-data/M1-G07-mapping-strategy-confirmation-summary-v0.1.json`; `docs/analysis/m1-master-data/M1-G07-mapping-strategy-adjustment-summary-v0.1.json`; `docs/analysis/m1-master-data/M1-mapping-version-docker-rehearsal-summary-v0.2.json` | Resolved in local dry-run | Blocks formal M2 until formal mapping activation | Keep v0.2 strategy; do not auto-select main raw IDs |
| `REQ-WORK-007` status | Status model exists at standard-work level; no full operations workflow or formal data state transition evidence. | `docs/prd/10-data-foundation/work-master-data.md`; `db/migrations/V0030_130__table_standard_work_status_history.sql` | Partial | Blocks formal M2 if status is required as input | Define/import confirmed product status data before formal evaluation |
| `REQ-WORK-008` to `REQ-WORK-011` basic info, author alias, copyright dates | Ledger semantics are confirmed, but ledger coverage is incomplete: 1270 / 3099 bill-derived standard works covered; many works still lack author, category, copyright, or tag candidates. | `docs/analysis/m1-master-data/README.md`; `docs/analysis/m1-master-data/summary.json`; `docs/prd/60-validation/pending-data-decisions.md` | Partial | Blocks formal M2 | Produce M2 readiness report for basic info gaps; allow fixture/local M2 only with explicit synthetic assumptions |
| `REQ-CLASS-001` / `AT-M1-040` classification path | Classification model exists, but final classification tree and field mapping remain PENDING-DATA. | `docs/prd/10-data-foundation/classification-and-tags.md`; `docs/prd/60-validation/pending-data-decisions.md`; `db/migrations/V0040_020__table_classification_node.sql` | Structure ready; values pending | Blocks formal M2 | Freeze initial classification tree or define M2-A fixture tree |
| `REQ-CLASS-002` / `AT-M1-041` tag library | Tag model exists; initial tag library and mapping remain PENDING-DATA. | `docs/prd/10-data-foundation/classification-and-tags.md`; `docs/prd/60-validation/pending-data-decisions.md`; `db/migrations/V0040_030__table_tag.sql` | Structure ready; values pending | Blocks formal M2 | Freeze initial tag release or limit M2-A/M2-B to fixtures |
| `REQ-PLATFORM-001` / `AT-M1-050` background tasks | Task tables, read-only APIs, and admin view exist. Cancel/retry/write semantics are not exposed in the current app. | `docs/prd/40-platform/platform-baseline.md`; `docs/technical-design/M1-最小只读管理端技术线收口报告-v0.1.md`; `src/http/app.js` | Read-only partial | Blocks full M1 acceptance; not M2-A prototype | Add write workflow only after explicit scope authorization |
| `REQ-PLATFORM-002` / `AT-M1-051` AI no downgrade | PRD rule exists; current M1 implementation has no AI task execution path. | `docs/prd/40-platform/platform-baseline.md`; `docs/technical-design/M1-最小只读管理端技术线收口报告-v0.1.md` | Deferred / not applicable to current read-only line | Does not block M2-A if no AI run is used | Revisit when M2 evaluation tasks use AI |
| `REQ-PLATFORM-003` / `AT-M1-052` backup and recovery | Restore point model exists and local tests cover some idempotent/atomic behaviors. No formal backup/recovery run against real data. | `docs/prd/40-platform/platform-baseline.md`; `db/migrations/V0050_040__table_restore_point.sql`; `docs/technical-design/M1-Flyway正式迁移目录冻结回归报告-v0.1.md` | Partial | Blocks formal M2-C/M2-D | Add backup/recovery readiness and restore validation before formal data use |
| M1 completion standard | Engineering artifacts and local dry-run are strong, but PRD full completion still requires full real bills, strict reconciliation, complete supporting master data, and acceptance records. | `docs/prd/70-acceptance/M1.md`; all evidence above | Not formally complete | Blocks formal old-product evaluation | Start M2-A/M2-B only as fixture/local; keep formal M2 blocked |

## 4. Technical line completeness

| Check | Status | Evidence |
| --- | --- | --- |
| API contract landed | Complete for current read-only scope | `docs/api/M1-api-contract-v0.1.md`; `docs/api/M1-openapi-v0.1.yaml`; `src/http/app.js` |
| Error codes normalized | Complete for current read-only scope | `docs/technical-design/M1-API错误码归一化评审报告-v0.1.md`; `src/errors.js`; `test/health.test.js`; `test/api.test.js` |
| Minimal read-only admin landed | Complete for current read-only scope | `docs/technical-design/M1-最小只读管理端技术线收口报告-v0.1.md`; `public/admin/`; `test/admin.test.js` |
| E2E connected | Complete | `docs/technical-design/M1-最小管理端页面E2E自动化测试报告-v0.1.md`; `test/e2e/admin.e2e.test.js` |
| CI gate connected | Complete | `.github/workflows/ci.yml`; `docs/technical-design/M1-管理端CI远端运行结果核对报告-v0.1.md` |
| Technical closeout report exists | Complete | `docs/technical-design/M1-最小只读管理端技术线收口报告-v0.1.md` |
| Remaining technical blockers | None for read-only technical line; full PRD write workflows remain outside implemented scope | `docs/api/M1-api-contract-v0.1.md` |
| Unsubmitted technical files | None found in current clean worktree | Git gate |

Technical conclusion: the read-only admin/API/CI line is stage-closed. It does not equal full M1 PRD closure because it intentionally excludes real import, write operations, activation, revoke UI, and formal DB use.

## 5. Operations line completeness

| Check | Status | Evidence |
| --- | --- | --- |
| v0.1 mapping issue recorded | Complete; G07 blocked by model identity rule | `docs/analysis/m1-master-data/M1-G07-mapping-strategy-confirmation-summary-v0.1.json`; `docs/analysis/m1-master-data/M1-mapping-version-docker-rehearsal-summary-v0.1.json` |
| G07 strategy adjusted | Complete; three IDs moved to historical strategy in v0.2 | `docs/analysis/m1-master-data/M1-G07-mapping-strategy-adjustment-summary-v0.1.json` |
| v0.2 Docker rehearsal | Passed in prior non-formal Docker PG16 rehearsal | `docs/analysis/m1-master-data/M1-mapping-version-docker-rehearsal-summary-v0.2.json` |
| v0.2 local dev dry-run | Passed in local Docker `m1-local-dry-run` | `docs/analysis/m1-master-data/M1-mapping-version-v0.2-local-dev-readiness-review-summary-v0.1.json`; `docs/analysis/m1-master-data/M1-local-docker-v0.2-dry-run-summary-v0.1.json` |
| G06 | Passed | same as above |
| G07 | Passed | same as above |
| `raw_work_id_mapping` count | `300` | `docs/analysis/m1-master-data/M1-mapping-version-v0.2-operations-stage-closeout-summary-v0.1.json` |
| `historical_volume_mapping` count | `52` | same as above |
| Audit source record count | `353` | same as above |
| `161280` / `161284` / `161290` | All historical volume mapping in v0.2 | `docs/analysis/m1-master-data/M1-G07-mapping-strategy-adjustment-summary-v0.1.json` |
| Formal activation | Not done | operations summaries |
| `switch_mapping_version` | Not called | operations summaries |
| Real bills, ledger, ops confirmation result imports | Not done | operations summaries |

Operations conclusion: mapping v0.2 is locally ready and dry-run proven, but not formally active and not a formal M1 data closeout.

## 6. Tooling completeness

| Check | Status | Evidence |
| --- | --- | --- |
| Local Docker PostgreSQL 16 multi-computer workflow | Complete | `docs/dev/M1_LOCAL_DOCKER_POSTGRES.md`; `tools/dev-db/New-M1LocalEnvFile.ps1`; `tools/dev-db/Invoke-M1LocalDockerPostgres.ps1`; `tools/dev-db/Invoke-M1MappingV02DryRun.ps1` |
| `.env.example` safety | Safe template: blank password and URL fields, local host only | `.env.example` |
| `.gitignore` coverage | Covers `.env.local`, `.env*`, `.pgpass`, dumps/backups/db files, `pgdata`, `data/`, spreadsheets, and private data patterns | `.gitignore` |
| `check:no-real-data` guard | Present and wired into CI | `scripts/check-no-real-data.mjs`; `package.json`; `.github/workflows/ci.yml` |
| CI | Runs `npm ci`, real-data guard, lint, build, test, smoke, E2E | `.github/workflows/ci.yml` |
| Main worktree | Clean at audit start | Git gate |
| Credential leakage risk | No committed real credentials found by current guard; `.env.example` intentionally has blanks. Existing local legacy scripts should be treated as secondary to the Docker workflow. | `.env.example`; `scripts/check-no-real-data.mjs`; `tools/dev-db/` |

Tooling conclusion: local development and guardrail tooling are ready for M2-A/M2-B style local work. Formal/staging/production/shared targets remain prohibited.

## 7. Data model and migration completeness

| Item | Status | Evidence |
| --- | --- | --- |
| Migration count | 80 SQL files in `db/migrations/` | `db/migrations/`; `docs/technical-design/M1-Flyway正式迁移目录冻结回归报告-v0.1.md` |
| Current schema version | `0060.290` | `docs/technical-design/M1-Flyway正式迁移目录冻结回归报告-v0.1.md`; `docs/api/M1-api-contract-v0.1.md` |
| Object counts | 48 M1 tables, 5 views, 21 functions, 32 user triggers, 84 foreign keys, 117 indexes | `docs/technical-design/M1-Flyway正式迁移目录冻结回归报告-v0.1.md`; `experiments/m1-flyway-candidate/reports/formal-migration-freeze-regression-summary.json` |
| Historical migration modification | No current unstaged/staged diff in `db/migrations/`; committed SQL must remain immutable | Git gate; `docs/technical-design/M1-Flyway正式迁移目录冻结回归报告-v0.1.md` |
| Unsubmitted migration | None found | Git gate |
| M1 objects modeled | Import file/batch/staging/fact, mapping versions, raw and historical mappings, classification/tag/basic-info versions, restore/impact records, views, and controlled functions | `docs/technical-design/M1-物理数据模型-v0.3.md`; `db/migrations/` |
| M1 objects still requiring operational implementation | Upload/import UI or API, real bill controlled import run, formal revoke/reimport run, backup/restore operational run, final classification/tag values, basic-info import from confirmed sources | PRD and implementation evidence above |
| M2 likely objects not implemented this round | Old-product evaluation task/attempt/result tables, evaluation input snapshots, lifecycle/rating outputs, backtest records, result invalidation and re-evaluation queue, algorithm/prompt/rule versions, export/reporting objects | `docs/prd/20-evaluation/common-evaluation-rules.md`; `docs/prd/05-老品评估.md` |

No M2 objects should be implemented in this audit round.

## 8. M2 old-product prerequisites

| M2 input | Current M1 state | Model vs formal data | Formal M2 blocker | M2-A / M2-B use |
| --- | --- | --- | --- | --- |
| Standard works | Model exists; bill-derived count is 3099; mapping v0.2 dry-run ready | Model/local candidate ready, not formally active | Yes | Use fixture/synthetic or local non-formal candidate |
| Confirmed merges | v0.2 mapping dry-run passed, G06/G07 passed | Local dry-run only | Yes until activated in authorized environment | Yes for local rehearsal |
| Income facts | Real bills analyzed, 192899 source rows reported; no formal DB import | Analysis only, not formal facts | Yes | Fixture/synthetic only; local dry-run does not equal formal income base |
| Complete months | 2026-04 confirmed latest complete; 2026-05 incomplete | Requirement/model ready, not formal active data | Yes for formal results | Can configure fixtures to mirror cutoff |
| Copyright start/end | Ledger semantics confirmed; coverage incomplete | Partial source coverage and no formal import | Yes | Fixture/local subsets only |
| Classification | Structure ready; final tree pending | Model only | Yes | Fixture tree acceptable for M2-A |
| Tags | Structure ready; initial library pending | Model only | Yes | Fixture tags acceptable for M2-A |
| Business form | ID parser/model and v0.2 mapping plan ready | Local dry-run ready | Formal activation blocker | Yes for local test |
| Version status | Version model exists; active mapping count remains 0 in dry-run | Not activated | Yes | Use non-active dry-run evidence only |

## 9. Risks and blockers

Hard blockers for formal M2-C/M2-D:

- No authorization to connect to or write any formal database.
- Real bills have not been formally imported into the M1 schema.
- Digital copyright ledger and operations confirmation results have not been formally imported.
- `mapping_version` v0.2 has not been activated.
- `switch_mapping_version` has not been called.
- Full strict reconciliation has not been executed in a formal authorized environment.
- M1 master-data gaps remain: ledger coverage is partial, final classification tree is pending, tag library is pending, and some basic information readiness is incomplete.
- Backup/recovery and revoke/reimport have not been formally accepted against real imported data.

Non-blocking but important risks:

- The read-only admin/API line is complete, but it is intentionally not an import/activation application.
- Existing legacy local DB scripts under `tools/dev-db/` are local-only but should remain secondary to the documented Docker workflow.
- Current public reports contain enough counts for readiness, but not private candidate bodies or stage JSON details; this is correct for Git safety.
- Remote CI evidence exists for earlier technical commits, but each future push still needs its own run result.

Allowed to enter M2:

- M2-A: old-product evaluation design/prototype using fixture or synthetic data.
- M2-B: local non-formal rehearsal using local Docker and synthetic or approved non-formal inputs, with explicit rollback boundaries.

Not allowed to enter:

- Formal old-product evaluation over real business data.
- Production/staging/shared database evaluation.
- Any process that treats local dry-run mapping as an active formal mapping.
- Any automatic import of real bills, ledger, ops confirmation Excel, or ops confirmation results without separate authorization.

## 10. M1 to M2 handoff conclusion

M1 engineering status: stage-closed for database schema, read-only admin/API, CI, repository guardrails, local Docker workflow, and mapping v0.2 non-formal dry-run. It is not full PRD M1 implementation because formal import/write/revoke/recovery acceptance remains incomplete.

M1 business status: partially complete. Operations mapping v0.2 is ready in local dry-run evidence, but formal business closure requires activation, real bill import, master-data readiness, and final classification/tag decisions.

M1 formal data status: not complete. No formal database was connected, no real data was imported, no `mapping_version` was activated, and no `switch_mapping_version` call occurred.

M2 readiness:

- M2-A ready: yes, for fixture/synthetic design and API/model prototyping.
- M2-B ready: yes, for local non-formal Docker rehearsal with explicit rollback and no formal claims.
- M2-C ready: no, blocked by formal data authorization and M1 formal data readiness.
- M2-D ready: no, blocked by the same formal data readiness plus evaluation result governance still needing implementation.

Recommended next task: authorize an M2-A fixture-only old-product evaluation design and test-plan task, while separately preparing a formal M1 data readiness checklist for real-bill import, mapping activation, master-data import, backup/recovery, and strict reconciliation.

## 11. Prohibited actions confirmed

This audit did not:

- connect to any database;
- execute Docker;
- run a database rehearsal;
- import real data;
- import real bills;
- import digital copyright ledger data;
- import operations confirmation Excel or results;
- activate `mapping_version`;
- call `switch_mapping_version`;
- execute formal data migration;
- modify `db/migrations/`;
- modify Flyway history migrations;
- modify business code;
- modify API behavior;
- modify pages;
- use `git add .`;
- touch stash.
