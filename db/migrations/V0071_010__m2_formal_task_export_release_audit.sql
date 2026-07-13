-- AUTHORIZED LOCAL FORMAL-READINESS MIGRATION
-- Layer: 0071
-- Dependencies: V0071_000__m2_formal_term_and_snapshot_semantics.sql.
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL).
-- Irreversible: yes; forward-only migration, no down migration.
-- Boundary: execute only in the explicitly authorized local PostgreSQL environment.

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE TABLE m2_formal_export_packages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  export_key text NOT NULL UNIQUE CHECK (btrim(export_key) <> ''),
  task_id bigint NOT NULL REFERENCES background_task(id) ON DELETE RESTRICT,
  candidate_version text NOT NULL CHECK (btrim(candidate_version) <> ''),
  algorithm_version text NOT NULL REFERENCES m2_evaluation_algorithm_versions(version_key) ON DELETE RESTRICT,
  mapping_version_id bigint NOT NULL REFERENCES mapping_version(id) ON DELETE RESTRICT,
  basic_info_version_id bigint NOT NULL REFERENCES basic_info_version(id) ON DELETE RESTRICT,
  cutoff_month date NOT NULL CHECK (cutoff_month = date_trunc('month', cutoff_month)::date),
  status text NOT NULL DEFAULT 'building' CHECK (status IN (
    'building',
    'prepared',
    'pending_approval',
    'approved',
    'released',
    'rejected',
    'rolled_back',
    'invalidated'
  )),
  item_count bigint NOT NULL DEFAULT 0 CHECK (item_count >= 0),
  payload_hash text CHECK (payload_hash IS NULL OR btrim(payload_hash) <> ''),
  contains_operating_suggestions boolean NOT NULL DEFAULT false CHECK (contains_operating_suggestions = false),
  generated_at timestamptz,
  approved_at timestamptz,
  approved_by text,
  released_at timestamptz,
  rolled_back_at timestamptz,
  invalidated_at timestamptz,
  release_note text,
  audit_metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status = 'building' OR (generated_at IS NOT NULL AND payload_hash IS NOT NULL)),
  CHECK (status NOT IN ('approved', 'released') OR (approved_at IS NOT NULL AND approved_by IS NOT NULL)),
  CHECK (status <> 'released' OR released_at IS NOT NULL),
  CHECK (status <> 'rolled_back' OR rolled_back_at IS NOT NULL),
  CHECK (status <> 'invalidated' OR invalidated_at IS NOT NULL)
);

CREATE INDEX idx_m2_formal_export_packages_status
  ON m2_formal_export_packages(status, created_at);

CREATE INDEX idx_m2_formal_export_packages_candidate
  ON m2_formal_export_packages(candidate_version, cutoff_month);

CREATE TABLE m2_formal_export_items (
  export_package_id bigint NOT NULL REFERENCES m2_formal_export_packages(id) ON DELETE RESTRICT,
  evaluation_result_id bigint NOT NULL REFERENCES m2_evaluation_results(id) ON DELETE RESTRICT,
  standard_work_id text NOT NULL REFERENCES standard_work(standard_work_id) ON DELETE RESTRICT,
  item_hash text NOT NULL CHECK (btrim(item_hash) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (export_package_id, evaluation_result_id),
  UNIQUE (export_package_id, standard_work_id)
);

CREATE INDEX idx_m2_formal_export_items_work
  ON m2_formal_export_items(standard_work_id);

CREATE TABLE m2_formal_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_key text NOT NULL UNIQUE CHECK (btrim(event_key) <> ''),
  task_id bigint REFERENCES background_task(id) ON DELETE RESTRICT,
  export_package_id bigint REFERENCES m2_formal_export_packages(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN (
    'formal_input_verified',
    'formal_master_data_written',
    'mapping_validated',
    'mapping_activated',
    'formal_evaluation_started',
    'formal_evaluation_completed',
    'export_prepared',
    'release_submitted',
    'release_approved',
    'release_rejected',
    'release_rolled_back',
    'release_invalidated'
  )),
  actor text NOT NULL CHECK (btrim(actor) <> ''),
  event_payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CHECK (task_id IS NOT NULL OR export_package_id IS NOT NULL)
);

CREATE INDEX idx_m2_formal_audit_events_task
  ON m2_formal_audit_events(task_id, occurred_at, id);

CREATE INDEX idx_m2_formal_audit_events_export
  ON m2_formal_audit_events(export_package_id, occurred_at, id);

COMMENT ON TABLE m2_formal_export_packages IS
  'DB-backed M2 export package state. pending_approval is not final release approval.';

COMMENT ON TABLE m2_formal_export_items IS
  'Immutable membership of a prepared aggregate M2 export package.';

COMMENT ON TABLE m2_formal_audit_events IS
  'Audit trail for the authorized local M2 formal-readiness execution chain.';

GRANT SELECT ON
  m1.m2_formal_export_packages,
  m1.m2_formal_export_items,
  m1.m2_formal_audit_events
TO application_ro, application_rw, background_worker;

GRANT INSERT, UPDATE ON
  m1.m2_formal_export_packages,
  m1.m2_formal_export_items,
  m1.m2_formal_audit_events
TO application_rw, background_worker;

GRANT USAGE, SELECT ON SEQUENCE
  m1.m2_formal_export_packages_id_seq,
  m1.m2_formal_audit_events_id_seq
TO application_rw, background_worker;
