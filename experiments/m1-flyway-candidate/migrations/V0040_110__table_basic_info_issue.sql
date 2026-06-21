-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0040
-- Dependencies: from prototype 0040_basic_info\0040_basic_info.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 4 basic info versions classification tags

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE TABLE basic_info_issue (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  upload_id bigint NOT NULL REFERENCES basic_info_upload(id) ON DELETE RESTRICT,
  issue_type text NOT NULL, severity text NOT NULL CHECK(severity IN ('info','warning','blocking')),
  group_key text NOT NULL, sample_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','waived')),
  resolution text, resolved_by text, resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), created_by text,
  UNIQUE(upload_id,issue_type,group_key),
  CHECK(status<>'resolved' OR (resolved_by IS NOT NULL AND resolved_at IS NOT NULL))
);
