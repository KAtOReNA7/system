-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0010
-- Dependencies: from prototype 0010_platform\0010_platform.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 1 platform identities

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE TABLE cleaning_rule_version (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rule_code text NOT NULL, version_no integer NOT NULL CHECK(version_no > 0),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','retired')),
  rule_payload jsonb NOT NULL, effective_from timestamptz, effective_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), created_by text,
  UNIQUE(rule_code,version_no), CHECK(effective_to IS NULL OR effective_from IS NULL OR effective_to > effective_from)
);

CREATE UNIQUE INDEX uq_cleaning_rule_active ON cleaning_rule_version(rule_code) WHERE status='active';
