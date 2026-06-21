-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0050
-- Dependencies: from prototype 0050_recovery_audit\0050_recovery_audit.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 5 recovery impact audit

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE TABLE month_completeness_confirmation (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bill_month date NOT NULL CHECK(bill_month=date_trunc('month',bill_month)::date),
  completeness_status text NOT NULL DEFAULT 'unconfirmed' CHECK(completeness_status IN ('unconfirmed','complete','incomplete')),
  basis text, confirmed_by text, confirmed_at timestamptz,
  superseded_by_id bigint REFERENCES month_completeness_confirmation(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(), created_by text,
  CHECK(completeness_status='unconfirmed' OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)),
  CHECK(superseded_by_id IS NULL OR superseded_by_id<>id)
);

CREATE UNIQUE INDEX uq_current_month_confirmation ON month_completeness_confirmation(bill_month) WHERE superseded_by_id IS NULL;
