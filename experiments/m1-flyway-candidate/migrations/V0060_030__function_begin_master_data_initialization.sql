-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0060
-- Dependencies: from prototype 0060_functions_views\0060_functions.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 6 functions triggers views permissions

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE FUNCTION begin_master_data_initialization(p_actor text DEFAULT current_user) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, m1
AS $fn$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('m1.version-switch',0));
  PERFORM 1 FROM m1.system_state WHERE id=1 FOR UPDATE;
  IF (SELECT lifecycle_status FROM m1.system_state WHERE id=1) <> 'schema_initialized' THEN
    RAISE EXCEPTION 'expected schema_initialized';
  END IF;
  PERFORM set_config('m1.switch_context','authorized',true);
  UPDATE m1.system_state SET lifecycle_status='master_data_initializing', status_changed_at=clock_timestamp(),
    status_changed_by=p_actor, status_note='prototype initialization started' WHERE id=1;
END
$fn$;
