-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0060
-- Dependencies: from prototype 0060_functions_views\0061_triggers.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 6 functions triggers views permissions

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE FUNCTION validate_income_fact_insert() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, m1 AS $fn$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM m1.import_batch WHERE id=NEW.import_batch_id;
  IF v_status NOT IN ('draft','validating') THEN
    RAISE EXCEPTION 'income facts can only be appended while batch is draft or validating';
  END IF;
  RETURN NEW;
END
$fn$;

CREATE TRIGGER income_fact_insert_state BEFORE INSERT ON income_fact FOR EACH ROW EXECUTE FUNCTION validate_income_fact_insert();
