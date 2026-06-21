-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0020
-- Dependencies: from prototype 0020_import\0020_import.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 2 import staging issues batches facts

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE TABLE temp_bill_record (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  staging_session_id bigint NOT NULL REFERENCES bill_staging_session(id) ON DELETE CASCADE,
  source_sheet_name text, source_row_number integer NOT NULL CHECK(source_row_number>0), bill_month date,
  raw_channel_id text, raw_channel_name text, raw_authorization_category text, raw_work_id text, raw_work_name text,
  actual_sales_amount numeric(32,18), parse_status text NOT NULL DEFAULT 'parsed' CHECK(parse_status IN ('parsed','invalid','ignored')),
  row_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT(staging_session_id,source_sheet_name,source_row_number),
  CHECK(bill_month IS NULL OR bill_month=date_trunc('month',bill_month)::date)
);

CREATE INDEX idx_temp_bill_work ON temp_bill_record(staging_session_id,raw_work_id);
