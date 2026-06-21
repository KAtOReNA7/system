-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0040
-- Dependencies: from prototype 0040_basic_info\0040_basic_info.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 4 basic info versions classification tags

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE TABLE tag (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tag_release_id bigint NOT NULL REFERENCES tag_release(id) ON DELETE RESTRICT,
  tag_code text NOT NULL CHECK(btrim(tag_code)<>''), display_name text NOT NULL CHECK(btrim(display_name)<>''),
  normalized_name text NOT NULL CHECK(btrim(normalized_name)<>''),
  tag_type text NOT NULL CHECK(tag_type IN ('auxiliary_content','special_attribute')),
  sort_order integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,tag_release_id), UNIQUE(tag_release_id,tag_code), UNIQUE(tag_release_id,tag_type,normalized_name)
);
