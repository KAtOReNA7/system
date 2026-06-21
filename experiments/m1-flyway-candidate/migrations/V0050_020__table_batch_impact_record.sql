-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0050
-- Dependencies: from prototype 0050_recovery_audit\0050_recovery_audit.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 5 recovery impact audit

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE TABLE batch_impact_record (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, event_key text NOT NULL UNIQUE,
  event_type text NOT NULL CHECK(event_type IN ('batch_activated','batch_revoked','mapping_reprojected','basic_info_changed')),
  import_batch_id bigint REFERENCES import_batch(id) ON DELETE RESTRICT,
  mapping_version_id bigint REFERENCES mapping_version(id) ON DELETE RESTRICT,
  standard_work_id text REFERENCES standard_work(standard_work_id) ON DELETE RESTRICT,
  bill_month date CHECK(bill_month IS NULL OR bill_month=date_trunc('month',bill_month)::date),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(num_nonnulls(import_batch_id,mapping_version_id,standard_work_id,bill_month)>0)
);
