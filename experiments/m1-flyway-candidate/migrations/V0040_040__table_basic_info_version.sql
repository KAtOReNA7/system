-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0040
-- Dependencies: from prototype 0040_basic_info\0040_basic_info.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 4 basic info versions classification tags

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE TABLE basic_info_version (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, version_no bigint NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'building' CHECK(status IN ('building','validated','active','retired','failed')),
  source_type text NOT NULL CHECK(source_type IN ('master_data_seed','ops_supplement','formal_basic_info')),
  classification_release_id bigint NOT NULL REFERENCES classification_release(id) ON DELETE RESTRICT,
  tag_release_id bigint NOT NULL REFERENCES tag_release(id) ON DELETE RESTRICT,
  build_task_id bigint NOT NULL REFERENCES background_task(id) ON DELETE RESTRICT,
  snapshot_work_count bigint NOT NULL DEFAULT 0 CHECK(snapshot_work_count>=0), snapshot_checksum text,
  validated_at timestamptz, activated_at timestamptz, retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), created_by text,
  CHECK(status NOT IN ('validated','active','retired') OR (snapshot_checksum IS NOT NULL AND validated_at IS NOT NULL)),
  CHECK(status<>'active' OR activated_at IS NOT NULL), CHECK(status<>'retired' OR retired_at IS NOT NULL)
);

CREATE UNIQUE INDEX uq_basic_info_version_active ON basic_info_version((true)) WHERE status='active';
