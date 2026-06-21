-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0060
-- Dependencies: from prototype 0060_functions_views\0061_triggers.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 6 functions triggers views permissions

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE FUNCTION enforce_mapping_table_mutex() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, m1 AS $fn$
DECLARE v_version bigint; v_raw text;
BEGIN
  IF TG_OP='DELETE' THEN RETURN NULL; END IF;
  IF TG_TABLE_NAME='raw_work_id_mapping' THEN v_version:=NEW.mapping_version_id; v_raw:=NEW.raw_work_id;
  ELSE v_version:=NEW.mapping_version_id; v_raw:=NEW.historical_raw_work_id; END IF;
  PERFORM 1 FROM m1.mapping_version WHERE id=v_version FOR UPDATE;
  IF TG_TABLE_NAME='raw_work_id_mapping' THEN
    IF EXISTS(SELECT 1 FROM m1.historical_volume_mapping WHERE mapping_version_id=v_version AND historical_raw_work_id=v_raw) THEN
      RAISE EXCEPTION 'raw work ID % exists in both mapping tables for version %',v_raw,v_version;
    END IF;
  ELSE
    IF EXISTS(SELECT 1 FROM m1.raw_work_id_mapping WHERE mapping_version_id=v_version AND raw_work_id=v_raw) THEN
      RAISE EXCEPTION 'raw work ID % exists in both mapping tables for version %',v_raw,v_version;
    END IF;
  END IF;
  RETURN NULL;
END
$fn$;

CREATE CONSTRAINT TRIGGER ct_raw_mapping_mutex AFTER INSERT OR UPDATE ON raw_work_id_mapping
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_mapping_table_mutex();

CREATE CONSTRAINT TRIGGER ct_historical_mapping_mutex AFTER INSERT OR UPDATE ON historical_volume_mapping
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_mapping_table_mutex();
