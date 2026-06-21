-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0040
-- Dependencies: from prototype 0040_basic_info\0040_basic_info.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 4 basic info versions classification tags

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE TABLE work_classification_assignment (
  basic_info_version_id bigint NOT NULL, standard_work_id text NOT NULL,
  classification_node_id bigint NOT NULL REFERENCES classification_node(id) ON DELETE RESTRICT,
  source_type text NOT NULL CHECK(source_type IN ('confirmed_master_data','ops_supplement','formal_basic_info')),
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(basic_info_version_id,standard_work_id),
  FOREIGN KEY(basic_info_version_id,standard_work_id)
    REFERENCES basic_info_version_work(basic_info_version_id,standard_work_id) ON DELETE RESTRICT
);
