-- NON-PRODUCTION PROTOTYPE — NOT A FORMAL MIGRATION
\set ON_ERROR_STOP on

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'migration_owner') THEN CREATE ROLE migration_owner NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'application_rw') THEN CREATE ROLE application_rw NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'application_ro') THEN CREATE ROLE application_ro NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'background_worker') THEN CREATE ROLE background_worker NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backup_operator') THEN CREATE ROLE backup_operator NOLOGIN; END IF;
END
$roles$;

CREATE SCHEMA m1 AUTHORIZATION migration_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA m1 FROM PUBLIC;
SET ROLE migration_owner;
SET search_path = m1, pg_catalog;

CREATE TABLE system_state (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  lifecycle_status text NOT NULL DEFAULT 'schema_initialized'
    CHECK (lifecycle_status IN ('schema_initialized','master_data_initializing','ready_for_bill_activation','operational')),
  status_changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  status_changed_by text,
  status_note text
);
INSERT INTO system_state(id) VALUES (1);

RESET ROLE;
