-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0050
-- Dependencies: from prototype 0050_recovery_audit\0050_recovery_audit.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 5 recovery impact audit

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE TABLE batch_impact_consumption (
  impact_record_id bigint NOT NULL REFERENCES batch_impact_record(id) ON DELETE RESTRICT,
  consumer_code text NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','consumed','failed','ignored')),
  consumed_at timestamptz, error_message text, attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count>=0),
  updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(impact_record_id,consumer_code),
  CHECK(status<>'consumed' OR consumed_at IS NOT NULL)
);

CREATE INDEX idx_impact_consumer_pending ON batch_impact_consumption(consumer_code,status,impact_record_id)
  WHERE status IN ('pending','failed');
