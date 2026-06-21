-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0030
-- Dependencies: from prototype 0030_mapping\0030_mapping.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 3 mapping projection metrics

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE TABLE issue_run (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_type text NOT NULL CHECK(run_type IN ('upload','batch','mapping')),
  staging_session_id bigint REFERENCES bill_staging_session(id) ON DELETE RESTRICT,
  import_batch_id bigint REFERENCES import_batch(id) ON DELETE RESTRICT,
  mapping_version_id bigint REFERENCES mapping_version(id) ON DELETE RESTRICT,
  run_no integer NOT NULL DEFAULT 1 CHECK(run_no>0),
  status text NOT NULL DEFAULT 'running' CHECK(status IN ('running','completed','failed','discarded')),
  started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), created_by text,
  CHECK(num_nonnulls(staging_session_id,import_batch_id,mapping_version_id)=1),
  CHECK((run_type='upload')=(staging_session_id IS NOT NULL)),
  CHECK((run_type='batch')=(import_batch_id IS NOT NULL)),
  CHECK((run_type='mapping')=(mapping_version_id IS NOT NULL))
);

CREATE UNIQUE INDEX uq_issue_run_upload ON issue_run(staging_session_id,run_no) WHERE run_type='upload';

CREATE UNIQUE INDEX uq_issue_run_batch ON issue_run(import_batch_id,run_no) WHERE run_type='batch';

CREATE UNIQUE INDEX uq_issue_run_mapping ON issue_run(mapping_version_id,run_no) WHERE run_type='mapping';
