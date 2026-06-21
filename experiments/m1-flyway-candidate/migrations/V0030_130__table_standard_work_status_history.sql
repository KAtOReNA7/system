-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0030
-- Dependencies: from prototype 0030_mapping\0030_mapping.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 3 mapping projection metrics

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE TABLE standard_work_status_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  standard_work_id text NOT NULL REFERENCES standard_work(standard_work_id) ON DELETE RESTRICT,
  status text NOT NULL CHECK(status IN ('listed','suspected_delisted','delisted','relisted')),
  status_basis text, valid_from timestamptz NOT NULL, valid_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), created_by text,
  CHECK(valid_to IS NULL OR valid_to>valid_from)
);

CREATE UNIQUE INDEX uq_work_current_status ON standard_work_status_history(standard_work_id) WHERE valid_to IS NULL;
