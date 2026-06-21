-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0060
-- Dependencies: from prototype 0060_functions_views\0061_triggers.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 6 functions triggers views permissions

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

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
