# M2 evaluation task fixture API contract v0.1

Status: fixture-only prototype.

This contract describes the M2-FR-4 evaluation task fixture API. It validates the task lifecycle shape and readiness gate integration before formal persistence and formal execution are implemented.

## Boundary

The runtime endpoint is intentionally namespaced under fixture mode:

- `GET /api/m2/fixture/evaluation-tasks`
- `GET /api/m2/fixture/evaluation-tasks/{taskId}`
- `POST /api/m2/fixture/evaluation-tasks`
- `POST /api/m2/fixture/evaluation-tasks/{taskId}/actions`

Every response must include:

- `mode="fixture"`
- `notForFormalDecision=true`
- `formalEvaluationExecuted=false`
- `databaseWritten=false`
- `mappingVersionActivated=false`
- `switchMappingVersionCalled=false`

The API does not execute formal evaluation and does not persist task state.

## Task statuses

- `draft`
- `blocked`
- `queued`
- `running`
- `completed`
- `failed`
- `cancelled`
- `retry_requested`

`running` and `completed` are fixture simulation states only. They do not mean a formal evaluation was executed.

## Task actions

- `create`
- `queue`
- `start`
- `complete`
- `fail`
- `cancel`
- `retry`

Each transition returns an audit event. Invalid actions or invalid transitions return `bad_request`.

## Readiness gate integration

`POST /api/m2/fixture/evaluation-tasks` must call the formal readiness gate before returning a task:

- `ready` creates a `queued` fixture task.
- `warning_only` may create `queued` or `draft`, while retaining advisory reasons.
- `blocked` creates a `blocked` fixture task and preserves blocking reasons.

The endpoint must not silently queue a task with blocked readiness.

## POST request example

```json
{
  "caseId": "blocked_review_pending",
  "actor": "SYN-FIXTURE-OPERATOR",
  "reason": "Fixture-only create simulation"
}
```

Response excerpt:

```json
{
  "mode": "fixture",
  "notForFormalDecision": true,
  "formalEvaluationExecuted": false,
  "databaseWritten": false,
  "mappingVersionActivated": false,
  "switchMappingVersionCalled": false,
  "task": {
    "taskId": "SYN-FR-TASK-005",
    "status": "blocked",
    "readinessStatus": "blocked"
  },
  "readinessGate": {
    "readinessStatus": "blocked",
    "blockingReasons": [
      {
        "code": "blocking_review_pending"
      }
    ]
  }
}
```

## Future formal API considerations

Future formal task APIs must integrate:

- persistent task records;
- persisted readiness gate snapshots;
- blocking review persistence;
- authorization and audit retention;
- explicit formal execution ownership;
- transactional safeguards against running tasks with blocked readiness.

This fixture API does not implement any of the above.

## Explicitly unavailable

- formal evaluation execution;
- formal task persistence;
- export APIs;
- mapping version activation;
- `switch_mapping_version`;
- real data import;
- database writes;
- migration execution.
