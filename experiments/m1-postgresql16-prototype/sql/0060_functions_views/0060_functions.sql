-- NON-PRODUCTION PROTOTYPE — NOT A FORMAL MIGRATION
\set ON_ERROR_STOP on
SET ROLE migration_owner;
SET search_path = m1, pg_catalog;

CREATE FUNCTION derive_standard_work_id(p_raw_work_id text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
SET search_path = pg_catalog, m1
RETURN CASE
  WHEN p_raw_work_id ~ '^[0-9]+$' THEN p_raw_work_id
  WHEN p_raw_work_id ~ '^Y[0-9]+$' THEN substring(p_raw_work_id FROM 2)
  ELSE NULL
END;

CREATE FUNCTION derive_business_form(p_raw_work_id text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
SET search_path = pg_catalog, m1
RETURN CASE
  WHEN p_raw_work_id ~ '^[0-9]+$' THEN 'audio_copyright'
  WHEN p_raw_work_id ~ '^Y[0-9]+$' THEN 'audio_product'
  ELSE NULL
END;

CREATE FUNCTION begin_master_data_initialization(p_actor text DEFAULT current_user) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, m1
AS $fn$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('m1.version-switch',0));
  PERFORM 1 FROM m1.system_state WHERE id=1 FOR UPDATE;
  IF (SELECT lifecycle_status FROM m1.system_state WHERE id=1) <> 'schema_initialized' THEN
    RAISE EXCEPTION 'expected schema_initialized';
  END IF;
  PERFORM set_config('m1.switch_context','authorized',true);
  UPDATE m1.system_state SET lifecycle_status='master_data_initializing', status_changed_at=clock_timestamp(),
    status_changed_by=p_actor, status_note='prototype initialization started' WHERE id=1;
END
$fn$;

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

CREATE FUNCTION assert_mapping_coverage(p_mapping_version_id bigint, p_include_batch_id bigint DEFAULT NULL,
  p_exclude_batch_id bigint DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, m1
AS $fn$
DECLARE v_expected_count bigint; v_projection_count bigint; v_expected_total numeric; v_projection_total numeric;
BEGIN
  SELECT count(*),COALESCE(sum(f.actual_sales_amount),0) INTO v_expected_count,v_expected_total
  FROM m1.income_fact f JOIN m1.import_batch b ON b.id=f.import_batch_id
  WHERE (b.status='active' OR b.id=p_include_batch_id) AND (p_exclude_batch_id IS NULL OR b.id<>p_exclude_batch_id);

  SELECT count(*),COALESCE(sum(f.actual_sales_amount),0) INTO v_projection_count,v_projection_total
  FROM m1.income_projection p JOIN m1.income_fact f ON f.id=p.income_fact_id
  JOIN m1.import_batch b ON b.id=f.import_batch_id
  WHERE p.mapping_version_id=p_mapping_version_id
    AND (b.status='active' OR b.id=p_include_batch_id) AND (p_exclude_batch_id IS NULL OR b.id<>p_exclude_batch_id);

  IF v_expected_count<>v_projection_count OR v_expected_total<>v_projection_total THEN
    RAISE EXCEPTION 'mapping % coverage mismatch expected %/% got %/%',p_mapping_version_id,v_expected_count,v_expected_total,v_projection_count,v_projection_total;
  END IF;
  IF EXISTS (SELECT 1 FROM m1.income_projection p JOIN m1.income_fact f ON f.id=p.income_fact_id
             JOIN m1.import_batch b ON b.id=f.import_batch_id
             WHERE p.mapping_version_id=p_mapping_version_id
               AND NOT ((b.status='active' OR b.id=p_include_batch_id) AND (p_exclude_batch_id IS NULL OR b.id<>p_exclude_batch_id))) THEN
    RAISE EXCEPTION 'mapping % contains facts outside visible batch set',p_mapping_version_id;
  END IF;
END
$fn$;

CREATE FUNCTION activate_bill_batch(p_batch_id bigint,p_mapping_version_id bigint,p_actor text DEFAULT current_user) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, m1
AS $fn$
DECLARE v_state text; v_first boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('m1.version-switch',0));
  SELECT lifecycle_status INTO v_state FROM m1.system_state WHERE id=1 FOR UPDATE;
  IF v_state NOT IN ('ready_for_bill_activation','operational') THEN RAISE EXCEPTION 'batch activation not allowed in %',v_state; END IF;
  PERFORM 1 FROM m1.import_batch WHERE id=p_batch_id AND status='ready' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'batch % is not ready',p_batch_id; END IF;
  PERFORM 1 FROM m1.mapping_version WHERE id=p_mapping_version_id AND status='validated' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'mapping % is not validated',p_mapping_version_id; END IF;
  PERFORM m1.assert_mapping_coverage(p_mapping_version_id,p_batch_id,NULL);
  v_first := v_state='ready_for_bill_activation';
  PERFORM set_config('m1.switch_context','authorized',true);
  UPDATE m1.mapping_version SET status='retired',retired_at=clock_timestamp() WHERE status='active';
  UPDATE m1.mapping_version SET status='active',activated_at=clock_timestamp() WHERE id=p_mapping_version_id;
  UPDATE m1.import_batch SET status='active',activated_at=clock_timestamp(),activation_mapping_version_id=p_mapping_version_id WHERE id=p_batch_id;
  IF v_first THEN
    UPDATE m1.system_state SET lifecycle_status='operational',status_changed_at=clock_timestamp(),status_changed_by=p_actor,
      status_note='first bill batch and real mapping activated atomically' WHERE id=1;
  END IF;
  INSERT INTO m1.batch_impact_record(event_key,event_type,import_batch_id,mapping_version_id,payload)
  VALUES('batch-activated:'||p_batch_id||':'||p_mapping_version_id,'batch_activated',p_batch_id,p_mapping_version_id,'{}')
  ON CONFLICT(event_key) DO NOTHING;
END
$fn$;

CREATE FUNCTION revoke_bill_batch(p_batch_id bigint,p_mapping_version_id bigint,p_actor text DEFAULT current_user) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, m1
AS $fn$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('m1.version-switch',0));
  PERFORM 1 FROM m1.system_state WHERE id=1 AND lifecycle_status='operational' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'revoke requires operational'; END IF;
  PERFORM 1 FROM m1.import_batch WHERE id=p_batch_id AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'batch % is not active',p_batch_id; END IF;
  PERFORM 1 FROM m1.mapping_version WHERE id=p_mapping_version_id AND status='validated' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'mapping % is not validated',p_mapping_version_id; END IF;
  PERFORM m1.assert_mapping_coverage(p_mapping_version_id,NULL,p_batch_id);
  PERFORM set_config('m1.switch_context','authorized',true);
  UPDATE m1.mapping_version SET status='retired',retired_at=clock_timestamp() WHERE status='active';
  UPDATE m1.mapping_version SET status='active',activated_at=clock_timestamp() WHERE id=p_mapping_version_id;
  UPDATE m1.import_batch SET status='revoked',revoked_at=clock_timestamp() WHERE id=p_batch_id;
  INSERT INTO m1.batch_impact_record(event_key,event_type,import_batch_id,mapping_version_id,payload)
  VALUES('batch-revoked:'||p_batch_id||':'||p_mapping_version_id,'batch_revoked',p_batch_id,p_mapping_version_id,'{}')
  ON CONFLICT(event_key) DO NOTHING;
END
$fn$;

CREATE FUNCTION switch_mapping_version(p_mapping_version_id bigint,p_actor text DEFAULT current_user) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, m1
AS $fn$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('m1.version-switch',0));
  PERFORM 1 FROM m1.system_state WHERE id=1 AND lifecycle_status='operational' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'mapping switch requires operational'; END IF;
  PERFORM 1 FROM m1.mapping_version WHERE id=p_mapping_version_id AND status='validated' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'mapping % is not validated',p_mapping_version_id; END IF;
  PERFORM m1.assert_mapping_coverage(p_mapping_version_id,NULL,NULL);
  PERFORM set_config('m1.switch_context','authorized',true);
  UPDATE m1.mapping_version SET status='retired',retired_at=clock_timestamp() WHERE status='active';
  UPDATE m1.mapping_version SET status='active',activated_at=clock_timestamp() WHERE id=p_mapping_version_id;
  INSERT INTO m1.batch_impact_record(event_key,event_type,mapping_version_id,payload)
  VALUES('mapping-reprojected:'||p_mapping_version_id,'mapping_reprojected',p_mapping_version_id,'{}')
  ON CONFLICT(event_key) DO NOTHING;
END
$fn$;

CREATE FUNCTION switch_basic_info_version(p_basic_info_version_id bigint,p_actor text DEFAULT current_user) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, m1
AS $fn$
DECLARE v_class bigint; v_tag bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('m1.version-switch',0));
  PERFORM 1 FROM m1.system_state WHERE id=1 AND lifecycle_status='operational' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'basic-info switch requires operational'; END IF;
  SELECT classification_release_id,tag_release_id INTO v_class,v_tag FROM m1.basic_info_version
    WHERE id=p_basic_info_version_id AND status='validated' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'basic-info version % is not validated',p_basic_info_version_id; END IF;
  IF NOT EXISTS(SELECT 1 FROM m1.classification_release WHERE id=v_class AND status IN ('draft','active'))
     OR NOT EXISTS(SELECT 1 FROM m1.tag_release WHERE id=v_tag AND status IN ('draft','active')) THEN
    RAISE EXCEPTION 'basic-info version references a release that cannot be activated';
  END IF;
  PERFORM set_config('m1.switch_context','authorized',true);
  IF NOT EXISTS(SELECT 1 FROM m1.classification_release WHERE id=v_class AND status='active') THEN
    UPDATE m1.classification_release SET status='retired',retired_at=clock_timestamp() WHERE status='active';
    UPDATE m1.classification_release SET status='active',activated_at=clock_timestamp() WHERE id=v_class;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM m1.tag_release WHERE id=v_tag AND status='active') THEN
    UPDATE m1.tag_release SET status='retired',retired_at=clock_timestamp() WHERE status='active';
    UPDATE m1.tag_release SET status='active',activated_at=clock_timestamp() WHERE id=v_tag;
  END IF;
  UPDATE m1.basic_info_version SET status='retired',retired_at=clock_timestamp() WHERE status='active';
  UPDATE m1.basic_info_version SET status='active',activated_at=clock_timestamp() WHERE id=p_basic_info_version_id;
END
$fn$;

ALTER FUNCTION begin_master_data_initialization(text) OWNER TO migration_owner;
ALTER FUNCTION initialize_bootstrap_versions(text) OWNER TO migration_owner;
ALTER FUNCTION assert_mapping_coverage(bigint,bigint,bigint) OWNER TO migration_owner;
ALTER FUNCTION activate_bill_batch(bigint,bigint,text) OWNER TO migration_owner;
ALTER FUNCTION revoke_bill_batch(bigint,bigint,text) OWNER TO migration_owner;
ALTER FUNCTION switch_mapping_version(bigint,text) OWNER TO migration_owner;
ALTER FUNCTION switch_basic_info_version(bigint,text) OWNER TO migration_owner;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA m1 FROM PUBLIC;

RESET ROLE;
