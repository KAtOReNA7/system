# M2 old-product evaluation API contract v0.1

Status: DESIGN ONLY - NOT IMPLEMENTED

This contract defines the intended M2-A API surface for fixture and synthetic old-product evaluation design. It does not modify the current API implementation.

## 1. Boundary

Allowed in M2-A:

- fixture responses;
- synthetic responses;
- contract tests;
- local non-formal design review.

Still forbidden:

- formal database connection;
- real data import;
- formal old-product evaluation;
- `mapping_version` activation;
- `switch_mapping_version`;
- formal data migration;
- exposing real work names, authors, revenues, connection details, or private files.

## 2. Common Conventions

All responses:

```text
content-type: application/json; charset=utf-8
cache-control: no-store
x-request-id: <uuid>
```

All evaluation responses must include:

```json
{
  "dataset": {
    "mode": "fixture",
    "formalDataAuthorized": false,
    "formalEvaluationAllowed": false,
    "cutoffMonth": "2026-04",
    "incompleteMonths": ["2026-05"]
  }
}
```

Allowed `dataset.mode` values:

- `fixture`
- `synthetic`
- `local_dry_run`
- `formal`

M2-A only allows `fixture` and `synthetic`.

## 3. Pagination, Filtering, Sorting

Pagination:

| Parameter | Default | Constraint |
| --- | ---: | --- |
| `page` | 1 | positive integer |
| `pageSize` | 20 | positive integer, max 100 |

Common filters:

- `query`
- `rating`
- `lifecycle`
- `risk`
- `classification1`
- `classification2`
- `classification3`
- `businessForm`
- `readiness`
- `resultStatus`
- `algorithmVersion`
- `cutoffMonth`

Common sorts:

- `forecastTotal.desc`
- `forecastTotal.asc`
- `last12MonthSales.desc`
- `rating.asc`
- `riskSeverity.desc`
- `updatedAt.desc`

Invalid filters or sorts return `bad_request`.

## 4. Error Codes

| Code | HTTP | Meaning |
| --- | ---: | --- |
| `bad_request` | 400 | invalid query, pagination, sort, or body |
| `not_found` | 404 | resource not found |
| `database_not_configured` | 503 | database URL is missing |
| `database_unavailable` | 503 | configured local database is unavailable |
| `formal_data_blocked` | 423 | formal data is not authorized or not ready |
| `m1_readiness_blocked` | 423 | required M1 inputs are incomplete |
| `evaluation_not_available` | 409 | evaluation result does not exist for requested mode |
| `fixture_only` | 409 | endpoint is available only with fixture/synthetic data in M2-A |
| `internal_error` | 500 | unexpected error |

Errors must not expose credentials, SQL, stack traces, host details, or real business data.

## 5. Old-Product Evaluation Overview API

`GET /api/m2/old-products/evaluations/overview`

Purpose: high-level evaluation status and distribution.

Response:

```json
{
  "dataset": { "mode": "fixture", "formalDataAuthorized": false },
  "summary": {
    "eligibleWorks": 24,
    "evaluatedWorks": 18,
    "blockedWorks": 6,
    "currentResults": 18,
    "invalidatedResults": 0,
    "latestCutoffMonth": "2026-04"
  },
  "distribution": {
    "rating": { "S+": 0, "S": 1, "A": 4, "B": 7, "C": 4, "D": 2, "E": 0 },
    "lifecycle": { "growth": 3, "stable": 5, "declining": 4, "long_tail": 5, "inactive": 1 },
    "riskSeverity": { "high": 2, "medium": 8, "low": 8 }
  },
  "notices": [
    { "code": "fixture_only", "message": "M2-A uses fixture or synthetic data only." },
    { "code": "incomplete_month_excluded", "message": "2026-05 is incomplete and excluded from formal evaluation cutoff." }
  ]
}
```

## 6. Old-Product Evaluation List API

`GET /api/m2/old-products/evaluations`

Purpose: list work-level current evaluation rows.

Response:

```json
{
  "dataset": { "mode": "fixture", "formalDataAuthorized": false },
  "items": [
    {
      "standardWorkId": "SYN-1001",
      "workName": "Synthetic Work 1001",
      "authorName": "Synthetic Author",
      "classificationPath": ["synthetic", "genre", "subgenre"],
      "businessForms": ["audio_copyright", "audio_product"],
      "cutoffMonth": "2026-04",
      "lifecycle": "stable",
      "rating": "A",
      "forecastTotal": "120000.00",
      "riskLevel": "medium",
      "primarySuggestion": "maintain_current_operation",
      "resultStatus": "current",
      "readiness": "ready"
    }
  ],
  "pagination": { "page": 1, "pageSize": 20, "total": 1 }
}
```

## 7. Old-Product Evaluation Detail API

`GET /api/m2/old-products/evaluations/{standardWorkId}`

Purpose: full current evaluation detail.

Response sections:

- `work`
- `readiness`
- `incomeSummary`
- `lifecycle`
- `forecast`
- `rating`
- `risks`
- `suggestions`
- `backtestSummary`
- `inputSnapshot`
- `algorithmVersion`
- `historyLinks`

If the work is blocked, return 200 with `readiness.status="blocked"` and no formal result, unless the work ID is unknown.

## 8. Evaluation History API

`GET /api/m2/old-products/evaluations/{standardWorkId}/history`

Purpose: list current, historical, invalidated results, and failed attempts.

Formal result statuses:

- `current`
- `historical`
- `invalidated`

Attempt statuses:

- `succeeded`
- `failed`

Cancelled tasks do not create attempts.

## 9. Data Gap API

`GET /api/m2/old-products/readiness-gaps`

Purpose: show why works cannot enter formal old-product evaluation.

Gap codes:

- `missing_income_fact`
- `mapping_not_active`
- `missing_standard_work_name`
- `missing_author`
- `missing_classification`
- `missing_required_tags`
- `missing_copyright_start`
- `missing_copyright_end`
- `copyright_expired`
- `pending_tag_configuration`
- `unresolved_data_issue`
- `incomplete_month_only`

M2-A fixture responses may include synthetic gap rows.

## 10. Backtest API

`GET /api/m2/old-products/backtests`

Purpose: list backtest batches and metrics.

Filters:

- `algorithmVersion`
- `cutoffMonth`
- `horizonMonths`
- `lifecycle`
- `classification1`

`GET /api/m2/old-products/backtests/{backtestBatchId}`

Purpose: detail metrics and sampled rows.

## 11. Algorithm Version API

`GET /api/m2/old-products/algorithm-versions`

Purpose: list algorithm/rule/prompt versions.

Fields:

- `id`
- `versionKey`
- `status`
- `effectiveFrom`
- `retiredAt`
- `usesAiModel`
- `fixtureOnly`
- `description`

M2-A versions must be `fixtureOnly=true`.

## 12. Controlled Evaluation Task API

Design-only endpoints:

- `POST /api/m2/old-products/evaluation-tasks`
- `GET /api/m2/old-products/evaluation-tasks`
- `GET /api/m2/old-products/evaluation-tasks/{taskId}`
- `POST /api/m2/old-products/evaluation-tasks/{taskId}/cancel`

M2-A does not implement these endpoints. If stubbed in M2-B, they must reject formal data mode and return `fixture_only` unless an explicit local non-formal mode is enabled.

Task request:

```json
{
  "mode": "fixture",
  "scope": { "standardWorkIds": ["SYN-1001"] },
  "algorithmVersionId": "fixture-algorithm-v1",
  "cutoffMonth": "2026-04"
}
```

## 13. Formal Data Blocking

Any request that asks for `mode=formal` before formal readiness must return:

```json
{
  "error": {
    "code": "formal_data_blocked",
    "message": "Formal M2 old-product evaluation is blocked until M1 formal data readiness is complete.",
    "requestId": "..."
  }
}
```

Blocking reasons include:

- no formal database authorization;
- real bills not formally imported;
- ledger and operations confirmation not formally imported;
- `mapping_version` not active;
- classification/tag values pending;
- strict reconciliation not formally accepted.
