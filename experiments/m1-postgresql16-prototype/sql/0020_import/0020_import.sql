-- NON-PRODUCTION PROTOTYPE — NOT A FORMAL MIGRATION
\set ON_ERROR_STOP on
SET ROLE migration_owner;
SET search_path = m1, pg_catalog;

CREATE TABLE import_file (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fingerprint_id bigint NOT NULL REFERENCES file_fingerprint_registry(id) ON DELETE RESTRICT,
  original_filename text NOT NULL, storage_uri text, uploaded_at timestamptz NOT NULL DEFAULT now(), uploaded_by text,
  retention_status text NOT NULL DEFAULT 'retained' CHECK(retention_status IN ('retained','deleted','redacted')),
  deleted_at timestamptz, parse_report_uri text, row_count bigint CHECK(row_count>=0), total_amount numeric(32,18),
  CHECK((retention_status='deleted')=(deleted_at IS NOT NULL))
);
CREATE INDEX idx_import_file_fingerprint ON import_file(fingerprint_id,uploaded_at);

CREATE TABLE bill_staging_session (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_id bigint NOT NULL REFERENCES background_task(id) ON DELETE RESTRICT,
  import_file_id bigint NOT NULL REFERENCES import_file(id) ON DELETE RESTRICT,
  rule_version_id bigint NOT NULL REFERENCES cleaning_rule_version(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'parsing' CHECK(status IN ('parsing','parsed','failed','discarded','promoted')),
  parsed_row_count bigint NOT NULL DEFAULT 0 CHECK(parsed_row_count>=0),
  valid_row_count bigint NOT NULL DEFAULT 0 CHECK(valid_row_count>=0),
  invalid_row_count bigint NOT NULL DEFAULT 0 CHECK(invalid_row_count>=0),
  raw_total_amount numeric(32,18), created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
  UNIQUE(import_file_id,task_id), CHECK(valid_row_count+invalid_row_count<=parsed_row_count)
);

CREATE TABLE temp_bill_record (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  staging_session_id bigint NOT NULL REFERENCES bill_staging_session(id) ON DELETE CASCADE,
  source_sheet_name text, source_row_number integer NOT NULL CHECK(source_row_number>0), bill_month date,
  raw_channel_id text, raw_channel_name text, raw_authorization_category text, raw_work_id text, raw_work_name text,
  actual_sales_amount numeric(32,18), parse_status text NOT NULL DEFAULT 'parsed' CHECK(parse_status IN ('parsed','invalid','ignored')),
  row_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT(staging_session_id,source_sheet_name,source_row_number),
  CHECK(bill_month IS NULL OR bill_month=date_trunc('month',bill_month)::date)
);
CREATE INDEX idx_temp_bill_work ON temp_bill_record(staging_session_id,raw_work_id);

CREATE TABLE import_batch (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, batch_no text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','validating','blocked','ready','active','revoked','failed')),
  source_type text NOT NULL DEFAULT 'normal_upload' CHECK(source_type IN ('normal_upload','controlled_reimport')),
  reimport_of_batch_id bigint REFERENCES import_batch(id) ON DELETE RESTRICT,
  rule_version_id bigint NOT NULL REFERENCES cleaning_rule_version(id) ON DELETE RESTRICT,
  activation_mapping_version_id bigint,
  raw_row_count bigint NOT NULL DEFAULT 0 CHECK(raw_row_count>=0), accepted_row_count bigint NOT NULL DEFAULT 0 CHECK(accepted_row_count>=0),
  fact_row_count bigint NOT NULL DEFAULT 0 CHECK(fact_row_count>=0), projection_row_count bigint NOT NULL DEFAULT 0 CHECK(projection_row_count>=0),
  raw_total_amount numeric(32,18) NOT NULL DEFAULT 0, deleted_confirmed_amount numeric(32,18) NOT NULL DEFAULT 0,
  accepted_total_amount numeric(32,18) NOT NULL DEFAULT 0, fact_total_amount numeric(32,18) NOT NULL DEFAULT 0,
  projection_total_amount numeric(32,18) NOT NULL DEFAULT 0, reconciliation_checksum text, reconciled_at timestamptz,
  activated_at timestamptz, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), created_by text,
  CHECK((source_type='controlled_reimport')=(reimport_of_batch_id IS NOT NULL)),
  CHECK(status NOT IN ('ready','active','revoked') OR
    (raw_total_amount-deleted_confirmed_amount=accepted_total_amount AND accepted_total_amount=fact_total_amount
     AND fact_total_amount=projection_total_amount AND accepted_row_count=fact_row_count AND fact_row_count=projection_row_count
     AND reconciled_at IS NOT NULL AND reconciliation_checksum IS NOT NULL)),
  CHECK(status<>'active' OR activated_at IS NOT NULL), CHECK(status<>'revoked' OR revoked_at IS NOT NULL)
);
CREATE UNIQUE INDEX uq_controlled_reimport_open ON import_batch(reimport_of_batch_id)
  WHERE source_type='controlled_reimport' AND status IN ('ready','active');

CREATE TABLE import_batch_file (
  import_batch_id bigint NOT NULL REFERENCES import_batch(id) ON DELETE RESTRICT,
  import_file_id bigint NOT NULL REFERENCES import_file(id) ON DELETE RESTRICT,
  file_role text NOT NULL DEFAULT 'source_bill' CHECK(file_role IN ('source_bill','cleaned_return','supporting_report')),
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(import_batch_id,import_file_id)
);

CREATE TABLE import_batch_month (
  import_batch_id bigint NOT NULL REFERENCES import_batch(id) ON DELETE RESTRICT,
  bill_month date NOT NULL CHECK(bill_month=date_trunc('month',bill_month)::date),
  row_count bigint NOT NULL CHECK(row_count>=0), amount_total numeric(32,18) NOT NULL,
  source_fact_checksum text NOT NULL, recomputed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(import_batch_id,bill_month)
);

CREATE TABLE income_fact (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_batch_id bigint NOT NULL REFERENCES import_batch(id) ON DELETE RESTRICT,
  import_file_id bigint NOT NULL REFERENCES import_file(id) ON DELETE RESTRICT,
  source_sheet_name text NOT NULL CHECK(btrim(source_sheet_name)<>''), source_row_number integer NOT NULL CHECK(source_row_number>0),
  bill_month date NOT NULL CHECK(bill_month=date_trunc('month',bill_month)::date),
  raw_channel_id text NOT NULL CHECK(btrim(raw_channel_id)<>''), raw_channel_name text NOT NULL CHECK(btrim(raw_channel_name)<>''),
  raw_authorization_category text NOT NULL CHECK(btrim(raw_authorization_category)<>''),
  raw_work_id text NOT NULL CHECK(btrim(raw_work_id)<>''), raw_work_name text NOT NULL CHECK(btrim(raw_work_name)<>''),
  actual_sales_amount numeric(32,18) NOT NULL, row_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(import_file_id,source_sheet_name,source_row_number)
);
CREATE INDEX idx_income_fact_batch ON income_fact(import_batch_id);
CREATE INDEX idx_income_fact_month ON income_fact(bill_month);
CREATE INDEX idx_income_fact_work_month ON income_fact(raw_work_id,bill_month);
CREATE INDEX idx_income_fact_channel_month ON income_fact(raw_channel_id,bill_month);

RESET ROLE;
