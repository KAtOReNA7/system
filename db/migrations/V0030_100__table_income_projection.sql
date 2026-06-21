-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0030
-- Dependencies: from prototype 0030_mapping\0030_mapping.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 3 mapping projection metrics

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE TABLE income_projection (
  mapping_version_id bigint NOT NULL REFERENCES mapping_version(id) ON DELETE RESTRICT,
  income_fact_id bigint NOT NULL REFERENCES income_fact(id) ON DELETE RESTRICT,
  channel_id bigint NOT NULL REFERENCES channel(id) ON DELETE RESTRICT,
  standard_work_id text NOT NULL, business_form text NOT NULL CHECK(business_form IN ('audio_copyright','audio_product')),
  channel_alias_id bigint NOT NULL, raw_work_mapping_id bigint, historical_volume_mapping_id bigint,
  projection_rule_code text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(mapping_version_id,income_fact_id),
  FOREIGN KEY(standard_work_id,business_form) REFERENCES work_business_form(standard_work_id,business_form) ON DELETE RESTRICT,
  FOREIGN KEY(channel_alias_id,mapping_version_id) REFERENCES channel_alias(id,mapping_version_id) ON DELETE RESTRICT,
  FOREIGN KEY(raw_work_mapping_id,mapping_version_id) REFERENCES raw_work_id_mapping(id,mapping_version_id) ON DELETE RESTRICT,
  FOREIGN KEY(historical_volume_mapping_id,mapping_version_id) REFERENCES historical_volume_mapping(id,mapping_version_id) ON DELETE RESTRICT,
  CHECK(num_nonnulls(raw_work_mapping_id,historical_volume_mapping_id)=1)
);

CREATE INDEX idx_projection_work ON income_projection(mapping_version_id,standard_work_id,business_form,income_fact_id);

CREATE INDEX idx_projection_channel ON income_projection(mapping_version_id,channel_id,income_fact_id);

CREATE INDEX idx_projection_fact ON income_projection(income_fact_id);
