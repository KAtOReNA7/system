# M2-FR-5 advisory review display fixture integration report v0.1

## Scope

This round implements the fixture-only advisory review display loop for M2 formal readiness preparation.

The implementation connects:

- advisory review display domain functions;
- fixture API summary output;
- existing blocking review and fixture task API display models;
- admin prototype display;
- unit/API/E2E tests;
- public API contract and machine-readable summary.

This round does not implement formal evaluation, formal task persistence, database writes, migration execution, mapping version activation, `switch_mapping_version`, export APIs, or real data import.

## Implemented domain boundary

New domain module:

```text
src/domain/oldProductEvaluation/advisoryReviewDisplay.js
```

Public functions:

- `summarizeAdvisoryReviews(items, options)`;
- `groupAdvisoryReasons(items)`;
- `buildAdvisoryDisplayModel(item)`.

Supported advisory reason families:

- `channel_structure_unclear`;
- `copyright_missing`;
- `abnormal_spike`;
- `buyout_or_oneoff_income`;
- `high_value_with_expiry`;
- `insufficient_history`;
- `channel_concentration_advisory`;
- `copyright_fallback_used`;
- `long_tail_or_inactive`;
- `downlist_requires_manual_confirmation`;
- `renewal_review_requires_confirmation`.

The domain output separates:

- `blocking_review`;
- `advisory_review`;
- `warning`;
- `action_candidate`;
- `display_only_note`.

Advisory display models always keep `blocksFormalEntry=false` and `automaticActionCreated=false`.

## Fixture API enhancement

New read-only fixture endpoint:

```text
GET /api/m2/fixture/advisory-reviews/summary
```

The response includes:

- `mode="fixture"`;
- `notForFormalDecision=true`;
- `formalEvaluationExecuted=false`;
- `databaseWritten=false`;
- advisory aggregate count: `2331`;
- blocking review aggregate count: `513`;
- advisory reason distribution;
- manual-confirmation prompts for downlist and renewal review.

Existing review/task fixture endpoints were enhanced with display-only advisory metadata. Existing fixture boundaries were not changed into formal persistence behavior.

## Admin prototype enhancement

The admin prototype now shows:

- advisory review summary on `#m2-reviews`;
- clear distinction between blocking review and advisory review;
- display kind per review item;
- advisory summary on `#m2-fixture-tasks`;
- readiness advisory reason codes on task list rows;
- advisory display models on task detail.

The page explicitly states:

- advisory does not block formal eligibility by itself;
- advisory does not create automatic downgrade, task, export, or persistence behavior;
- `databaseWritten=false`;
- `formalEvaluationExecuted=false`.

## Validation coverage

Added:

```text
test/m2-advisory-review-display.test.js
```

Covered checks:

- advisory review does not block formal eligibility;
- blocking review remains distinct and blocks;
- advisory reason distribution is computed;
- downlist and renewal prompts require manual confirmation before downstream action;
- summary API returns fixture guard flags;
- review list API separates blocking/advisory display semantics;
- evaluation task detail preserves advisory reasons;
- admin page displays advisory summary;
- no database connection, data read, migration execution, or formal capability was introduced.

E2E coverage was extended so the admin page must render advisory summary on review and task pages.

## Safety boundary result

| Boundary | Result |
| --- | --- |
| Database connected | No |
| Database written | No |
| Migration executed | No |
| `db/migrations/` modified | No |
| Real data read | No |
| `data/**` read | No |
| Formal evaluation executed | No |
| Mapping version activated | No |
| `switch_mapping_version` called | No |
| Formal task API added | No |
| Export API added | No |

## Next recommended line

Move to business/operations review of the M2 candidate-a formal readiness packet, focusing on whether the displayed advisory prompts are clear enough for acceptance before formalization.
