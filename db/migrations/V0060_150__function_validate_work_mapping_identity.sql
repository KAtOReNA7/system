-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0060
-- Dependencies: from prototype 0060_functions_views\0061_triggers.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 6 functions triggers views permissions

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE FUNCTION validate_work_mapping_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, m1 AS $fn$
DECLARE v_raw text; v_standard text; v_form text;
BEGIN
  IF TG_TABLE_NAME='raw_work_id_mapping' THEN
    v_raw:=NEW.raw_work_id; v_standard:=NEW.standard_work_id; v_form:=NEW.business_form;
    IF m1.derive_standard_work_id(v_raw) IS NULL OR m1.derive_standard_work_id(v_raw)<>v_standard THEN
      RAISE EXCEPTION 'raw work ID % does not derive standard work ID %',v_raw,v_standard;
    END IF;
  ELSE
    v_raw:=NEW.historical_raw_work_id; v_form:=NEW.business_form;
    IF m1.derive_standard_work_id(v_raw) IS NULL THEN RAISE EXCEPTION 'invalid historical raw work ID %',v_raw; END IF;
  END IF;
  IF m1.derive_business_form(v_raw)<>v_form THEN RAISE EXCEPTION 'business form % conflicts with raw work ID %',v_form,v_raw; END IF;
  RETURN NEW;
END
$fn$;

CREATE TRIGGER validate_raw_mapping_identity BEFORE INSERT OR UPDATE ON raw_work_id_mapping
FOR EACH ROW EXECUTE FUNCTION validate_work_mapping_identity();

CREATE TRIGGER validate_historical_mapping_identity BEFORE INSERT OR UPDATE ON historical_volume_mapping
FOR EACH ROW EXECUTE FUNCTION validate_work_mapping_identity();
