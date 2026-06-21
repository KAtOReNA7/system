import pg from "pg";
import {
  assertNoDataDirectoryInput,
  assertSmokeEnvironment,
  parseDatabaseUrl
} from "./smoke-safety.mjs";

const { Pool } = pg;

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
    application_name: "m1_synthetic_smoke_clear"
  });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL search_path = m1, pg_catalog");
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    await client.query("DELETE FROM m1.mapping_version WHERE trigger_type = 'synthetic_smoke'");
    await client.query(
      `DELETE FROM m1.background_task
        WHERE task_type IN ('synthetic_smoke_mapping_build','synthetic_smoke_observation')`
    );
    await client.query("DELETE FROM m1.standard_work WHERE standard_work_id IN ('990001','990002')");
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
    mode: "clear_synthetic_data",
    database: admin.databaseName,
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
