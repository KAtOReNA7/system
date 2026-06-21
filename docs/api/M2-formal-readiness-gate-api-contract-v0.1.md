# M2 formal readiness gate API contract v0.1

Status: DESIGN ONLY - RUNTIME API NOT IMPLEMENTED

This contract defines the future read-only API shape for the M2 formal readiness gate. The current implementation in M2-FR-2 only provides a pure domain module, synthetic fixture coverage, and a local fixture CLI.

## 1. Boundary

Allowed future behavior:

- read-only readiness overview;
- read-only readiness item listing;
- read-only readiness item detail;
- structured `ready`, `blocked`, and `warning_only` reasons.

Explicitly forbidden in M2-FR-2:

- formal evaluation execution;
- database writes;
- `mapping_version` activation;
- `switch_mapping_version`;
- migration execution;
- export API runtime;
- evaluation task API runtime;
- write API runtime;
- reading raw bills, ledger source files, or operations confirmation source files.

## 2. Common response fields

All successful readiness responses should include:

```json
{
  "dataset": {
    "mode": "formal_readiness",
    "candidateVersion": "m2-c3-cleaned-bill-nonformal-v0.2/candidate-a",
    "formalEvaluationExecuted": false,
    "formalEvaluationAllowed": false
  }
}
```

`formalEvaluationAllowed` is true only when all required readiness gates pass for the requested scope. Advisory reasons do not block eligibility, but they must remain visible.

## 3. Endpoints

### `GET /api/m2/formal-readiness/overview`

Purpose: return aggregate readiness status.

Response shape:

```json
{
  "dataset": {
    "mode": "formal_readiness",
    "candidateVersion": "m2-c3-cleaned-bill-nonformal-v0.2/candidate-a",
    "formalEvaluationExecuted": false,
    "formalEvaluationAllowed": false
  },
  "summary": {
    "total": 3054,
    "ready": 0,
    "blocked": 0,
    "warningOnly": 0,
    "blockingReasonDistribution": {},
    "advisoryReasonDistribution": {},
    "requiredActionDistribution": {}
  }
}
```

### `GET /api/m2/formal-readiness/items`

Purpose: list work-level readiness states.

Query parameters:

| Parameter | Meaning |
|---|---|
| `page` | positive integer |
| `pageSize` | positive integer, max 100 |
| `readinessStatus` | `ready`, `blocked`, or `warning_only` |
| `reasonCode` | blocking, advisory, or warning reason code |
| `standardWorkId` | exact standard work ID |

Response shape:

```json
{
  "items": [
    {
      "standardWorkId": "SYN-FR-WORK-001",
      "readinessStatus": "ready",
      "formalEvaluationAllowed": true,
      "blockingReasons": [],
      "advisoryReasons": [],
      "warnings": [],
      "requiredActions": [],
      "versionRefs": {
        "mappingVersionId": 101,
        "mappingVersionStatus": "active",
        "basicInfoVersionId": 201,
        "basicInfoVersionStatus": "active",
        "latestCompleteMonth": "2026-04",
        "cutoffMonth": "2026-04"
      },
      "candidateVersion": "m2-c3-cleaned-bill-nonformal-v0.2/candidate-a"
    }
  ],
  "pagination": { "page": 1, "pageSize": 20, "total": 1 }
}
```

### `GET /api/m2/formal-readiness/items/{standardWorkId}`

Purpose: return one readiness item.

Not found response:

```json
{
  "error": {
    "code": "not_found",
    "message": "Formal readiness item not found.",
    "requestId": "..."
  }
}
```

## 4. Readiness statuses

| Status | Meaning |
|---|---|
| `ready` | No blocking, advisory, or warning reason exists for the scope. |
| `blocked` | One or more blocking reasons prevent formal evaluation. |
| `warning_only` | No blocking reason exists, but advisory or warning reasons must be shown. |

## 5. Blocking reason codes

- `mapping_version_not_active`
- `mapping_version_missing`
- `basic_info_version_missing`
- `copyright_end_missing`
- `copyright_date_conflict`
- `blocking_review_pending`
- `blocking_review_rejected`
- `income_facts_missing`
- `input_snapshot_missing`
- `cutoff_month_invalid`
- `candidate_version_mismatch`

## 6. Advisory reason codes

- `advisory_review_present`
- `channel_concentration_advisory`
- `copyright_fallback_used`
- `long_tail_or_inactive`
- `downlist_requires_manual_confirmation`
- `renewal_review_requires_confirmation`

## 7. Warning codes

- `not_for_formal_decision`
- `formal_persistence_not_enabled`
- `evaluation_task_api_not_enabled`
- `export_api_not_enabled`

## 8. Error codes

| Code | HTTP | Meaning |
|---|---:|---|
| `bad_request` | 400 | Invalid query, pagination, or reason code. |
| `not_found` | 404 | Readiness item not found. |
| `database_not_configured` | 503 | Database URL missing. |
| `database_unavailable` | 503 | Configured local/test database unavailable. |
| `formal_readiness_blocked` | 423 | Requested formal readiness scope is blocked. |
| `formal_evaluation_not_implemented` | 501 | Formal evaluation execution is not implemented. |
| `internal_error` | 500 | Unexpected error. |

Errors must not expose connection strings, SQL, stack traces, host details, credentials, raw bill rows, ledger source content, or operations confirmation source content.

## 9. Current implementation note

M2-FR-2 does not implement these runtime endpoints. It only implements the pure domain readiness gate and synthetic fixture CLI. The API contract exists so future runtime API implementation can stay read-only and audited.
