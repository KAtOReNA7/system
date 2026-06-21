# M2-C real cleaned-bill calibration input contract v0.1

## 1. Status

Status: DESIGN CONTRACT ONLY.

This document defines the minimum aggregate input contract required before the fixture-only old-product evaluation engine can be calibrated with real cleaned bill data. It does not authorize real data import, formal evaluation, local dry-run implementation, database writes, mapping activation, export, or evaluation task execution.

## 2. Why the M2-B fixture skeleton is insufficient

M2-B uses embedded synthetic fixture values to prove API shape, admin display, explainable evaluation output, and test coverage. The fixture skeleton is intentionally not enough for real calibration because:

- fixture revenue curves are handcrafted coverage cases, not observed distribution;
- fixture thresholds are non-formal and cannot become business rules;
- fixture backtest rows only prove response shape and UI behavior;
- fixture data does not validate settlement delay, channel coverage, work mapping quality, copyright-window edge cases, or incomplete-month behavior;
- fixture readiness flags are examples, not operational truth.

M2-C must therefore consume reviewed aggregate inputs derived from the approved M1 data pipeline, not raw bill files or private confirmation workbooks.

## 3. Required aggregate input grain

The calibration input should be prepared at a bounded aggregate grain:

| Field | Required | Semantics |
| --- | --- | --- |
| `standardWorkId` | yes | Standard work identity after approved mapping projection. |
| `billMonth` | yes | Natural month at month-start date or canonical `YYYY-MM` value. |
| `businessForm` | yes | Derived from the approved raw work ID parsing rule, not from authorization category. |
| `channelId` | recommended | Unified channel identity when channel-level calibration is needed. |
| `actualSalesAmount` | yes | Exact decimal aggregate amount from immutable income facts through approved projection. |
| `isCompleteMonth` | yes | Whether the month is confirmed complete for formal cutoff purposes. |
| `cutoffMonth` | yes | Latest confirmed complete month used for the calibration slice. |
| `firstPositiveSalesMonth` | recommended | First month with positive actual sales under M1 confirmed semantics. |
| `copyrightStartDate` | yes for formal calibration | Copyright start date from approved master-data source or basic-info version. |
| `copyrightEndDate` | yes for formal calibration | Copyright expiry date from approved master-data source or basic-info version. |
| `classificationPath` | yes for stratified calibration | Approved three-level classification path. |
| `requiredTags` | pending | Required tag set remains PENDING-DATA until product rules freeze. |
| `readinessFlags` | yes | Machine-readable flags explaining missing or blocked inputs. |
| `mappingVersionId` | yes | Approved mapping version used for projection. |
| `basicInfoVersionId` | yes | Approved basic information version used for enrichment. |
| `sourceBatchIds` | recommended | Import batches contributing to the aggregate slice. |

## 4. Required aggregate forms

M2-C should request these aggregate forms instead of row-level raw bills:

1. Work-month aggregate: `standardWorkId + billMonth + businessForm`.
2. Work-channel-month aggregate when channel effects are tested: `standardWorkId + channelId + billMonth + businessForm`.
3. Work-level historical summary: first positive sales month, latest income month, complete-month count, zero-month count, last-12 and last-24 sales, total historical sales.
4. Work-level readiness snapshot: mapping readiness, basic-info completeness, unresolved blocking issues, month completeness boundary.
5. Calibration backtest slice: cutoff month, horizon months, predicted target window, actual target-window aggregate.

All forms must preserve exact decimal semantics and must carry source version references. They must not contain raw bill row bodies, private workbook content, or unreviewed operations decisions.

## 5. Exclusions

M2-C calibration input must not include:

- raw bill files;
- raw bill row-level bodies;
- private operation confirmation workbook content;
- local private paths;
- database connection strings;
- credentials;
- unapproved mapping candidates;
- formal `mapping_version` activation commands;
- application write/export/evaluation-task payloads.

## 6. Validation gates before M2-C implementation

Before implementing real cleaned-bill calibration, the following gates must pass:

- M1 formal data readiness is explicitly authorized for the target non-production environment;
- approved mapping and basic-info versions exist for the calibration slice;
- incomplete months are excluded from the formal cutoff while still available as non-cutoff facts when authorized;
- aggregate totals reconcile to approved M1 income facts;
- no unresolved formal-import blocker is included in the calibration slice;
- input manifest identifies versions, month range, aggregate grain, row count, checksum, and synthetic/real mode;
- all real-data access is explicitly scoped and reviewed.

## 7. PENDING-DATA items

The following remain pending and must not be hard-coded:

- formal rating thresholds;
- formal risk severity thresholds;
- required tag set;
- minimum history window for formal evaluation;
- channel weighting or settlement-delay adjustment;
- formal backtest acceptance criteria.

## 8. Next-stage recommendation

The next technical step should be M2-C-0 real cleaned-bill calibration access design. It should define authorization, source manifests, aggregate-only extraction, dry-run boundaries, validation checks, and rollback/reporting behavior before any real-data calibration implementation begins.
