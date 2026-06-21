-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0060
-- Dependencies: from prototype 0060_functions_views\0060_functions.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 6 functions triggers views permissions

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE FUNCTION switch_basic_info_version(p_basic_info_version_id bigint,p_actor text DEFAULT current_user) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, m1
AS $fn$
DECLARE v_class bigint; v_tag bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('m1.version-switch',0));
  PERFORM 1 FROM m1.system_state WHERE id=1 AND lifecycle_status='operational' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'basic-info switch requires operational'; END IF;
  SELECT classification_release_id,tag_release_id INTO v_class,v_tag FROM m1.basic_info_version
    WHERE id=p_basic_info_version_id AND status='validated' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'basic-info version % is not validated',p_basic_info_version_id; END IF;
  IF NOT EXISTS(SELECT 1 FROM m1.classification_release WHERE id=v_class AND status IN ('draft','active'))
     OR NOT EXISTS(SELECT 1 FROM m1.tag_release WHERE id=v_tag AND status IN ('draft','active')) THEN
    RAISE EXCEPTION 'basic-info version references a release that cannot be activated';
  END IF;
  PERFORM set_config('m1.switch_context','authorized',true);
  IF NOT EXISTS(SELECT 1 FROM m1.classification_release WHERE id=v_class AND status='active') THEN
    UPDATE m1.classification_release SET status='retired',retired_at=clock_timestamp() WHERE status='active';
    UPDATE m1.classification_release SET status='active',activated_at=clock_timestamp() WHERE id=v_class;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM m1.tag_release WHERE id=v_tag AND status='active') THEN
    UPDATE m1.tag_release SET status='retired',retired_at=clock_timestamp() WHERE status='active';
    UPDATE m1.tag_release SET status='active',activated_at=clock_timestamp() WHERE id=v_tag;
  END IF;
  UPDATE m1.basic_info_version SET status='retired',retired_at=clock_timestamp() WHERE status='active';
  UPDATE m1.basic_info_version SET status='active',activated_at=clock_timestamp() WHERE id=p_basic_info_version_id;
END
$fn$;

ALTER FUNCTION begin_master_data_initialization(text) OWNER TO migration_owner;

ALTER FUNCTION initialize_bootstrap_versions(text) OWNER TO migration_owner;

ALTER FUNCTION assert_mapping_coverage(bigint,bigint,bigint) OWNER TO migration_owner;

ALTER FUNCTION activate_bill_batch(bigint,bigint,text) OWNER TO migration_owner;

ALTER FUNCTION revoke_bill_batch(bigint,bigint,text) OWNER TO migration_owner;

ALTER FUNCTION switch_mapping_version(bigint,text) OWNER TO migration_owner;

ALTER FUNCTION switch_basic_info_version(bigint,text) OWNER TO migration_owner;
