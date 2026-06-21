-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0060
-- Dependencies: from prototype 0060_functions_views\0062_views.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 6 functions triggers views permissions

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE VIEW v_basic_info_gap WITH (security_barrier=true) AS
SELECT sw.standard_work_id,
       biv.id AS active_basic_info_version_id,
       (biw.standard_work_id IS NULL) AS missing_basic_info_record,
       (biw.standard_work_name IS NULL OR biw.author_id IS NULL OR biw.copyright_start_date IS NULL OR biw.copyright_end_date IS NULL) AS missing_core_fields,
       (wca.standard_work_id IS NULL) AS missing_classification
FROM m1.standard_work sw
LEFT JOIN m1.basic_info_version biv ON biv.status='active'
LEFT JOIN m1.basic_info_version_work biw ON biw.basic_info_version_id=biv.id AND biw.standard_work_id=sw.standard_work_id
LEFT JOIN m1.work_classification_assignment wca ON wca.basic_info_version_id=biv.id AND wca.standard_work_id=sw.standard_work_id;
