-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0020
-- Dependencies: from prototype 0020_import\0020_import.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 2 import staging issues batches facts

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE TABLE import_batch_month (
  import_batch_id bigint NOT NULL REFERENCES import_batch(id) ON DELETE RESTRICT,
  bill_month date NOT NULL CHECK(bill_month=date_trunc('month',bill_month)::date),
  row_count bigint NOT NULL CHECK(row_count>=0), amount_total numeric(32,18) NOT NULL,
  source_fact_checksum text NOT NULL, recomputed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(import_batch_id,bill_month)
);
