-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0030
-- Dependencies: from prototype 0030_mapping\0030_mapping.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 3 mapping projection metrics

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE TABLE mapping_version_work_metric (
  mapping_version_id bigint NOT NULL REFERENCES mapping_version(id) ON DELETE RESTRICT,
  standard_work_id text NOT NULL REFERENCES standard_work(standard_work_id) ON DELETE RESTRICT,
  launch_month date, positive_fact_count bigint NOT NULL DEFAULT 0 CHECK(positive_fact_count>=0),
  source_projection_checksum text NOT NULL, computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(mapping_version_id,standard_work_id),
  CHECK(launch_month IS NULL OR launch_month=date_trunc('month',launch_month)::date),
  CHECK((launch_month IS NULL)=(positive_fact_count=0))
);
