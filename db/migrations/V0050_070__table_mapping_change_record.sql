-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0050
-- Dependencies: from prototype 0050_recovery_audit\0050_recovery_audit.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 5 recovery impact audit

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE TABLE mapping_change_record (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mapping_version_id bigint NOT NULL REFERENCES mapping_version(id) ON DELETE RESTRICT,
  change_type text NOT NULL CHECK(change_type IN ('insert','update','delete','reproject')),
  entity_type text NOT NULL CHECK(entity_type IN ('channel_alias','raw_work_mapping','historical_volume_mapping','projection')),
  entity_key text NOT NULL, before_payload jsonb, after_payload jsonb,
  confirmed_issue_id bigint REFERENCES data_issue(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(), created_by text,
  UNIQUE(mapping_version_id,change_type,entity_type,entity_key),
  CHECK(num_nonnulls(before_payload,after_payload)>0)
);
