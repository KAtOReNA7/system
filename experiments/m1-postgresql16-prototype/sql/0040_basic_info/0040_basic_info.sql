-- NON-PRODUCTION PROTOTYPE — NOT A FORMAL MIGRATION
\set ON_ERROR_STOP on
SET ROLE migration_owner;
SET search_path = m1, pg_catalog;

CREATE TABLE author_alias (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  author_id bigint NOT NULL REFERENCES author(id) ON DELETE RESTRICT,
  alias_name text NOT NULL CHECK(btrim(alias_name)<>''), normalized_alias text NOT NULL CHECK(btrim(normalized_alias)<>''),
  source_type text NOT NULL CHECK(source_type IN ('master_data','ops_supplement','formal_basic_info')),
  source_ref text, confirmed_issue_id bigint REFERENCES data_issue(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','retired','pending_confirmation')),
  created_at timestamptz NOT NULL DEFAULT now(), created_by text
);
CREATE UNIQUE INDEX uq_author_alias_active ON author_alias(normalized_alias) WHERE status='active';

CREATE TABLE classification_node (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  classification_release_id bigint NOT NULL REFERENCES classification_release(id) ON DELETE RESTRICT,
  classification_system_id bigint NOT NULL REFERENCES classification_system(id) ON DELETE RESTRICT,
  parent_id bigint, node_code text NOT NULL CHECK(btrim(node_code)<>''), display_name text NOT NULL CHECK(btrim(display_name)<>''),
  level smallint NOT NULL CHECK(level BETWEEN 1 AND 3), sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,classification_release_id,classification_system_id),
  UNIQUE(classification_release_id,classification_system_id,node_code),
  UNIQUE NULLS NOT DISTINCT(classification_release_id,classification_system_id,parent_id,display_name),
  FOREIGN KEY(parent_id,classification_release_id,classification_system_id)
    REFERENCES classification_node(id,classification_release_id,classification_system_id) ON DELETE RESTRICT,
  CHECK((level=1 AND parent_id IS NULL) OR (level IN (2,3) AND parent_id IS NOT NULL))
);

CREATE TABLE tag (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tag_release_id bigint NOT NULL REFERENCES tag_release(id) ON DELETE RESTRICT,
  tag_code text NOT NULL CHECK(btrim(tag_code)<>''), display_name text NOT NULL CHECK(btrim(display_name)<>''),
  normalized_name text NOT NULL CHECK(btrim(normalized_name)<>''),
  tag_type text NOT NULL CHECK(tag_type IN ('auxiliary_content','special_attribute')),
  sort_order integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,tag_release_id), UNIQUE(tag_release_id,tag_code), UNIQUE(tag_release_id,tag_type,normalized_name)
);

CREATE TABLE basic_info_version (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, version_no bigint NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'building' CHECK(status IN ('building','validated','active','retired','failed')),
  source_type text NOT NULL CHECK(source_type IN ('master_data_seed','ops_supplement','formal_basic_info')),
  classification_release_id bigint NOT NULL REFERENCES classification_release(id) ON DELETE RESTRICT,
  tag_release_id bigint NOT NULL REFERENCES tag_release(id) ON DELETE RESTRICT,
  build_task_id bigint NOT NULL REFERENCES background_task(id) ON DELETE RESTRICT,
  snapshot_work_count bigint NOT NULL DEFAULT 0 CHECK(snapshot_work_count>=0), snapshot_checksum text,
  validated_at timestamptz, activated_at timestamptz, retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), created_by text,
  CHECK(status NOT IN ('validated','active','retired') OR (snapshot_checksum IS NOT NULL AND validated_at IS NOT NULL)),
  CHECK(status<>'active' OR activated_at IS NOT NULL), CHECK(status<>'retired' OR retired_at IS NOT NULL)
);
CREATE UNIQUE INDEX uq_basic_info_version_active ON basic_info_version((true)) WHERE status='active';

CREATE TABLE basic_info_version_work (
  basic_info_version_id bigint NOT NULL REFERENCES basic_info_version(id) ON DELETE RESTRICT,
  standard_work_id text NOT NULL REFERENCES standard_work(standard_work_id) ON DELETE RESTRICT,
  standard_work_name text NOT NULL CHECK(btrim(standard_work_name)<>''),
  author_id bigint REFERENCES author(id) ON DELETE RESTRICT,
  copyright_start_date date, copyright_end_date date,
  copyright_source_priority text CHECK(copyright_source_priority IN ('confirmed_master_data','ops_supplement','formal_basic_info_version')),
  source_record_ref text, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(basic_info_version_id,standard_work_id),
  CHECK((copyright_start_date IS NULL)=(copyright_end_date IS NULL)),
  CHECK(copyright_end_date IS NULL OR copyright_end_date>=copyright_start_date),
  CHECK(copyright_start_date IS NULL OR copyright_source_priority IS NOT NULL)
);

CREATE TABLE work_classification_assignment (
  basic_info_version_id bigint NOT NULL, standard_work_id text NOT NULL,
  classification_node_id bigint NOT NULL REFERENCES classification_node(id) ON DELETE RESTRICT,
  source_type text NOT NULL CHECK(source_type IN ('confirmed_master_data','ops_supplement','formal_basic_info')),
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(basic_info_version_id,standard_work_id),
  FOREIGN KEY(basic_info_version_id,standard_work_id)
    REFERENCES basic_info_version_work(basic_info_version_id,standard_work_id) ON DELETE RESTRICT
);

CREATE TABLE work_tag_assignment (
  basic_info_version_id bigint NOT NULL, standard_work_id text NOT NULL,
  tag_id bigint NOT NULL REFERENCES tag(id) ON DELETE RESTRICT,
  source_type text NOT NULL CHECK(source_type IN ('confirmed_master_data','ops_supplement','formal_basic_info')),
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(basic_info_version_id,standard_work_id,tag_id),
  FOREIGN KEY(basic_info_version_id,standard_work_id)
    REFERENCES basic_info_version_work(basic_info_version_id,standard_work_id) ON DELETE RESTRICT
);

CREATE TABLE basic_info_export (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, export_no text NOT NULL UNIQUE,
  source_basic_info_version_id bigint NOT NULL REFERENCES basic_info_version(id) ON DELETE RESTRICT,
  source_mapping_version_id bigint NOT NULL REFERENCES mapping_version(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'generated' CHECK(status IN ('generated','downloaded','expired')),
  file_uri text, row_count bigint NOT NULL DEFAULT 0 CHECK(row_count>=0),
  generated_at timestamptz NOT NULL DEFAULT now(), generated_by text
);

CREATE TABLE basic_info_upload (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  export_id bigint NOT NULL REFERENCES basic_info_export(id) ON DELETE RESTRICT,
  import_file_id bigint NOT NULL REFERENCES import_file(id) ON DELETE RESTRICT,
  task_id bigint NOT NULL REFERENCES background_task(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'uploaded' CHECK(status IN ('uploaded','parsing','validated','blocked','applied','failed','discarded')),
  parsed_row_count bigint NOT NULL DEFAULT 0 CHECK(parsed_row_count>=0), valid_row_count bigint NOT NULL DEFAULT 0 CHECK(valid_row_count>=0),
  invalid_row_count bigint NOT NULL DEFAULT 0 CHECK(invalid_row_count>=0),
  uploaded_at timestamptz NOT NULL DEFAULT now(), uploaded_by text, finished_at timestamptz,
  UNIQUE(import_file_id,task_id), CHECK(valid_row_count+invalid_row_count<=parsed_row_count)
);

CREATE TABLE basic_info_temp_record (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  upload_id bigint NOT NULL REFERENCES basic_info_upload(id) ON DELETE CASCADE,
  source_sheet_name text NOT NULL, source_row_number integer NOT NULL CHECK(source_row_number>0),
  standard_work_id text, standard_work_name text, author_name text,
  classification_level_1 text, classification_level_2 text, classification_level_3 text,
  copyright_start_date date, copyright_end_date date, tag_values jsonb NOT NULL DEFAULT '[]'::jsonb,
  parse_status text NOT NULL DEFAULT 'parsed' CHECK(parse_status IN ('parsed','invalid','ignored')),
  row_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(upload_id,source_sheet_name,source_row_number),
  CHECK(copyright_end_date IS NULL OR copyright_start_date IS NULL OR copyright_end_date>=copyright_start_date)
);

CREATE TABLE basic_info_issue (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  upload_id bigint NOT NULL REFERENCES basic_info_upload(id) ON DELETE RESTRICT,
  issue_type text NOT NULL, severity text NOT NULL CHECK(severity IN ('info','warning','blocking')),
  group_key text NOT NULL, sample_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','waived')),
  resolution text, resolved_by text, resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), created_by text,
  UNIQUE(upload_id,issue_type,group_key),
  CHECK(status<>'resolved' OR (resolved_by IS NOT NULL AND resolved_at IS NOT NULL))
);

CREATE TABLE basic_info_apply_batch (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, apply_no text NOT NULL UNIQUE,
  upload_id bigint NOT NULL REFERENCES basic_info_upload(id) ON DELETE RESTRICT,
  target_version_id bigint NOT NULL UNIQUE REFERENCES basic_info_version(id) ON DELETE RESTRICT,
  restore_point_id bigint NOT NULL,
  status text NOT NULL DEFAULT 'building' CHECK(status IN ('building','validated','active','failed','rolled_back')),
  applied_row_count bigint NOT NULL DEFAULT 0 CHECK(applied_row_count>=0), snapshot_checksum text,
  started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz, error_message text,
  created_at timestamptz NOT NULL DEFAULT now(), created_by text,
  CHECK(status<>'active' OR (snapshot_checksum IS NOT NULL AND finished_at IS NOT NULL))
);

RESET ROLE;
