-- AUTHORIZED LOCAL FORMAL-READINESS MIGRATION
-- Layer: 0071
-- Dependencies: V0070_000__m2_evaluation_persistence.sql.
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL).
-- Irreversible: yes; forward-only migration, no down migration.
-- Boundary: execute only in the explicitly authorized local PostgreSQL environment.

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

ALTER TABLE basic_info_version_work
  DROP CONSTRAINT basic_info_version_work_check;

ALTER TABLE basic_info_version_work
  ADD COLUMN copyright_end_type text NOT NULL DEFAULT 'unknown',
  ADD COLUMN copyright_end_value text,
  ADD COLUMN work_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN audio_rights_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN source_metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE basic_info_version_work
SET copyright_end_type = CASE
      WHEN copyright_end_date IS NOT NULL THEN 'exact_date'
      ELSE 'unknown'
    END,
    copyright_end_value = CASE
      WHEN copyright_end_date IS NOT NULL THEN copyright_end_date::text
      ELSE NULL
    END;

ALTER TABLE basic_info_version_work
  ADD CONSTRAINT ck_basic_info_copyright_end_type
    CHECK (copyright_end_type IN (
      'exact_date',
      'perpetual',
      'relative_term',
      'year_only',
      'expired_unknown_date',
      'unknown'
    )),
  ADD CONSTRAINT ck_basic_info_copyright_end_shape
    CHECK ((copyright_end_type = 'exact_date') = (copyright_end_date IS NOT NULL)),
  ADD CONSTRAINT ck_basic_info_copyright_end_value
    CHECK (
      (copyright_end_type = 'unknown' AND copyright_end_value IS NULL)
      OR
      (copyright_end_type <> 'unknown' AND btrim(coalesce(copyright_end_value, '')) <> '')
    ),
  ADD CONSTRAINT ck_basic_info_exact_end_value
    CHECK (copyright_end_type <> 'exact_date' OR copyright_end_value = copyright_end_date::text),
  ADD CONSTRAINT ck_basic_info_work_status
    CHECK (work_status IN ('listed', 'delisted', 'unknown')),
  ADD CONSTRAINT ck_basic_info_audio_rights_status
    CHECK (audio_rights_status IN ('active', 'perpetual', 'expired', 'unknown', 'pending_review')),
  ADD CONSTRAINT ck_basic_info_perpetual_consistency
    CHECK (
      (copyright_end_type = 'perpetual') = (audio_rights_status = 'perpetual')
      OR audio_rights_status = 'unknown'
    ),
  ADD CONSTRAINT ck_basic_info_expired_unknown_consistency
    CHECK (copyright_end_type <> 'expired_unknown_date' OR audio_rights_status = 'expired');

ALTER TABLE m2_evaluation_results
  ADD COLUMN forecastability_status text,
  ADD COLUMN forecast_confidence text,
  ADD COLUMN selected_forecast_model text,
  ADD COLUMN evaluation_metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT ck_m2_eval_forecastability_status
    CHECK (
      forecastability_status IS NULL
      OR forecastability_status IN (
        'numeric_forecast_eligible',
        'conservative_numeric_forecast',
        'observe_only_no_numeric_forecast',
        'true_forecast_blocked'
      )
    ),
  ADD CONSTRAINT ck_m2_eval_forecast_confidence
    CHECK (forecast_confidence IS NULL OR forecast_confidence IN ('low', 'medium', 'high', 'unknown'));

CREATE INDEX idx_m2_eval_results_forecastability_status
  ON m2_evaluation_results(forecastability_status);

ALTER TABLE m2_evaluation_input_snapshots
  ADD COLUMN copyright_end_type text NOT NULL DEFAULT 'unknown',
  ADD COLUMN copyright_end_value text,
  ADD COLUMN work_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN audio_rights_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN classification_path_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN auxiliary_tags_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN snapshot_metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT ck_m2_snapshot_copyright_end_type
    CHECK (copyright_end_type IN (
      'exact_date',
      'perpetual',
      'relative_term',
      'year_only',
      'expired_unknown_date',
      'unknown'
    )),
  ADD CONSTRAINT ck_m2_snapshot_copyright_end_shape
    CHECK ((copyright_end_type = 'exact_date') = (copyright_end IS NOT NULL)),
  ADD CONSTRAINT ck_m2_snapshot_copyright_end_value
    CHECK (
      (copyright_end_type = 'unknown' AND copyright_end_value IS NULL)
      OR
      (copyright_end_type <> 'unknown' AND btrim(coalesce(copyright_end_value, '')) <> '')
    ),
  ADD CONSTRAINT ck_m2_snapshot_work_status
    CHECK (work_status IN ('listed', 'delisted', 'unknown')),
  ADD CONSTRAINT ck_m2_snapshot_audio_rights_status
    CHECK (audio_rights_status IN ('active', 'perpetual', 'expired', 'unknown', 'pending_review'));

COMMENT ON COLUMN basic_info_version_work.copyright_end_type IS
  'Controlled term type preserving exact, perpetual, relative, year-only, and expired-with-unknown-date semantics.';

COMMENT ON COLUMN basic_info_version_work.copyright_end_value IS
  'Controlled source value for the copyright term; never replaced with a fabricated date.';

COMMENT ON COLUMN m2_evaluation_results.evaluation_metadata_json IS
  'Aggregate formal-evaluation evidence and model-selection metadata; raw bill rows are forbidden.';
