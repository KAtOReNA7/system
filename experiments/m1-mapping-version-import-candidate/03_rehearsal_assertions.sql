-- M1 mapping_version local rehearsal assertions v0.1
-- EXPERIMENT ONLY. Do not place in db/migrations. Do not run against production.
-- Requires psql variable: stage_json
-- Purpose:
--   G06: verify Y167972 folds from 2 effective sources into 1 physical DB mapping row
--        while retaining 2 audit source records.
--   G07: verify direct raw_work_id_mapping insertion for target 161260/audio_copyright
--        with raw IDs 161280, 161284, 161290 is incompatible with the current
--        physical model. The identity trigger rejects these rows before the
--        UNIQUE(mapping_version_id, standard_work_id, business_form) constraint
--        can be reached, because numeric raw IDs derive to themselves.

\set ON_ERROR_STOP on
SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

BEGIN;

CREATE TEMP TABLE tmp_m1_mapping_physical AS
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

CREATE TEMP TABLE tmp_m1_mapping_effective AS
SELECT *
FROM jsonb_to_recordset((:'stage_json')::jsonb -> 'effective_mapping_snapshot') AS x(
  mapping_id text,
  layer text,
  source_input_row_id text,
  raw_work_id text,
  business_form_key text,
  target_standard_work_id text,
  historical_standard_work_id text,
  source_task_id text,
  special_review_task_id text,
  special_review_group_id text,
  source_basis jsonb,
  source_trace text,
  other_id_treatment text,
  is_exception boolean,
  requires_final_human_confirmation boolean,
  is_auto_applicable boolean,
  status text,
  effective_status text,
  priority_rule text,
  priority_rank integer
);

CREATE TEMP TABLE tmp_m1_rehearsal_result(
  gate_id text,
  status text,
  detail text
);

WITH g06 AS (
  SELECT
    (SELECT count(*) FROM tmp_m1_mapping_effective WHERE raw_work_id='Y167972') AS effective_source_records,
    (SELECT count(*) FROM tmp_m1_mapping_physical WHERE raw_work_id='Y167972') AS physical_rows,
    (SELECT coalesce(sum(audit_source_count),0) FROM tmp_m1_mapping_physical WHERE raw_work_id='Y167972') AS audit_source_records,
    (SELECT bool_or(is_exception) FROM tmp_m1_mapping_physical WHERE raw_work_id='Y167972') AS has_exception,
    (SELECT string_agg(source_task_ids,'; ') FROM tmp_m1_mapping_physical WHERE raw_work_id='Y167972') AS source_task_ids
)
INSERT INTO tmp_m1_rehearsal_result
SELECT
  'G06_Y167972_FOLD',
  CASE
    WHEN effective_source_records=2
     AND physical_rows=1
     AND audit_source_records=2
     AND has_exception IS TRUE
     AND source_task_ids LIKE '%MERGE::167972%169792%'
     AND source_task_ids LIKE '%MERGE::167972%167996%'
    THEN 'PASS'
    ELSE 'FAIL'
  END,
  format(
    'effective_source_records=%s, physical_rows=%s, audit_source_records=%s, has_exception=%s, source_task_ids=%s',
    effective_source_records, physical_rows, audit_source_records, has_exception, source_task_ids
  )
FROM g06;

WITH task_insert AS (
  INSERT INTO background_task(task_type, logical_operation_key, idempotency_key, status, finished_at, business_stage, payload, created_by)
  VALUES (
    'mapping_version_import_rehearsal_assertion',
    'MVC-M1-V0.1-20260621:G07',
    'MVC-M1-V0.1-20260621:G07',
    'succeeded',
    clock_timestamp(),
    'local_docker_rehearsal',
    '{}'::jsonb,
    'local_docker_rehearsal'
  )
  RETURNING id
),
version_insert AS (
  INSERT INTO mapping_version(version_no, status, trigger_type, trigger_ref, build_task_id, created_by)
  SELECT 202606210103::bigint, 'building', 'ops_candidate_import_rehearsal_assertion', 'MVC-M1-V0.1-20260621:G07', id, 'local_docker_rehearsal'
  FROM task_insert
  RETURNING id
),
standard_work_upsert AS (
  INSERT INTO standard_work(standard_work_id, identity_source, created_by)
  VALUES ('161260', 'ops_confirmed', 'local_docker_rehearsal')
  ON CONFLICT (standard_work_id) DO NOTHING
),
business_form_upsert AS (
  INSERT INTO work_business_form(standard_work_id, business_form, created_by)
  VALUES ('161260', 'audio_copyright', 'local_docker_rehearsal')
  ON CONFLICT (standard_work_id,business_form) DO NOTHING
)
SELECT id AS g07_mapping_version_id
INTO TEMP TABLE tmp_g07_mapping_version
FROM version_insert;

DO $$
DECLARE
  v_mapping_version_id bigint;
  v_message text;
  v_constraint text;
BEGIN
  SELECT g07_mapping_version_id INTO v_mapping_version_id FROM tmp_g07_mapping_version;

  BEGIN
    INSERT INTO raw_work_id_mapping(mapping_version_id, raw_work_id, standard_work_id, business_form, mapping_source)
    VALUES (v_mapping_version_id, '161280', '161260', 'audio_copyright', 'ops_confirmed');

    INSERT INTO tmp_m1_rehearsal_result
    VALUES ('G07_RAW_IDENTITY_COMPATIBILITY', 'FAIL', 'real G07 raw mapping insert unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    INSERT INTO tmp_m1_rehearsal_result
    VALUES (
      'G07_RAW_IDENTITY_COMPATIBILITY',
      CASE WHEN v_message LIKE 'raw work ID 161280 does not derive standard work ID 161260%' THEN 'EXPECTED_CONFLICT' ELSE 'FAIL' END,
      format('direct insert result for 161280 -> 161260: message=%s, constraint=%s', v_message, coalesce(v_constraint,''))
    );
  END;

  INSERT INTO tmp_m1_rehearsal_result
  VALUES (
    'G07_RAW_UNIQUE_COMPATIBILITY',
    'BLOCKED_BY_IDENTITY_RULE',
    'plan has 3 raw_work_id_mapping rows for 161260/audio_copyright, but current identity trigger rejects 161280/161284/161290 -> 161260 before UNIQUE(mapping_version_id,standard_work_id,business_form) can be reached'
  );
END $$;

INSERT INTO tmp_m1_rehearsal_result
SELECT
  'G07_MAIN_RAW_ID_CONFIRMATION',
  'NEEDS_USER_CONFIRMATION',
  'candidate package does not identify which of 161280/161284/161290 is the human-confirmed main regular raw ID; do not let rules choose automatically'
WHERE EXISTS (
  SELECT 1
  FROM tmp_m1_mapping_physical
  WHERE physical_table='raw_work_id_mapping'
    AND target_standard_work_id='161260'
    AND business_form='audio_copyright'
  GROUP BY target_standard_work_id,business_form
  HAVING count(*)=3
);

TABLE tmp_m1_rehearsal_result ORDER BY gate_id;

ROLLBACK;
