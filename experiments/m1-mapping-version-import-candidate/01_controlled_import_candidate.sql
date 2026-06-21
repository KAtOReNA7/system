-- M1 mapping_version controlled import candidate v0.1
-- EXPERIMENT ONLY. Do not place in db/migrations. Do not run against production.
-- This script is a dry-run template for a local isolated database. It must end in ROLLBACK.
-- Candidate: m1_mapping_candidate_v0.1_20260621 (MVC-M1-V0.1-20260621)

\set ON_ERROR_STOP on
SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

BEGIN;

-- Required caller-provided variables for local isolated rehearsal:
--   \set candidate_version_no 2026062101
--   \set actor 'local_rehearsal'
--   \set stage_json `type experiments/m1-mapping-version-import-candidate/mapping_import_stage-v0.1.json`

CREATE TEMP TABLE tmp_m1_mapping_stage AS
SELECT *
FROM jsonb_to_recordset((:'stage_json')::jsonb -> 'physical_plan_rows') AS x(
  physical_table text,
  raw_work_id text,
  target_standard_work_id text,
  business_form text,
  source_layer text,
  mapping_ids text,
  source_task_ids text,
  source_basis text,
  is_exception boolean,
  audit_source_count integer
);

-- Hard stop for known schema compatibility issue until rehearsal owner chooses a resolution.
DO $$
DECLARE v_conflict_count integer;
BEGIN
  SELECT count(*) INTO v_conflict_count
  FROM (
    SELECT target_standard_work_id,business_form
    FROM tmp_m1_mapping_stage
    WHERE physical_table='raw_work_id_mapping'
    GROUP BY target_standard_work_id,business_form
    HAVING count(*)>1
  ) s;
  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION 'raw_work_id_mapping unique constraint rehearsal gate: % duplicate target/form groups require resolution before insert', v_conflict_count;
  END IF;
END $$;

WITH task_insert AS (
  INSERT INTO background_task(task_type, logical_operation_key, idempotency_key, status, finished_at, business_stage, payload, created_by)
  VALUES (
    'mapping_version_import_rehearsal',
    'MVC-M1-V0.1-20260621',
    'MVC-M1-V0.1-20260621:local-dry-run',
    'succeeded',
    clock_timestamp(),
    'controlled_import_preparation',
    jsonb_build_object(
      'candidate_version', 'm1_mapping_candidate_v0.1_20260621',
      'source_bill_sha256', 'b7ed5b08bcfde56d78d0df5fbe63a084c45467b520fd2dda6ce2f822c0d6ba94',
      'source_bill_rows', 192872
    ),
    :'actor'
  )
  RETURNING id
),
version_insert AS (
  INSERT INTO mapping_version(version_no, status, trigger_type, trigger_ref, build_task_id, created_by)
  SELECT :'candidate_version_no'::bigint, 'building', 'ops_candidate_import_rehearsal', 'MVC-M1-V0.1-20260621', id, :'actor'
  FROM task_insert
  RETURNING id
),
run_insert AS (
  INSERT INTO issue_run(run_type, mapping_version_id, status, created_by)
  SELECT 'mapping', id, 'completed', :'actor'
  FROM version_insert
  RETURNING id
),
issue_source AS (
  SELECT
    source_task_ids,
    string_agg(DISTINCT mapping_ids, '; ' ORDER BY mapping_ids) AS mapping_ids,
    string_agg(DISTINCT source_basis, '; ' ORDER BY source_basis) AS source_basis
  FROM tmp_m1_mapping_stage
  GROUP BY source_task_ids
),
issue_insert AS (
  INSERT INTO data_issue(issue_run_id, issue_type, severity, blocking, group_key, sample_ref, status, created_by)
  SELECT
    (SELECT id FROM run_insert),
    'ops_mapping_confirmation_source',
    'info',
    false,
    source_task_ids,
    jsonb_build_object('mapping_ids', mapping_ids, 'source_basis', source_basis),
    'resolved',
    :'actor'
  FROM issue_source
  RETURNING id, group_key
),
standard_work_upsert AS (
  INSERT INTO standard_work(standard_work_id, identity_source, created_by)
  SELECT DISTINCT target_standard_work_id, 'ops_confirmed', :'actor'
  FROM tmp_m1_mapping_stage
  ON CONFLICT (standard_work_id) DO NOTHING
),
business_form_upsert AS (
  INSERT INTO work_business_form(standard_work_id, business_form, created_by)
  SELECT DISTINCT target_standard_work_id, business_form, :'actor'
  FROM tmp_m1_mapping_stage
  ON CONFLICT (standard_work_id,business_form) DO NOTHING
),
raw_insert AS (
  INSERT INTO raw_work_id_mapping(mapping_version_id, raw_work_id, standard_work_id, business_form, mapping_source, confirmed_issue_id)
  SELECT (SELECT id FROM version_insert), s.raw_work_id, s.target_standard_work_id, s.business_form, 'ops_confirmed', i.id
  FROM tmp_m1_mapping_stage s
  LEFT JOIN issue_insert i ON i.group_key=s.source_task_ids
  WHERE s.physical_table='raw_work_id_mapping'
  RETURNING id
),
historical_insert AS (
  INSERT INTO historical_volume_mapping(mapping_version_id, historical_raw_work_id, target_standard_work_id, business_form, confirmed_issue_id)
  SELECT (SELECT id FROM version_insert), s.raw_work_id, s.target_standard_work_id, s.business_form, i.id
  FROM tmp_m1_mapping_stage s
  JOIN issue_insert i ON i.group_key=s.source_task_ids
  WHERE s.physical_table='historical_volume_mapping'
  RETURNING id
)
SELECT
  (SELECT count(*) FROM raw_insert) AS raw_work_id_mapping_inserted,
  (SELECT count(*) FROM historical_insert) AS historical_volume_mapping_inserted,
  (SELECT id FROM version_insert) AS rehearsal_mapping_version_id;

-- Forbidden in this rehearsal:
--   SELECT switch_mapping_version(...);
--   UPDATE mapping_version SET status='active';
--   importing real bills or changing income facts.

ROLLBACK;
