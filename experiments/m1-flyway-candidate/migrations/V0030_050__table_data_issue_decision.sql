-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0030
-- Dependencies: from prototype 0030_mapping\0030_mapping.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 3 mapping projection metrics

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE TABLE data_issue_decision (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  issue_id bigint NOT NULL REFERENCES data_issue(id) ON DELETE RESTRICT,
  decision text NOT NULL CHECK(decision IN ('delete_duplicate','keep_as_valid','source_file_fix_required','map_to_existing','needs_more_info','not_applicable')),
  decision_payload jsonb NOT NULL DEFAULT '{}'::jsonb, decided_by text NOT NULL, decided_at timestamptz NOT NULL DEFAULT now(),
  superseded_by_id bigint REFERENCES data_issue_decision(id) ON DELETE RESTRICT,
  CHECK(superseded_by_id IS NULL OR superseded_by_id<>id)
);

CREATE UNIQUE INDEX uq_current_issue_decision ON data_issue_decision(issue_id) WHERE superseded_by_id IS NULL;
