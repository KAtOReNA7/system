# M2-FR-4 evaluation task fixture prototype report v0.1

## Scope

This round implements a runnable fixture-only evaluation task prototype. It validates task creation, querying, cancellation, retry, synthetic state transitions, and readiness gate blocking behavior.

This round does not implement formal evaluation, formal task persistence, database writes, migration execution, mapping activation, `switch_mapping_version`, export APIs, or real data import.

## Implemented components

- Domain workflow: `src/domain/oldProductEvaluation/evaluationTaskWorkflow.js`
- Synthetic fixture: `test/fixtures/m2EvaluationTask.fixture.js`
- Fixture repository: `src/repositories/m2EvaluationTaskFixtureRepository.js`
- Fixture runtime API:
  - `GET /api/m2/fixture/evaluation-tasks`
  - `GET /api/m2/fixture/evaluation-tasks/{taskId}`
  - `POST /api/m2/fixture/evaluation-tasks`
  - `POST /api/m2/fixture/evaluation-tasks/{taskId}/actions`
- Admin page: `#m2-fixture-tasks`
- API contract: `docs/api/M2-evaluation-task-fixture-api-contract-v0.1.md`
- Tests:
  - domain workflow;
  - readiness gate integration;
  - blocking review integration;
  - fixture repository;
  - runtime API;
  - admin and E2E.

## Readiness gate behavior

Task creation calls `evaluateFormalReadiness` first.

| Readiness result | Fixture task result |
| --- | --- |
| `ready` | `queued` |
| `warning_only` | `queued` or explicitly requested `draft`, with advisory reasons retained |
| `blocked` | `blocked`, with blocking reasons retained |

Blocked readiness is never silently queued.

## Blocking review integration

The fixture cases include:

- blocking review pending;
- blocking review rejected;
- approved blocking review;
- waiver-granted blocking review.

Approved and waiver-granted review cases can create queued fixture tasks. Pending and rejected review cases create blocked fixture tasks.

## Task lifecycle

Supported statuses:

- `draft`
- `blocked`
- `queued`
- `running`
- `completed`
- `failed`
- `cancelled`
- `retry_requested`

Supported actions:

- `create`
- `queue`
- `start`
- `complete`
- `fail`
- `cancel`
- `retry`

Every transition returns an audit event with `databaseWritten=false` and `formalEvaluationExecuted=false`.

## Fixture API boundary

The API is namespaced under `/api/m2/fixture/` to avoid presenting it as a future formal API.

Every response includes:

- `mode="fixture"`
- `notForFormalDecision=true`
- `formalEvaluationExecuted=false`
- `databaseWritten=false`
- `mappingVersionActivated=false`
- `switchMappingVersionCalled=false`

## Admin prototype

The admin page supports:

- fixture task list;
- task detail;
- readiness status display;
- blocking and advisory reason counts;
- simulated create task;
- simulated cancel/retry and other state transitions.

The page explicitly states that the prototype does not write a database row and does not run formal processing.

## Verification

Required verification commands:

- `npm run check:no-real-data`
- `npm run lint`
- `npm run build`
- `npm test`
- `npm run smoke`
- `npm run test:e2e`

## Remaining boundary

Formal task persistence, authorization, durable audit retention, real task execution, and task worker orchestration remain out of scope. Those require a later DB/migration-authorized phase.
