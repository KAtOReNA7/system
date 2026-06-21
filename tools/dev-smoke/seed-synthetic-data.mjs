import pg from "pg";
import {
  assertNoDataDirectoryInput,
  assertSmokeEnvironment,
  parseDatabaseUrl
} from "./smoke-safety.mjs";

const { Pool } = pg;

const SYNTHETIC_WORK_IDS = ["990001", "990002"];
const SYNTHETIC_MAPPING_VERSION_NO = 990001;
const SYNTHETIC_TASK_TYPES = [
  "synthetic_smoke_mapping_build",
  "synthetic_smoke_observation"
];

function sqlArray(values) {
  return values.map((value) => `'${value.replaceAll("'", "''")}'`).join(",");
}

async function main() {
  assertSmokeEnvironment();
  assertNoDataDirectoryInput();
  const admin = parseDatabaseUrl(
    process.env.M1_SMOKE_ADMIN_DATABASE_URL,
    "M1_SMOKE_ADMIN_DATABASE_URL",
    "migration_owner"
  );

  const pool = new Pool({
    connectionString: admin.value,
    max: 1,
    connectionTimeoutMillis: 3000,
    application_name: "m1_synthetic_smoke_seed"
  });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL search_path = m1, pg_catalog");
    await client.query("SET LOCAL TIME ZONE 'UTC'");

    await client.query("DELETE FROM m1.mapping_version WHERE trigger_type = 'synthetic_smoke'");
    await client.query(
      `DELETE FROM m1.background_task
        WHERE task_type IN (${sqlArray(SYNTHETIC_TASK_TYPES)})`
    );
    await client.query(
      `DELETE FROM m1.standard_work
        WHERE standard_work_id IN (${sqlArray(SYNTHETIC_WORK_IDS)})`
    );

    await client.query(
      `INSERT INTO m1.standard_work(standard_work_id, identity_source, created_by)
       VALUES
         ('990001', 'bill_derived', 'synthetic-smoke'),
         ('990002', 'bill_derived', 'synthetic-smoke')`
    );

    const task = await client.query(
      `INSERT INTO m1.background_task(
          task_type, logical_operation_key, idempotency_key, status, payload, finished_at, created_by
       )
       VALUES (
          'synthetic_smoke_mapping_build',
          'SYN-JOB-001',
          'SYN-JOB-001',
          'succeeded',
          '{"fixture":"synthetic","containsRealData":false}'::jsonb,
          clock_timestamp(),
          'synthetic-smoke'
       )
       RETURNING id`
    );

    await client.query(
      `INSERT INTO m1.background_task(
          task_type, logical_operation_key, idempotency_key, status, payload, created_by
       )
       VALUES (
          'synthetic_smoke_observation',
          'SYN-JOB-002',
          'SYN-JOB-002',
          'queued',
          '{"fixture":"synthetic","containsRealData":false}'::jsonb,
          'synthetic-smoke'
       )`
    );

    await client.query(
      `INSERT INTO m1.mapping_version(
          version_no, status, trigger_type, trigger_ref, build_task_id,
          projection_row_count, projection_total_amount, created_by
       )
       VALUES (
          $1, 'building', 'synthetic_smoke', 'SYN-MAPPING-VERSION-001', $2,
          0, 0, 'synthetic-smoke'
       )`,
      [SYNTHETIC_MAPPING_VERSION_NO, task.rows[0].id]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }

  console.log(JSON.stringify({
    status: "ok",
    mode: "seed_synthetic_data",
    database: admin.databaseName,
    syntheticWorkIds: SYNTHETIC_WORK_IDS,
    syntheticMappingVersionNo: SYNTHETIC_MAPPING_VERSION_NO,
    realDataImported: false
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    status: "failed",
    message: error.message,
    realDataImported: false
  }, null, 2));
  process.exitCode = 1;
});
