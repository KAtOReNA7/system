-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0060
-- Dependencies: from prototype 0060_functions_views\0061_triggers.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 6 functions triggers views permissions

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE FUNCTION assert_active_versions() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, m1 AS $fn$
DECLARE v_state text; v_mapping integer; v_basic integer; v_class integer; v_tag integer;
BEGIN
  SELECT lifecycle_status INTO v_state FROM m1.system_state WHERE id=1;
  IF v_state IN ('ready_for_bill_activation','operational') THEN
    SELECT count(*) INTO v_mapping FROM m1.mapping_version WHERE status='active';
    SELECT count(*) INTO v_basic FROM m1.basic_info_version WHERE status='active';
    SELECT count(*) INTO v_class FROM m1.classification_release WHERE status='active';
    SELECT count(*) INTO v_tag FROM m1.tag_release WHERE status='active';
    IF v_mapping<>1 OR v_basic<>1 OR v_class<>1 OR v_tag<>1 THEN
      RAISE EXCEPTION 'state % requires exactly one active version of each kind; got mapping %, basic %, classification %, tag %',
        v_state,v_mapping,v_basic,v_class,v_tag;
    END IF;
  END IF;
  RETURN NULL;
END
$fn$;

CREATE CONSTRAINT TRIGGER ct_system_active_versions AFTER INSERT OR UPDATE OR DELETE ON system_state
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_active_versions();

CREATE CONSTRAINT TRIGGER ct_mapping_active_versions AFTER INSERT OR UPDATE OR DELETE ON mapping_version
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_active_versions();

CREATE CONSTRAINT TRIGGER ct_basic_active_versions AFTER INSERT OR UPDATE OR DELETE ON basic_info_version
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_active_versions();

CREATE CONSTRAINT TRIGGER ct_class_active_versions AFTER INSERT OR UPDATE OR DELETE ON classification_release
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_active_versions();

CREATE CONSTRAINT TRIGGER ct_tag_active_versions AFTER INSERT OR UPDATE OR DELETE ON tag_release
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_active_versions();
