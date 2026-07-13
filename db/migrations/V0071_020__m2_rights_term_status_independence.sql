-- AUTHORIZED LOCAL FORMAL-READINESS MIGRATION
-- Layer: 0071
-- Dependencies: V0071_010__m2_formal_task_export_release_audit.sql.
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL).
-- Boundary: execute only in the explicitly authorized local PostgreSQL environment.

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

ALTER TABLE basic_info_version_work
  DROP CONSTRAINT ck_basic_info_perpetual_consistency,
  DROP CONSTRAINT ck_basic_info_expired_unknown_consistency;

COMMENT ON COLUMN basic_info_version_work.copyright_end_type IS
  'Historical/current controlled term representation. It is independent from the current audio-rights status because renewal or status updates can supersede an older term record.';

COMMENT ON COLUMN basic_info_version_work.audio_rights_status IS
  'Current audio-rights status. A disagreement with the recorded term is retained as audited source evidence, not overwritten by a cross-field constraint.';
