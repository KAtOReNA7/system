-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0040
-- Dependencies: from prototype 0040_basic_info\0040_basic_info.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 4 basic info versions classification tags

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE TABLE basic_info_version_work (
  basic_info_version_id bigint NOT NULL REFERENCES basic_info_version(id) ON DELETE RESTRICT,
  standard_work_id text NOT NULL REFERENCES standard_work(standard_work_id) ON DELETE RESTRICT,
  standard_work_name text NOT NULL CHECK(btrim(standard_work_name)<>''),
  author_id bigint REFERENCES author(id) ON DELETE RESTRICT,
  copyright_start_date date, copyright_end_date date,
  copyright_source_priority text CHECK(copyright_source_priority IN ('confirmed_master_data','ops_supplement','formal_basic_info_version')),
  source_record_ref text, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(basic_info_version_id,standard_work_id),
  CHECK((copyright_start_date IS NULL)=(copyright_end_date IS NULL)),
  CHECK(copyright_end_date IS NULL OR copyright_end_date>=copyright_start_date),
  CHECK(copyright_start_date IS NULL OR copyright_source_priority IS NOT NULL)
);
