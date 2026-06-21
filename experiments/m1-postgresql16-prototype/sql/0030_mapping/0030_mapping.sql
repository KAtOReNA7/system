-- NON-PRODUCTION PROTOTYPE — NOT A FORMAL MIGRATION
\set ON_ERROR_STOP on
SET ROLE migration_owner;
SET search_path = m1, pg_catalog;

CREATE TABLE mapping_version (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, version_no bigint NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'building' CHECK(status IN ('building','validated','active','retired','failed')),
  base_version_id bigint REFERENCES mapping_version(id) ON DELETE RESTRICT,
  trigger_type text NOT NULL, trigger_ref text,
  build_task_id bigint NOT NULL REFERENCES background_task(id) ON DELETE RESTRICT,
  projection_row_count bigint NOT NULL DEFAULT 0 CHECK(projection_row_count>=0),
  projection_total_amount numeric(32,18) NOT NULL DEFAULT 0,
  projection_checksum text, validated_at timestamptz, activated_at timestamptz, retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), created_by text,
  CHECK(status NOT IN ('validated','active','retired') OR (projection_checksum IS NOT NULL AND validated_at IS NOT NULL)),
  CHECK(status<>'active' OR activated_at IS NOT NULL), CHECK(status<>'retired' OR retired_at IS NOT NULL)
);
CREATE UNIQUE INDEX uq_mapping_version_active ON mapping_version((true)) WHERE status='active';

ALTER TABLE import_batch ADD CONSTRAINT fk_import_batch_activation_mapping
  FOREIGN KEY(activation_mapping_version_id) REFERENCES mapping_version(id) ON DELETE RESTRICT;

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

CREATE TABLE data_issue_decision (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  issue_id bigint NOT NULL REFERENCES data_issue(id) ON DELETE RESTRICT,
  decision text NOT NULL CHECK(decision IN ('delete_duplicate','keep_as_valid','source_file_fix_required','map_to_existing','needs_more_info','not_applicable')),
  decision_payload jsonb NOT NULL DEFAULT '{}'::jsonb, decided_by text NOT NULL, decided_at timestamptz NOT NULL DEFAULT now(),
  superseded_by_id bigint REFERENCES data_issue_decision(id) ON DELETE RESTRICT,
  CHECK(superseded_by_id IS NULL OR superseded_by_id<>id)
);
CREATE UNIQUE INDEX uq_current_issue_decision ON data_issue_decision(issue_id) WHERE superseded_by_id IS NULL;

CREATE TABLE work_business_form (
  standard_work_id text NOT NULL REFERENCES standard_work(standard_work_id) ON DELETE RESTRICT,
  business_form text NOT NULL CHECK(business_form IN ('audio_copyright','audio_product')),
  created_at timestamptz NOT NULL DEFAULT now(), created_by text,
  PRIMARY KEY(standard_work_id,business_form)
);

CREATE TABLE channel_alias (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mapping_version_id bigint NOT NULL REFERENCES mapping_version(id) ON DELETE RESTRICT,
  channel_id bigint NOT NULL REFERENCES channel(id) ON DELETE RESTRICT,
  raw_channel_id text NOT NULL CHECK(btrim(raw_channel_id)<>''), raw_channel_name text NOT NULL CHECK(btrim(raw_channel_name)<>''),
  normalized_channel_name text NOT NULL CHECK(btrim(normalized_channel_name)<>''),
  mapping_source text NOT NULL CHECK(mapping_source IN ('bill_observed','ops_confirmed')),
  confirmed_issue_id bigint REFERENCES data_issue(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,mapping_version_id),
  UNIQUE(mapping_version_id,raw_channel_id,normalized_channel_name)
);
CREATE INDEX idx_channel_alias_raw ON channel_alias(mapping_version_id,raw_channel_id);

CREATE TABLE raw_work_id_mapping (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mapping_version_id bigint NOT NULL REFERENCES mapping_version(id) ON DELETE RESTRICT,
  raw_work_id text NOT NULL CHECK(btrim(raw_work_id)<>''),
  standard_work_id text NOT NULL, business_form text NOT NULL CHECK(business_form IN ('audio_copyright','audio_product')),
  mapping_source text NOT NULL CHECK(mapping_source IN ('id_rule','ops_confirmed')),
  confirmed_issue_id bigint REFERENCES data_issue(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(standard_work_id,business_form) REFERENCES work_business_form(standard_work_id,business_form) ON DELETE RESTRICT,
  UNIQUE(id,mapping_version_id), UNIQUE(mapping_version_id,raw_work_id),
  UNIQUE(mapping_version_id,standard_work_id,business_form)
);

CREATE TABLE historical_volume_mapping (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mapping_version_id bigint NOT NULL REFERENCES mapping_version(id) ON DELETE RESTRICT,
  historical_raw_work_id text NOT NULL CHECK(btrim(historical_raw_work_id)<>''),
  target_standard_work_id text NOT NULL, business_form text NOT NULL CHECK(business_form IN ('audio_copyright','audio_product')),
  confirmed_issue_id bigint NOT NULL REFERENCES data_issue(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(target_standard_work_id,business_form) REFERENCES work_business_form(standard_work_id,business_form) ON DELETE RESTRICT,
  UNIQUE(id,mapping_version_id), UNIQUE(mapping_version_id,historical_raw_work_id)
);
CREATE INDEX idx_historical_target ON historical_volume_mapping(mapping_version_id,target_standard_work_id,business_form);

CREATE TABLE income_projection (
  mapping_version_id bigint NOT NULL REFERENCES mapping_version(id) ON DELETE RESTRICT,
  income_fact_id bigint NOT NULL REFERENCES income_fact(id) ON DELETE RESTRICT,
  channel_id bigint NOT NULL REFERENCES channel(id) ON DELETE RESTRICT,
  standard_work_id text NOT NULL, business_form text NOT NULL CHECK(business_form IN ('audio_copyright','audio_product')),
  channel_alias_id bigint NOT NULL, raw_work_mapping_id bigint, historical_volume_mapping_id bigint,
  projection_rule_code text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(mapping_version_id,income_fact_id),
  FOREIGN KEY(standard_work_id,business_form) REFERENCES work_business_form(standard_work_id,business_form) ON DELETE RESTRICT,
  FOREIGN KEY(channel_alias_id,mapping_version_id) REFERENCES channel_alias(id,mapping_version_id) ON DELETE RESTRICT,
  FOREIGN KEY(raw_work_mapping_id,mapping_version_id) REFERENCES raw_work_id_mapping(id,mapping_version_id) ON DELETE RESTRICT,
  FOREIGN KEY(historical_volume_mapping_id,mapping_version_id) REFERENCES historical_volume_mapping(id,mapping_version_id) ON DELETE RESTRICT,
  CHECK(num_nonnulls(raw_work_mapping_id,historical_volume_mapping_id)=1)
);
CREATE INDEX idx_projection_work ON income_projection(mapping_version_id,standard_work_id,business_form,income_fact_id);
CREATE INDEX idx_projection_channel ON income_projection(mapping_version_id,channel_id,income_fact_id);
CREATE INDEX idx_projection_fact ON income_projection(income_fact_id);

CREATE TABLE mapping_version_work_metric (
  mapping_version_id bigint NOT NULL REFERENCES mapping_version(id) ON DELETE RESTRICT,
  standard_work_id text NOT NULL REFERENCES standard_work(standard_work_id) ON DELETE RESTRICT,
  launch_month date, positive_fact_count bigint NOT NULL DEFAULT 0 CHECK(positive_fact_count>=0),
  source_projection_checksum text NOT NULL, computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(mapping_version_id,standard_work_id),
  CHECK(launch_month IS NULL OR launch_month=date_trunc('month',launch_month)::date),
  CHECK((launch_month IS NULL)=(positive_fact_count=0))
);

CREATE TABLE mapping_version_work_form_metric (
  mapping_version_id bigint NOT NULL REFERENCES mapping_version(id) ON DELETE RESTRICT,
  standard_work_id text NOT NULL, business_form text NOT NULL CHECK(business_form IN ('audio_copyright','audio_product')),
  first_positive_sale_month date, positive_fact_count bigint NOT NULL DEFAULT 0 CHECK(positive_fact_count>=0),
  source_projection_checksum text NOT NULL, computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(mapping_version_id,standard_work_id,business_form),
  FOREIGN KEY(standard_work_id,business_form) REFERENCES work_business_form(standard_work_id,business_form) ON DELETE RESTRICT,
  CHECK(first_positive_sale_month IS NULL OR first_positive_sale_month=date_trunc('month',first_positive_sale_month)::date),
  CHECK((first_positive_sale_month IS NULL)=(positive_fact_count=0))
);

CREATE TABLE standard_work_status_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  standard_work_id text NOT NULL REFERENCES standard_work(standard_work_id) ON DELETE RESTRICT,
  status text NOT NULL CHECK(status IN ('listed','suspected_delisted','delisted','relisted')),
  status_basis text, valid_from timestamptz NOT NULL, valid_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), created_by text,
  CHECK(valid_to IS NULL OR valid_to>valid_from)
);
CREATE UNIQUE INDEX uq_work_current_status ON standard_work_status_history(standard_work_id) WHERE valid_to IS NULL;

RESET ROLE;
