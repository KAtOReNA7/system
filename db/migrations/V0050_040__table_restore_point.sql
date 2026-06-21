-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0050
-- Dependencies: from prototype 0050_recovery_audit\0050_recovery_audit.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 5 recovery impact audit

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE TABLE restore_point (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, restore_point_no text NOT NULL UNIQUE,
  operation_type text NOT NULL CHECK(operation_type IN ('batch_activate','batch_revoke','mapping_activate','basic_info_apply','manual_backup')),
  operation_ref text, database_backup_ref text NOT NULL CHECK(btrim(database_backup_ref)<>''),
  mapping_version_id bigint REFERENCES mapping_version(id) ON DELETE RESTRICT,
  basic_info_version_id bigint REFERENCES basic_info_version(id) ON DELETE RESTRICT,
  import_batch_id bigint REFERENCES import_batch(id) ON DELETE RESTRICT,
  checksum_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), created_by text
);
