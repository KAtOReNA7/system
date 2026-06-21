-- M1 mapping_version local rehearsal assertions v0.2
-- EXPERIMENT ONLY. Do not place in db/migrations. Do not run against production.
-- Requires psql variable: stage_json
-- Purpose:
--   G06: verify Y167972 folds from 2 effective sources into 1 physical DB mapping row
--        while retaining 2 audit source records.
--   G07: verify user-confirmed strategy moves 161280/161284/161290 out of
--        raw_work_id_mapping and into historical_volume_mapping for 161260/audio_copyright.

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
  audit_source_count integer,
  adjustment_reason text,
  is_general_rule boolean
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
  priority_rank integer,
  g07_adjustment boolean,
  is_general_rule boolean
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

WITH g07 AS (
  SELECT
    (SELECT count(*) FROM tmp_m1_mapping_physical
      WHERE physical_table='raw_work_id_mapping'
        AND raw_work_id IN ('161280','161284','161290')
        AND target_standard_work_id='161260'
        AND business_form='audio_copyright') AS raw_rows,
    (SELECT count(*) FROM tmp_m1_mapping_physical
      WHERE physical_table='historical_volume_mapping'
        AND raw_work_id IN ('161280','161284','161290')
        AND target_standard_work_id='161260'
        AND business_form='audio_copyright') AS historical_rows,
    (SELECT coalesce(sum(audit_source_count),0) FROM tmp_m1_mapping_physical
      WHERE physical_table='historical_volume_mapping'
        AND raw_work_id IN ('161280','161284','161290')
        AND target_standard_work_id='161260'
        AND business_form='audio_copyright') AS audit_source_records,
    (SELECT count(*) FROM tmp_m1_mapping_physical
      WHERE physical_table='historical_volume_mapping'
        AND raw_work_id IN ('161280','161284','161290')
        AND target_standard_work_id='161260'
        AND business_form='audio_copyright'
        AND coalesce(is_general_rule,false)=true) AS general_rule_rows,
    (SELECT string_agg(source_task_ids,'; ' ORDER BY raw_work_id) FROM tmp_m1_mapping_physical
      WHERE physical_table='historical_volume_mapping'
        AND raw_work_id IN ('161280','161284','161290')
        AND target_standard_work_id='161260'
        AND business_form='audio_copyright') AS source_task_ids
)
INSERT INTO tmp_m1_rehearsal_result
SELECT
  'G07_REVISED_STRATEGY',
  CASE
    WHEN raw_rows=0
     AND historical_rows=3
     AND audit_source_records=3
     AND general_rule_rows=0
     AND source_task_ids LIKE '%IMPORT-BLOCK::161280%'
     AND source_task_ids LIKE '%IMPORT-BLOCK::161284%'
     AND source_task_ids LIKE '%IMPORT-BLOCK::161290%'
    THEN 'PASS'
    ELSE 'FAIL'
  END,
  format(
    'raw_rows=%s, historical_rows=%s, audit_source_records=%s, general_rule_rows=%s, source_task_ids=%s',
    raw_rows, historical_rows, audit_source_records, general_rule_rows, source_task_ids
  )
FROM g07;

INSERT INTO tmp_m1_rehearsal_result
SELECT
  'G07_RAW_IDENTITY_COMPATIBILITY',
  CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END,
  'raw_work_id_mapping identity incompatible rows=' || count(*)
FROM tmp_m1_mapping_physical
WHERE physical_table='raw_work_id_mapping'
  AND (
    derive_standard_work_id(raw_work_id) IS DISTINCT FROM target_standard_work_id
    OR derive_business_form(raw_work_id) IS DISTINCT FROM business_form
  );

INSERT INTO tmp_m1_rehearsal_result
SELECT
  'G07_RAW_UNIQUE_COMPATIBILITY',
  CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END,
  'raw_work_id_mapping duplicate target/form groups=' || count(*)
FROM (
  SELECT target_standard_work_id,business_form
  FROM tmp_m1_mapping_physical
  WHERE physical_table='raw_work_id_mapping'
  GROUP BY target_standard_work_id,business_form
  HAVING count(*)>1
) s;

TABLE tmp_m1_rehearsal_result ORDER BY gate_id;

ROLLBACK;
