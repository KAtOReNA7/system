-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0060
-- Dependencies: from prototype 0060_functions_views\0060_functions.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 6 functions triggers views permissions

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE FUNCTION assert_mapping_coverage(p_mapping_version_id bigint, p_include_batch_id bigint DEFAULT NULL,
  p_exclude_batch_id bigint DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, m1
AS $fn$
DECLARE v_expected_count bigint; v_projection_count bigint; v_expected_total numeric; v_projection_total numeric;
BEGIN
  SELECT count(*),COALESCE(sum(f.actual_sales_amount),0) INTO v_expected_count,v_expected_total
  FROM m1.income_fact f JOIN m1.import_batch b ON b.id=f.import_batch_id
  WHERE (b.status='active' OR b.id=p_include_batch_id) AND (p_exclude_batch_id IS NULL OR b.id<>p_exclude_batch_id);

  SELECT count(*),COALESCE(sum(f.actual_sales_amount),0) INTO v_projection_count,v_projection_total
  FROM m1.income_projection p JOIN m1.income_fact f ON f.id=p.income_fact_id
  JOIN m1.import_batch b ON b.id=f.import_batch_id
  WHERE p.mapping_version_id=p_mapping_version_id
    AND (b.status='active' OR b.id=p_include_batch_id) AND (p_exclude_batch_id IS NULL OR b.id<>p_exclude_batch_id);

  IF v_expected_count<>v_projection_count OR v_expected_total<>v_projection_total THEN
    RAISE EXCEPTION 'mapping % coverage mismatch expected %/% got %/%',p_mapping_version_id,v_expected_count,v_expected_total,v_projection_count,v_projection_total;
  END IF;
  IF EXISTS (SELECT 1 FROM m1.income_projection p JOIN m1.income_fact f ON f.id=p.income_fact_id
             JOIN m1.import_batch b ON b.id=f.import_batch_id
             WHERE p.mapping_version_id=p_mapping_version_id
               AND NOT ((b.status='active' OR b.id=p_include_batch_id) AND (p_exclude_batch_id IS NULL OR b.id<>p_exclude_batch_id))) THEN
    RAISE EXCEPTION 'mapping % contains facts outside visible batch set',p_mapping_version_id;
  END IF;
END
$fn$;
