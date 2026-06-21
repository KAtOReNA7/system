# M2 blocking manual review workflow API contract v0.1

Status: fixture-only prototype.

This contract describes the M2-FR-3 blocking manual review workflow used to validate product behavior before formal persistence is approved. It is synthetic-only and must not be used as a formal business decision source.

## Global boundary

- Data mode: `fixture`.
- Formal decision flag: `notForFormalDecision=true`.
- Formal processing flag: `formalEvaluationAllowed=false`.
- Persistence flag: `databaseWritten=false`.
- Source: synthetic fixture only.
- No formal database write, migration, mapping activation, export, task creation, or real data import is available.

## Status model

Review statuses:

- `pending`
- `approved`
- `data_fix_required`
- `waiver_granted`
- `rejected_for_formal`
- `no_action_required`

Review types:

- `blocking_manual_review`
- `advisory_review`

Blocking rule:

- `blocking_manual_review` with `pending`, `data_fix_required`, or `rejected_for_formal` blocks formal entry.
- `approved` and `waiver_granted` unblock the specific review item.
- `advisory_review` is non-blocking by default.

## GET /api/m2/formal-readiness/reviews

Lists synthetic review items.

Query parameters:

- `page`
- `pageSize`
- `reviewStatus`
- `reviewType`
- `reasonCode`
- `isBlocking`

Response shape:

```json
{
  "dataset": {
    "mode": "fixture",
    "source": "m2-fr-3-blocking-review-synthetic-fixture",
    "candidateVersion": "candidate-a",
    "formalEvaluationAllowed": false,
    "notForFormalDecision": true,
    "databaseWritten": false
  },
  "mode": "fixture",
  "formalEvaluationAllowed": false,
  "notForFormalDecision": true,
  "databaseWritten": false,
  "items": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 0
  },
  "aggregate": {
    "simulatedBlockingReviewCount": 513,
    "sampleItemCount": 10,
    "aggregateOnly": true
  },
  "workflowSummary": {},
  "canEnterFormalAfterReview": false
}
```

## GET /api/m2/formal-readiness/reviews/{reviewItemId}

Returns one synthetic review item and its workflow impact.

Unknown `reviewItemId` returns:

```json
{
  "error": {
    "code": "not_found",
    "message": "Blocking review item not found",
    "requestId": "..."
  }
}
```

## POST /api/m2/formal-readiness/reviews/{reviewItemId}/actions

Simulates a fixture-only transition. This endpoint is intentionally not a formal write API.

Request body:

```json
{
  "action": "approve",
  "actor": "SYN-FIXTURE-OPERATOR",
  "reason": "Fixture-only transition reason"
}
```

Supported actions:

- `approve`
- `request_data_fix`
- `grant_waiver`
- `reject_for_formal`
- `mark_no_action_required`

Response includes the transitioned fixture item and audit event:

```json
{
  "mode": "fixture",
  "formalEvaluationAllowed": false,
  "notForFormalDecision": true,
  "databaseWritten": false,
  "item": {
    "reviewItemId": "SYN-FR-REVIEW-001",
    "reviewStatus": "approved"
  },
  "auditEvent": {
    "eventId": "SYN-FR-AUDIT-SYN-FR-REVIEW-001-approve",
    "action": "approve",
    "previousStatus": "pending",
    "nextStatus": "approved"
  }
}
```

The transition is not persisted. Re-reading the item returns the original fixture state.

## Explicitly unavailable

The following remain out of scope:

- formal evaluation execution;
- formal evaluation task APIs;
- export APIs;
- mapping version activation;
- `switch_mapping_version`;
- real data import;
- database persistence for review decisions.
