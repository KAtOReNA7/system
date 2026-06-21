-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0030
-- Dependencies: from prototype 0030_mapping\0030_mapping.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 3 mapping projection metrics

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE TABLE mapping_version_work_form_metric (
  mapping_version_id bigint NOT NULL REFERENCES mapping_version(id) ON DELETE RESTRICT,
  standard_work_id text NOT NULL, business_form text NOT NULL CHECK(business_form IN ('audio_copyright','audio_product')),
  first_positive_sale_month date, positive_fact_count bigint NOT NULL DEFAULT 0 CHECK(positive_fact_count>=0),
  source_projection_checksum text NOT NULL, computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(mapping_version_id,standard_work_id,business_form),
  FOREIGN KEY(standard_work_id,business_form) REFERENCES work_business_form(standard_work_id,business_form) ON DELETE RESTRICT,
  CHECK(first_positive_sale_month IS NULL OR first_positive_sale_month=date_trunc('month',first_positive_sale_month)::date),
  CHECK((first_positive_sale_month IS NULL)=(positive_fact_count=0))
);
