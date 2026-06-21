-- NON-PRODUCTION PROTOTYPE — NOT A FORMAL MIGRATION
\set ON_ERROR_STOP on
SET ROLE migration_owner;
SET search_path = m1, pg_catalog;

CREATE TABLE background_task (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_type text NOT NULL, logical_operation_key text NOT NULL, idempotency_key text NOT NULL,
  retry_of_task_id bigint REFERENCES background_task(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','waiting','succeeded','failed','cancelled')),
  business_stage text, priority integer NOT NULL DEFAULT 100,
  transient_attempt_count integer NOT NULL DEFAULT 0 CHECK (transient_attempt_count >= 0),
  max_transient_attempts integer NOT NULL DEFAULT 1 CHECK (max_transient_attempts >= 0),
  required_model text, payload jsonb NOT NULL DEFAULT '{}'::jsonb, result jsonb,
  error_code text, error_message text, available_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz, finished_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), created_by text,
  UNIQUE(task_type,idempotency_key), CHECK (retry_of_task_id IS NULL OR retry_of_task_id <> id),
  CHECK (status NOT IN ('succeeded','failed','cancelled') OR finished_at IS NOT NULL)
);
CREATE INDEX idx_task_queue ON background_task(priority,available_at,id) WHERE status='queued';
CREATE INDEX idx_task_logical_operation ON background_task(task_type,logical_operation_key);

CREATE TABLE background_task_event (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_id bigint NOT NULL REFERENCES background_task(id) ON DELETE RESTRICT,
  event_type text NOT NULL, from_status text, to_status text, transient_attempt_no integer,
  message text, event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(), created_by text,
  CHECK (transient_attempt_no IS NULL OR transient_attempt_no > 0)
);
CREATE INDEX idx_task_event ON background_task_event(task_id,occurred_at,id);

CREATE TABLE file_fingerprint_registry (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sha256 text NOT NULL UNIQUE CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  file_size_bytes bigint NOT NULL CHECK (file_size_bytes > 0), created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cleaning_rule_version (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rule_code text NOT NULL, version_no integer NOT NULL CHECK(version_no > 0),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','retired')),
  rule_payload jsonb NOT NULL, effective_from timestamptz, effective_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), created_by text,
  UNIQUE(rule_code,version_no), CHECK(effective_to IS NULL OR effective_from IS NULL OR effective_to > effective_from)
);
CREATE UNIQUE INDEX uq_cleaning_rule_active ON cleaning_rule_version(rule_code) WHERE status='active';

CREATE TABLE channel (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  channel_code text NOT NULL UNIQUE CHECK(btrim(channel_code)<>''),
  display_name text NOT NULL CHECK(btrim(display_name)<>''),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(), created_by text
);

CREATE TABLE standard_work (
  standard_work_id text PRIMARY KEY CHECK(btrim(standard_work_id)<>''),
  identity_source text NOT NULL CHECK(identity_source IN ('bill_derived','ops_confirmed')),
  created_at timestamptz NOT NULL DEFAULT now(), created_by text
);

CREATE TABLE author (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  author_code text NOT NULL UNIQUE CHECK(btrim(author_code)<>''),
  primary_name text NOT NULL CHECK(btrim(primary_name)<>''),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','pending_confirmation')),
  created_at timestamptz NOT NULL DEFAULT now(), created_by text
);
CREATE INDEX idx_author_name ON author(primary_name);

CREATE TABLE classification_system (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  system_code text NOT NULL UNIQUE CHECK(system_code IN ('publication','web')),
  display_name text NOT NULL CHECK(btrim(display_name)<>''),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(), created_by text
);

CREATE TABLE classification_release (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, version_no bigint NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','retired')),
  release_note text, activated_at timestamptz, retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), created_by text,
  CHECK((status='active')=(activated_at IS NOT NULL) OR status='retired'),
  CHECK(status<>'retired' OR retired_at IS NOT NULL)
);
CREATE UNIQUE INDEX uq_classification_release_active ON classification_release((true)) WHERE status='active';

CREATE TABLE tag_release (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, version_no bigint NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','retired')),
  release_note text, activated_at timestamptz, retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), created_by text,
  CHECK((status='active')=(activated_at IS NOT NULL) OR status='retired'),
  CHECK(status<>'retired' OR retired_at IS NOT NULL)
);
CREATE UNIQUE INDEX uq_tag_release_active ON tag_release((true)) WHERE status='active';

RESET ROLE;
