"""NON-PRODUCTION PROTOTYPE — NOT A FORMAL MIGRATION.

Runs destructive tests only against explicitly named local prototype databases.
No repository business data is read.
"""
from __future__ import annotations

import hashlib
import json
import os
import platform
import shutil
import subprocess
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SQL_ROOT = ROOT / "sql"
REPORTS = ROOT / "reports"
REPORTS.mkdir(parents=True, exist_ok=True)
PG_BIN = Path(os.environ.get("PG_BIN", r"C:\Program Files\PostgreSQL\16\bin"))
HOST = os.environ.get("PGHOST", "127.0.0.1")
PORT = os.environ.get("PGPORT", "55432")
USER = os.environ.get("PGUSER", "postgres")
PASSWORD = os.environ.get("PGPASSWORD", "")
TEST_DB = "m1_proto_validation"
PERF_DB = "m1_proto_performance"

results: list[dict] = []
execution_log: list[str] = []


def command(exe: str, args: list[str], *, timeout: int = 300, input_text: str | None = None) -> subprocess.CompletedProcess:
    env = os.environ.copy()
    env["PGPASSWORD"] = PASSWORD
    cp = subprocess.run([str(PG_BIN / exe), *args], input=input_text, text=True, encoding="utf-8",
                        errors="replace", capture_output=True, timeout=timeout, env=env)
    execution_log.append(f"$ {exe} {' '.join(args)}\n{cp.stdout}{cp.stderr}")
    return cp


def psql(db: str, sql: str, *, timeout: int = 300) -> subprocess.CompletedProcess:
    prefix = "SET client_min_messages=warning; SET statement_timeout='5min'; SET lock_timeout='2s'; "
    return command("psql.exe", ["-h", HOST, "-p", PORT, "-U", USER, "-d", db, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", prefix + sql], timeout=timeout)


def record(name: str, category: str, passed: bool, detail: str = "") -> None:
    results.append({"name": name, "category": category, "status": "passed" if passed else "failed", "detail": detail.strip()[:2000]})


def expect_success(name: str, category: str, sql: str, contains: str | None = None, db: str = TEST_DB) -> subprocess.CompletedProcess:
    cp = psql(db, sql)
    ok = cp.returncode == 0 and (contains is None or contains in cp.stdout)
    record(name, category, ok, cp.stdout + cp.stderr)
    return cp


def expect_failure(name: str, category: str, sql: str, contains: str | None = None, db: str = TEST_DB) -> subprocess.CompletedProcess:
    cp = psql(db, sql)
    text = cp.stdout + cp.stderr
    ok = cp.returncode != 0 and (contains is None or contains in text)
    record(name, category, ok, text)
    return cp


def reset_database(db: str) -> None:
    command("dropdb.exe", ["-h", HOST, "-p", PORT, "-U", USER, "--if-exists", "--force", db])
    cp = command("createdb.exe", ["-h", HOST, "-p", PORT, "-U", USER, "-T", "template0", "-E", "UTF8", db])
    if cp.returncode:
        raise RuntimeError(cp.stderr)
    for path in sorted(SQL_ROOT.rglob("*.sql")):
        cp = command("psql.exe", ["-h", HOST, "-p", PORT, "-U", USER, "-d", db, "-X", "-v", "ON_ERROR_STOP=1", "-f", str(path)])
        if cp.returncode:
            raise RuntimeError(f"DDL failed at {path}: {cp.stderr}")


def create_mapping_candidate(version_no: int, trigger_type: str = "test") -> int:
    sql = f"""
    INSERT INTO m1.background_task(task_type,logical_operation_key,idempotency_key,status,finished_at)
      VALUES('mapping_build','mv-{version_no}','mv-{version_no}','succeeded',clock_timestamp());
    INSERT INTO m1.mapping_version(version_no,status,base_version_id,trigger_type,build_task_id)
      SELECT {version_no},'building',id,'{trigger_type}',currval('m1.background_task_id_seq') FROM m1.mapping_version WHERE status='active';
    INSERT INTO m1.channel_alias(mapping_version_id,channel_id,raw_channel_id,raw_channel_name,normalized_channel_name,mapping_source)
      SELECT nv.id,ca.channel_id,ca.raw_channel_id,ca.raw_channel_name,ca.normalized_channel_name,ca.mapping_source
      FROM m1.mapping_version nv CROSS JOIN m1.mapping_version ov JOIN m1.channel_alias ca ON ca.mapping_version_id=ov.id
      WHERE nv.version_no={version_no} AND ov.status='active';
    INSERT INTO m1.raw_work_id_mapping(mapping_version_id,raw_work_id,standard_work_id,business_form,mapping_source)
      SELECT nv.id,r.raw_work_id,r.standard_work_id,r.business_form,r.mapping_source
      FROM m1.mapping_version nv CROSS JOIN m1.mapping_version ov JOIN m1.raw_work_id_mapping r ON r.mapping_version_id=ov.id
      WHERE nv.version_no={version_no} AND ov.status='active';
    INSERT INTO m1.historical_volume_mapping(mapping_version_id,historical_raw_work_id,target_standard_work_id,business_form,confirmed_issue_id)
      SELECT nv.id,h.historical_raw_work_id,h.target_standard_work_id,h.business_form,h.confirmed_issue_id
      FROM m1.mapping_version nv CROSS JOIN m1.mapping_version ov JOIN m1.historical_volume_mapping h ON h.mapping_version_id=ov.id
      WHERE nv.version_no={version_no} AND ov.status='active';
    INSERT INTO m1.income_projection(mapping_version_id,income_fact_id,channel_id,standard_work_id,business_form,channel_alias_id,raw_work_mapping_id,historical_volume_mapping_id,projection_rule_code)
      SELECT nv.id,f.id,ca.channel_id,COALESCE(r.standard_work_id,h.target_standard_work_id),COALESCE(r.business_form,h.business_form),ca.id,r.id,h.id,'prototype'
      FROM m1.mapping_version nv JOIN m1.income_fact f ON true JOIN m1.import_batch b ON b.id=f.import_batch_id AND b.status='active'
      JOIN m1.channel_alias ca ON ca.mapping_version_id=nv.id AND ca.raw_channel_id=f.raw_channel_id AND ca.raw_channel_name=f.raw_channel_name
      LEFT JOIN m1.raw_work_id_mapping r ON r.mapping_version_id=nv.id AND r.raw_work_id=f.raw_work_id
      LEFT JOIN m1.historical_volume_mapping h ON h.mapping_version_id=nv.id AND h.historical_raw_work_id=f.raw_work_id
      WHERE nv.version_no={version_no};
    INSERT INTO m1.mapping_version_work_form_metric(mapping_version_id,standard_work_id,business_form,first_positive_sale_month,positive_fact_count,source_projection_checksum)
      SELECT nv.id,p.standard_work_id,p.business_form,min(f.bill_month) FILTER(WHERE f.actual_sales_amount>0),count(*) FILTER(WHERE f.actual_sales_amount>0),'test'
      FROM m1.mapping_version nv JOIN m1.income_projection p ON p.mapping_version_id=nv.id JOIN m1.income_fact f ON f.id=p.income_fact_id
      WHERE nv.version_no={version_no} GROUP BY nv.id,p.standard_work_id,p.business_form;
    INSERT INTO m1.mapping_version_work_metric(mapping_version_id,standard_work_id,launch_month,positive_fact_count,source_projection_checksum)
      SELECT nv.id,p.standard_work_id,min(f.bill_month) FILTER(WHERE f.actual_sales_amount>0),count(*) FILTER(WHERE f.actual_sales_amount>0),'test'
      FROM m1.mapping_version nv JOIN m1.income_projection p ON p.mapping_version_id=nv.id JOIN m1.income_fact f ON f.id=p.income_fact_id
      WHERE nv.version_no={version_no} GROUP BY nv.id,p.standard_work_id;
    UPDATE m1.mapping_version mv SET status='validated',projection_row_count=x.c,projection_total_amount=x.a,
      projection_checksum='test-{version_no}',validated_at=clock_timestamp()
      FROM (SELECT count(*) c,COALESCE(sum(f.actual_sales_amount),0) a FROM m1.income_projection p JOIN m1.income_fact f ON f.id=p.income_fact_id
            WHERE p.mapping_version_id=(SELECT id FROM m1.mapping_version WHERE version_no={version_no})) x
      WHERE mv.version_no={version_no};
    SELECT id FROM m1.mapping_version WHERE version_no={version_no};
    """
    cp = psql(TEST_DB, sql)
    if cp.returncode:
        raise RuntimeError(cp.stderr)
    return int(cp.stdout.strip().splitlines()[-1])


def run_structural_and_lifecycle_tests() -> None:
    reset_database(TEST_DB)
    record("empty database creates all prototype objects", "ddl", True, "all SQL files executed")
    expect_success("48 physical tables", "ddl", "SELECT count(*) FROM pg_tables WHERE schemaname='m1';", "48")
    expect_success("five version partial active indexes exist", "ddl", "SELECT count(*) FROM pg_indexes WHERE schemaname='m1' AND indexname IN ('uq_mapping_version_active','uq_basic_info_version_active','uq_classification_release_active','uq_tag_release_active','uq_cleaning_rule_active');", "5")
    expect_success("NULLS NOT DISTINCT is present", "ddl", "SELECT count(*) FROM pg_indexes WHERE schemaname='m1' AND indexdef ILIKE '%NULLS NOT DISTINCT%';", "2")
    expect_success("schema_initialized permits zero active", "lifecycle", "SELECT lifecycle_status FROM m1.system_state;", "schema_initialized")
    expect_failure("ready rejects zero active", "lifecycle", "BEGIN; SET ROLE migration_owner; SELECT set_config('m1.switch_context','authorized',true); UPDATE m1.system_state SET lifecycle_status='ready_for_bill_activation'; COMMIT;", "requires exactly one")
    expect_success("enter master_data_initializing", "lifecycle", "SELECT m1.begin_master_data_initialization('validation'); SELECT lifecycle_status FROM m1.system_state;", "master_data_initializing")
    expect_success("bootstrap activation and ready transition", "lifecycle", "SELECT m1.initialize_bootstrap_versions('validation'); SELECT lifecycle_status FROM m1.system_state;", "ready_for_bill_activation")
    expect_success("ready has exactly one of four active versions", "lifecycle", "SELECT (SELECT count(*) FROM m1.mapping_version WHERE status='active')::text||(SELECT count(*) FROM m1.basic_info_version WHERE status='active')::text||(SELECT count(*) FROM m1.classification_release WHERE status='active')::text||(SELECT count(*) FROM m1.tag_release WHERE status='active')::text;", "1111")
    expect_failure("second active mapping rejected", "lifecycle", "SET ROLE migration_owner; SELECT set_config('m1.switch_context','authorized',true); INSERT INTO m1.background_task(task_type,logical_operation_key,idempotency_key,status,finished_at) VALUES('x','x','second-active','succeeded',now()); INSERT INTO m1.mapping_version(version_no,status,trigger_type,build_task_id,projection_checksum,validated_at,activated_at) VALUES(99,'active','x',currval('m1.background_task_id_seq'),'x',now(),now());", "uq_mapping_version_active")

    expect_success("raw ID parsing keeps 12345 and Y12345 distinct", "invariants", "SELECT m1.derive_standard_work_id('12345')||','||m1.derive_standard_work_id('Y12345')||','||m1.derive_business_form('12345')||','||m1.derive_business_form('Y12345');", "12345,12345,audio_copyright,audio_product")
    expect_success("illegal ID returns null", "invariants", "SELECT m1.derive_standard_work_id('bad-id') IS NULL AND m1.derive_business_form('bad-id') IS NULL;", "t")

    prep = """
    INSERT INTO m1.standard_work(standard_work_id,identity_source) VALUES('12345','bill_derived'),('99999','bill_derived');
    INSERT INTO m1.work_business_form(standard_work_id,business_form) VALUES('12345','audio_copyright'),('12345','audio_product'),('99999','audio_copyright');
    INSERT INTO m1.channel(channel_code,display_name) VALUES('SYN','Synthetic Channel');
    INSERT INTO m1.background_task(task_type,logical_operation_key,idempotency_key,status,finished_at) VALUES('mapping_build','v2','v2','succeeded',now());
    INSERT INTO m1.mapping_version(version_no,status,base_version_id,trigger_type,build_task_id)
      SELECT 2,'building',id,'first_batch',currval('m1.background_task_id_seq') FROM m1.mapping_version WHERE status='active';
    INSERT INTO m1.channel_alias(mapping_version_id,channel_id,raw_channel_id,raw_channel_name,normalized_channel_name,mapping_source)
      SELECT id,(SELECT id FROM m1.channel WHERE channel_code='SYN'),'C1','Synthetic Channel','synthetic channel','bill_observed' FROM m1.mapping_version WHERE version_no=2;
    INSERT INTO m1.raw_work_id_mapping(mapping_version_id,raw_work_id,standard_work_id,business_form,mapping_source)
      SELECT id,'12345','12345','audio_copyright','id_rule' FROM m1.mapping_version WHERE version_no=2
      UNION ALL SELECT id,'Y12345','12345','audio_product','id_rule' FROM m1.mapping_version WHERE version_no=2;
    """
    expect_success("two business forms map to one standard work", "invariants", prep)
    expect_failure("invalid raw ID mapping is rejected", "invariants", "INSERT INTO m1.raw_work_id_mapping(mapping_version_id,raw_work_id,standard_work_id,business_form,mapping_source) SELECT id,'X123','12345','audio_copyright','id_rule' FROM m1.mapping_version WHERE version_no=2;", "does not derive")
    expect_failure("authorization category cannot override business form", "invariants", "INSERT INTO m1.raw_work_id_mapping(mapping_version_id,raw_work_id,standard_work_id,business_form,mapping_source) SELECT id,'Y99999','99999','audio_copyright','id_rule' FROM m1.mapping_version WHERE version_no=2;", "business form")

    issue = """
    INSERT INTO m1.issue_run(run_type,mapping_version_id,status) SELECT 'mapping',id,'completed' FROM m1.mapping_version WHERE version_no=2;
    INSERT INTO m1.data_issue(issue_run_id,issue_type,severity,group_key,status) VALUES(currval('m1.issue_run_id_seq'),'historical','blocking','H1','resolved');
    """
    expect_success("historical issue context created", "invariants", issue)
    expect_failure("raw and historical mapping tables are mutually exclusive", "invariants", "BEGIN; INSERT INTO m1.historical_volume_mapping(mapping_version_id,historical_raw_work_id,target_standard_work_id,business_form,confirmed_issue_id) SELECT mv.id,'12345','12345','audio_copyright',di.id FROM m1.mapping_version mv CROSS JOIN m1.data_issue di WHERE mv.version_no=2 LIMIT 1; COMMIT;", "both mapping tables")
    expect_failure("historical raw ID cannot repeat through another business form", "invariants", "BEGIN; INSERT INTO m1.historical_volume_mapping(mapping_version_id,historical_raw_work_id,target_standard_work_id,business_form,confirmed_issue_id) SELECT mv.id,'Y99999','12345','audio_product',di.id FROM m1.mapping_version mv CROSS JOIN m1.data_issue di WHERE mv.version_no=2 LIMIT 1; INSERT INTO m1.historical_volume_mapping(mapping_version_id,historical_raw_work_id,target_standard_work_id,business_form,confirmed_issue_id) SELECT mv.id,'Y99999','12345','audio_copyright',di.id FROM m1.mapping_version mv CROSS JOIN m1.data_issue di WHERE mv.version_no=2 LIMIT 1; COMMIT;", None)
    expect_failure("classification root NULL uniqueness works", "invariants", "BEGIN; INSERT INTO m1.classification_system(system_code,display_name) VALUES('publication','Publication'); INSERT INTO m1.classification_release(version_no,status) VALUES(99,'draft'); INSERT INTO m1.classification_node(classification_release_id,classification_system_id,node_code,display_name,level) SELECT cr.id,cs.id,'A','Same Root',1 FROM m1.classification_release cr,m1.classification_system cs WHERE cr.version_no=99; INSERT INTO m1.classification_node(classification_release_id,classification_system_id,node_code,display_name,level) SELECT cr.id,cs.id,'B','Same Root',1 FROM m1.classification_release cr,m1.classification_system cs WHERE cr.version_no=99; COMMIT;")

    fact_setup = """
    INSERT INTO m1.file_fingerprint_registry(sha256,file_size_bytes) VALUES(repeat('a',64),100);
    INSERT INTO m1.import_file(fingerprint_id,original_filename) VALUES(currval('m1.file_fingerprint_registry_id_seq'),'synthetic-1.xlsx');
    INSERT INTO m1.cleaning_rule_version(rule_code,version_no,status,rule_payload) VALUES('bill',1,'active','{}');
    INSERT INTO m1.import_batch(batch_no,rule_version_id) VALUES('SYN-B1',currval('m1.cleaning_rule_version_id_seq'));
    INSERT INTO m1.income_fact(import_batch_id,import_file_id,source_sheet_name,source_row_number,bill_month,raw_channel_id,raw_channel_name,raw_authorization_category,raw_work_id,raw_work_name,actual_sales_amount,row_hash)
      VALUES(currval('m1.import_batch_id_seq'),currval('m1.import_file_id_seq'),'Synthetic',1,'2026-01-01','C1','Synthetic Channel','Category Does Not Drive Form','12345','Synthetic Work',123.123456789012345678,'row1');
    INSERT INTO m1.income_projection(mapping_version_id,income_fact_id,channel_id,standard_work_id,business_form,channel_alias_id,raw_work_mapping_id,projection_rule_code)
      SELECT mv.id,f.id,ca.channel_id,r.standard_work_id,r.business_form,ca.id,r.id,'prototype'
      FROM m1.mapping_version mv JOIN m1.income_fact f ON true JOIN m1.channel_alias ca ON ca.mapping_version_id=mv.id AND ca.raw_channel_id=f.raw_channel_id
      JOIN m1.raw_work_id_mapping r ON r.mapping_version_id=mv.id AND r.raw_work_id=f.raw_work_id WHERE mv.version_no=2;
    INSERT INTO m1.mapping_version_work_form_metric(mapping_version_id,standard_work_id,business_form,first_positive_sale_month,positive_fact_count,source_projection_checksum)
      SELECT id,'12345','audio_copyright','2026-01-01',1,'first' FROM m1.mapping_version WHERE version_no=2;
    INSERT INTO m1.mapping_version_work_metric(mapping_version_id,standard_work_id,launch_month,positive_fact_count,source_projection_checksum)
      SELECT id,'12345','2026-01-01',1,'first' FROM m1.mapping_version WHERE version_no=2;
    UPDATE m1.mapping_version SET status='validated',projection_row_count=1,projection_total_amount=123.123456789012345678,projection_checksum='first',validated_at=now() WHERE version_no=2;
    UPDATE m1.import_batch SET status='ready',raw_row_count=1,accepted_row_count=1,fact_row_count=1,projection_row_count=1,
      raw_total_amount=123.123456789012345678,accepted_total_amount=123.123456789012345678,fact_total_amount=123.123456789012345678,
      projection_total_amount=123.123456789012345678,reconciliation_checksum='ok',reconciled_at=now() WHERE batch_no='SYN-B1';
    """
    expect_success("candidate first batch prepared", "lifecycle", fact_setup)
    expect_success("NUMERIC(32,18) preserves exact value", "invariants", "SELECT actual_sales_amount::text FROM m1.income_fact WHERE row_hash='row1';", "123.123456789012345678")
    expect_failure("income_fact UPDATE rejected", "invariants", "UPDATE m1.income_fact SET actual_sales_amount=0 WHERE row_hash='row1';", "immutable")
    expect_failure("income_fact DELETE rejected", "invariants", "DELETE FROM m1.income_fact WHERE row_hash='row1';", "immutable")
    expect_failure("ready batch reconciliation fields are frozen", "invariants", "UPDATE m1.import_batch SET reconciliation_checksum='changed' WHERE batch_no='SYN-B1';", "forbidden")
    expect_success("new work appears in basic info gap view", "invariants", "SELECT missing_basic_info_record FROM m1.v_basic_info_gap WHERE standard_work_id='99999';", "t")
    expect_success("first batch and mapping activate atomically", "lifecycle", "SELECT m1.activate_bill_batch((SELECT id FROM m1.import_batch WHERE batch_no='SYN-B1'),(SELECT id FROM m1.mapping_version WHERE version_no=2),'validation'); SELECT lifecycle_status FROM m1.system_state;", "operational")
    expect_success("bootstrap mapping retired", "lifecycle", "SELECT status FROM m1.mapping_version WHERE version_no=1;", "retired")
    expect_failure("operational rejects zero active mapping", "lifecycle", "BEGIN; SET ROLE migration_owner; SELECT set_config('m1.switch_context','authorized',true); UPDATE m1.mapping_version SET status='retired',retired_at=now() WHERE status='active'; COMMIT;", "requires exactly one")
    expect_failure("active batch rejects appended facts", "invariants", "INSERT INTO m1.income_fact(import_batch_id,import_file_id,source_sheet_name,source_row_number,bill_month,raw_channel_id,raw_channel_name,raw_authorization_category,raw_work_id,raw_work_name,actual_sales_amount,row_hash) SELECT b.id,f.id,'Synthetic',2,'2026-01-01','C1','Synthetic Channel','Any','12345','Synthetic Work',1,'late-row' FROM m1.import_batch b,m1.import_file f WHERE b.batch_no='SYN-B1' AND f.original_filename='synthetic-1.xlsx';", "only be appended")
    expect_failure("active mapping snapshot rejects child append", "invariants", "INSERT INTO m1.channel_alias(mapping_version_id,channel_id,raw_channel_id,raw_channel_name,normalized_channel_name,mapping_source) SELECT mv.id,c.id,'C2','Late Channel','late channel','bill_observed' FROM m1.mapping_version mv,m1.channel c WHERE mv.status='active' LIMIT 1;", "immutable")

    second = """
    INSERT INTO m1.file_fingerprint_registry(sha256,file_size_bytes) VALUES(repeat('b',64),100);
    INSERT INTO m1.import_file(fingerprint_id,original_filename) VALUES(currval('m1.file_fingerprint_registry_id_seq'),'synthetic-2.xlsx');
    INSERT INTO m1.import_batch(batch_no,rule_version_id) SELECT 'SYN-B2',id FROM m1.cleaning_rule_version WHERE rule_code='bill' AND status='active';
    INSERT INTO m1.income_fact(import_batch_id,import_file_id,source_sheet_name,source_row_number,bill_month,raw_channel_id,raw_channel_name,raw_authorization_category,raw_work_id,raw_work_name,actual_sales_amount,row_hash)
      VALUES(currval('m1.import_batch_id_seq'),currval('m1.import_file_id_seq'),'Synthetic',1,'2026-02-01','C1','Synthetic Channel','Any Category','Y12345','Synthetic Work Product',-1.000000000000000001,'row2');
    UPDATE m1.import_batch SET status='ready',raw_row_count=1,accepted_row_count=1,fact_row_count=1,projection_row_count=1,
      raw_total_amount=-1.000000000000000001,accepted_total_amount=-1.000000000000000001,fact_total_amount=-1.000000000000000001,
      projection_total_amount=-1.000000000000000001,reconciliation_checksum='ok2',reconciled_at=now() WHERE batch_no='SYN-B2';
    """
    expect_success("second batch facts prepared", "lifecycle", second)

    # Candidate 3 must include ready batch 2 in addition to active batch 1, so build it explicitly.
    mv3_sql = """
    INSERT INTO m1.background_task(task_type,logical_operation_key,idempotency_key,status,finished_at) VALUES('mapping_build','v3','v3','succeeded',now());
    INSERT INTO m1.mapping_version(version_no,status,base_version_id,trigger_type,build_task_id) SELECT 3,'building',id,'new_batch',currval('m1.background_task_id_seq') FROM m1.mapping_version WHERE status='active';
    INSERT INTO m1.channel_alias(mapping_version_id,channel_id,raw_channel_id,raw_channel_name,normalized_channel_name,mapping_source)
      SELECT nv.id,ca.channel_id,ca.raw_channel_id,ca.raw_channel_name,ca.normalized_channel_name,ca.mapping_source FROM m1.mapping_version nv,m1.mapping_version ov,m1.channel_alias ca WHERE nv.version_no=3 AND ov.status='active' AND ca.mapping_version_id=ov.id;
    INSERT INTO m1.raw_work_id_mapping(mapping_version_id,raw_work_id,standard_work_id,business_form,mapping_source)
      SELECT nv.id,r.raw_work_id,r.standard_work_id,r.business_form,r.mapping_source FROM m1.mapping_version nv,m1.mapping_version ov,m1.raw_work_id_mapping r WHERE nv.version_no=3 AND ov.status='active' AND r.mapping_version_id=ov.id;
    INSERT INTO m1.income_projection(mapping_version_id,income_fact_id,channel_id,standard_work_id,business_form,channel_alias_id,raw_work_mapping_id,projection_rule_code)
      SELECT nv.id,f.id,ca.channel_id,r.standard_work_id,r.business_form,ca.id,r.id,'prototype' FROM m1.mapping_version nv JOIN m1.income_fact f ON true
      JOIN m1.channel_alias ca ON ca.mapping_version_id=nv.id AND ca.raw_channel_id=f.raw_channel_id
      JOIN m1.raw_work_id_mapping r ON r.mapping_version_id=nv.id AND r.raw_work_id=f.raw_work_id WHERE nv.version_no=3;
    INSERT INTO m1.mapping_version_work_form_metric SELECT nv.id,p.standard_work_id,p.business_form,min(f.bill_month) FILTER(WHERE f.actual_sales_amount>0),count(*) FILTER(WHERE f.actual_sales_amount>0),'v3',now() FROM m1.mapping_version nv JOIN m1.income_projection p ON p.mapping_version_id=nv.id JOIN m1.income_fact f ON f.id=p.income_fact_id WHERE nv.version_no=3 GROUP BY nv.id,p.standard_work_id,p.business_form;
    INSERT INTO m1.mapping_version_work_metric SELECT nv.id,p.standard_work_id,min(f.bill_month) FILTER(WHERE f.actual_sales_amount>0),count(*) FILTER(WHERE f.actual_sales_amount>0),'v3',now() FROM m1.mapping_version nv JOIN m1.income_projection p ON p.mapping_version_id=nv.id JOIN m1.income_fact f ON f.id=p.income_fact_id WHERE nv.version_no=3 GROUP BY nv.id,p.standard_work_id;
    UPDATE m1.mapping_version SET status='validated',projection_row_count=2,projection_total_amount=122.123456789012345677,projection_checksum='v3',validated_at=now() WHERE version_no=3;
    """
    expect_success("second mapping snapshot built invisibly", "lifecycle", mv3_sql)
    expect_success("new batch activation keeps batch/mapping atomic", "lifecycle", "SELECT m1.activate_bill_batch((SELECT id FROM m1.import_batch WHERE batch_no='SYN-B2'),(SELECT id FROM m1.mapping_version WHERE version_no=3),'validation'); SELECT count(*) FROM m1.v_current_income;", "2")
    expect_success("negative-only business form has no first-positive month", "invariants", "SELECT first_positive_sale_month IS NULL AND positive_fact_count=0 FROM m1.mapping_version_work_form_metric m JOIN m1.mapping_version v ON v.id=m.mapping_version_id WHERE v.version_no=3 AND m.business_form='audio_product';", "t")
    expect_success("NUMERIC aggregation preserves 18 decimals", "invariants", "SELECT sum(actual_sales_amount)::text FROM m1.v_current_income;", "122.123456789012345677")

    mv4 = create_mapping_candidate(4, "revoke")
    # Candidate helper cloned both active facts; remove row2 before validation is not allowed because it already validated.
    # Rebuild candidate 4 as a failed test artifact, then use candidate 5 for actual revoke.
    expect_failure("revoke rejects candidate still containing revoked batch", "lifecycle", f"SELECT m1.revoke_bill_batch((SELECT id FROM m1.import_batch WHERE batch_no='SYN-B2'),{mv4},'validation');", "outside visible batch set")
    revoke_sql = """
    INSERT INTO m1.background_task(task_type,logical_operation_key,idempotency_key,status,finished_at) VALUES('mapping_build','v5','v5','succeeded',now());
    INSERT INTO m1.mapping_version(version_no,status,base_version_id,trigger_type,build_task_id) SELECT 5,'building',id,'revoke',currval('m1.background_task_id_seq') FROM m1.mapping_version WHERE status='active';
    INSERT INTO m1.channel_alias(mapping_version_id,channel_id,raw_channel_id,raw_channel_name,normalized_channel_name,mapping_source) SELECT nv.id,ca.channel_id,ca.raw_channel_id,ca.raw_channel_name,ca.normalized_channel_name,ca.mapping_source FROM m1.mapping_version nv,m1.mapping_version ov,m1.channel_alias ca WHERE nv.version_no=5 AND ov.status='active' AND ca.mapping_version_id=ov.id;
    INSERT INTO m1.raw_work_id_mapping(mapping_version_id,raw_work_id,standard_work_id,business_form,mapping_source) SELECT nv.id,r.raw_work_id,r.standard_work_id,r.business_form,r.mapping_source FROM m1.mapping_version nv,m1.mapping_version ov,m1.raw_work_id_mapping r WHERE nv.version_no=5 AND ov.status='active' AND r.mapping_version_id=ov.id;
    INSERT INTO m1.income_projection(mapping_version_id,income_fact_id,channel_id,standard_work_id,business_form,channel_alias_id,raw_work_mapping_id,projection_rule_code)
      SELECT nv.id,f.id,ca.channel_id,r.standard_work_id,r.business_form,ca.id,r.id,'prototype' FROM m1.mapping_version nv JOIN m1.income_fact f ON f.row_hash='row1' JOIN m1.channel_alias ca ON ca.mapping_version_id=nv.id AND ca.raw_channel_id=f.raw_channel_id JOIN m1.raw_work_id_mapping r ON r.mapping_version_id=nv.id AND r.raw_work_id=f.raw_work_id WHERE nv.version_no=5;
    INSERT INTO m1.mapping_version_work_form_metric SELECT nv.id,p.standard_work_id,p.business_form,min(f.bill_month),count(*),'v5',now() FROM m1.mapping_version nv JOIN m1.income_projection p ON p.mapping_version_id=nv.id JOIN m1.income_fact f ON f.id=p.income_fact_id WHERE nv.version_no=5 GROUP BY nv.id,p.standard_work_id,p.business_form;
    INSERT INTO m1.mapping_version_work_metric SELECT nv.id,p.standard_work_id,min(f.bill_month),count(*),'v5',now() FROM m1.mapping_version nv JOIN m1.income_projection p ON p.mapping_version_id=nv.id JOIN m1.income_fact f ON f.id=p.income_fact_id WHERE nv.version_no=5 GROUP BY nv.id,p.standard_work_id;
    UPDATE m1.mapping_version SET status='validated',projection_row_count=1,projection_total_amount=123.123456789012345678,projection_checksum='v5',validated_at=now() WHERE version_no=5;
    """
    expect_success("revocation mapping prepared", "lifecycle", revoke_sql)
    expect_success("batch revocation and mapping switch atomic", "lifecycle", "SELECT m1.revoke_bill_batch((SELECT id FROM m1.import_batch WHERE batch_no='SYN-B2'),(SELECT id FROM m1.mapping_version WHERE version_no=5),'validation'); SELECT count(*) FROM m1.v_current_income;", "1")

    mv6 = create_mapping_candidate(6, "pure_mapping")
    expect_success("pure mapping switch", "lifecycle", f"SELECT m1.switch_mapping_version({mv6},'validation'); SELECT version_no FROM m1.mapping_version WHERE status='active';", "6")
    basic_sql = """
    INSERT INTO m1.background_task(task_type,logical_operation_key,idempotency_key,status,finished_at) VALUES('basic_info_build','bi2','bi2','succeeded',now());
    INSERT INTO m1.basic_info_version(version_no,status,source_type,classification_release_id,tag_release_id,build_task_id,snapshot_work_count,snapshot_checksum,validated_at)
      SELECT 2,'validated','ops_supplement',cr.id,tr.id,currval('m1.background_task_id_seq'),0,'bi2',now() FROM m1.classification_release cr,m1.tag_release tr WHERE cr.status='active' AND tr.status='active';
    SELECT m1.switch_basic_info_version((SELECT id FROM m1.basic_info_version WHERE version_no=2),'validation');
    """
    expect_success("basic info version switch", "lifecycle", basic_sql)
    reference_switch_sql = """
    INSERT INTO m1.classification_system(system_code,display_name) VALUES('publication','Publication');
    INSERT INTO m1.classification_release(version_no,status,release_note) VALUES(2,'draft','synthetic release');
    INSERT INTO m1.tag_release(version_no,status,release_note) VALUES(2,'draft','synthetic release');
    INSERT INTO m1.classification_node(classification_release_id,classification_system_id,node_code,display_name,level)
      SELECT cr.id,cs.id,'L1','Synthetic L1',1 FROM m1.classification_release cr,m1.classification_system cs WHERE cr.version_no=2;
    INSERT INTO m1.classification_node(classification_release_id,classification_system_id,parent_id,node_code,display_name,level)
      SELECT cr.id,cs.id,p.id,'L2','Synthetic L2',2 FROM m1.classification_release cr,m1.classification_system cs,m1.classification_node p WHERE cr.version_no=2 AND p.classification_release_id=cr.id AND p.node_code='L1';
    INSERT INTO m1.classification_node(classification_release_id,classification_system_id,parent_id,node_code,display_name,level)
      SELECT cr.id,cs.id,p.id,'L3','Synthetic L3',3 FROM m1.classification_release cr,m1.classification_system cs,m1.classification_node p WHERE cr.version_no=2 AND p.classification_release_id=cr.id AND p.node_code='L2';
    INSERT INTO m1.tag(tag_release_id,tag_code,display_name,normalized_name,tag_type)
      SELECT id,'T1','Synthetic Tag','synthetic tag','auxiliary_content' FROM m1.tag_release WHERE version_no=2;
    INSERT INTO m1.author(author_code,primary_name) VALUES('A1','Synthetic Author');
    INSERT INTO m1.background_task(task_type,logical_operation_key,idempotency_key,status,finished_at) VALUES('basic_info_build','bi3','bi3','succeeded',now());
    INSERT INTO m1.basic_info_version(version_no,status,source_type,classification_release_id,tag_release_id,build_task_id,snapshot_work_count)
      SELECT 3,'building','formal_basic_info',cr.id,tr.id,currval('m1.background_task_id_seq'),1 FROM m1.classification_release cr,m1.tag_release tr WHERE cr.version_no=2 AND tr.version_no=2;
    INSERT INTO m1.basic_info_version_work(basic_info_version_id,standard_work_id,standard_work_name,author_id,copyright_start_date,copyright_end_date,copyright_source_priority)
      SELECT biv.id,'12345','Synthetic Work',a.id,'2025-01-01','2030-01-01','formal_basic_info_version' FROM m1.basic_info_version biv,m1.author a WHERE biv.version_no=3 AND a.author_code='A1';
    INSERT INTO m1.work_classification_assignment(basic_info_version_id,standard_work_id,classification_node_id,source_type)
      SELECT biv.id,'12345',cn.id,'formal_basic_info' FROM m1.basic_info_version biv,m1.classification_node cn WHERE biv.version_no=3 AND cn.node_code='L3' AND cn.classification_release_id=biv.classification_release_id;
    INSERT INTO m1.work_tag_assignment(basic_info_version_id,standard_work_id,tag_id,source_type)
      SELECT biv.id,'12345',t.id,'formal_basic_info' FROM m1.basic_info_version biv,m1.tag t WHERE biv.version_no=3 AND t.tag_release_id=biv.tag_release_id;
    UPDATE m1.basic_info_version SET status='validated',snapshot_checksum='bi3',validated_at=now() WHERE version_no=3;
    SELECT m1.switch_basic_info_version((SELECT id FROM m1.basic_info_version WHERE version_no=3),'validation');
    SELECT (SELECT version_no FROM m1.basic_info_version WHERE status='active')::text||':'||(SELECT version_no FROM m1.classification_release WHERE status='active')::text||':'||(SELECT version_no FROM m1.tag_release WHERE status='active')::text;
    """
    expect_success("basic info, classification and tag releases switch atomically", "lifecycle", reference_switch_sql, "3:2:2")
    expect_failure("active classification release rejects node append", "invariants", "INSERT INTO m1.classification_node(classification_release_id,classification_system_id,node_code,display_name,level) SELECT cr.id,cs.id,'LATE','Late',1 FROM m1.classification_release cr,m1.classification_system cs WHERE cr.status='active';", "immutable")
    expect_failure("active basic-info snapshot rejects row append", "invariants", "INSERT INTO m1.basic_info_version_work(basic_info_version_id,standard_work_id,standard_work_name) SELECT id,'99999','Late Work' FROM m1.basic_info_version WHERE status='active';", "immutable")

    bad_sql = """
    INSERT INTO m1.background_task(task_type,logical_operation_key,idempotency_key,status,finished_at) VALUES('mapping_build','bad','bad','succeeded',now());
    INSERT INTO m1.mapping_version(version_no,status,base_version_id,trigger_type,build_task_id,projection_row_count,projection_total_amount,projection_checksum,validated_at)
      SELECT 7,'validated',id,'bad',currval('m1.background_task_id_seq'),0,0,'bad',now() FROM m1.mapping_version WHERE status='active';
    """
    expect_success("invalid candidate can remain invisible", "lifecycle", bad_sql)
    expect_failure("validated mapping metadata is frozen", "invariants", "UPDATE m1.mapping_version SET projection_checksum='changed' WHERE version_no=7;", "frozen")
    expect_failure("pre-commit validation failure rolls back switch", "lifecycle", "SELECT m1.switch_mapping_version((SELECT id FROM m1.mapping_version WHERE version_no=7),'validation');", "coverage mismatch")
    expect_success("failed switch leaves prior active mapping", "lifecycle", "SELECT version_no FROM m1.mapping_version WHERE status='active';", "6")

    expect_failure("application_rw cannot update income_fact", "permissions", "SET ROLE application_rw; UPDATE m1.income_fact SET actual_sales_amount=0;")
    expect_failure("application_rw cannot switch active version", "permissions", f"SET ROLE application_rw; SELECT m1.switch_mapping_version({mv6},'x');")
    expect_success("application_rw can call authorized parser", "permissions", "SET ROLE application_rw; SELECT m1.derive_business_form('Y12345');", "audio_product")
    expect_success("application_ro can query formal view", "permissions", "SET ROLE application_ro; SELECT count(*) FROM m1.v_current_income;", "1")
    expect_failure("application_ro cannot query base facts", "permissions", "SET ROLE application_ro; SELECT count(*) FROM m1.income_fact;")
    expect_success("background_worker can create a building candidate", "permissions", "SET ROLE background_worker; INSERT INTO m1.background_task(task_type,logical_operation_key,idempotency_key,status,finished_at) VALUES('mapping_build','worker-candidate','worker-candidate','succeeded',now()); INSERT INTO m1.mapping_version(version_no,status,base_version_id,trigger_type,build_task_id) SELECT 90,'building',id,'worker',currval('m1.background_task_id_seq') FROM m1.mapping_version WHERE status='active'; SELECT status FROM m1.mapping_version WHERE version_no=90;", "building")
    expect_failure("background_worker cannot activate mapping directly", "permissions", "SET ROLE background_worker; UPDATE m1.mapping_version SET status='active',activated_at=now() WHERE version_no=7;")
    expect_failure("backup_operator has no business write", "permissions", "SET ROLE backup_operator; INSERT INTO m1.channel(channel_code,display_name) VALUES('X','X');")
    expect_success("SECURITY DEFINER functions have fixed search_path", "permissions", "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='m1' AND p.prosecdef AND array_to_string(p.proconfig,',') LIKE '%search_path=pg_catalog, m1%';", "7")
    expect_success("caller search_path cannot pollute SECURITY DEFINER lookup", "permissions", "SET search_path=public; SELECT m1.assert_mapping_coverage((SELECT id FROM m1.mapping_version WHERE status='active'),NULL,NULL);", None)

    # Prepare one valid candidate for concurrent switching.
    concurrent_mv = create_mapping_candidate(8, "concurrency")
    session_a_sql = f"BEGIN; SET lock_timeout='5s'; SELECT m1.switch_mapping_version({concurrent_mv},'session-a'); SELECT pg_sleep(2); COMMIT;"
    timeout_mv = create_mapping_candidate(9, "concurrency_timeout")
    a_result: dict = {}

    def run_a() -> None:
        a_result["cp"] = psql(TEST_DB, session_a_sql, timeout=30)

    thread = threading.Thread(target=run_a)
    thread.start()
    time.sleep(0.4)
    b = psql(TEST_DB, f"SET lock_timeout='300ms'; SELECT m1.switch_mapping_version({timeout_mv},'session-b');", timeout=10)
    thread.join()
    a = a_result["cp"]
    record("first concurrent switch commits", "concurrency", a.returncode == 0, a.stdout + a.stderr)
    record("second concurrent switch times out on advisory lock", "concurrency", b.returncode != 0, b.stdout+b.stderr)
    expect_success("timeout leaves one complete active version", "concurrency", "SELECT count(*)||':'||max(version_no) FROM m1.mapping_version WHERE status='active';", "1:8")


def run_performance_baseline() -> dict:
    reset_database(PERF_DB)
    expect_success("performance DB lifecycle bootstrap", "performance", "SELECT m1.begin_master_data_initialization('perf'); SELECT m1.initialize_bootstrap_versions('perf');", db=PERF_DB)
    timings: dict[str, float | int | str | dict] = {}

    def timed(label: str, sql: str, timeout: int = 600) -> subprocess.CompletedProcess:
        start = time.perf_counter()
        cp = psql(PERF_DB, sql, timeout=timeout)
        timings[label] = round(time.perf_counter()-start, 6)
        record(label, "performance", cp.returncode == 0, cp.stdout+cp.stderr)
        return cp

    timed("synthetic master identities", """
      INSERT INTO m1.standard_work(standard_work_id,identity_source) SELECT g::text,'bill_derived' FROM generate_series(1,5000) g;
      INSERT INTO m1.work_business_form SELECT standard_work_id,'audio_copyright',now(),'perf' FROM m1.standard_work;
      INSERT INTO m1.work_business_form SELECT standard_work_id,'audio_product',now(),'perf' FROM m1.standard_work;
      INSERT INTO m1.channel(channel_code,display_name) SELECT 'C'||g,'Synthetic Channel '||g FROM generate_series(1,50) g;
      INSERT INTO m1.background_task(task_type,logical_operation_key,idempotency_key,status,finished_at) VALUES('perf','perf','perf','succeeded',now());
      INSERT INTO m1.cleaning_rule_version(rule_code,version_no,status,rule_payload) VALUES('bill',1,'active','{}');
      INSERT INTO m1.file_fingerprint_registry(sha256,file_size_bytes) VALUES(repeat('c',64),1000000);
      INSERT INTO m1.import_file(fingerprint_id,original_filename) VALUES(currval('m1.file_fingerprint_registry_id_seq'),'synthetic-performance.xlsx');
      INSERT INTO m1.bill_staging_session(task_id,import_file_id,rule_version_id) VALUES(currval('m1.background_task_id_seq'),currval('m1.import_file_id_seq'),currval('m1.cleaning_rule_version_id_seq'));
    """)
    timed("staging write 192899 rows", """
      INSERT INTO m1.temp_bill_record(staging_session_id,source_sheet_name,source_row_number,bill_month,raw_channel_id,raw_channel_name,raw_authorization_category,raw_work_id,raw_work_name,actual_sales_amount,parse_status,row_hash)
      SELECT (SELECT id FROM m1.bill_staging_session ORDER BY id DESC LIMIT 1),'Synthetic',g,date '2024-01-01'+((g%24)||' months')::interval,
             'C'||((g%50)+1),'Synthetic Channel '||((g%50)+1),'Synthetic Category',
             CASE WHEN g%2=0 THEN ((g%5000)+1)::text ELSE 'Y'||((g%5000)+1)::text END,
             'Synthetic Work '||((g%5000)+1),((g%200001)-100000)::numeric/1000000000000000000::numeric,'parsed',md5(g::text)
      FROM generate_series(1,192899) g;
      UPDATE m1.bill_staging_session SET status='parsed',parsed_row_count=192899,valid_row_count=192899,
        raw_total_amount=(SELECT sum(actual_sales_amount) FROM m1.temp_bill_record) WHERE id=(SELECT max(id) FROM m1.bill_staging_session);
    """)
    timed("fact write 192899 rows", """
      INSERT INTO m1.import_batch(batch_no,rule_version_id) SELECT 'PERF-B1',id FROM m1.cleaning_rule_version WHERE rule_code='bill' AND status='active';
      INSERT INTO m1.income_fact(import_batch_id,import_file_id,source_sheet_name,source_row_number,bill_month,raw_channel_id,raw_channel_name,raw_authorization_category,raw_work_id,raw_work_name,actual_sales_amount,row_hash)
      SELECT (SELECT id FROM m1.import_batch WHERE batch_no='PERF-B1'),(SELECT id FROM m1.import_file WHERE original_filename='synthetic-performance.xlsx'),source_sheet_name,source_row_number,bill_month,
             raw_channel_id,raw_channel_name,raw_authorization_category,raw_work_id,raw_work_name,actual_sales_amount,row_hash
      FROM m1.temp_bill_record;
    """)
    timed("candidate mapping identities", """
      INSERT INTO m1.background_task(task_type,logical_operation_key,idempotency_key,status,finished_at) VALUES('mapping_build','perf-mv','perf-mv','succeeded',now());
      INSERT INTO m1.mapping_version(version_no,status,base_version_id,trigger_type,build_task_id) SELECT 2,'building',id,'first_batch',currval('m1.background_task_id_seq') FROM m1.mapping_version WHERE status='active';
      INSERT INTO m1.channel_alias(mapping_version_id,channel_id,raw_channel_id,raw_channel_name,normalized_channel_name,mapping_source)
        SELECT mv.id,c.id,c.channel_code,c.display_name,lower(c.display_name),'bill_observed' FROM m1.mapping_version mv CROSS JOIN m1.channel c WHERE mv.version_no=2;
      INSERT INTO m1.raw_work_id_mapping(mapping_version_id,raw_work_id,standard_work_id,business_form,mapping_source)
        SELECT mv.id,sw.standard_work_id,sw.standard_work_id,'audio_copyright','id_rule' FROM m1.mapping_version mv CROSS JOIN m1.standard_work sw WHERE mv.version_no=2;
      INSERT INTO m1.raw_work_id_mapping(mapping_version_id,raw_work_id,standard_work_id,business_form,mapping_source)
        SELECT mv.id,'Y'||sw.standard_work_id,sw.standard_work_id,'audio_product','id_rule' FROM m1.mapping_version mv CROSS JOIN m1.standard_work sw WHERE mv.version_no=2;
    """)
    timed("full projection build 192899 rows", """
      INSERT INTO m1.income_projection(mapping_version_id,income_fact_id,channel_id,standard_work_id,business_form,channel_alias_id,raw_work_mapping_id,projection_rule_code)
      SELECT mv.id,f.id,ca.channel_id,r.standard_work_id,r.business_form,ca.id,r.id,'prototype'
      FROM m1.mapping_version mv JOIN m1.income_fact f ON true
      JOIN m1.channel_alias ca ON ca.mapping_version_id=mv.id AND ca.raw_channel_id=f.raw_channel_id AND ca.raw_channel_name=f.raw_channel_name
      JOIN m1.raw_work_id_mapping r ON r.mapping_version_id=mv.id AND r.raw_work_id=f.raw_work_id WHERE mv.version_no=2;
    """)
    timed("first positive metrics build", """
      INSERT INTO m1.mapping_version_work_form_metric(mapping_version_id,standard_work_id,business_form,first_positive_sale_month,positive_fact_count,source_projection_checksum)
      SELECT p.mapping_version_id,p.standard_work_id,p.business_form,min(f.bill_month) FILTER(WHERE f.actual_sales_amount>0),count(*) FILTER(WHERE f.actual_sales_amount>0),'perf'
      FROM m1.income_projection p JOIN m1.income_fact f ON f.id=p.income_fact_id GROUP BY p.mapping_version_id,p.standard_work_id,p.business_form;
      INSERT INTO m1.mapping_version_work_metric(mapping_version_id,standard_work_id,launch_month,positive_fact_count,source_projection_checksum)
      SELECT p.mapping_version_id,p.standard_work_id,min(f.bill_month) FILTER(WHERE f.actual_sales_amount>0),count(*) FILTER(WHERE f.actual_sales_amount>0),'perf'
      FROM m1.income_projection p JOIN m1.income_fact f ON f.id=p.income_fact_id GROUP BY p.mapping_version_id,p.standard_work_id;
    """)
    timed("strict reconciliation preparation", """
      UPDATE m1.mapping_version mv SET status='validated',projection_row_count=x.c,projection_total_amount=x.a,projection_checksum='perf',validated_at=now()
      FROM (SELECT count(*) c,sum(f.actual_sales_amount) a FROM m1.income_projection p JOIN m1.income_fact f ON f.id=p.income_fact_id WHERE p.mapping_version_id=(SELECT id FROM m1.mapping_version WHERE version_no=2)) x WHERE mv.version_no=2;
      UPDATE m1.import_batch b SET status='ready',raw_row_count=x.c,accepted_row_count=x.c,fact_row_count=x.c,projection_row_count=x.c,
        raw_total_amount=x.a,accepted_total_amount=x.a,fact_total_amount=x.a,projection_total_amount=x.a,reconciliation_checksum='perf',reconciled_at=now()
      FROM (SELECT count(*) c,sum(actual_sales_amount) a FROM m1.income_fact) x WHERE b.batch_no='PERF-B1';
    """)
    timed("mapping and batch atomic switch", "SELECT m1.activate_bill_batch((SELECT id FROM m1.import_batch WHERE batch_no='PERF-B1'),(SELECT id FROM m1.mapping_version WHERE version_no=2),'perf');")
    timed("aggregate by month work channel form", "SELECT count(*) FROM (SELECT bill_month,standard_work_id,channel_id,business_form,sum(actual_sales_amount) FROM m1.v_current_income GROUP BY 1,2,3,4) q;")

    plans = {}
    for label, query in {
        "month": "SELECT bill_month,sum(actual_sales_amount) FROM m1.v_current_income GROUP BY bill_month",
        "work": "SELECT standard_work_id,sum(actual_sales_amount) FROM m1.v_current_income GROUP BY standard_work_id",
        "channel": "SELECT channel_id,sum(actual_sales_amount) FROM m1.v_current_income GROUP BY channel_id",
        "form": "SELECT business_form,sum(actual_sales_amount) FROM m1.v_current_income GROUP BY business_form",
    }.items():
        cp = psql(PERF_DB, f"EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) {query};")
        record(f"EXPLAIN {label}", "performance", cp.returncode == 0, cp.stdout+cp.stderr)
        plans[label] = cp.stdout.strip()
    size_cp = psql(PERF_DB, "SELECT pg_database_size(current_database()),COALESCE(sum(pg_relation_size(indexrelid)),0) FROM pg_stat_user_indexes;")
    if size_cp.returncode == 0:
        parts = size_cp.stdout.strip().splitlines()[-1].split('|')
        timings["database_size_bytes"] = int(parts[0])
        timings["index_size_bytes"] = int(parts[1])
    timings["row_count"] = 192899
    timings["plans"] = plans
    return timings


def main() -> int:
    started = datetime.now(timezone.utc)
    server = command("psql.exe", ["-h", HOST, "-p", PORT, "-U", USER, "-d", "postgres", "-X", "-At", "-c",
             "select version()||'|listen='||current_setting('listen_addresses')||'|port='||current_setting('port')||'|timezone='||current_setting('TimeZone')||'|statement_timeout='||current_setting('statement_timeout')||'|lock_timeout='||current_setting('lock_timeout')||'|max_connections='||current_setting('max_connections')||'|shared_buffers='||current_setting('shared_buffers')||'|user='||current_user;"])
    run_structural_and_lifecycle_tests()
    performance = run_performance_baseline()
    sql_files = sorted(SQL_ROOT.rglob("*.sql"))
    header_failures = [str(p.relative_to(ROOT)) for p in sql_files if not p.read_text(encoding="utf-8").startswith("-- NON-PRODUCTION PROTOTYPE — NOT A FORMAL MIGRATION")]
    record("all prototype SQL files carry non-production banner", "boundary", not header_failures, json.dumps(header_failures,ensure_ascii=False))
    formal_path_exists = (ROOT.parents[1] / "db" / "migrations").exists()
    record("formal db/migrations directory not created", "boundary", not formal_path_exists, str(formal_path_exists))
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "started_at": started.isoformat(),
        "environment": {
            "server": server.stdout.strip(), "host": HOST, "port": PORT,
            "os": platform.platform(), "python": platform.python_version(),
            "cpu_logical": os.cpu_count(),
        },
        "object_counts": {
            "prototype_sql_files": len(sql_files),
            "tables": 48,
        },
        "summary": {
            "passed": sum(r["status"]=="passed" for r in results),
            "failed": sum(r["status"]=="failed" for r in results),
            "total": len(results),
        },
        "tests": results,
        "performance": performance,
        "sql_checksums": {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sql_files},
    }
    (REPORTS / "validation-results.json").write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding="utf-8")
    (REPORTS / "test-execution.log").write_text("\n\n".join(execution_log),encoding="utf-8")
    return 0 if payload["summary"]["failed"]==0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
