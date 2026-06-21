-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0030
-- Dependencies: from prototype 0030_mapping\0030_mapping.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 3 mapping projection metrics

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE TABLE historical_volume_mapping (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mapping_version_id bigint NOT NULL REFERENCES mapping_version(id) ON DELETE RESTRICT,
  historical_raw_work_id text NOT NULL CHECK(btrim(historical_raw_work_id)<>''),
  target_standard_work_id text NOT NULL, business_form text NOT NULL CHECK(business_form IN ('audio_copyright','audio_product')),
  confirmed_issue_id bigint NOT NULL REFERENCES data_issue(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(target_standard_work_id,business_form) REFERENCES work_business_form(standard_work_id,business_form) ON DELETE RESTRICT,
  UNIQUE(id,mapping_version_id), UNIQUE(mapping_version_id,historical_raw_work_id)
);

CREATE INDEX idx_historical_target ON historical_volume_mapping(mapping_version_id,target_standard_work_id,business_form);
