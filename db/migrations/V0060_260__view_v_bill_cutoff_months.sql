-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0060
-- Dependencies: from prototype 0060_functions_views\0062_views.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 6 functions triggers views permissions

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE VIEW v_bill_cutoff_months WITH (security_barrier=true) AS
SELECT (SELECT max(f.bill_month) FROM m1.income_fact f JOIN m1.import_batch b ON b.id=f.import_batch_id WHERE b.status='active') AS bill_max_month,
       (SELECT max(c.bill_month) FROM m1.month_completeness_confirmation c
         WHERE c.superseded_by_id IS NULL AND c.completeness_status='complete') AS latest_confirmed_complete_month;
