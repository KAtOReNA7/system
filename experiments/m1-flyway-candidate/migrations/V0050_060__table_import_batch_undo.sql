-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0050
-- Dependencies: from prototype 0050_recovery_audit\0050_recovery_audit.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 5 recovery impact audit

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE TABLE import_batch_undo (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_batch_id bigint NOT NULL REFERENCES import_batch(id) ON DELETE RESTRICT,
  restore_point_id bigint NOT NULL REFERENCES restore_point(id) ON DELETE RESTRICT,
  result_mapping_version_id bigint REFERENCES mapping_version(id) ON DELETE RESTRICT,
  undo_reason text NOT NULL, status text NOT NULL DEFAULT 'requested'
    CHECK(status IN ('requested','building','ready','switching','succeeded','failed')),
  affected_fact_count bigint CHECK(affected_fact_count>=0), affected_amount numeric(32,18),
  created_at timestamptz NOT NULL DEFAULT now(), created_by text, finished_at timestamptz, error_message text,
  CHECK(status<>'succeeded' OR (result_mapping_version_id IS NOT NULL AND finished_at IS NOT NULL))
);

CREATE UNIQUE INDEX uq_open_batch_undo ON import_batch_undo(import_batch_id)
  WHERE status IN ('requested','building','ready','switching');
