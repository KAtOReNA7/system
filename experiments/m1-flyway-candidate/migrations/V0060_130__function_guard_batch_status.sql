-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0060
-- Dependencies: from prototype 0060_functions_views\0061_triggers.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 6 functions triggers views permissions

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE FUNCTION guard_batch_status() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, m1 AS $fn$
BEGIN
  IF current_user='migration_owner' AND COALESCE(current_setting('m1.switch_context',true),'')='authorized' THEN RETURN NEW; END IF;
  IF (TG_OP='INSERT' AND NEW.status IN ('active','revoked'))
     OR (TG_OP='UPDATE' AND (OLD.status IN ('ready','active','revoked') OR NEW.status IN ('active','revoked'))) THEN
    RAISE EXCEPTION 'direct active/revoked batch mutation is forbidden';
  END IF;
  RETURN NEW;
END
$fn$;

CREATE TRIGGER guard_import_batch BEFORE INSERT OR UPDATE ON import_batch FOR EACH ROW EXECUTE FUNCTION guard_batch_status();
