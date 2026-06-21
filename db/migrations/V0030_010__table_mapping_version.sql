-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0030
-- Dependencies: from prototype 0030_mapping\0030_mapping.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 3 mapping projection metrics

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE TABLE mapping_version (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, version_no bigint NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'building' CHECK(status IN ('building','validated','active','retired','failed')),
  base_version_id bigint REFERENCES mapping_version(id) ON DELETE RESTRICT,
  trigger_type text NOT NULL, trigger_ref text,
  build_task_id bigint NOT NULL REFERENCES background_task(id) ON DELETE RESTRICT,
  projection_row_count bigint NOT NULL DEFAULT 0 CHECK(projection_row_count>=0),
  projection_total_amount numeric(32,18) NOT NULL DEFAULT 0,
  projection_checksum text, validated_at timestamptz, activated_at timestamptz, retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), created_by text,
  CHECK(status NOT IN ('validated','active','retired') OR (projection_checksum IS NOT NULL AND validated_at IS NOT NULL)),
  CHECK(status<>'active' OR activated_at IS NOT NULL), CHECK(status<>'retired' OR retired_at IS NOT NULL)
);

CREATE UNIQUE INDEX uq_mapping_version_active ON mapping_version((true)) WHERE status='active';
