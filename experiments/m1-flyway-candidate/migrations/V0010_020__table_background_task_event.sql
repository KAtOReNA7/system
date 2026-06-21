-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0010
-- Dependencies: from prototype 0010_platform\0010_platform.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 1 platform identities

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE TABLE background_task_event (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_id bigint NOT NULL REFERENCES background_task(id) ON DELETE RESTRICT,
  event_type text NOT NULL, from_status text, to_status text, transient_attempt_no integer,
  message text, event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(), created_by text,
  CHECK (transient_attempt_no IS NULL OR transient_attempt_no > 0)
);

CREATE INDEX idx_task_event ON background_task_event(task_id,occurred_at,id);
