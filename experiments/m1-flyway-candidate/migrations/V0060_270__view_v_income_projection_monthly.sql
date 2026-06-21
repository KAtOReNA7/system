-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0060
-- Dependencies: from prototype 0060_functions_views\0062_views.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 6 functions triggers views permissions

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE VIEW v_income_projection_monthly WITH (security_barrier=true) AS
SELECT p.mapping_version_id,f.bill_month,p.channel_id,p.standard_work_id,p.business_form,
       count(*) AS fact_count,sum(f.actual_sales_amount) AS actual_sales_amount
FROM m1.income_projection p JOIN m1.income_fact f ON f.id=p.income_fact_id
GROUP BY p.mapping_version_id,f.bill_month,p.channel_id,p.standard_work_id,p.business_form;
