-- NON-PRODUCTION PROTOTYPE — NOT A FORMAL MIGRATION
\set ON_ERROR_STOP on
SET ROLE migration_owner;
SET search_path = m1, pg_catalog;

CREATE FUNCTION require_switch_context() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, m1 AS $fn$
BEGIN
  IF current_user<>'migration_owner' OR COALESCE(current_setting('m1.switch_context',true),'')<>'authorized' THEN
    RAISE EXCEPTION 'direct lifecycle/status mutation is forbidden on %',TG_TABLE_NAME;
  END IF;
  RETURN COALESCE(NEW,OLD);
END
$fn$;

CREATE TRIGGER guard_system_state BEFORE UPDATE OR DELETE ON system_state
FOR EACH ROW EXECUTE FUNCTION require_switch_context();

CREATE FUNCTION guard_version_status() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, m1 AS $fn$
BEGIN
  IF current_user='migration_owner' AND COALESCE(current_setting('m1.switch_context',true),'')='authorized' THEN
    RETURN COALESCE(NEW,OLD);
  END IF;
  IF TG_OP='DELETE' AND OLD.status IN ('active','retired') THEN
    RAISE EXCEPTION 'cannot delete active/retired % row',TG_TABLE_NAME;
  ELSIF TG_OP='INSERT' AND NEW.status IN ('active','retired') THEN
    RAISE EXCEPTION 'cannot directly insert active/retired % row',TG_TABLE_NAME;
  ELSIF TG_OP='UPDATE' AND (OLD.status IN ('validated','active','retired') OR NEW.status IN ('active','retired')) THEN
    RAISE EXCEPTION 'cannot directly transition or mutate frozen validated/active/retired % row',TG_TABLE_NAME;
  END IF;
  RETURN COALESCE(NEW,OLD);
END
$fn$;

CREATE TRIGGER guard_mapping_version BEFORE INSERT OR UPDATE OR DELETE ON mapping_version FOR EACH ROW EXECUTE FUNCTION guard_version_status();
CREATE TRIGGER guard_basic_info_version BEFORE INSERT OR UPDATE OR DELETE ON basic_info_version FOR EACH ROW EXECUTE FUNCTION guard_version_status();
CREATE TRIGGER guard_classification_release BEFORE INSERT OR UPDATE OR DELETE ON classification_release FOR EACH ROW EXECUTE FUNCTION guard_version_status();
CREATE TRIGGER guard_tag_release BEFORE INSERT OR UPDATE OR DELETE ON tag_release FOR EACH ROW EXECUTE FUNCTION guard_version_status();

CREATE FUNCTION guard_batch_status() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, m1 AS $fn$
BEGIN
  IF current_user='migration_owner' AND COALESCE(current_setting('m1.switch_context',true),'')='authorized' THEN RETURN NEW; END IF;
  IF (TG_OP='INSERT' AND NEW.status IN ('active','revoked'))
     OR (TG_OP='UPDATE' AND (OLD.status IN ('ready','active','revoked') OR NEW.status IN ('active','revoked'))) THEN
    RAISE EXCEPTION 'direct active/revoked batch mutation is forbidden';
  END IF;
  RETURN NEW;
END
$fn$;
CREATE TRIGGER guard_import_batch BEFORE INSERT OR UPDATE ON import_batch FOR EACH ROW EXECUTE FUNCTION guard_batch_status();

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

CREATE FUNCTION validate_work_mapping_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, m1 AS $fn$
DECLARE v_raw text; v_standard text; v_form text;
BEGIN
  IF TG_TABLE_NAME='raw_work_id_mapping' THEN
    v_raw:=NEW.raw_work_id; v_standard:=NEW.standard_work_id; v_form:=NEW.business_form;
    IF m1.derive_standard_work_id(v_raw) IS NULL OR m1.derive_standard_work_id(v_raw)<>v_standard THEN
      RAISE EXCEPTION 'raw work ID % does not derive standard work ID %',v_raw,v_standard;
    END IF;
  ELSE
    v_raw:=NEW.historical_raw_work_id; v_form:=NEW.business_form;
    IF m1.derive_standard_work_id(v_raw) IS NULL THEN RAISE EXCEPTION 'invalid historical raw work ID %',v_raw; END IF;
  END IF;
  IF m1.derive_business_form(v_raw)<>v_form THEN RAISE EXCEPTION 'business form % conflicts with raw work ID %',v_form,v_raw; END IF;
  RETURN NEW;
END
$fn$;
CREATE TRIGGER validate_raw_mapping_identity BEFORE INSERT OR UPDATE ON raw_work_id_mapping
FOR EACH ROW EXECUTE FUNCTION validate_work_mapping_identity();
CREATE TRIGGER validate_historical_mapping_identity BEFORE INSERT OR UPDATE ON historical_volume_mapping
FOR EACH ROW EXECUTE FUNCTION validate_work_mapping_identity();

CREATE FUNCTION enforce_mapping_table_mutex() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, m1 AS $fn$
DECLARE v_version bigint; v_raw text;
BEGIN
  IF TG_OP='DELETE' THEN RETURN NULL; END IF;
  IF TG_TABLE_NAME='raw_work_id_mapping' THEN v_version:=NEW.mapping_version_id; v_raw:=NEW.raw_work_id;
  ELSE v_version:=NEW.mapping_version_id; v_raw:=NEW.historical_raw_work_id; END IF;
  PERFORM 1 FROM m1.mapping_version WHERE id=v_version FOR UPDATE;
  IF TG_TABLE_NAME='raw_work_id_mapping' THEN
    IF EXISTS(SELECT 1 FROM m1.historical_volume_mapping WHERE mapping_version_id=v_version AND historical_raw_work_id=v_raw) THEN
      RAISE EXCEPTION 'raw work ID % exists in both mapping tables for version %',v_raw,v_version;
    END IF;
  ELSE
    IF EXISTS(SELECT 1 FROM m1.raw_work_id_mapping WHERE mapping_version_id=v_version AND raw_work_id=v_raw) THEN
      RAISE EXCEPTION 'raw work ID % exists in both mapping tables for version %',v_raw,v_version;
    END IF;
  END IF;
  RETURN NULL;
END
$fn$;
CREATE CONSTRAINT TRIGGER ct_raw_mapping_mutex AFTER INSERT OR UPDATE ON raw_work_id_mapping
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_mapping_table_mutex();
CREATE CONSTRAINT TRIGGER ct_historical_mapping_mutex AFTER INSERT OR UPDATE ON historical_volume_mapping
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_mapping_table_mutex();

CREATE FUNCTION reject_income_fact_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, m1 AS $fn$
BEGIN RAISE EXCEPTION 'income_fact is immutable; use batch revoke and a new projection version'; END
$fn$;
CREATE TRIGGER income_fact_immutable BEFORE UPDATE OR DELETE ON income_fact FOR EACH ROW EXECUTE FUNCTION reject_income_fact_mutation();

CREATE FUNCTION validate_income_fact_insert() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, m1 AS $fn$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM m1.import_batch WHERE id=NEW.import_batch_id;
  IF v_status NOT IN ('draft','validating') THEN
    RAISE EXCEPTION 'income facts can only be appended while batch is draft or validating';
  END IF;
  RETURN NEW;
END
$fn$;
CREATE TRIGGER income_fact_insert_state BEFORE INSERT ON income_fact FOR EACH ROW EXECUTE FUNCTION validate_income_fact_insert();

CREATE FUNCTION guard_snapshot_child() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, m1 AS $fn$
DECLARE v_id bigint; v_status text;
BEGIN
  IF TG_OP='DELETE' THEN v_id := (to_jsonb(OLD)->>TG_ARGV[1])::bigint;
  ELSE v_id := (to_jsonb(NEW)->>TG_ARGV[1])::bigint; END IF;
  IF TG_ARGV[0]='mapping' THEN
    SELECT status INTO v_status FROM m1.mapping_version WHERE id=v_id;
    IF v_status<>'building' THEN RAISE EXCEPTION 'mapping snapshot children are immutable unless version is building'; END IF;
  ELSIF TG_ARGV[0]='basic' THEN
    SELECT status INTO v_status FROM m1.basic_info_version WHERE id=v_id;
    IF v_status<>'building' THEN RAISE EXCEPTION 'basic-info snapshot children are immutable unless version is building'; END IF;
  ELSIF TG_ARGV[0]='classification' THEN
    SELECT status INTO v_status FROM m1.classification_release WHERE id=v_id;
    IF v_status<>'draft' THEN RAISE EXCEPTION 'classification release children are immutable unless release is draft'; END IF;
  ELSIF TG_ARGV[0]='tag' THEN
    SELECT status INTO v_status FROM m1.tag_release WHERE id=v_id;
    IF v_status<>'draft' THEN RAISE EXCEPTION 'tag release children are immutable unless release is draft'; END IF;
  END IF;
  RETURN COALESCE(NEW,OLD);
END
$fn$;

CREATE TRIGGER guard_channel_alias_snapshot BEFORE INSERT OR UPDATE OR DELETE ON channel_alias FOR EACH ROW EXECUTE FUNCTION guard_snapshot_child('mapping','mapping_version_id');
CREATE TRIGGER guard_raw_mapping_snapshot BEFORE INSERT OR UPDATE OR DELETE ON raw_work_id_mapping FOR EACH ROW EXECUTE FUNCTION guard_snapshot_child('mapping','mapping_version_id');
CREATE TRIGGER guard_historical_mapping_snapshot BEFORE INSERT OR UPDATE OR DELETE ON historical_volume_mapping FOR EACH ROW EXECUTE FUNCTION guard_snapshot_child('mapping','mapping_version_id');
CREATE TRIGGER guard_projection_snapshot BEFORE INSERT OR UPDATE OR DELETE ON income_projection FOR EACH ROW EXECUTE FUNCTION guard_snapshot_child('mapping','mapping_version_id');
CREATE TRIGGER guard_work_metric_snapshot BEFORE INSERT OR UPDATE OR DELETE ON mapping_version_work_metric FOR EACH ROW EXECUTE FUNCTION guard_snapshot_child('mapping','mapping_version_id');
CREATE TRIGGER guard_work_form_metric_snapshot BEFORE INSERT OR UPDATE OR DELETE ON mapping_version_work_form_metric FOR EACH ROW EXECUTE FUNCTION guard_snapshot_child('mapping','mapping_version_id');
CREATE TRIGGER guard_basic_work_snapshot BEFORE INSERT OR UPDATE OR DELETE ON basic_info_version_work FOR EACH ROW EXECUTE FUNCTION guard_snapshot_child('basic','basic_info_version_id');
CREATE TRIGGER guard_work_classification_snapshot BEFORE INSERT OR UPDATE OR DELETE ON work_classification_assignment FOR EACH ROW EXECUTE FUNCTION guard_snapshot_child('basic','basic_info_version_id');
CREATE TRIGGER guard_work_tag_snapshot BEFORE INSERT OR UPDATE OR DELETE ON work_tag_assignment FOR EACH ROW EXECUTE FUNCTION guard_snapshot_child('basic','basic_info_version_id');
CREATE TRIGGER guard_classification_nodes BEFORE INSERT OR UPDATE OR DELETE ON classification_node FOR EACH ROW EXECUTE FUNCTION guard_snapshot_child('classification','classification_release_id');
CREATE TRIGGER guard_tags BEFORE INSERT OR UPDATE OR DELETE ON tag FOR EACH ROW EXECUTE FUNCTION guard_snapshot_child('tag','tag_release_id');

CREATE FUNCTION validate_classification_parent() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, m1 AS $fn$
DECLARE v_parent_level smallint;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    SELECT level INTO v_parent_level FROM m1.classification_node WHERE id=NEW.parent_id;
    IF v_parent_level<>NEW.level-1 THEN RAISE EXCEPTION 'classification parent level must be exactly one lower'; END IF;
  END IF;
  RETURN NULL;
END
$fn$;
CREATE CONSTRAINT TRIGGER ct_classification_parent AFTER INSERT OR UPDATE ON classification_node
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_classification_parent();

CREATE FUNCTION validate_basic_assignment_release() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, m1 AS $fn$
DECLARE v_expected bigint; v_actual bigint; v_level smallint;
BEGIN
  IF TG_TABLE_NAME='work_classification_assignment' THEN
    SELECT classification_release_id INTO v_expected FROM m1.basic_info_version WHERE id=NEW.basic_info_version_id;
    SELECT classification_release_id,level INTO v_actual,v_level FROM m1.classification_node WHERE id=NEW.classification_node_id;
    IF v_expected<>v_actual OR v_level<>3 THEN RAISE EXCEPTION 'classification assignment release/level mismatch'; END IF;
  ELSE
    SELECT tag_release_id INTO v_expected FROM m1.basic_info_version WHERE id=NEW.basic_info_version_id;
    SELECT tag_release_id INTO v_actual FROM m1.tag WHERE id=NEW.tag_id;
    IF v_expected<>v_actual THEN RAISE EXCEPTION 'tag assignment release mismatch'; END IF;
  END IF;
  RETURN NULL;
END
$fn$;
CREATE CONSTRAINT TRIGGER ct_class_assignment_release AFTER INSERT OR UPDATE ON work_classification_assignment
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_basic_assignment_release();
CREATE CONSTRAINT TRIGGER ct_tag_assignment_release AFTER INSERT OR UPDATE ON work_tag_assignment
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_basic_assignment_release();

CREATE FUNCTION validate_projection_sources() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, m1 AS $fn$
DECLARE v_channel bigint; v_standard text; v_form text;
BEGIN
  SELECT channel_id INTO v_channel FROM m1.channel_alias WHERE id=NEW.channel_alias_id AND mapping_version_id=NEW.mapping_version_id;
  IF v_channel IS DISTINCT FROM NEW.channel_id THEN RAISE EXCEPTION 'projection channel does not match alias'; END IF;
  IF NEW.raw_work_mapping_id IS NOT NULL THEN
    SELECT standard_work_id,business_form INTO v_standard,v_form FROM m1.raw_work_id_mapping
      WHERE id=NEW.raw_work_mapping_id AND mapping_version_id=NEW.mapping_version_id;
  ELSE
    SELECT target_standard_work_id,business_form INTO v_standard,v_form FROM m1.historical_volume_mapping
      WHERE id=NEW.historical_volume_mapping_id AND mapping_version_id=NEW.mapping_version_id;
  END IF;
  IF v_standard IS DISTINCT FROM NEW.standard_work_id OR v_form IS DISTINCT FROM NEW.business_form THEN
    RAISE EXCEPTION 'projection work/form does not match selected mapping source';
  END IF;
  RETURN NEW;
END
$fn$;
CREATE TRIGGER validate_projection BEFORE INSERT OR UPDATE ON income_projection FOR EACH ROW EXECUTE FUNCTION validate_projection_sources();

RESET ROLE;
