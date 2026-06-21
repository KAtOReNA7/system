
"""FORMAL MIGRATION CANDIDATE ? NOT YET APPROVED FOR PRODUCTION.

Runs destructive validation only against explicitly named local candidate databases.
Uses Flyway to apply candidate migrations. No repository business data is read.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import platform
import shutil
import subprocess
import secrets
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
PROTO_TEST = REPO / "experiments" / "m1-postgresql16-prototype" / "tests" / "run_prototype_validation.py"
MIGRATIONS_ROOT = ROOT / "migrations"
CONFIG_FILE = ROOT / "config" / "flyway-candidate-template.conf"
REPORTS = ROOT / "reports"
REPORTS.mkdir(parents=True, exist_ok=True)
PG_BIN = Path(os.environ.get("PG_BIN", r"C:\Program Files\PostgreSQL\16\bin"))
HOST = os.environ.get("PGHOST", "127.0.0.1")
PORT = os.environ.get("PGPORT", "55432")
ADMIN_USER = os.environ.get("PGADMINUSER", "postgres")
ADMIN_PASSWORD = os.environ.get("PGADMINPASSWORD", os.environ.get("PGPASSWORD", ""))

def runtime_password(env_name: str) -> str:
    return os.environ.get(env_name) or secrets.token_urlsafe(24)

ROLE_PASSWORDS = {
    "migration_owner": os.environ.get("M1_MIGRATION_OWNER_PASSWORD", os.environ.get("FLYWAY_PASSWORD", "")) or runtime_password("M1_MIGRATION_OWNER_PASSWORD"),
    "application_rw": runtime_password("M1_APPLICATION_RW_PASSWORD"),
    "application_ro": runtime_password("M1_APPLICATION_RO_PASSWORD"),
    "background_worker": runtime_password("M1_BACKGROUND_WORKER_PASSWORD"),
    "backup_operator": runtime_password("M1_BACKUP_OPERATOR_PASSWORD"),
}
TEST_DB = "m1_flyway_candidate_a"
SECOND_DB = "m1_flyway_candidate_b"

execution_log: list[str] = []


def run_cmd(cmd: list[str], *, timeout: int = 300, env: dict | None = None, redact: bool = False, input_text: str | None = None) -> subprocess.CompletedProcess:
    cp = subprocess.run(cmd, input=input_text, text=True, encoding="utf-8", errors="replace", capture_output=True, timeout=timeout, env=env)
    shown = " ".join(cmd)
    if redact:
        shown = "<redacted setup command>"
    execution_log.append(f"$ {shown}\n{cp.stdout}{cp.stderr}")
    return cp


def pg_env(password: str) -> dict:
    env = os.environ.copy()
    env["PGPASSWORD"] = password
    return env


def psql(db: str, sql: str, *, role: str = "migration_owner", timeout: int = 300, redact: bool = False) -> subprocess.CompletedProcess:
    prefix = "SET client_min_messages=warning; SET statement_timeout='5min'; SET lock_timeout='2s'; SET TIME ZONE 'UTC'; "
    return run_cmd([str(PG_BIN / "psql.exe"), "-h", HOST, "-p", PORT, "-U", role, "-d", db, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", prefix + sql], timeout=timeout, env=pg_env(ROLE_PASSWORDS.get(role, ADMIN_PASSWORD)), redact=redact)


def admin_psql(sql: str, *, db: str = "postgres", timeout: int = 300, redact: bool = False) -> subprocess.CompletedProcess:
    return run_cmd([str(PG_BIN / "psql.exe"), "-h", HOST, "-p", PORT, "-U", ADMIN_USER, "-d", db, "-X", "-v", "ON_ERROR_STOP=1", "-q", "-c", sql], timeout=timeout, env=pg_env(ADMIN_PASSWORD), redact=redact)


def flyway(db: str, action: str, *, config_file: Path | None = None, timeout: int = 300) -> subprocess.CompletedProcess:
    env = os.environ.copy()
    env["FLYWAY_PASSWORD"] = ROLE_PASSWORDS["migration_owner"]
    cfg = str(config_file or CONFIG_FILE)
    url = f"jdbc:postgresql://{HOST}:{PORT}/{db}"
    return run_cmd(["flyway", f"-configFiles={cfg}", f"-url={url}", f"-locations=filesystem:{MIGRATIONS_ROOT.as_posix()}", action], timeout=timeout, env=env)


def prepare_roles() -> None:
    sql = """
DO $setup$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='migration_owner') THEN CREATE ROLE migration_owner LOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='application_rw') THEN CREATE ROLE application_rw LOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='application_ro') THEN CREATE ROLE application_ro LOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='background_worker') THEN CREATE ROLE background_worker LOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='backup_operator') THEN CREATE ROLE backup_operator LOGIN; END IF;
END
$setup$;
"""
    for role, password in ROLE_PASSWORDS.items():
        sql += f"ALTER ROLE {role} LOGIN PASSWORD '{password}';\n"
    cp = admin_psql(sql, redact=True)
    if cp.returncode:
        raise RuntimeError(cp.stderr)


def reset_database(db: str) -> None:
    prepare_roles()
    run_cmd([str(PG_BIN / "dropdb.exe"), "-h", HOST, "-p", PORT, "-U", ADMIN_USER, "--if-exists", "--force", db], env=pg_env(ADMIN_PASSWORD))
    cp = run_cmd([str(PG_BIN / "createdb.exe"), "-h", HOST, "-p", PORT, "-U", ADMIN_USER, "-T", "template0", "-E", "UTF8", "-O", "migration_owner", db], env=pg_env(ADMIN_PASSWORD))
    if cp.returncode:
        raise RuntimeError(cp.stderr)
    cp = admin_psql(f"ALTER DATABASE {db} SET TimeZone TO 'UTC';")
    if cp.returncode:
        raise RuntimeError(cp.stderr)
    cp = flyway(db, "migrate", timeout=900)
    (REPORTS / f"flyway-{db}-migrate.log").write_text(cp.stdout + cp.stderr, encoding="utf-8")
    if cp.returncode:
        raise RuntimeError(cp.stdout + cp.stderr)


def load_proto_module():
    spec = importlib.util.spec_from_file_location("m1_proto_validation", PROTO_TEST)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


def attach_candidate_runtime(mod):
    mod.ROOT = ROOT
    mod.REPORTS = REPORTS
    mod.TEST_DB = TEST_DB
    mod.PERF_DB = TEST_DB
    mod.USER = "migration_owner"
    mod.PASSWORD = ROLE_PASSWORDS["migration_owner"]
    mod.execution_log = execution_log

    def candidate_command(exe: str, args: list[str], *, timeout: int = 300, input_text: str | None = None):
        env = pg_env(ROLE_PASSWORDS["migration_owner"])
        cmd = [str(PG_BIN / exe), *args]
        cp = run_cmd(cmd, timeout=timeout, env=env, input_text=input_text)
        return cp

    def candidate_psql(db: str, sql: str, *, timeout: int = 300):
        return psql(db, sql, role="migration_owner", timeout=timeout)

    def run_sql_with_possible_role(db_name: str, sql_text: str):
        stripped = sql_text.strip()
        for role in ("application_rw", "application_ro", "background_worker", "backup_operator"):
            prefix = f"SET ROLE {role};"
            if stripped.startswith(prefix):
                return psql(db_name, stripped[len(prefix):].strip(), role=role)
        return candidate_psql(db_name, sql_text)

    def candidate_expect_success(name: str, category: str, sql: str, contains: str | None = None, db: str | None = None):
        cp = run_sql_with_possible_role(db or mod.TEST_DB, sql)
        ok = cp.returncode == 0 and (contains is None or contains in cp.stdout)
        mod.record(name, category, ok, cp.stdout + cp.stderr)
        return cp

    def candidate_expect_failure(name: str, category: str, sql: str, contains: str | None = None, db: str | None = None):
        cp = run_sql_with_possible_role(db or mod.TEST_DB, sql)
        text = cp.stdout + cp.stderr
        ok = cp.returncode != 0 and (contains is None or contains in text)
        mod.record(name, category, ok, text)
        return cp

    mod.command = candidate_command
    mod.psql = candidate_psql
    mod.expect_success = candidate_expect_success
    mod.expect_failure = candidate_expect_failure
    mod.reset_database = reset_database
    return mod


def record(mod, name: str, category: str, passed: bool, detail: str = "") -> None:
    mod.results.append({"name": name, "category": category, "status": "passed" if passed else "failed", "detail": detail.strip()[:4000]})


def run_flyway_behavior_tests(mod) -> dict:
    info = {}
    cp_info = flyway(TEST_DB, "info")
    (REPORTS / "flyway-a-info.log").write_text(cp_info.stdout + cp_info.stderr, encoding="utf-8")
    record(mod, "flyway info succeeds", "flyway", cp_info.returncode == 0 and "0060.290" in (cp_info.stdout + cp_info.stderr), cp_info.stdout + cp_info.stderr)

    cp_validate = flyway(TEST_DB, "validate")
    (REPORTS / "flyway-a-validate.log").write_text(cp_validate.stdout + cp_validate.stderr, encoding="utf-8")
    record(mod, "flyway validate succeeds", "flyway", cp_validate.returncode == 0 and "Successfully validated" in (cp_validate.stdout + cp_validate.stderr), cp_validate.stdout + cp_validate.stderr)

    cp_second = flyway(TEST_DB, "migrate")
    (REPORTS / "flyway-a-second-migrate.log").write_text(cp_second.stdout + cp_second.stderr, encoding="utf-8")
    txt_second = cp_second.stdout + cp_second.stderr
    record(mod, "second flyway migrate is idempotent", "flyway", cp_second.returncode == 0 and ("No migration necessary" in txt_second or "up to date" in txt_second.lower()), txt_second)

    tmp = REPORTS / "tamper_migrations_copy"
    if tmp.exists():
        shutil.rmtree(tmp)
    shutil.copytree(MIGRATIONS_ROOT, tmp)
    target = sorted(tmp.glob("*.sql"))[0]
    target.write_text(target.read_text(encoding="utf-8") + "\n-- checksum tamper for validation test\n", encoding="utf-8")
    env = os.environ.copy()
    env["FLYWAY_PASSWORD"] = ROLE_PASSWORDS["migration_owner"]
    tamper_url = f"jdbc:postgresql://{HOST}:{PORT}/{TEST_DB}"
    cp_tamper = run_cmd(["flyway", f"-configFiles={CONFIG_FILE}", f"-url={tamper_url}", f"-locations=filesystem:{tmp.as_posix()}", "validate"], timeout=300, env=env)
    (REPORTS / "flyway-a-validate-tamper-expected-failure.log").write_text(cp_tamper.stdout + cp_tamper.stderr, encoding="utf-8")
    record(mod, "flyway validate fails after checksum tamper", "flyway", cp_tamper.returncode != 0 and "checksum" in (cp_tamper.stdout + cp_tamper.stderr).lower(), cp_tamper.stdout + cp_tamper.stderr)

    cp_restore = flyway(TEST_DB, "validate")
    (REPORTS / "flyway-a-validate-restored.log").write_text(cp_restore.stdout + cp_restore.stderr, encoding="utf-8")
    record(mod, "flyway validate succeeds after original location restored", "flyway", cp_restore.returncode == 0, cp_restore.stdout + cp_restore.stderr)
    shutil.rmtree(tmp, ignore_errors=True)

    cp_b_info = flyway(SECOND_DB, "info")
    (REPORTS / "flyway-b-info.log").write_text(cp_b_info.stdout + cp_b_info.stderr, encoding="utf-8")
    record(mod, "B database flyway info succeeds", "flyway", cp_b_info.returncode == 0 and "0060.290" in (cp_b_info.stdout + cp_b_info.stderr), cp_b_info.stdout + cp_b_info.stderr)
    return info


def run_true_role_permission_tests(mod) -> None:
    tests = [
        ("application_rw cannot update income_fact", "application_rw", "UPDATE m1.income_fact SET raw_work_name=raw_work_name WHERE id=1;", False, "permission"),
        ("application_rw cannot directly switch mapping_version", "application_rw", "UPDATE m1.mapping_version SET status='active' WHERE id=1;", False, "permission"),
        ("application_ro can query official view", "application_ro", "SELECT count(*) >= 0 FROM m1.v_current_income;", True, "t"),
        ("application_ro cannot query income_fact table", "application_ro", "SELECT count(*) FROM m1.income_fact;", False, "permission"),
        ("backup_operator has no business write", "backup_operator", "INSERT INTO m1.channel(channel_code,display_name) VALUES('BK','Backup');", False, "permission"),
    ]
    for name, role, sql, should_pass, marker in tests:
        cp = psql(TEST_DB, sql, role=role)
        txt = cp.stdout + cp.stderr
        ok = (cp.returncode == 0 and marker in txt) if should_pass else (cp.returncode != 0)
        record(mod, name, "permissions_true_connection", ok, txt)

    sql = """
    INSERT INTO m1.background_task(task_type,logical_operation_key,idempotency_key,status,finished_at)
    VALUES('permission','background-worker','bw-candidate-build','succeeded',clock_timestamp())
    ON CONFLICT(task_type,idempotency_key) DO UPDATE SET logical_operation_key=EXCLUDED.logical_operation_key
    RETURNING id;
    """
    cp = psql(TEST_DB, sql, role="background_worker")
    record(mod, "background_worker can write task candidate rows", "permissions_true_connection", cp.returncode == 0, cp.stdout + cp.stderr)
    cp2 = psql(TEST_DB, "SELECT m1.switch_mapping_version(1,'background-worker');", role="background_worker")
    record(mod, "background_worker cannot activate mapping directly", "permissions_true_connection", cp2.returncode != 0, cp2.stdout + cp2.stderr)

    owner_sql = """
      SELECT count(*) FILTER (WHERE r.rolname='migration_owner' AND NOT r.rolsuper) = count(*)
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
      WHERE n.nspname='m1' AND p.prosecdef;
    """
    cp3 = psql(TEST_DB, owner_sql)
    record(mod, "SECURITY DEFINER functions owned by non-superuser migration_owner", "permissions_true_connection", cp3.returncode == 0 and "t" in cp3.stdout, cp3.stdout + cp3.stderr)
    cp4 = psql(TEST_DB, "SET search_path=public,pg_catalog; SELECT m1.derive_business_form('Y12345');", role="application_ro")
    record(mod, "caller search_path cannot pollute qualified functions", "permissions_true_connection", cp4.returncode == 0 and "audio_product" in cp4.stdout, cp4.stdout + cp4.stderr)


def run_timezone_tests(mod) -> None:
    cp = psql(TEST_DB, "SHOW TimeZone;")
    record(mod, "migration database session defaults to UTC", "timezone", cp.returncode == 0 and "UTC" in cp.stdout, cp.stdout + cp.stderr)
    sql = """
    WITH a AS (
      SELECT extract(epoch from '2026-01-01 00:00:00+00'::timestamptz) AS epoch_utc
    ), b AS (
      SELECT date '2026-05-01' = date_trunc('month', date '2026-05-01')::date AS month_ok
    )
    SELECT (SELECT epoch_utc FROM a)::bigint = 1767225600 AND (SELECT month_ok FROM b);
    """
    cp2 = psql(TEST_DB, sql)
    record(mod, "timestamptz epoch and natural month are timezone-safe", "timezone", cp2.returncode == 0 and "t" in cp2.stdout, cp2.stdout + cp2.stderr)
    cp3 = psql(TEST_DB, "SET TIME ZONE 'Asia/Shanghai'; SELECT extract(epoch from '2026-01-01 08:00:00+08'::timestamptz)::bigint = 1767225600 AND date '2026-05-01' = date_trunc('month', date '2026-05-01')::date;")
    record(mod, "Asia/Shanghai session reads same instant and stable natural month", "timezone", cp3.returncode == 0 and "t" in cp3.stdout, cp3.stdout + cp3.stderr)


def get_object_counts(db: str) -> dict:
    sql = """
    SELECT 'm1_tables', count(*) FROM pg_tables WHERE schemaname='m1'
    UNION ALL SELECT 'flyway_tables', count(*) FROM pg_tables WHERE schemaname='flyway_history'
    UNION ALL SELECT 'views', count(*) FROM pg_views WHERE schemaname='m1'
    UNION ALL SELECT 'functions', count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='m1'
    UNION ALL SELECT 'triggers', count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='m1' AND NOT t.tgisinternal
    UNION ALL SELECT 'fks', count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='m1' AND c.contype='f'
    UNION ALL SELECT 'indexes', count(*) FROM pg_indexes WHERE schemaname='m1';
    """
    cp = psql(db, sql)
    if cp.returncode:
        raise RuntimeError(cp.stderr)
    out = {}
    for line in cp.stdout.splitlines():
        if '|' not in line:
            continue
        k, v = line.split('|', 1)
        if k and v.strip().isdigit():
            out[k] = int(v)
    return out


def hash_query(db: str, sql: str) -> str:
    cp = psql(db, sql)
    if cp.returncode:
        raise RuntimeError(cp.stderr)
    return hashlib.sha256(cp.stdout.encode('utf-8')).hexdigest()


def run_ab_hash_tests(mod) -> dict:
    object_sql = """
    SELECT obj FROM (
      SELECT 'table:'||schemaname||'.'||tablename AS obj FROM pg_tables WHERE schemaname IN ('m1','flyway_history')
      UNION ALL SELECT 'view:'||schemaname||'.'||viewname FROM pg_views WHERE schemaname='m1'
      UNION ALL SELECT 'function:'||n.nspname||'.'||p.proname||'/'||pg_get_function_arguments(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='m1'
      UNION ALL SELECT 'trigger:'||n.nspname||'.'||c.relname||'.'||t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='m1' AND NOT t.tgisinternal
      UNION ALL SELECT 'constraint:'||n.nspname||'.'||c.conname||'.'||c.contype::text FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='m1'
      UNION ALL SELECT 'index:'||schemaname||'.'||indexname||':'||indexdef FROM pg_indexes WHERE schemaname='m1'
    ) s ORDER BY obj;
    """
    perm_sql = """
    SELECT item FROM (
      SELECT 'schema:'||nspname||':'||coalesce(array_to_string(nspacl,','),'') AS item FROM pg_namespace WHERE nspname IN ('m1','flyway_history')
      UNION ALL SELECT 'table:'||table_schema||'.'||table_name||':'||privilege_type||':'||grantee FROM information_schema.table_privileges WHERE table_schema IN ('m1','flyway_history')
      UNION ALL SELECT 'routine:'||routine_schema||'.'||routine_name||':'||privilege_type||':'||grantee FROM information_schema.routine_privileges WHERE routine_schema='m1'
    ) s ORDER BY item;
    """
    a_counts = get_object_counts(TEST_DB)
    b_counts = get_object_counts(SECOND_DB)
    a_hash = hash_query(TEST_DB, object_sql)
    b_hash = hash_query(SECOND_DB, object_sql)
    a_perm = hash_query(TEST_DB, perm_sql)
    b_perm = hash_query(SECOND_DB, perm_sql)
    record(mod, "A/B object counts match", "ab_compare", a_counts == b_counts, json.dumps({'A':a_counts,'B':b_counts},ensure_ascii=False))
    record(mod, "A/B schema object hashes match", "ab_compare", a_hash == b_hash, f"A={a_hash} B={b_hash}")
    record(mod, "A/B permission hashes match", "ab_compare", a_perm == b_perm, f"A={a_perm} B={b_perm}")
    return {"A_counts": a_counts, "B_counts": b_counts, "A_schema_hash": a_hash, "B_schema_hash": b_hash, "A_permission_hash": a_perm, "B_permission_hash": b_perm}


def run_b_high_risk_subset(mod) -> None:
    original_test_db = mod.TEST_DB
    try:
        mod.TEST_DB = SECOND_DB
        mod.run_structural_and_lifecycle_tests()
    finally:
        mod.TEST_DB = original_test_db


def main() -> int:
    started = datetime.now(timezone.utc)
    mod = attach_candidate_runtime(load_proto_module())
    mod.results = []
    execution_log.clear()

    server = admin_psql("select version()||'|listen='||current_setting('listen_addresses')||'|port='||current_setting('port')||'|timezone='||current_setting('TimeZone')||'|statement_timeout='||current_setting('statement_timeout')||'|lock_timeout='||current_setting('lock_timeout')||'|max_connections='||current_setting('max_connections')||'|shared_buffers='||current_setting('shared_buffers')||'|user='||current_user;")

    mod.run_structural_and_lifecycle_tests()
    performance = mod.run_performance_baseline()

    # Boundary checks complete the original 76-item prototype regression set.
    sql_files = sorted(MIGRATIONS_ROOT.glob("*.sql"))
    expected_banner = "-- FORMAL MIGRATION CANDIDATE " + chr(8212) + " NOT YET APPROVED FOR PRODUCTION"
    header_failures = [str(p.relative_to(ROOT)) for p in sql_files if not p.read_text(encoding="utf-8").startswith(expected_banner)]
    record(mod, "all candidate SQL files carry formal-candidate banner", "boundary", not header_failures, json.dumps(header_failures, ensure_ascii=False))
    formal_path_exists = (REPO / "db" / "migrations").exists()
    record(mod, "formal db/migrations directory not created", "boundary", not formal_path_exists, str(formal_path_exists))
    regression_count = len(mod.results)
    regression_passed = sum(r["status"] == "passed" for r in mod.results)

    # Additional candidate-only validation.
    reset_database(SECOND_DB)
    flyway_behavior = run_flyway_behavior_tests(mod)
    run_true_role_permission_tests(mod)
    run_timezone_tests(mod)
    ab = run_ab_hash_tests(mod)
    run_b_high_risk_subset(mod)

    flyway_version = run_cmd(["flyway", "-v"], timeout=60)
    sql_checksums = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sql_files}
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "started_at": started.isoformat(),
        "environment": {
            "server": server.stdout.strip(),
            "host": HOST,
            "port": PORT,
            "os": platform.platform(),
            "python": platform.python_version(),
            "cpu_logical": os.cpu_count(),
            "flyway_version": flyway_version.stdout.strip() + flyway_version.stderr.strip(),
            "locations": str(MIGRATIONS_ROOT),
            "schemas": "flyway_history,m1",
            "history_table": "flyway_history.flyway_schema_history",
        },
        "object_counts": {
            "candidate_sql_files": len(sql_files),
            "m1_tables": 48,
            **ab.get("A_counts", {}),
        },
        "regression_summary_76": {"passed": regression_passed, "failed": regression_count - regression_passed, "total": regression_count},
        "summary": {"passed": sum(r["status"] == "passed" for r in mod.results), "failed": sum(r["status"] == "failed" for r in mod.results), "total": len(mod.results)},
        "tests": mod.results,
        "performance": performance,
        "flyway_behavior": flyway_behavior,
        "ab_compare": ab,
        "sql_checksums": sql_checksums,
    }
    (REPORTS / "validation-results.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    (REPORTS / "test-execution.log").write_text("\n\n".join(execution_log), encoding="utf-8")
    return 0 if payload["summary"]["failed"] == 0 and payload["regression_summary_76"]["failed"] == 0 else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        REPORTS.mkdir(parents=True, exist_ok=True)
        (REPORTS / "test-execution-error.log").write_text(str(exc) + "\n\n" + "\n\n".join(execution_log), encoding="utf-8")
        raise
