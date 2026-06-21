-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0020
-- Dependencies: from prototype 0020_import\0020_import.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 2 import staging issues batches facts

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE TABLE bill_staging_session (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_id bigint NOT NULL REFERENCES background_task(id) ON DELETE RESTRICT,
  import_file_id bigint NOT NULL REFERENCES import_file(id) ON DELETE RESTRICT,
  rule_version_id bigint NOT NULL REFERENCES cleaning_rule_version(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'parsing' CHECK(status IN ('parsing','parsed','failed','discarded','promoted')),
  parsed_row_count bigint NOT NULL DEFAULT 0 CHECK(parsed_row_count>=0),
  valid_row_count bigint NOT NULL DEFAULT 0 CHECK(valid_row_count>=0),
  invalid_row_count bigint NOT NULL DEFAULT 0 CHECK(invalid_row_count>=0),
  raw_total_amount numeric(32,18), created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
  UNIQUE(import_file_id,task_id), CHECK(valid_row_count+invalid_row_count<=parsed_row_count)
);
