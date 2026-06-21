-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0040
-- Dependencies: from prototype 0040_basic_info\0040_basic_info.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 4 basic info versions classification tags

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE TABLE basic_info_export (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, export_no text NOT NULL UNIQUE,
  source_basic_info_version_id bigint NOT NULL REFERENCES basic_info_version(id) ON DELETE RESTRICT,
  source_mapping_version_id bigint NOT NULL REFERENCES mapping_version(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'generated' CHECK(status IN ('generated','downloaded','expired')),
  file_uri text, row_count bigint NOT NULL DEFAULT 0 CHECK(row_count>=0),
  generated_at timestamptz NOT NULL DEFAULT now(), generated_by text
);
