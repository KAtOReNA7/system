-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0010
-- Dependencies: from prototype 0010_platform\0010_platform.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 1 platform identities

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE TABLE classification_release (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, version_no bigint NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','retired')),
  release_note text, activated_at timestamptz, retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), created_by text,
  CHECK((status='active')=(activated_at IS NOT NULL) OR status='retired'),
  CHECK(status<>'retired' OR retired_at IS NOT NULL)
);

CREATE UNIQUE INDEX uq_classification_release_active ON classification_release((true)) WHERE status='active';
