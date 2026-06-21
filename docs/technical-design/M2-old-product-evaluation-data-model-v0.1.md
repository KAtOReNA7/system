# M2 old-product evaluation data model v0.1

Status: DESIGN ONLY - NO MIGRATION

This document designs the M2 old-product evaluation data model. It must not be copied into `db/migrations/` during M2-A.

## 1. Boundary

M2-A only defines model shape, dependencies, and migration candidates. It does not create tables, views, functions, triggers, or indexes.

M2-A depends on M1 outputs conceptually, but formal use remains blocked until M1 formal data readiness is complete.

## 2. M1 Dependencies

M2 reads or depends on:

- `standard_work`;
- `work_business_form`;
- `mapping_version`;
- `income_fact`;
- `income_projection`;
- `mapping_version_work_metric`;
- `mapping_version_work_form_metric`;
- `standard_work_status_history`;
- `basic_info_version`;
- `basic_info_version_work`;
- `work_classification_assignment`;
- `work_tag_assignment`;
- `classification_node`;
- `tag`;
- `month_completeness_confirmation`;
- `batch_impact_record`;
- `batch_impact_consumption`;
- views such as `v_current_income`, `v_income_projection_monthly`, and `v_basic_info_m2_completeness`.

Formal M2 must only consume active M1 versions and the latest confirmed complete month.

## 3. Core Tables and Objects

### 3.1 `old_product_evaluation_batch`

Represents a batch request to evaluate one or more old products.

Candidate fields:

- `id`;
- `batch_no`;
- `mode`: `fixture`, `synthetic`, `local_dry_run`, `formal`;
- `status`: `draft`, `queued`, `running`, `succeeded`, `failed`, `cancelled`;
- `cutoff_month`;
- `algorithm_version_id`;
- `input_snapshot_id`;
- `requested_scope`;
- `requested_by`;
- `created_at`, `started_at`, `finished_at`.

M2-B migration candidate.

### 3.2 `old_product_evaluation_attempt`

Represents an actual execution attempt. It follows `REQ-EVAL-001`.

Candidate fields:

- `id`;
- `batch_id`;
- `standard_work_id`;
- `status`: `succeeded` or `failed`;
- `started_at`, `finished_at`;
- `error_code`;
- `error_summary`;
- `runtime_metadata`.

M2-B migration candidate.

### 3.3 `old_product_evaluation_result`

Represents a formal or fixture evaluation result.

Candidate fields:

- `id`;
- `attempt_id`;
- `standard_work_id`;
- `result_status`: `current`, `historical`, `invalidated`;
- `mode`;
- `cutoff_month`;
- `input_snapshot_id`;
- `algorithm_version_id`;
- `lifecycle_type`;
- `rating`;
- `resource_investment_level`;
- `forecast_total_base`;
- `forecast_total_optimistic`;
- `forecast_total_pessimistic`;
- `confidence_level`;
- `published_at`;
- `invalidated_at`;
- `invalidated_reason`.

M2-B can create this for fixture/local non-formal. Formal status use waits for M2-C/M2-D authorization.

### 3.4 `old_product_income_summary`

Stores denormalized income features used by a result.

Candidate fields:

- `result_id`;
- `historical_total`;
- `last_12_month_total`;
- `last_24_month_total`;
- `recent_3_month_total`;
- `business_form_mix`;
- `channel_mix`;
- `positive_month_count`;
- `zero_month_count`;
- `negative_month_count`;
- `first_positive_month`;
- `latest_income_month`.

M2-B migration candidate if persisted; otherwise can be embedded in input snapshot for M2-A/B.

### 3.5 `old_product_lifecycle_judgment`

Stores lifecycle classification and rationale.

Candidate fields:

- `result_id`;
- `lifecycle_type`;
- `confidence`;
- `window_months`;
- `signals`;
- `rationale`.

M2-B migration candidate.

### 3.6 `old_product_forecast_result`

Stores forecast detail.

Candidate fields:

- `result_id`;
- `scenario`: `base`, `optimistic`, `pessimistic`;
- `forecast_total`;
- `remaining_months`;
- `yearly_breakdown`;
- `method_key`;
- `assumption_summary`.

M2-B migration candidate.

### 3.7 `old_product_rating_result`

Stores rating and resource-level rationale.

Candidate fields:

- `result_id`;
- `rating`;
- `rating_basis`;
- `resource_investment_level`;
- `adjustments`;
- `requires_confirmation`.

M2-B migration candidate.

### 3.8 `old_product_risk_result`

Stores one row per risk.

Candidate fields:

- `id`;
- `result_id`;
- `risk_code`;
- `severity`;
- `rationale`;
- `affected_metric`;
- `mitigation`.

M2-B migration candidate.

### 3.9 `old_product_suggestion_result`

Stores operating suggestions.

Candidate fields:

- `id`;
- `result_id`;
- `rank`;
- `suggestion_code`;
- `title`;
- `rationale`;
- `expected_effect`;
- `requires_manual_review`.

M2-B migration candidate.

### 3.10 `old_product_backtest_batch`

Stores a backtest run over historical cutoffs.

Candidate fields:

- `id`;
- `batch_no`;
- `algorithm_version_id`;
- `cutoff_month`;
- `horizon_months`;
- `scope_filter`;
- `status`;
- `created_at`, `finished_at`.

M2-B migration candidate for fixture/local. Formal backtest waits for real historical readiness.

### 3.11 `old_product_backtest_result`

Stores per-work backtest comparison.

Candidate fields:

- `id`;
- `backtest_batch_id`;
- `standard_work_id`;
- `predicted_total_base`;
- `predicted_total_optimistic`;
- `predicted_total_pessimistic`;
- `actual_total`;
- `absolute_error`;
- `percentage_error`;
- `covered_by_interval`;
- `lifecycle_type`;
- `rating_at_cutoff`.

M2-B migration candidate.

### 3.12 `old_product_algorithm_version`

Stores algorithm, rule, prompt, and fixture version metadata.

Candidate fields:

- `id`;
- `version_key`;
- `status`: `draft`, `fixture_only`, `active`, `retired`;
- `uses_ai_model`;
- `model_name`;
- `rule_config_hash`;
- `prompt_hash`;
- `created_at`, `retired_at`;
- `notes`.

M2-B can persist fixture-only versions. Formal active versions require M2-C/M2-D authorization.

### 3.13 `old_product_input_snapshot`

Stores immutable structured inputs for a result.

Candidate fields:

- `id`;
- `mode`;
- `standard_work_id`;
- `cutoff_month`;
- `mapping_version_id`;
- `basic_info_version_id`;
- `classification_release_id`;
- `tag_release_id`;
- `bill_batch_fingerprint`;
- `income_feature_json`;
- `basic_info_json`;
- `readiness_json`;
- `source_hash`.

M2-B migration candidate. Formal snapshots require active M1 data.

### 3.14 `old_product_result_invalidation`

Stores invalidation and re-evaluation markers.

Candidate fields:

- `id`;
- `result_id`;
- `trigger_type`;
- `trigger_ref`;
- `reason`;
- `detected_at`;
- `re_evaluation_task_id`;
- `status`.

M2-B can model it; formal automatic re-evaluation waits for M2-C/M2-D and M4 integration.

## 4. Readiness Views

Candidate views:

- `v_m2_old_product_ready_work`;
- `v_m2_old_product_readiness_gap`;
- `v_m2_old_product_current_result`;
- `v_m2_old_product_result_history`;
- `v_m2_old_product_backtest_metrics`.

M2-B can implement fixture/local views or repository-level projections. Formal views should be introduced only after M1 formal data readiness is satisfied.

## 5. Result State Rules

At most one `current` result per standard work and evaluation family.

State transitions:

- no result -> current;
- current -> historical when a new current result is published;
- current -> invalidated when input data or algorithm invalidates the result;
- failed attempt -> no formal result;
- cancelled task -> no attempt.

Direct overwrite is forbidden.

## 6. M2-B Migration Candidates

Likely M2-B candidates:

- algorithm version table;
- input snapshot table;
- evaluation batch and attempt tables;
- evaluation result table;
- income summary table;
- lifecycle, forecast, rating, risk, suggestion child tables;
- readiness gap view;
- fixture-only seed or test fixtures outside formal migrations.

M2-B must use forward-only migration candidates in a separate authorized implementation task. M2-A does not write them.

## 7. M2-C / M2-D Formal Authorization Items

Only after formal readiness:

- formal result status activation;
- formal backtest batch over real history;
- formal algorithm version activation;
- automatic invalidation from real batch impact records;
- automatic re-evaluation tasks;
- export over real evaluation results;
- annual target dependency on valid current results.

## 8. Explicit Non-Goals

This model does not:

- modify M1 tables;
- modify `db/migrations/`;
- import real data;
- activate mapping versions;
- call mapping switch functions;
- implement old-product algorithm thresholds;
- define final rating thresholds;
- define final lifecycle thresholds;
- create annual target tables.
