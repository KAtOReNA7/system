# M2 advisory review display fixture API contract v0.1

Status: fixture-only display contract.

This contract documents the M2-FR-5 advisory review display boundary. It is not a formal evaluation API, not a persistence API, and not an export API.

## Semantics

Advisory review is a visible prompt or note for operator awareness. It is distinct from blocking manual review:

- Blocking manual review can block formal entry while unresolved.
- Advisory review does not block formal eligibility by itself.
- Advisory reason codes must not be interpreted as automatic downgrade rules.
- Advisory reason codes must not create automatic manual tasks.
- Downlist and renewal advisory prompts require human confirmation before any downstream action outside this fixture prototype.

## Fixture endpoint

```text
GET /api/m2/fixture/advisory-reviews/summary
```

Response is read-only and fixture-only.

Required guard fields:

```json
{
  "mode": "fixture",
  "notForFormalDecision": true,
  "formalEvaluationExecuted": false,
  "databaseWritten": false
}
```

Summary fields:

```json
{
  "advisoryReviewCount": 2331,
  "advisoryReasonDistribution": {
    "channel_structure_unclear": 190,
    "copyright_missing": 276,
    "abnormal_spike": 251,
    "buyout_or_oneoff_income": 132,
    "high_value_with_expiry": 144,
    "insufficient_history": 318,
    "channel_concentration_advisory": 221,
    "copyright_fallback_used": 208,
    "long_tail_or_inactive": 291,
    "downlist_requires_manual_confirmation": 167,
    "renewal_review_requires_confirmation": 133
  },
  "blockingReviewCount": 513,
  "displayOnlyCount": 499,
  "requiresManualConfirmationBeforeExportCount": 300,
  "renewalReviewDisplayCount": 133,
  "downlistDisplayCount": 167
}
```

The numbers above are fixture display aggregates used for API and page integration tests. They are not formal persisted results.

## Existing endpoints enhanced

The existing fixture review and task endpoints remain in their prior scope:

```text
GET /api/m2/formal-readiness/reviews
GET /api/m2/formal-readiness/reviews/{reviewItemId}
GET /api/m2/fixture/evaluation-tasks
GET /api/m2/fixture/evaluation-tasks/{taskId}
```

Review list/detail items may include:

```json
{
  "displayModel": {
    "reviewClass": "blocking_review | advisory_review",
    "displayKind": "blocking_review | warning | advisory_review | action_candidate | display_only_note",
    "blocksFormalEntry": false,
    "advisoryOnly": true,
    "requiresManualConfirmationBeforeExport": false,
    "automaticActionCreated": false,
    "formalEligibilityImpact": "does_not_block_formal_eligibility"
  }
}
```

Fixture task detail may include:

```json
{
  "advisoryReviewDisplay": [
    {
      "reasonCode": "channel_concentration_advisory",
      "reviewClass": "advisory_review",
      "displayKind": "advisory_review",
      "blocksFormalEntry": false
    }
  ]
}
```

## Page display boundary

The admin prototype displays advisory review information on:

- `#m2-reviews`: blocking review and advisory review are visibly separated.
- `#m2-fixture-tasks`: readiness advisory reasons are shown with task fixture output.

The page must show:

- advisory does not block formal eligibility;
- advisory does not represent formal execution;
- `databaseWritten=false`;
- `formalEvaluationExecuted=false`.

## Prohibited behavior

This contract does not authorize:

- database writes;
- migration execution;
- formal evaluation;
- formal task persistence;
- mapping version activation;
- `switch_mapping_version`;
- export API creation;
- real data import;
- automatic application of advisory reason rules.
