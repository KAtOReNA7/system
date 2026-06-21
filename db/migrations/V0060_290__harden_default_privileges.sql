-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0060
-- Dependencies: all objects and grants
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: yes
-- Physical model: M1 physical data model v0.4

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

ALTER DEFAULT PRIVILEGES FOR ROLE migration_owner IN SCHEMA m1 REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE migration_owner IN SCHEMA m1 REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE migration_owner IN SCHEMA m1 REVOKE ALL ON FUNCTIONS FROM PUBLIC;
