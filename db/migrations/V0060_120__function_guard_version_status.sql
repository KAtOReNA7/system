-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0060
-- Dependencies: from prototype 0060_functions_views\0061_triggers.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 6 functions triggers views permissions

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE FUNCTION guard_version_status() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, m1 AS $fn$
BEGIN
  IF current_user='migration_owner' AND COALESCE(current_setting('m1.switch_context',true),'')='authorized' THEN
    RETURN COALESCE(NEW,OLD);
  END IF;
  IF TG_OP='DELETE' AND OLD.status IN ('active','retired') THEN
    RAISE EXCEPTION 'cannot delete active/retired % row',TG_TABLE_NAME;
  ELSIF TG_OP='INSERT' AND NEW.status IN ('active','retired') THEN
    RAISE EXCEPTION 'cannot directly insert active/retired % row',TG_TABLE_NAME;
  ELSIF TG_OP='UPDATE' AND (OLD.status IN ('validated','active','retired') OR NEW.status IN ('active','retired')) THEN
    RAISE EXCEPTION 'cannot directly transition or mutate frozen validated/active/retired % row',TG_TABLE_NAME;
  END IF;
  RETURN COALESCE(NEW,OLD);
END
$fn$;

CREATE TRIGGER guard_mapping_version BEFORE INSERT OR UPDATE OR DELETE ON mapping_version FOR EACH ROW EXECUTE FUNCTION guard_version_status();

CREATE TRIGGER guard_basic_info_version BEFORE INSERT OR UPDATE OR DELETE ON basic_info_version FOR EACH ROW EXECUTE FUNCTION guard_version_status();

CREATE TRIGGER guard_classification_release BEFORE INSERT OR UPDATE OR DELETE ON classification_release FOR EACH ROW EXECUTE FUNCTION guard_version_status();

CREATE TRIGGER guard_tag_release BEFORE INSERT OR UPDATE OR DELETE ON tag_release FOR EACH ROW EXECUTE FUNCTION guard_version_status();
