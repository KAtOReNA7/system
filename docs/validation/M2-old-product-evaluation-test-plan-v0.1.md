# M2 old-product evaluation test plan v0.1

Status: DESIGN ONLY

This test plan covers M2-A fixture and synthetic validation for old-product evaluation. It does not execute tests in this document round.

## 1. Scope

Test scope:

- API contract behavior;
- deterministic fixture algorithm behavior;
- readiness gap classification;
- page render expectations;
- export consistency design;
- prohibited-action guards.

Data scope:

- fixture data;
- synthetic data;
- local non-formal data in later M2-B only.

No test may connect to formal, staging, production, shared development, or shared test databases.

## 2. Fixture Data Tests

Cases:

- ready old product with complete M1 inputs;
- blocked work missing classification;
- blocked work missing copyright end date;
- work with both business forms;
- work with only one business form;
- work with incomplete latest month excluded;
- work with current, historical, and invalidated result samples.

Assertions:

- fixture rows contain no real names or revenue details;
- every response has `dataset.mode="fixture"`;
- formal flags are false.

## 3. Synthetic Data Tests

Cases:

- generated 24-month stable income series;
- generated growth series;
- generated decline series;
- long-tail low income series;
- inactive series;
- rebound after decline.

Assertions:

- synthetic IDs follow explicit synthetic naming;
- deterministic seed produces stable results;
- no values copied from real bills or private analysis files.

## 4. Readiness Gap Tests

Gap coverage:

- `missing_income_fact`;
- `mapping_not_active`;
- `missing_standard_work_name`;
- `missing_author`;
- `missing_classification`;
- `missing_required_tags`;
- `missing_copyright_start`;
- `missing_copyright_end`;
- `copyright_expired`;
- `pending_tag_configuration`;
- `unresolved_data_issue`;
- `incomplete_month_only`.

Assertions:

- blocked works do not produce formal current results;
- gap list is stable under pagination and filters;
- gap severity is visible in list and detail pages.

## 5. Lifecycle Identification Tests

Fixture lifecycle labels:

- `growth`;
- `stable`;
- `declining`;
- `long_tail`;
- `inactive`;
- `rebound`;
- `insufficient_history`.

Assertions:

- each label can be produced by deterministic fixture inputs;
- lifecycle rationale includes input window and signals;
- incomplete months are excluded.

## 6. Rating Tests

Ratings:

- `S+`;
- `S`;
- `A`;
- `B`;
- `C`;
- `D`;
- `E`.

Assertions:

- fixture thresholds are labelled non-formal;
- `S+` includes confirmation-required marker;
- `E` is compatible with inactive/down-shelf fixture state;
- rating rationale is structured.

## 7. Three-Scenario Forecast Tests

Scenarios:

- base;
- optimistic;
- pessimistic.

Assertions:

- pessimistic <= base <= optimistic;
- remaining-month count respects copyright end date;
- annual breakdown sums to scenario total;
- expired copyright produces blocked or zero remaining forecast according to fixture rule;
- no incomplete month is used as formal cutoff.

## 8. Backtest Tests

Cases:

- historical cutoff with actual later income;
- insufficient future actual period;
- interval-covered result;
- interval-missed result;
- over-prediction and under-prediction.

Assertions:

- absolute error and percentage error are computed consistently;
- interval coverage is boolean and explainable;
- backtest batch references algorithm version and cutoff month.

## 9. API Contract Tests

Endpoints:

- overview;
- evaluation list;
- detail;
- history;
- readiness gaps;
- backtests;
- algorithm versions;
- controlled evaluation task stubs.

Assertions:

- pagination validation;
- filter validation;
- sort validation;
- safe error shape;
- `formal_data_blocked` for formal mode;
- `fixture_only` for task execution in M2-A;
- no credentials, SQL, stack trace, host detail, or real data in errors.

## 10. Page Rendering Tests

Pages:

- overview;
- evaluation list;
- evaluation detail;
- data gap list;
- backtests and algorithms.

Assertions:

- fixture/synthetic badge visible;
- formal data blocked notice visible;
- incomplete-month notice visible;
- empty, blocked, degraded, error, and not-found states render;
- dense tables do not overflow small viewports;
- no write controls for formal evaluation in M2-A.

## 11. Export Consistency Tests

Design assertions for later implementation:

- export row count matches current filters;
- exported metrics match API totals;
- fixture exports include non-formal label;
- formal export is blocked before authorization.

## 12. Prohibited-Action Tests

Tests must verify:

- no formal database URL is accepted by default;
- no staging or production environment is accepted;
- no real data file paths are used as application input;
- no `mapping_version` activation API appears;
- no `switch_mapping_version` call is reachable;
- no formal data migration is triggered;
- no fixture contains private Excel, candidate package body, or stage JSON body.

## 13. CI Expectations

M2-B implementation should extend CI with:

- API contract tests;
- fixture evaluator unit tests;
- page rendering tests;
- prohibited-action tests;
- real-data guard.

M2-A only documents this plan and runs the existing repository verification commands.
