-- NON-PRODUCTION PROTOTYPE — NOT A FORMAL MIGRATION
\set ON_ERROR_STOP on
SET ROLE migration_owner;
SET search_path = m1, pg_catalog;

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

CREATE TABLE batch_impact_consumption (
  impact_record_id bigint NOT NULL REFERENCES batch_impact_record(id) ON DELETE RESTRICT,
  consumer_code text NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','consumed','failed','ignored')),
  consumed_at timestamptz, error_message text, attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count>=0),
  updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(impact_record_id,consumer_code),
  CHECK(status<>'consumed' OR consumed_at IS NOT NULL)
);
CREATE INDEX idx_impact_consumer_pending ON batch_impact_consumption(consumer_code,status,impact_record_id)
  WHERE status IN ('pending','failed');

CREATE TABLE restore_point (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, restore_point_no text NOT NULL UNIQUE,
  operation_type text NOT NULL CHECK(operation_type IN ('batch_activate','batch_revoke','mapping_activate','basic_info_apply','manual_backup')),
  operation_ref text, database_backup_ref text NOT NULL CHECK(btrim(database_backup_ref)<>''),
  mapping_version_id bigint REFERENCES mapping_version(id) ON DELETE RESTRICT,
  basic_info_version_id bigint REFERENCES basic_info_version(id) ON DELETE RESTRICT,
  import_batch_id bigint REFERENCES import_batch(id) ON DELETE RESTRICT,
  checksum_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), created_by text
);

ALTER TABLE basic_info_apply_batch ADD CONSTRAINT fk_basic_info_apply_restore
  FOREIGN KEY(restore_point_id) REFERENCES restore_point(id) ON DELETE RESTRICT;

CREATE TABLE import_batch_undo (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_batch_id bigint NOT NULL REFERENCES import_batch(id) ON DELETE RESTRICT,
  restore_point_id bigint NOT NULL REFERENCES restore_point(id) ON DELETE RESTRICT,
  result_mapping_version_id bigint REFERENCES mapping_version(id) ON DELETE RESTRICT,
  undo_reason text NOT NULL, status text NOT NULL DEFAULT 'requested'
    CHECK(status IN ('requested','building','ready','switching','succeeded','failed')),
  affected_fact_count bigint CHECK(affected_fact_count>=0), affected_amount numeric(32,18),
  created_at timestamptz NOT NULL DEFAULT now(), created_by text, finished_at timestamptz, error_message text,
  CHECK(status<>'succeeded' OR (result_mapping_version_id IS NOT NULL AND finished_at IS NOT NULL))
);
CREATE UNIQUE INDEX uq_open_batch_undo ON import_batch_undo(import_batch_id)
  WHERE status IN ('requested','building','ready','switching');

CREATE TABLE mapping_change_record (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mapping_version_id bigint NOT NULL REFERENCES mapping_version(id) ON DELETE RESTRICT,
  change_type text NOT NULL CHECK(change_type IN ('insert','update','delete','reproject')),
  entity_type text NOT NULL CHECK(entity_type IN ('channel_alias','raw_work_mapping','historical_volume_mapping','projection')),
  entity_key text NOT NULL, before_payload jsonb, after_payload jsonb,
  confirmed_issue_id bigint REFERENCES data_issue(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(), created_by text,
  UNIQUE(mapping_version_id,change_type,entity_type,entity_key),
  CHECK(num_nonnulls(before_payload,after_payload)>0)
);

RESET ROLE;
