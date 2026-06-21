-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0000
-- Dependencies: V0000_010__preflight_environment_roles_and_utc.sql
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE TABLE system_state (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  lifecycle_status text NOT NULL DEFAULT 'schema_initialized'
    CHECK (lifecycle_status IN ('schema_initialized','master_data_initializing','ready_for_bill_activation','operational')),
  status_changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  status_changed_by text,
  status_note text
);

INSERT INTO system_state(id) VALUES (1);
