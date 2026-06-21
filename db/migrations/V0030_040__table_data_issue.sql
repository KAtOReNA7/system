-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0030
-- Dependencies: from prototype 0030_mapping\0030_mapping.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 3 mapping projection metrics

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE TABLE data_issue (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  issue_run_id bigint NOT NULL REFERENCES issue_run(id) ON DELETE RESTRICT,
  issue_type text NOT NULL, severity text NOT NULL CHECK(severity IN ('info','warning','blocking')),
  blocking boolean NOT NULL DEFAULT true, group_key text NOT NULL,
  sample_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','decided','resolved','waived')),
  created_at timestamptz NOT NULL DEFAULT now(), created_by text,
  UNIQUE(issue_run_id,issue_type,group_key), CHECK(blocking=(severity='blocking'))
);

CREATE INDEX idx_data_issue_open ON data_issue(issue_run_id,issue_type,group_key) WHERE status IN ('open','decided');

CREATE INDEX idx_data_issue_status ON data_issue(status,blocking,issue_type);
