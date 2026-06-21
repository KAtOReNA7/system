-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0060
-- Dependencies: from prototype 0060_functions_views\0061_triggers.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 6 functions triggers views permissions

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE FUNCTION reject_income_fact_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, m1 AS $fn$
BEGIN RAISE EXCEPTION 'income_fact is immutable; use batch revoke and a new projection version'; END
$fn$;

CREATE TRIGGER income_fact_immutable BEFORE UPDATE OR DELETE ON income_fact FOR EACH ROW EXECUTE FUNCTION reject_income_fact_mutation();
