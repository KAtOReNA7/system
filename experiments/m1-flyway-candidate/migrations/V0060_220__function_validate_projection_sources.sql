-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0060
-- Dependencies: from prototype 0060_functions_views\0061_triggers.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 6 functions triggers views permissions

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE FUNCTION validate_projection_sources() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, m1 AS $fn$
DECLARE v_channel bigint; v_standard text; v_form text;
BEGIN
  SELECT channel_id INTO v_channel FROM m1.channel_alias WHERE id=NEW.channel_alias_id AND mapping_version_id=NEW.mapping_version_id;
  IF v_channel IS DISTINCT FROM NEW.channel_id THEN RAISE EXCEPTION 'projection channel does not match alias'; END IF;
  IF NEW.raw_work_mapping_id IS NOT NULL THEN
    SELECT standard_work_id,business_form INTO v_standard,v_form FROM m1.raw_work_id_mapping
      WHERE id=NEW.raw_work_mapping_id AND mapping_version_id=NEW.mapping_version_id;
  ELSE
    SELECT target_standard_work_id,business_form INTO v_standard,v_form FROM m1.historical_volume_mapping
      WHERE id=NEW.historical_volume_mapping_id AND mapping_version_id=NEW.mapping_version_id;
  END IF;
  IF v_standard IS DISTINCT FROM NEW.standard_work_id OR v_form IS DISTINCT FROM NEW.business_form THEN
    RAISE EXCEPTION 'projection work/form does not match selected mapping source';
  END IF;
  RETURN NEW;
END
$fn$;

CREATE TRIGGER validate_projection BEFORE INSERT OR UPDATE ON income_projection FOR EACH ROW EXECUTE FUNCTION validate_projection_sources();
