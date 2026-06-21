-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0020
-- Dependencies: from prototype 0020_import\0020_import.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 2 import staging issues batches facts

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE TABLE import_batch_file (
  import_batch_id bigint NOT NULL REFERENCES import_batch(id) ON DELETE RESTRICT,
  import_file_id bigint NOT NULL REFERENCES import_file(id) ON DELETE RESTRICT,
  file_role text NOT NULL DEFAULT 'source_bill' CHECK(file_role IN ('source_bill','cleaned_return','supporting_report')),
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(import_batch_id,import_file_id)
);
