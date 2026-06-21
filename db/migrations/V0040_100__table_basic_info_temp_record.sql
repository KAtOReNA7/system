-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0040
-- Dependencies: from prototype 0040_basic_info\0040_basic_info.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 4 basic info versions classification tags

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE TABLE basic_info_temp_record (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  upload_id bigint NOT NULL REFERENCES basic_info_upload(id) ON DELETE CASCADE,
  source_sheet_name text NOT NULL, source_row_number integer NOT NULL CHECK(source_row_number>0),
  standard_work_id text, standard_work_name text, author_name text,
  classification_level_1 text, classification_level_2 text, classification_level_3 text,
  copyright_start_date date, copyright_end_date date, tag_values jsonb NOT NULL DEFAULT '[]'::jsonb,
  parse_status text NOT NULL DEFAULT 'parsed' CHECK(parse_status IN ('parsed','invalid','ignored')),
  row_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(upload_id,source_sheet_name,source_row_number),
  CHECK(copyright_end_date IS NULL OR copyright_start_date IS NULL OR copyright_end_date>=copyright_start_date)
);
