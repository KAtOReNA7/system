-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0000
-- Dependencies: external role/database bootstrap only
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: revokes PUBLIC schema privileges
-- Physical model: M1 physical data model v0.4

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

DO $preflight$
DECLARE missing_roles text[];
BEGIN
  IF current_user <> 'migration_owner' THEN
    RAISE EXCEPTION 'Flyway candidate migrations must run as migration_owner, got %', current_user;
  END IF;
  IF current_setting('TimeZone') <> 'UTC' THEN
    RAISE EXCEPTION 'Flyway migration session TimeZone must be UTC, got %', current_setting('TimeZone');
  END IF;
  SELECT array_agg(role_name) INTO missing_roles
  FROM (VALUES ('migration_owner'),('application_rw'),('application_ro'),('background_worker'),('backup_operator')) AS r(role_name)
  WHERE NOT EXISTS (SELECT 1 FROM pg_roles pr WHERE pr.rolname = r.role_name);
  IF missing_roles IS NOT NULL THEN
    RAISE EXCEPTION 'Required database roles are missing: %', missing_roles;
  END IF;
END
$preflight$;

CREATE SCHEMA IF NOT EXISTS m1;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA m1 FROM PUBLIC;
REVOKE ALL ON SCHEMA flyway_history FROM PUBLIC;
