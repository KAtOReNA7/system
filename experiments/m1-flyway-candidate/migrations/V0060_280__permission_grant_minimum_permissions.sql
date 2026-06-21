-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0060
-- Dependencies: from prototype 0060_functions_views\0063_permissions.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: yes
-- Physical model: M1 physical data model v0.4 - Layer 6 functions triggers views permissions

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

REVOKE ALL ON ALL TABLES IN SCHEMA m1 FROM PUBLIC;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA m1 FROM PUBLIC;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA m1 FROM PUBLIC;

GRANT USAGE ON SCHEMA m1 TO application_rw,application_ro,background_worker,backup_operator;

GRANT SELECT ON m1.v_current_income,m1.v_basic_info_gap,m1.v_basic_info_m2_completeness,
  m1.v_bill_cutoff_months,m1.v_income_projection_monthly TO application_ro,application_rw,background_worker;

GRANT EXECUTE ON FUNCTION m1.derive_standard_work_id(text),m1.derive_business_form(text) TO application_rw,application_ro,background_worker;

GRANT SELECT ON ALL TABLES IN SCHEMA m1 TO background_worker;

GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA m1 TO background_worker;

GRANT INSERT,UPDATE ON m1.background_task,m1.background_task_event,m1.import_file,m1.bill_staging_session,
  m1.temp_bill_record,m1.issue_run,m1.data_issue,m1.data_issue_decision,m1.import_batch,m1.import_batch_file,
  m1.import_batch_month,m1.mapping_version,m1.channel_alias,m1.raw_work_id_mapping,m1.historical_volume_mapping,
  m1.income_projection,m1.mapping_version_work_metric,m1.mapping_version_work_form_metric,m1.basic_info_upload,
  m1.basic_info_temp_record,m1.basic_info_issue,m1.basic_info_version,m1.basic_info_version_work,
  m1.work_classification_assignment,m1.work_tag_assignment TO background_worker;

GRANT INSERT ON m1.income_fact TO background_worker;

GRANT EXECUTE ON FUNCTION m1.begin_master_data_initialization(text),m1.initialize_bootstrap_versions(text),
  m1.activate_bill_batch(bigint,bigint,text),m1.revoke_bill_batch(bigint,bigint,text),
  m1.switch_mapping_version(bigint,text),m1.switch_basic_info_version(bigint,text) TO migration_owner;

-- backup_operator intentionally receives no business-table write privileges in M1.
-- Physical backup/PITR capabilities are provisioned outside application schema migrations.
GRANT USAGE ON SCHEMA m1 TO backup_operator;
