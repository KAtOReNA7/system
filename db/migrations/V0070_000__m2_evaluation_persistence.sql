-- LOCAL DEVELOPMENT MIGRATION - AUTHORIZED REAL-DATA DEVELOPMENT ONLY
-- Layer: 0070
-- Dependencies: M1 physical model through V0060_290.
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL).
-- Irreversible: yes; forward-only migration, no down migration.
-- Permissions: yes.
-- Boundary: do not execute against production, staging, shared, or formal databases
-- unless separately approved for a formal release.

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE TABLE m2_evaluation_algorithm_versions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version_key text NOT NULL CHECK (btrim(version_key) <> ''),
  candidate_version text NOT NULL CHECK (btrim(candidate_version) <> ''),
  parameter_version text NOT NULL CHECK (btrim(parameter_version) <> ''),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','frozen','released','retired','failed')),
  is_formal boolean NOT NULL DEFAULT false,
  source_candidate text,
  description text,
  frozen_at timestamptz,
  released_at timestamptz,
  retired_at timestamptz,
  audit_metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version_key),
  CHECK (status <> 'frozen' OR frozen_at IS NOT NULL),
  CHECK (status <> 'released' OR (is_formal = true AND released_at IS NOT NULL)),
  CHECK (status <> 'retired' OR retired_at IS NOT NULL)
);

CREATE INDEX idx_m2_eval_algorithm_versions_candidate_version
  ON m2_evaluation_algorithm_versions(candidate_version);

CREATE INDEX idx_m2_eval_algorithm_versions_status_created
  ON m2_evaluation_algorithm_versions(status, created_at);

CREATE TABLE m2_evaluation_results (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  standard_work_id text NOT NULL REFERENCES standard_work(standard_work_id) ON DELETE RESTRICT,
  candidate_version text NOT NULL CHECK (btrim(candidate_version) <> ''),
  algorithm_version text NOT NULL REFERENCES m2_evaluation_algorithm_versions(version_key) ON DELETE RESTRICT,
  parameter_version text NOT NULL CHECK (btrim(parameter_version) <> ''),
  mapping_version_id bigint NOT NULL REFERENCES mapping_version(id) ON DELETE RESTRICT,
  basic_info_version_id bigint NOT NULL REFERENCES basic_info_version(id) ON DELETE RESTRICT,
  cutoff_month date NOT NULL CHECK (cutoff_month = date_trunc('month', cutoff_month)::date),
  result_status text NOT NULL DEFAULT 'current' CHECK (result_status IN ('current','historical','invalidated','failed')),
  rating text CHECK (rating IN ('S+','S','A','B','C','D','E','not_rated')),
  rating_score numeric(10,4) CHECK (rating_score IS NULL OR (rating_score >= 0 AND rating_score <= 100)),
  lifecycle text CHECK (lifecycle IS NULL OR lifecycle IN ('growth','stable','rebound','declining','long_tail','inactive','insufficient_history','unknown')),
  lifecycle_confidence text CHECK (lifecycle_confidence IS NULL OR lifecycle_confidence IN ('low','medium','high','unknown')),
  forecast_base_total numeric(32,18),
  forecast_optimistic_total numeric(32,18),
  forecast_pessimistic_total numeric(32,18),
  forecast_range_lower numeric(32,18),
  forecast_range_upper numeric(32,18),
  risk_level text CHECK (risk_level IS NULL OR risk_level IN ('none','low','medium','high')),
  primary_suggestion text,
  not_for_formal_decision boolean NOT NULL DEFAULT true,
  formal_evaluation_allowed boolean NOT NULL DEFAULT false,
  generated_at timestamptz NOT NULL,
  invalidated_at timestamptz,
  invalidation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (forecast_range_lower IS NULL OR forecast_range_upper IS NULL OR forecast_range_lower <= forecast_range_upper),
  CHECK (not_for_formal_decision = false OR formal_evaluation_allowed = false),
  CHECK (result_status <> 'current' OR invalidated_at IS NULL),
  CHECK (result_status <> 'invalidated' OR (invalidated_at IS NOT NULL AND btrim(coalesce(invalidation_reason,'')) <> ''))
);

CREATE UNIQUE INDEX uq_m2_eval_results_current_version_scope
  ON m2_evaluation_results(standard_work_id, cutoff_month, mapping_version_id, basic_info_version_id, algorithm_version)
  WHERE result_status = 'current';

CREATE INDEX idx_m2_eval_results_standard_work_id
  ON m2_evaluation_results(standard_work_id);

CREATE INDEX idx_m2_eval_results_work_cutoff
  ON m2_evaluation_results(standard_work_id, cutoff_month DESC);

CREATE INDEX idx_m2_eval_results_cutoff_month
  ON m2_evaluation_results(cutoff_month);

CREATE INDEX idx_m2_eval_results_candidate_version
  ON m2_evaluation_results(candidate_version);

CREATE INDEX idx_m2_eval_results_algorithm_version
  ON m2_evaluation_results(algorithm_version);

CREATE INDEX idx_m2_eval_results_mapping_version
  ON m2_evaluation_results(mapping_version_id);

CREATE INDEX idx_m2_eval_results_version_scope
  ON m2_evaluation_results(mapping_version_id, basic_info_version_id, cutoff_month);

CREATE INDEX idx_m2_eval_results_status
  ON m2_evaluation_results(result_status);

CREATE INDEX idx_m2_eval_results_rating
  ON m2_evaluation_results(rating);

CREATE INDEX idx_m2_eval_results_lifecycle
  ON m2_evaluation_results(lifecycle);

CREATE INDEX idx_m2_eval_results_created_at
  ON m2_evaluation_results(created_at);

CREATE TABLE m2_evaluation_input_snapshots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  evaluation_result_id bigint NOT NULL UNIQUE REFERENCES m2_evaluation_results(id) ON DELETE RESTRICT,
  standard_work_id text NOT NULL REFERENCES standard_work(standard_work_id) ON DELETE RESTRICT,
  cutoff_month date NOT NULL CHECK (cutoff_month = date_trunc('month', cutoff_month)::date),
  latest_complete_month date NOT NULL CHECK (latest_complete_month = date_trunc('month', latest_complete_month)::date),
  income_fact_version text,
  source_batch_ids bigint[] NOT NULL DEFAULT ARRAY[]::bigint[],
  mapping_version_id bigint NOT NULL REFERENCES mapping_version(id) ON DELETE RESTRICT,
  basic_info_version_id bigint NOT NULL REFERENCES basic_info_version(id) ON DELETE RESTRICT,
  copyright_start date,
  copyright_end date,
  remaining_copyright_months integer CHECK (remaining_copyright_months IS NULL OR remaining_copyright_months >= 0),
  last3_revenue numeric(32,18) NOT NULL DEFAULT 0,
  last6_revenue numeric(32,18) NOT NULL DEFAULT 0,
  last12_revenue numeric(32,18) NOT NULL DEFAULT 0,
  last24_revenue numeric(32,18) NOT NULL DEFAULT 0,
  total_historical_revenue numeric(32,18) NOT NULL DEFAULT 0,
  active_month_count integer NOT NULL DEFAULT 0 CHECK (active_month_count >= 0),
  zero_revenue_month_count integer NOT NULL DEFAULT 0 CHECK (zero_revenue_month_count >= 0),
  business_form_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  channel_concentration_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  incomplete_months_excluded date[] NOT NULL DEFAULT ARRAY[]::date[],
  input_hash text NOT NULL CHECK (btrim(input_hash) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (latest_complete_month <= cutoff_month),
  CHECK (copyright_start IS NULL OR copyright_end IS NULL OR copyright_start <= copyright_end)
);

CREATE INDEX idx_m2_eval_input_snapshots_standard_work_id
  ON m2_evaluation_input_snapshots(standard_work_id);

CREATE INDEX idx_m2_eval_input_snapshots_cutoff_month
  ON m2_evaluation_input_snapshots(cutoff_month);

CREATE INDEX idx_m2_eval_input_snapshots_mapping_version
  ON m2_evaluation_input_snapshots(mapping_version_id);

CREATE INDEX idx_m2_eval_input_snapshots_input_hash
  ON m2_evaluation_input_snapshots(input_hash);

CREATE TABLE m2_evaluation_risks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  evaluation_result_id bigint NOT NULL REFERENCES m2_evaluation_results(id) ON DELETE RESTRICT,
  risk_code text NOT NULL CHECK (btrim(risk_code) <> ''),
  severity text NOT NULL CHECK (severity IN ('low','medium','high')),
  risk_type text NOT NULL CHECK (risk_type IN ('blocking','advisory','warning')),
  is_blocking boolean NOT NULL DEFAULT false,
  is_advisory boolean NOT NULL DEFAULT false,
  evidence_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  mitigation_hint text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evaluation_result_id, risk_code, risk_type),
  CHECK (NOT (is_blocking = true AND is_advisory = true)),
  CHECK (risk_type <> 'blocking' OR is_blocking = true),
  CHECK (risk_type <> 'advisory' OR is_advisory = true)
);

CREATE INDEX idx_m2_eval_risks_result
  ON m2_evaluation_risks(evaluation_result_id);

CREATE INDEX idx_m2_eval_risks_risk_code
  ON m2_evaluation_risks(risk_code);

CREATE INDEX idx_m2_eval_risks_type_severity
  ON m2_evaluation_risks(risk_type, severity);

CREATE INDEX idx_m2_eval_risks_is_blocking
  ON m2_evaluation_risks(is_blocking);

CREATE INDEX idx_m2_eval_risks_created_at
  ON m2_evaluation_risks(created_at);

CREATE TABLE m2_evaluation_suggestions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  evaluation_result_id bigint NOT NULL REFERENCES m2_evaluation_results(id) ON DELETE RESTRICT,
  suggestion_code text NOT NULL CHECK (btrim(suggestion_code) <> ''),
  priority integer NOT NULL CHECK (priority >= 1),
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  expected_impact text,
  requires_manual_confirmation boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evaluation_result_id, suggestion_code)
);

CREATE INDEX idx_m2_eval_suggestions_result
  ON m2_evaluation_suggestions(evaluation_result_id);

CREATE INDEX idx_m2_eval_suggestions_code_priority
  ON m2_evaluation_suggestions(suggestion_code, priority);

CREATE INDEX idx_m2_eval_suggestions_created_at
  ON m2_evaluation_suggestions(created_at);

CREATE TABLE m2_evaluation_review_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  evaluation_result_id bigint NOT NULL REFERENCES m2_evaluation_results(id) ON DELETE RESTRICT,
  standard_work_id text NOT NULL REFERENCES standard_work(standard_work_id) ON DELETE RESTRICT,
  review_type text NOT NULL CHECK (review_type IN ('blocking_manual_review','advisory_review')),
  review_reason_code text NOT NULL CHECK (btrim(review_reason_code) <> ''),
  review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','approved','data_fix_required','waiver_granted','rejected_for_formal','no_action_required')),
  review_priority integer NOT NULL DEFAULT 100 CHECK (review_priority >= 1),
  is_blocking boolean NOT NULL DEFAULT false,
  assigned_to text,
  reviewed_by text,
  reviewed_at timestamptz,
  decision text,
  decision_reason text,
  audit_metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evaluation_result_id, review_type, review_reason_code),
  CHECK (review_type <> 'blocking_manual_review' OR is_blocking = true),
  CHECK (review_status <> 'pending' OR reviewed_at IS NULL),
  CHECK (review_status = 'pending' OR reviewed_by IS NOT NULL),
  CHECK (review_status = 'pending' OR decision IS NOT NULL)
);

CREATE INDEX idx_m2_eval_review_items_result
  ON m2_evaluation_review_items(evaluation_result_id);

CREATE INDEX idx_m2_eval_review_items_standard_work_id
  ON m2_evaluation_review_items(standard_work_id);

CREATE INDEX idx_m2_eval_review_items_status
  ON m2_evaluation_review_items(review_status);

CREATE INDEX idx_m2_eval_review_items_blocking_status_priority
  ON m2_evaluation_review_items(is_blocking, review_status, review_priority, created_at);

CREATE INDEX idx_m2_eval_review_items_reason
  ON m2_evaluation_review_items(review_reason_code);

CREATE INDEX idx_m2_eval_review_items_created_at
  ON m2_evaluation_review_items(created_at);

COMMENT ON TABLE m2_evaluation_algorithm_versions IS
  'M2 algorithm version registry for authorized local real-data development and future formal release control.';

COMMENT ON TABLE m2_evaluation_results IS
  'M2 evaluation result snapshots. Local development migration; not a final release approval by itself.';

COMMENT ON TABLE m2_evaluation_input_snapshots IS
  'M2 aggregate input snapshot table storing version references and aggregate metrics, not raw bill rows.';

COMMENT ON TABLE m2_evaluation_risks IS
  'M2 risk facts split from evaluation results for blocking and advisory review policies.';

COMMENT ON TABLE m2_evaluation_suggestions IS
  'M2 action suggestions split from evaluation results for reviewable downstream decisions.';

COMMENT ON TABLE m2_evaluation_review_items IS
  'M2 blocking and advisory review work queue generated from evaluation results.';

GRANT SELECT ON
  m1.m2_evaluation_algorithm_versions,
  m1.m2_evaluation_results,
  m1.m2_evaluation_input_snapshots,
  m1.m2_evaluation_risks,
  m1.m2_evaluation_suggestions,
  m1.m2_evaluation_review_items
TO application_ro, application_rw, background_worker;

GRANT INSERT, UPDATE ON
  m1.m2_evaluation_algorithm_versions,
  m1.m2_evaluation_results,
  m1.m2_evaluation_input_snapshots,
  m1.m2_evaluation_risks,
  m1.m2_evaluation_suggestions,
  m1.m2_evaluation_review_items
TO application_rw, background_worker;

GRANT USAGE, SELECT ON SEQUENCE
  m1.m2_evaluation_algorithm_versions_id_seq,
  m1.m2_evaluation_results_id_seq,
  m1.m2_evaluation_input_snapshots_id_seq,
  m1.m2_evaluation_risks_id_seq,
  m1.m2_evaluation_suggestions_id_seq,
  m1.m2_evaluation_review_items_id_seq
TO application_rw, background_worker;
