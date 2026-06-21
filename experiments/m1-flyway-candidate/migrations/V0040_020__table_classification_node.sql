-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0040
-- Dependencies: from prototype 0040_basic_info\0040_basic_info.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 4 basic info versions classification tags

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE TABLE classification_node (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  classification_release_id bigint NOT NULL REFERENCES classification_release(id) ON DELETE RESTRICT,
  classification_system_id bigint NOT NULL REFERENCES classification_system(id) ON DELETE RESTRICT,
  parent_id bigint, node_code text NOT NULL CHECK(btrim(node_code)<>''), display_name text NOT NULL CHECK(btrim(display_name)<>''),
  level smallint NOT NULL CHECK(level BETWEEN 1 AND 3), sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,classification_release_id,classification_system_id),
  UNIQUE(classification_release_id,classification_system_id,node_code),
  UNIQUE NULLS NOT DISTINCT(classification_release_id,classification_system_id,parent_id,display_name),
  FOREIGN KEY(parent_id,classification_release_id,classification_system_id)
    REFERENCES classification_node(id,classification_release_id,classification_system_id) ON DELETE RESTRICT,
  CHECK((level=1 AND parent_id IS NULL) OR (level IN (2,3) AND parent_id IS NOT NULL))
);
