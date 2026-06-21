-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0040
-- Dependencies: from prototype 0040_basic_info\0040_basic_info.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 4 basic info versions classification tags

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE TABLE author_alias (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  author_id bigint NOT NULL REFERENCES author(id) ON DELETE RESTRICT,
  alias_name text NOT NULL CHECK(btrim(alias_name)<>''), normalized_alias text NOT NULL CHECK(btrim(normalized_alias)<>''),
  source_type text NOT NULL CHECK(source_type IN ('master_data','ops_supplement','formal_basic_info')),
  source_ref text, confirmed_issue_id bigint REFERENCES data_issue(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','retired','pending_confirmation')),
  created_at timestamptz NOT NULL DEFAULT now(), created_by text
);

CREATE UNIQUE INDEX uq_author_alias_active ON author_alias(normalized_alias) WHERE status='active';
