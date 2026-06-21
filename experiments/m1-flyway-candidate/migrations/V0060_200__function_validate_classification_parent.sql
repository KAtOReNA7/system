-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0060
-- Dependencies: from prototype 0060_functions_views\0061_triggers.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 6 functions triggers views permissions

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE FUNCTION validate_classification_parent() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, m1 AS $fn$
DECLARE v_parent_level smallint;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    SELECT level INTO v_parent_level FROM m1.classification_node WHERE id=NEW.parent_id;
    IF v_parent_level<>NEW.level-1 THEN RAISE EXCEPTION 'classification parent level must be exactly one lower'; END IF;
  END IF;
  RETURN NULL;
END
$fn$;

CREATE CONSTRAINT TRIGGER ct_classification_parent AFTER INSERT OR UPDATE ON classification_node
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_classification_parent();
