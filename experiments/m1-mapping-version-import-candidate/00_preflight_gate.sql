-- M1 mapping_version controlled import preflight candidate v0.1
-- EXPERIMENT ONLY. Do not place in db/migrations. Do not run against production.
-- Intended next step: local isolated database dry-run only.

\set ON_ERROR_STOP on
SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

-- Load mapping_import_stage-v0.1.json into a psql variable before execution, for example:
--   \set stage_json `type experiments/m1-mapping-version-import-candidate/mapping_import_stage-v0.1.json`
-- This file intentionally performs preflight checks only and must not activate a mapping version.

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

CREATE TEMP TABLE tmp_m1_mapping_gate_result(gate_id text, status text, detail text);

INSERT INTO tmp_m1_mapping_gate_result
SELECT 'COUNT_PHYSICAL_ROWS',
       CASE WHEN count(*)=352 THEN 'PASS' ELSE 'FAIL' END,
       'expected 352, actual ' || count(*)
FROM tmp_m1_mapping_stage;

INSERT INTO tmp_m1_mapping_gate_result
SELECT 'NO_RAW_TARGET_CONFLICT',
       CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END,
       'same raw_work_id mapped to multiple target_standard_work_id count=' || count(*)
FROM (
  SELECT raw_work_id
  FROM tmp_m1_mapping_stage
  GROUP BY raw_work_id
  HAVING count(DISTINCT target_standard_work_id)>1
) s;

INSERT INTO tmp_m1_mapping_gate_result
SELECT 'RAW_TABLE_UNIQUE_COMPATIBILITY',
       CASE WHEN count(*)=0 THEN 'PASS' ELSE 'NEEDS_LOCAL_REHEARSAL' END,
       'raw_work_id_mapping target/form duplicate groups=' || count(*)
FROM (
  SELECT target_standard_work_id,business_form
  FROM tmp_m1_mapping_stage
  WHERE physical_table='raw_work_id_mapping'
  GROUP BY target_standard_work_id,business_form
  HAVING count(*)>1
) s;

INSERT INTO tmp_m1_mapping_gate_result
SELECT 'RAW_TABLE_IDENTITY_COMPATIBILITY',
       CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END,
       'raw_work_id_mapping rows incompatible with derive_standard_work_id/derive_business_form=' || count(*)
FROM tmp_m1_mapping_stage
WHERE physical_table='raw_work_id_mapping'
  AND (
    derive_standard_work_id(raw_work_id) IS DISTINCT FROM target_standard_work_id
    OR derive_business_form(raw_work_id) IS DISTINCT FROM business_form
  );

INSERT INTO tmp_m1_mapping_gate_result
SELECT 'HISTORICAL_TABLE_UNIQUE_COMPATIBILITY',
       CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END,
       'historical_raw_work_id duplicate groups=' || count(*)
FROM (
  SELECT raw_work_id
  FROM tmp_m1_mapping_stage
  WHERE physical_table='historical_volume_mapping'
  GROUP BY raw_work_id
  HAVING count(*)>1
) s;

INSERT INTO tmp_m1_mapping_gate_result
SELECT 'HISTORICAL_TABLE_IDENTITY_COMPATIBILITY',
       CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END,
       'historical_volume_mapping rows incompatible with derive_standard_work_id/derive_business_form=' || count(*)
FROM tmp_m1_mapping_stage
WHERE physical_table='historical_volume_mapping'
  AND (
    derive_standard_work_id(raw_work_id) IS NULL
    OR derive_business_form(raw_work_id) IS DISTINCT FROM business_form
  );

INSERT INTO tmp_m1_mapping_gate_result
SELECT 'VALID_BUSINESS_FORM',
       CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END,
       'invalid business_form rows=' || count(*)
FROM tmp_m1_mapping_stage
WHERE business_form NOT IN ('audio_copyright','audio_product');

TABLE tmp_m1_mapping_gate_result ORDER BY gate_id;
