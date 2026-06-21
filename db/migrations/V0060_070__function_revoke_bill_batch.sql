-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0060
-- Dependencies: from prototype 0060_functions_views\0060_functions.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 6 functions triggers views permissions

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE FUNCTION revoke_bill_batch(p_batch_id bigint,p_mapping_version_id bigint,p_actor text DEFAULT current_user) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, m1
AS $fn$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('m1.version-switch',0));
  PERFORM 1 FROM m1.system_state WHERE id=1 AND lifecycle_status='operational' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'revoke requires operational'; END IF;
  PERFORM 1 FROM m1.import_batch WHERE id=p_batch_id AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'batch % is not active',p_batch_id; END IF;
  PERFORM 1 FROM m1.mapping_version WHERE id=p_mapping_version_id AND status='validated' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'mapping % is not validated',p_mapping_version_id; END IF;
  PERFORM m1.assert_mapping_coverage(p_mapping_version_id,NULL,p_batch_id);
  PERFORM set_config('m1.switch_context','authorized',true);
  UPDATE m1.mapping_version SET status='retired',retired_at=clock_timestamp() WHERE status='active';
  UPDATE m1.mapping_version SET status='active',activated_at=clock_timestamp() WHERE id=p_mapping_version_id;
  UPDATE m1.import_batch SET status='revoked',revoked_at=clock_timestamp() WHERE id=p_batch_id;
  INSERT INTO m1.batch_impact_record(event_key,event_type,import_batch_id,mapping_version_id,payload)
  VALUES('batch-revoked:'||p_batch_id||':'||p_mapping_version_id,'batch_revoked',p_batch_id,p_mapping_version_id,'{}')
  ON CONFLICT(event_key) DO NOTHING;
END
$fn$;
