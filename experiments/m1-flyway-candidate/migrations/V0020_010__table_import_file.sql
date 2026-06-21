-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0020
-- Dependencies: from prototype 0020_import\0020_import.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 2 import staging issues batches facts

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE TABLE import_file (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fingerprint_id bigint NOT NULL REFERENCES file_fingerprint_registry(id) ON DELETE RESTRICT,
  original_filename text NOT NULL, storage_uri text, uploaded_at timestamptz NOT NULL DEFAULT now(), uploaded_by text,
  retention_status text NOT NULL DEFAULT 'retained' CHECK(retention_status IN ('retained','deleted','redacted')),
  deleted_at timestamptz, parse_report_uri text, row_count bigint CHECK(row_count>=0), total_amount numeric(32,18),
  CHECK((retention_status='deleted')=(deleted_at IS NOT NULL))
);

CREATE INDEX idx_import_file_fingerprint ON import_file(fingerprint_id,uploaded_at);
