-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0020
-- Dependencies: from prototype 0020_import\0020_import.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 2 import staging issues batches facts

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE TABLE income_fact (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_batch_id bigint NOT NULL REFERENCES import_batch(id) ON DELETE RESTRICT,
  import_file_id bigint NOT NULL REFERENCES import_file(id) ON DELETE RESTRICT,
  source_sheet_name text NOT NULL CHECK(btrim(source_sheet_name)<>''), source_row_number integer NOT NULL CHECK(source_row_number>0),
  bill_month date NOT NULL CHECK(bill_month=date_trunc('month',bill_month)::date),
  raw_channel_id text NOT NULL CHECK(btrim(raw_channel_id)<>''), raw_channel_name text NOT NULL CHECK(btrim(raw_channel_name)<>''),
  raw_authorization_category text NOT NULL CHECK(btrim(raw_authorization_category)<>''),
  raw_work_id text NOT NULL CHECK(btrim(raw_work_id)<>''), raw_work_name text NOT NULL CHECK(btrim(raw_work_name)<>''),
  actual_sales_amount numeric(32,18) NOT NULL, row_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(import_file_id,source_sheet_name,source_row_number)
);

CREATE INDEX idx_income_fact_batch ON income_fact(import_batch_id);

CREATE INDEX idx_income_fact_month ON income_fact(bill_month);

CREATE INDEX idx_income_fact_work_month ON income_fact(raw_work_id,bill_month);

CREATE INDEX idx_income_fact_channel_month ON income_fact(raw_channel_id,bill_month);
