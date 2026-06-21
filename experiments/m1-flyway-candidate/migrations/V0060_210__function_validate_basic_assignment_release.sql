-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0060
-- Dependencies: from prototype 0060_functions_views\0061_triggers.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 6 functions triggers views permissions

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE FUNCTION validate_basic_assignment_release() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, m1 AS $fn$
DECLARE v_expected bigint; v_actual bigint; v_level smallint;
BEGIN
  IF TG_TABLE_NAME='work_classification_assignment' THEN
    SELECT classification_release_id INTO v_expected FROM m1.basic_info_version WHERE id=NEW.basic_info_version_id;
    SELECT classification_release_id,level INTO v_actual,v_level FROM m1.classification_node WHERE id=NEW.classification_node_id;
    IF v_expected<>v_actual OR v_level<>3 THEN RAISE EXCEPTION 'classification assignment release/level mismatch'; END IF;
  ELSE
    SELECT tag_release_id INTO v_expected FROM m1.basic_info_version WHERE id=NEW.basic_info_version_id;
    SELECT tag_release_id INTO v_actual FROM m1.tag WHERE id=NEW.tag_id;
    IF v_expected<>v_actual THEN RAISE EXCEPTION 'tag assignment release mismatch'; END IF;
  END IF;
  RETURN NULL;
END
$fn$;

CREATE CONSTRAINT TRIGGER ct_class_assignment_release AFTER INSERT OR UPDATE ON work_classification_assignment
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_basic_assignment_release();

CREATE CONSTRAINT TRIGGER ct_tag_assignment_release AFTER INSERT OR UPDATE ON work_tag_assignment
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_basic_assignment_release();
