# M2-FR-3 blocking manual review workflow fixture prototype report v0.1

## Scope

This round implements a fixture-only blocking manual review workflow prototype for M2 formal readiness preparation. It does not create formal persistence, does not execute formal evaluation, and does not write a database.

## Implemented components

- Domain workflow module: `src/domain/oldProductEvaluation/blockingReviewWorkflow.js`
- Synthetic fixture: `test/fixtures/m2BlockingReviewWorkflow.fixture.js`
- Fixture repository: `src/repositories/m2BlockingReviewFixtureRepository.js`
- Fixture runtime API:
  - `GET /api/m2/formal-readiness/reviews`
  - `GET /api/m2/formal-readiness/reviews/{reviewItemId}`
  - `POST /api/m2/formal-readiness/reviews/{reviewItemId}/actions`
- Minimal admin prototype page:
  - `#m2-reviews`
  - fixture-only review queue
  - filters
  - detail panel
  - fixture action simulation
- API contract: `docs/api/M2-blocking-review-workflow-api-contract-v0.1.md`
- Automated tests:
  - domain state transitions
  - summary and formal-entry blocking decision
  - fixture repository
  - HTTP API
  - admin surface
  - E2E admin interaction

## Workflow rules

Statuses:

- `pending`
- `approved`
- `data_fix_required`
- `waiver_granted`
- `rejected_for_formal`
- `no_action_required`

Review types:

- `blocking_manual_review`
- `advisory_review`

Formal-entry blocking rule:

- `blocking_manual_review` items with `pending`, `data_fix_required`, or `rejected_for_formal` block formal entry.
- `approved` and `waiver_granted` unblock the item.
- `advisory_review` remains non-blocking.

## Fixture data

The fixture simulates the aggregate of 513 blocking review items with 10 representative synthetic samples. All IDs use `SYN-FR-REVIEW-*` and `SYN-FR-WORK-*`. No real work names, channels, authors, income values, ledger rows, or operation confirmation rows are included.

Covered reason families:

- `high_value_with_data_gap`
- `high_value_with_expiry`
- `abnormal_spike`
- `buyout_or_oneoff_income`
- `insufficient_history`
- `channel_structure_unclear`
- `mixed_blocking_advisory`

## API and admin guardrails

Every API response includes fixture guard flags:

- `mode="fixture"`
- `formalEvaluationAllowed=false`
- `notForFormalDecision=true`
- `databaseWritten=false`

The admin page presents the action buttons as fixture transition simulations. The action endpoint only returns an in-memory transition result and audit event. It does not persist the transition, and re-reading the fixture item returns the original fixture state.

## Explicitly not implemented

- Formal review persistence
- Formal old-product evaluation execution
- Formal task API
- Export API
- Mapping activation
- `switch_mapping_version`
- Database write
- Real data import
- Migration changes

## Verification plan

Required commands:

- `npm run check:no-real-data`
- `npm run lint`
- `npm run build`
- `npm test`
- `npm run smoke`
- `npm run test:e2e`

## Formal readiness impact

This prototype only proves the workflow shape and UI/API boundary. It does not make M2 formal-ready. A later formal persistence round must define database tables, approval persistence, authorization, audit retention, and business ownership before any real review decision can be applied.
