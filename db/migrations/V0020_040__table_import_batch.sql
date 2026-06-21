-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0020
-- Dependencies: from prototype 0020_import\0020_import.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 2 import staging issues batches facts

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE TABLE import_batch (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, batch_no text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','validating','blocked','ready','active','revoked','failed')),
  source_type text NOT NULL DEFAULT 'normal_upload' CHECK(source_type IN ('normal_upload','controlled_reimport')),
  reimport_of_batch_id bigint REFERENCES import_batch(id) ON DELETE RESTRICT,
  rule_version_id bigint NOT NULL REFERENCES cleaning_rule_version(id) ON DELETE RESTRICT,
  activation_mapping_version_id bigint,
  raw_row_count bigint NOT NULL DEFAULT 0 CHECK(raw_row_count>=0), accepted_row_count bigint NOT NULL DEFAULT 0 CHECK(accepted_row_count>=0),
  fact_row_count bigint NOT NULL DEFAULT 0 CHECK(fact_row_count>=0), projection_row_count bigint NOT NULL DEFAULT 0 CHECK(projection_row_count>=0),
  raw_total_amount numeric(32,18) NOT NULL DEFAULT 0, deleted_confirmed_amount numeric(32,18) NOT NULL DEFAULT 0,
  accepted_total_amount numeric(32,18) NOT NULL DEFAULT 0, fact_total_amount numeric(32,18) NOT NULL DEFAULT 0,
  projection_total_amount numeric(32,18) NOT NULL DEFAULT 0, reconciliation_checksum text, reconciled_at timestamptz,
  activated_at timestamptz, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), created_by text,
  CHECK((source_type='controlled_reimport')=(reimport_of_batch_id IS NOT NULL)),
  CHECK(status NOT IN ('ready','active','revoked') OR
    (raw_total_amount-deleted_confirmed_amount=accepted_total_amount AND accepted_total_amount=fact_total_amount
     AND fact_total_amount=projection_total_amount AND accepted_row_count=fact_row_count AND fact_row_count=projection_row_count
     AND reconciled_at IS NOT NULL AND reconciliation_checksum IS NOT NULL)),
  CHECK(status<>'active' OR activated_at IS NOT NULL), CHECK(status<>'revoked' OR revoked_at IS NOT NULL)
);

CREATE UNIQUE INDEX uq_controlled_reimport_open ON import_batch(reimport_of_batch_id)
  WHERE source_type='controlled_reimport' AND status IN ('ready','active');
