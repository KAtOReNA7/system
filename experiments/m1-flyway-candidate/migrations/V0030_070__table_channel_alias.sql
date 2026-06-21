-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0030
-- Dependencies: from prototype 0030_mapping\0030_mapping.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 3 mapping projection metrics

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE TABLE channel_alias (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mapping_version_id bigint NOT NULL REFERENCES mapping_version(id) ON DELETE RESTRICT,
  channel_id bigint NOT NULL REFERENCES channel(id) ON DELETE RESTRICT,
  raw_channel_id text NOT NULL CHECK(btrim(raw_channel_id)<>''), raw_channel_name text NOT NULL CHECK(btrim(raw_channel_name)<>''),
  normalized_channel_name text NOT NULL CHECK(btrim(normalized_channel_name)<>''),
  mapping_source text NOT NULL CHECK(mapping_source IN ('bill_observed','ops_confirmed')),
  confirmed_issue_id bigint REFERENCES data_issue(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,mapping_version_id),
  UNIQUE(mapping_version_id,raw_channel_id,normalized_channel_name)
);

CREATE INDEX idx_channel_alias_raw ON channel_alias(mapping_version_id,raw_channel_id);
