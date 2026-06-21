-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0010
-- Dependencies: from prototype 0010_platform\0010_platform.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 1 platform identities

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE TABLE file_fingerprint_registry (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sha256 text NOT NULL UNIQUE CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  file_size_bytes bigint NOT NULL CHECK (file_size_bytes > 0), created_at timestamptz NOT NULL DEFAULT now()
);
