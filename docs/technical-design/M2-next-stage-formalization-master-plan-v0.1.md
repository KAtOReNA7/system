# M2 next-stage formalization master plan v0.1

Generated: 2026-06-22

Repository baseline: `main` and `origin/main` at `463f86ecc1045a67c2d014d2fd4e59f55a8dcdcc`

Status: updated for authorized local real-data development mode. Earlier no-real-data/no-DB restrictions in this document apply only to the prior unauthorised handoff phase and to remote/formal release environments.

## 0. Strategy update: authorized local real-data development mode

Starting 2026-06-22, the project is authorized for local real-data development.

Allowed in local development:

- read user-provided local real data, including `data/**`;
- read local bill files, copyright ledger files, operation confirmation files, cleaned bills, and prior M2-C aggregate/intermediate files;
- connect to local development PostgreSQL;
- use local Docker/PostgreSQL;
- add or modify `db/migrations/` for development schema changes;
- execute local migrations;
- import local real data;
- run strict reconciliation, backtests, lifecycle calibration, forecast calibration, rating calibration, and aggregate report generation.

Still prohibited:

- connect to remote production, shared, staging-like, or otherwise unapproved databases;
- commit raw bills, ledger files, private Excel/CSV, `.env`, `.pgpass`, database dumps, temporary database files, or sensitive row-level details;
- print secrets, passwords, or complete sensitive row-level detail in handoff responses;
- present local real-data development results as final release-approved formal results;
- use `git add .`;
- touch stash.

## 1. Executive conclusion

The recommended route is now to enter **M2 authorized local real-data development**, combining:

1. local real-data source discovery and profiling;
2. strict reconciliation;
3. local DB-backed development preparation;
4. real-data lifecycle, forecast, rating, and backtest calibration.

The project should not continue M2-C5/C6 parameter micro-iteration, should not open FR-7, and should not move to M3 until the real-data M2 development candidate is reviewed.

Current M1+M2 completion means staged engineering, fixture productization, non-formal candidate freezing, and formal-readiness prototypes are complete. It does not mean formal real-data acceptance or formal old-product evaluation is complete.

The frozen candidate is:

```text
m2-c3-cleaned-bill-nonformal-v0.2/candidate-a
```

`candidate-a` is a non-formal algorithm candidate. It can be used as a baseline for real-data development, but it cannot be used for final release decisions and cannot bypass readiness gates, manual review, persistence, audit, release, or rollback controls. Local real-data work may produce a new development candidate, such as `m2-realdata-dev-candidate-b-v0.1`.

## 2. Repository state and audit-baseline clarification

Lightweight gate for this planning task:

| Check | Expected / observed state |
| --- | --- |
| Local `HEAD` | `463f86ecc1045a67c2d014d2fd4e59f55a8dcdcc` |
| `origin/main` | `463f86ecc1045a67c2d014d2fd4e59f55a8dcdcc` |
| Known allowed dirty item | `docs/technical-design/PROJECT-PROGRESS-FOR-EXTERNAL-AI-v0.1.md` |
| Other dirty files before this planning edit | None observed |
| Current route | M2 authorized local real-data development |
| Current non-route | No M2-C5/C6, no FR-7, no M3 start |

The M1-M2 audit report and summary reference baseline `9b138432d9022802aa90fce048d510e40d135c20`. That is the audited repository state before the audit artifacts were committed. Current `463f86e...` includes those audit artifacts and should not be mistaken for a divergence from the audit. The relationship is:

```text
9b138432...  = audited code/document baseline
463f86ecc... = current main, including the M1-M2 completion audit artifacts
```

There is no valid current entry point that asks the next Codex session to continue M2-C5/C6 or start FR-7. The new entry point is real-data development, not further fixture/prototype expansion.

## 3. Current status matrix

| Area | Current state | Formal boundary | Next useful action |
| --- | --- | --- | --- |
| M1 PRD and traceability | Structured and frozen for staged work | Formal real-data acceptance is not complete | Keep PRD rules stable; use as acceptance authority |
| M1 engineering | Schema, read-only API, admin, CI, guardrails, local tooling exist | No formal DB authorization or formal real-data acceptance | Plan authorization, reconciliation, activation, rollback |
| M2-B old-product fixture | API, admin, fixture engine, CLI, tests complete | Fixture/synthetic only | Reuse as non-formal UX and contract reference |
| M2-C candidate | `candidate-a` frozen | Non-formal only | Treat as formalization input, not decision output |
| M2-FR-0 to FR-6 | Readiness, review, task, advisory, export prototypes complete | Fixture/prototype only | Convert into future formal contracts after authorization |
| Formal persistence | Data model, SQL candidate, and local development migration `V0070_000__m2_evaluation_persistence.sql` exist | Local migration file prepared but not executed; no DB write path | Review and execute only in authorized local DB first; formal execution still needs release authorization |
| Formal task/export APIs | Fixture task/export prototypes exist | Formal APIs not implemented | Draft contracts before implementation |
| Formal evaluation | Not executed | Blocked | Execute only after explicit authorization and readiness closure |
| Mapping activation | Local rehearsal/summaries exist | Not activated; `switch_mapping_version` not called | Build activation readiness and rollback plan |
| Review closure | DB-backed candidate-b review workflow exists; 85 blocking items are compressed into 4 group-level decision groups; remediation diagnostics have been generated | Business confirmation incomplete; all blocking items remain pending until explicit group/item decisions | Use remediated group decision template and dry-run/apply runner for auditable local closure |
| Release and rollback | Fixture release gate exists | No DB-backed release/audit/rollback | Define formal contract and audit requirements |

## 4. Currently implemented

The repository currently implements the following safe, staged capabilities:

- M1 read-only HTTP APIs for system status, works, mapping versions, and jobs.
- M1 admin views for status, works, mapping, and jobs.
- Database configuration guardrails that reject unsafe role boundaries and degrade safely when DB URLs are absent.
- CI and local validation scripts, including no-real-data scanning.
- M2 old-product fixture evaluation APIs and admin views.
- M2 fixture old-product evaluation engine and calibrated non-formal parameter profiles.
- `candidate-a` non-formal acceptance artifacts.
- Formal persistence schema constants and validation helpers.
- Formal readiness gate domain logic.
- Blocking manual review fixture workflow.
- Evaluation task fixture workflow.
- Advisory review display fixture integration.
- Export release gate fixture workflow and tests.
- Formal-mode blocking behavior in runtime M2 routes.
- Authorized local real-data aggregate runner `scripts/m2-real-data/run_authorized_real_data_development.py`.
- Sanitized aggregate real-data profile, strict reconciliation, algorithm calibration, and `m2-realdata-dev-candidate-b-v0.1` summary under `docs/analysis/m2-real-data/`.
- Local development persistence migration `db/migrations/V0070_000__m2_evaluation_persistence.sql`; not executed in this run.
- Candidate-b review decision closure helpers and local DB runner.
- Candidate-b data-gap remediation runner and sanitized remediation reports.

## 5. Fixture / prototype / non-formal only

These surfaces are intentionally not formal business systems:

- M2 old-product evaluation outputs under fixture/synthetic data.
- M2-C non-formal aggregate dry-runs and candidate selection.
- `candidate-a` metrics and business acceptance pack.
- M2-FR blocking review workflow.
- M2-FR evaluation task workflow.
- M2-FR advisory review display.
- M2-FR export release gate.
- Formal persistence SQL candidate.
- Admin screens that display fixture readiness, task, review, advisory, or export state.

They may inform formal design, but they cannot be presented as formal results, formal approvals, formal exports, or production decisions.

## 6. Local authorization and remaining blockers

The following are now allowed for local development:

- read and import local real data;
- read `data/**`;
- connect to local development DB;
- use local Docker/PostgreSQL;
- add or modify `db/migrations/` for local development schema;
- execute local migrations;
- run strict reconciliation, real-data backtests, and algorithm calibration.

The following remain blocked:

- remote production/shared/staging-like database access;
- committing raw private data or secrets;
- printing sensitive raw rows or credentials;
- mapping activation or `switch_mapping_version` against any non-local/production-like environment;
- release-approved formal evaluation or final publication without business approval;
- formal task/export/write API exposure as a release feature without a separate release gate.

## 7. Why not continue M2-C5/C6

M2-C5/C6 would likely become parameter micro-iteration around an already frozen non-formal candidate. That does not solve the current blockers:

- no formal DB authorization;
- no formal data import and strict reconciliation;
- no activated mapping version;
- no completed blocking manual review closure;
- no migrated formal persistence;
- no formal task/export/audit/release/rollback implementation.

Continuing M2-C5/C6 would spend effort inside the non-formal boundary while the project needs formalization planning and authorization gates.

## 8. Why not open FR-7

FR-0 through FR-6 already produced the readiness prototypes needed for the next stage. Opening FR-7 would keep extending the prototype line rather than converting the line into formal contracts, readiness closure, and DB-backed implementation planning.

FR-7 should remain closed unless the user explicitly redefines it as a new, bounded formalization task with clear deliverables and authorization rules.

## 9. Candidate-a non-formal boundary

`candidate-a` may be referenced as:

- the frozen M2 non-formal algorithm candidate;
- the baseline algorithm candidate for formalization planning;
- a source of expected risk/review categories and output shape;
- a comparison point for future formal dry-runs after authorization.

`candidate-a` must not be used as:

- a formal evaluation result;
- a basis for production downlist, suspend, renewal, promotion, or revenue decisions;
- a reason to skip formal data readiness;
- a reason to skip blocking manual review;
- a reason to skip mapping activation controls;
- a reason to skip formal persistence, audit, release, or rollback controls.

The known non-formal candidate facts from closeout materials are planning evidence only:

| Fact | Value | Formal meaning |
| --- | ---: | --- |
| Evaluated work count | 3054 | Non-formal scope reference only |
| Blocking manual review count | 513 | Requires business closure before formal use |
| Advisory review count | 2331 | Display and interpretation requirement |
| Copyright fallback usage | 2207 | Formal blocker unless completed or waived |
| Downlist or suspend count | 744 | Requires manual confirmation before release |
| Renewal review count | 209 | Requires manual confirmation before release |
| Latest complete month | 2026-04 | Cutoff reference only |
| Excluded incomplete month | 2026-05 | Do not include incomplete formal month |

## 10. Formal evaluation blockers

Formal evaluation cannot start until these blockers are closed:

| Blocker | Current state | Closure condition |
| --- | --- | --- |
| Formal DB authorization | Not open | User explicitly authorizes target environment and access boundary |
| Formal real-data import | Local file-based aggregate read executed; DB import not executed | Authorized DB import path and data custody rules are approved |
| Strict reconciliation | Local aggregate reconciliation executed for file inputs; formal DB reconciliation pending | Bill totals, work identity, cutoff months, exclusions, and exception ledger reconcile in the target local DB |
| Mapping activation | Not active | Mapping readiness approved, activation performed, rollback path prepared |
| `switch_mapping_version` | Not called | Explicit run authorization and post-switch verification |
| Basic info readiness | Gaps remain possible | Required fields completed or auditable waiver granted |
| Copyright readiness | Fallbacks exist in non-formal line | Copyright end/status completed or waived with audit reason |
| Blocking manual reviews | Candidate-a baseline has 513 blocking items; `m2-realdata-dev-candidate-b-v0.1` has 85 blocking items | Every item has approved, no-action, rejected, data-fix, or waiver state |
| Advisory display | Fixture display exists | Formal report/export display policy approved |
| Formal persistence | Local development migration file created; not executed | Reviewed migration executed first in authorized local DB, then formally approved before any release environment |
| Formal task API | Fixture prototype only | DB-backed contract implemented after authorization |
| Formal export API | Fixture prototype only | Controlled export contract implemented after authorization |
| Audit/release/rollback | Fixture gate only | DB-backed audit and rollback contract implemented after authorization |

## 11. Formal DB-backed implementation planning

Formal DB-backed implementation should be planned in two phases.

### 11.1 Pre-authorization planning

Allowed in authorized local development:

- review the formal persistence model;
- review the SQL candidate for schema shape, naming, indexes, constraints, permissions, and rollback considerations;
- convert the SQL candidate into local development migrations if needed;
- execute local migrations;
- build local staging/import tables if needed;
- run local import, reconciliation, backtest, and calibration scripts;
- keep CI fixture/no-DB compatible.

Still not allowed:

- remote production/shared/staging-like database access;
- committing raw data or secrets;
- presenting local development outputs as final release-approved results.

### 11.2 Post-authorization implementation concept

After explicit authorization, the likely DB-backed model should cover:

- algorithm versions;
- evaluation result records;
- input snapshots;
- risk details;
- recommendation/suggestion records;
- manual review items;
- task lifecycle records;
- export requests and export manifests;
- release approvals;
- rollback and invalidation records;
- immutable audit events.

Formal persistence must not store raw bill rows, private source documents, secrets, `.env` values, or unnecessarily reidentifiable revenue combinations.

## 12. Formal evaluation readiness execution plan

The formal readiness execution plan should proceed as a controlled checklist:

1. Confirm authorization scope: environment, data sources, operators, allowed commands, and no-go boundaries.
2. Freeze candidate and algorithm version: confirm `candidate-a` or explicitly select a replacement.
3. Confirm cutoff window: latest complete month, excluded incomplete months, and accepted historical scope.
4. Prepare formal data import rules: bills, work identity, mapping source, basic info, copyright, and operation confirmations.
5. Run strict reconciliation after authorized import: totals, counts, unmatched rows, duplicate identities, channel/business-form mapping, and cutoff completeness.
6. Close mapping readiness: active candidate, activation approval, switch plan, verification, rollback.
7. Close basic info and copyright readiness: data fix, explicit waiver, or blocked status.
8. Close blocking manual reviews: every blocking item must have a final auditable state.
9. Approve advisory display: define how warning-only items appear in reports and exports.
10. Execute formal evaluation only after all blocking gates pass.
11. Review formal outputs before release: task logs, result counts, risk distribution, export fields, release approval.
12. Preserve rollback and invalidation path for bad mapping, bad input, algorithm error, or business override.

## 13. Mapping activation readiness plan

Mapping activation must remain blocked until separately authorized. The readiness plan should include:

- candidate mapping version identity and source evidence;
- business-form, channel, raw work ID, standard work ID, and history mapping checks;
- mutual exclusion checks for conflicting mappings;
- orphan and duplicate checks;
- pre-activation dry-run report;
- operator approval record;
- exact `switch_mapping_version` command or API plan, but not execution in this planning task;
- post-activation verification queries;
- rollback or reactivation procedure;
- audit event requirements.

No next-stage agent should call `switch_mapping_version` based on this document alone.

## 14. Strict reconciliation plan

Strict reconciliation must prove that the formal evaluation input is complete and explainable:

- source file inventory and custody record;
- import batch identity and immutable import metadata;
- bill row count and amount totals by month, channel, business form, and source file;
- exclusion ledger for incomplete months and out-of-scope rows;
- duplicate detection and resolution;
- raw work to standard work mapping coverage;
- standard work identity stability checks;
- basic info and copyright coverage checks;
- aggregate revenue comparison against source-control totals;
- exception ledger with owner, reason, resolution, and approval;
- final readiness sign-off before evaluation task creation.

This plan does not authorize reading or importing the real source files.

## 15. Blocking manual review / waiver policy

Blocking review items must prevent formal release until they reach a final state:

| State | Formal meaning |
| --- | --- |
| `pending` | Blocks formal release |
| `approved` | Cleared by reviewer |
| `data_fix_required` | Blocks until fixed and rechecked |
| `waiver_granted` | Cleared only with reason, approver, expiry or scope, and audit trail |
| `rejected_for_formal` | Blocks formal release |
| `no_action_required` | Cleared with reason |

Waivers must be narrow, auditable, and visible in the formal release package. A waiver cannot silently convert missing copyright, bad mapping, or unresolved review risk into a clean formal result.

## 16. Advisory display policy

Advisory items are warning-only unless another gate classifies them as blocking. Formal outputs should display advisory items without overstating them:

- advisory count and category summary;
- per-work advisory reasons where allowed;
- explanation that advisory status does not itself block eligibility;
- distinction between advisory warning, blocking review, and release confirmation;
- export field controls to avoid raw bills, secrets, private operator notes, or reidentifiable combinations.

Advisory display must help reviewers interpret risk without turning fixture-derived warnings into formal business commands.

## 17. Formal persistence migration review plan

The existing SQL candidate is:

```text
docs/technical-design/sql-candidates/M2-FR-1-formal-persistence-migration-candidate-v0.1.sql
```

Review plan:

1. Compare table names and column types against existing migration conventions.
2. Review primary keys, foreign keys, uniqueness, check constraints, and timestamp strategy.
3. Review indexes for expected task, result, review, export, release, and audit queries.
4. Review permission and role boundaries.
5. Review rollback and invalidation requirements.
6. Confirm no raw bill rows, secrets, private source documents, or prohibited fields are persisted.
7. If local DB-backed development requires it, prepare a forward migration under `db/migrations/`.
8. Execute only against local development DB.
9. Keep CI independent from private data and local DB state.

## 18. Formal task/export/audit/release/rollback contract plan

Formal contracts should be drafted before implementation and explicitly marked pending authorization.

### Task contract

- Create task only when readiness gate is green.
- Persist task state, candidate version, input snapshot, cutoff window, operator, and audit events.
- Support query, cancel, retry, invalidation, and failure reason.
- Prevent formal mode if formal data is not authorized or readiness is blocked.

### Export contract

- Export only released or review-approved formal results.
- Include only allowed fields.
- Reject raw bill rows, real private documents, secrets, environment values, channel-sensitive combinations, and unapproved per-work revenue details.
- Require manual confirmation for downlist, suspend, renewal, promotion, or similar action-bearing recommendations.

### Audit and release contract

- Persist immutable audit events for readiness checks, task creation, task completion, review closure, export creation, release approval, rollback, and invalidation.
- Require reviewer and approver identity where business action is taken.
- Keep fixture and formal release packages visibly separate.

### Rollback contract

- Support invalidating a formal run because of bad input, mapping error, algorithm error, review reversal, or release mistake.
- Preserve original records with invalidated status rather than silent overwrite.
- Require a new task or release package for corrected outputs.

No formal task/export/write API is implemented by this plan.

## 19. Recommended high-efficiency execution order

1. Treat this plan, `NEXT-CODEX-INSTRUCTION.md`, and the new aggregate reports as the current handoff baseline.
2. Review the generated real-data profile, strict reconciliation, algorithm calibration, and candidate-b summary with business owners.
3. Treat the local DB-backed candidate-b import as current development evidence: PostgreSQL 16 (`postgres:16-bookworm`), schema `0070.000`, 3054 evaluation results, 85 blocking review items, and 2759 advisory review items.
4. Use `docs/analysis/m2-real-data/M2-local-db-import-reconciliation-summary-v0.1.md` as the DB-backed reconciliation evidence and `docs/analysis/m2-real-data/M2-candidate-b-blocking-review-workflow-summary-v0.1.md` as the review workflow evidence.
5. Use the remediation reports as the current review evidence: 57 data-gap blockers have no safe auto-fix and remain `data_fix_required` candidates; 23 expiry blockers have a waiver policy draft only; 5 manual exception blockers remain pending.
6. Close or waive the 85 candidate-b blocking review items through the remediated group-level decision flow: fill only confirmed groups in the private group template, then dry-run/apply through the local runner; default behavior must remain no bulk approval.
7. If review decisions require data fixes, perform the minimum authorized local source correction and rerun local import/reconciliation/remediation before any closing decision.
8. Convert the remaining formal task/export/release contracts from fixture prototypes into DB-backed local development contracts, still not final release APIs.
9. Run formal evaluation only after readiness gates pass and the user explicitly authorizes formal execution.
10. Release outputs only through audit-backed approval and rollback controls.

## 20. Next Codex large task package

Suggested next large task for Codex:

```text
You are continuing KAtOReNA7/system in authorized local real-data development mode. Do not continue M2-C5/C6, do not open FR-7, and do not start M3. First run git status, git rev-parse HEAD, git fetch origin main, and git rev-parse origin/main. Read README.md, AGENTS.md, NEXT-CODEX-INSTRUCTION.md, docs/technical-design/M2-next-stage-formalization-master-plan-v0.1.md, M2 closeout/readiness docs, current M2 domain code, package.json, .github/workflows/ci.yml, and .gitignore.

Your task is to continue from the generated aggregate reports under docs/analysis/m2-real-data/, the local development migration db/migrations/V0070_000__m2_evaluation_persistence.sql, and the implemented local runners scripts/m2-real-data/run_authorized_real_data_db_import.mjs, scripts/m2-real-data/run_candidate_b_review_decision_apply.mjs, and scripts/m2-real-data/run_candidate_b_review_remediation.mjs. Do not rediscover candidate-b and do not return to a pure document plan. Local DB-backed import/reconciliation has already passed on PostgreSQL 16 (`postgres:16-bookworm`) with schema `0070.000`, 3054 evaluation results, 85 blocking review items, and 2759 advisory review items. Remediation diagnostics show 57 data-gap blockers with no safe auto-fix, 23 expiry blockers with a waiver policy draft only, and 5 manual exception blockers that remain pending. Continue with business confirmation against the remediated private group template: if the user has filled the template, dry-run it first, then apply only explicitly confirmed groups with audit metadata; unconfirmed groups remain pending. If review decisions require data fixes, make the minimum authorized local source correction and rerun import/reconciliation/remediation. You may read local real data and data/**, use local Docker/PostgreSQL, modify db/migrations, and execute local migrations locally. Do not connect to remote production/shared databases, do not commit raw data or secrets, do not print sensitive row-level details, do not use git add ., and do not touch stash. Keep CI fixture/no-DB compatible. After changes, run npm run check:no-real-data, npm run lint, npm run build, npm test, npm run smoke, npm run evaluate:m2:real-data:dev, npm run import:m2:real-data:local-db, npm run review:m2:candidate-b:local, npm run review:m2:candidate-b:export-group-template, npm run review:m2:candidate-b:group-summary, and npm run review:m2:candidate-b:remediate-data-gaps.
```

## 21. Operations requiring explicit user authorization

The following remain separate future authorizations:

- connecting to remote production, shared, staging-like, or externally managed databases;
- publishing release-approved formal evaluation results;
- activating or switching mapping in a non-local/formal environment;
- exposing formal task/export/write APIs as production features;
- creating formal release exports outside the local development boundary;
- staging or committing files if the worktree contains unrelated changes;
- using any implicit broad staging command such as `git add .`;
- touching stash in any way.

## 22. Boundary confirmation for this plan

This document now authorizes local development planning and execution for real-data discovery, local import, local migration, local DB-backed development, reconciliation, backtest, and calibration. It still does not authorize remote production/shared DB access, raw data commits, secret disclosure, or final release approval.
