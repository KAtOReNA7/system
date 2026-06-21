-- FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION
-- Layer: 0060
-- Dependencies: from prototype 0060_functions_views\0060_functions.sql; previous candidates in layer order
-- Transaction: yes (Flyway default, PostgreSQL transactional DDL)
-- Irreversible: yes; forward-only candidate, no down migration
-- Permissions: no
-- Physical model: M1 physical data model v0.4 - Layer 6 functions triggers views permissions

SET search_path = m1, pg_catalog;
SET TIME ZONE 'UTC';

CREATE FUNCTION initialize_bootstrap_versions(p_actor text DEFAULT current_user) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, m1
AS $fn$
DECLARE v_task bigint; v_class bigint; v_tag bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('m1.version-switch',0));
  PERFORM 1 FROM m1.system_state WHERE id=1 FOR UPDATE;
  IF (SELECT lifecycle_status FROM m1.system_state WHERE id=1) <> 'master_data_initializing' THEN
    RAISE EXCEPTION 'expected master_data_initializing';
  END IF;
  PERFORM set_config('m1.switch_context','authorized',true);

  INSERT INTO m1.background_task(task_type,logical_operation_key,idempotency_key,status,finished_at,created_by)
  VALUES('bootstrap','bootstrap','bootstrap-v1','succeeded',clock_timestamp(),p_actor)
  ON CONFLICT(task_type,idempotency_key) DO UPDATE SET logical_operation_key=EXCLUDED.logical_operation_key
  RETURNING id INTO v_task;

  INSERT INTO m1.classification_release(version_no,status,release_note,activated_at,created_by)
  VALUES(1,'active','bootstrap empty release',clock_timestamp(),p_actor)
  ON CONFLICT(version_no) DO UPDATE SET status='active',activated_at=COALESCE(m1.classification_release.activated_at,clock_timestamp())
  RETURNING id INTO v_class;

  INSERT INTO m1.tag_release(version_no,status,release_note,activated_at,created_by)
  VALUES(1,'active','bootstrap empty release',clock_timestamp(),p_actor)
  ON CONFLICT(version_no) DO UPDATE SET status='active',activated_at=COALESCE(m1.tag_release.activated_at,clock_timestamp())
  RETURNING id INTO v_tag;

  INSERT INTO m1.mapping_version(version_no,status,trigger_type,trigger_ref,build_task_id,projection_row_count,
    projection_total_amount,projection_checksum,validated_at,activated_at,created_by)
  VALUES(1,'active','bootstrap','bootstrap',v_task,0,0,'bootstrap-empty',clock_timestamp(),clock_timestamp(),p_actor)
  ON CONFLICT(version_no) DO UPDATE SET status='active',activated_at=COALESCE(m1.mapping_version.activated_at,clock_timestamp())
  RETURNING id INTO v_task;

  SELECT id INTO v_task FROM m1.background_task WHERE task_type='bootstrap' AND idempotency_key='bootstrap-v1';
  INSERT INTO m1.basic_info_version(version_no,status,source_type,classification_release_id,tag_release_id,build_task_id,
    snapshot_work_count,snapshot_checksum,validated_at,activated_at,created_by)
  VALUES(1,'active','master_data_seed',v_class,v_tag,v_task,0,'bootstrap-empty',clock_timestamp(),clock_timestamp(),p_actor)
  ON CONFLICT(version_no) DO UPDATE SET status='active',activated_at=COALESCE(m1.basic_info_version.activated_at,clock_timestamp());

  IF (SELECT count(*) FROM m1.mapping_version WHERE status='active')<>1
     OR (SELECT count(*) FROM m1.basic_info_version WHERE status='active')<>1
     OR (SELECT count(*) FROM m1.classification_release WHERE status='active')<>1
     OR (SELECT count(*) FROM m1.tag_release WHERE status='active')<>1 THEN
    RAISE EXCEPTION 'bootstrap active version invariant failed';
  END IF;

  UPDATE m1.system_state SET lifecycle_status='ready_for_bill_activation',status_changed_at=clock_timestamp(),
    status_changed_by=p_actor,status_note='four bootstrap versions activated atomically' WHERE id=1;
END
$fn$;
