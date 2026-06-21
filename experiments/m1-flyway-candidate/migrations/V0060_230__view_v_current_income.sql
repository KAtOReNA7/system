-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0060
-- Dependencies: from prototype 0060_functions_views\0062_views.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 6 functions triggers views permissions

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE VIEW v_current_income WITH (security_barrier=true) AS
SELECT f.id AS income_fact_id,f.import_batch_id,f.import_file_id,f.source_sheet_name,f.source_row_number,
       f.bill_month,f.raw_channel_id,f.raw_channel_name,f.raw_authorization_category,f.raw_work_id,f.raw_work_name,
       f.actual_sales_amount,p.channel_id,p.standard_work_id,p.business_form,p.mapping_version_id
FROM m1.mapping_version mv
JOIN m1.income_projection p ON p.mapping_version_id=mv.id
JOIN m1.income_fact f ON f.id=p.income_fact_id
JOIN m1.import_batch b ON b.id=f.import_batch_id
WHERE mv.status='active' AND b.status='active';
