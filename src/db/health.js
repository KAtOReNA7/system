import pg from "pg";
import { sanitizeError } from "../errors.js";

const { Pool } = pg;

const EXPECTED_SCHEMA_VERSION = "0060.290";
const FORMAL_VIEWS = [
  "m1.v_current_income",
  "m1.v_basic_info_gap",
  "m1.v_basic_info_m2_completeness",
  "m1.v_bill_cutoff_months",
  "m1.v_income_projection_monthly"
];

function createDefaultPool(connectionString, applicationName = "m1_health_check") {
  return new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 1000,
    application_name: applicationName
  });
}

export async function checkDatabaseHealth(config, options = {}) {
  const readonlyConnectionString = config.database.readonlyUrl;
  const controlConnectionString = config.database.backgroundUrl ?? config.database.readonlyUrl;
  if (!readonlyConnectionString) {
    return {
      status: "degraded",
      database: {
        connected: false,
        reason: "database_not_configured"
      }
    };
  }

  const poolFactory = options.poolFactory ?? createDefaultPool;
  const readonlyPool = poolFactory(readonlyConnectionString, "m1_health_check_readonly");
  const controlPool =
    controlConnectionString === readonlyConnectionString
      ? readonlyPool
      : poolFactory(controlConnectionString, "m1_health_check_control");

  try {
    const client = await readonlyPool.connect();
    try {
      const identity = await client.query(
        "SELECT current_user AS current_user, current_setting('TimeZone') AS timezone"
      );
      const currentUser = identity.rows[0]?.current_user;
      const timezone = identity.rows[0]?.timezone;

      if (currentUser === "migration_owner") {
        return {
          status: "degraded",
          database: {
            connected: true,
            reason: "migration_owner_not_allowed"
          }
        };
      }

      const schema = await client.query(
        `SELECT version
           FROM flyway_history.flyway_schema_history
          WHERE success
          ORDER BY installed_rank DESC
          LIMIT 1`
      );
      const schemaVersion = schema.rows[0]?.version ?? null;

      for (const viewName of FORMAL_VIEWS) {
        await client.query(`SELECT 1 FROM ${viewName} LIMIT 0`);
      }

      const controlClient = await controlPool.connect();
      let systemState;
      let controlUser;
      try {
        const controlIdentity = await controlClient.query(
          "SELECT current_user AS current_user"
        );
        controlUser = controlIdentity.rows[0]?.current_user;
        if (controlUser === "migration_owner") {
          return {
            status: "degraded",
            database: {
              connected: true,
              reason: "migration_owner_not_allowed"
            }
          };
        }

        const state = await controlClient.query(
          "SELECT lifecycle_status FROM m1.system_state WHERE id = 1"
        );
        systemState = state.rows[0]?.lifecycle_status ?? null;
      } finally {
        controlClient.release();
      }

      const checks = {
        timezoneUtc: timezone === "UTC",
        expectedSchemaVersion: schemaVersion === EXPECTED_SCHEMA_VERSION,
        systemStateReadable: systemState === "schema_initialized",
        formalViewsQueryable: true,
        runtimeRoleAllowed: currentUser !== "migration_owner"
      };

      const ok = Object.values(checks).every(Boolean);

      return {
        status: ok ? "ok" : "degraded",
        database: {
          connected: true,
          schemaVersion,
          systemState,
          checks
        }
      };
    } finally {
      client.release();
    }
  } catch (error) {
    const sanitized = sanitizeError(error);
    return {
      status: "degraded",
      database: {
        connected: false,
        reason: sanitized.code
      }
    };
  } finally {
    if (controlPool !== readonlyPool) {
      await controlPool.end();
    }
    await readonlyPool.end();
  }
}

export { EXPECTED_SCHEMA_VERSION, FORMAL_VIEWS };
