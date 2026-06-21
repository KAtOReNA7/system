-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0040
-- Dependencies: from prototype 0040_basic_info\0040_basic_info.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 4 basic info versions classification tags

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE TABLE basic_info_apply_batch (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, apply_no text NOT NULL UNIQUE,
  upload_id bigint NOT NULL REFERENCES basic_info_upload(id) ON DELETE RESTRICT,
  target_version_id bigint NOT NULL UNIQUE REFERENCES basic_info_version(id) ON DELETE RESTRICT,
  restore_point_id bigint NOT NULL,
  status text NOT NULL DEFAULT 'building' CHECK(status IN ('building','validated','active','failed','rolled_back')),
  applied_row_count bigint NOT NULL DEFAULT 0 CHECK(applied_row_count>=0), snapshot_checksum text,
  started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz, error_message text,
  created_at timestamptz NOT NULL DEFAULT now(), created_by text,
  CHECK(status<>'active' OR (snapshot_checksum IS NOT NULL AND finished_at IS NOT NULL))
);
