-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0040
-- Dependencies: from prototype 0040_basic_info\0040_basic_info.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 4 basic info versions classification tags

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE TABLE basic_info_upload (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  export_id bigint NOT NULL REFERENCES basic_info_export(id) ON DELETE RESTRICT,
  import_file_id bigint NOT NULL REFERENCES import_file(id) ON DELETE RESTRICT,
  task_id bigint NOT NULL REFERENCES background_task(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'uploaded' CHECK(status IN ('uploaded','parsing','validated','blocked','applied','failed','discarded')),
  parsed_row_count bigint NOT NULL DEFAULT 0 CHECK(parsed_row_count>=0), valid_row_count bigint NOT NULL DEFAULT 0 CHECK(valid_row_count>=0),
  invalid_row_count bigint NOT NULL DEFAULT 0 CHECK(invalid_row_count>=0),
  uploaded_at timestamptz NOT NULL DEFAULT now(), uploaded_by text, finished_at timestamptz,
  UNIQUE(import_file_id,task_id), CHECK(valid_row_count+invalid_row_count<=parsed_row_count)
);
