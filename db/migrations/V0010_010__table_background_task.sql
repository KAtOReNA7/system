-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0010
-- Dependencies: from prototype 0010_platform\0010_platform.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 1 platform identities

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE TABLE background_task (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_type text NOT NULL, logical_operation_key text NOT NULL, idempotency_key text NOT NULL,
  retry_of_task_id bigint REFERENCES background_task(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','waiting','succeeded','failed','cancelled')),
  business_stage text, priority integer NOT NULL DEFAULT 100,
  transient_attempt_count integer NOT NULL DEFAULT 0 CHECK (transient_attempt_count >= 0),
  max_transient_attempts integer NOT NULL DEFAULT 1 CHECK (max_transient_attempts >= 0),
  required_model text, payload jsonb NOT NULL DEFAULT '{}'::jsonb, result jsonb,
  error_code text, error_message text, available_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz, finished_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), created_by text,
  UNIQUE(task_type,idempotency_key), CHECK (retry_of_task_id IS NULL OR retry_of_task_id <> id),
  CHECK (status NOT IN ('succeeded','failed','cancelled') OR finished_at IS NOT NULL)
);

CREATE INDEX idx_task_queue ON background_task(priority,available_at,id) WHERE status='queued';

CREATE INDEX idx_task_logical_operation ON background_task(task_type,logical_operation_key);
