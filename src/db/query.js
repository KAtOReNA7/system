import pg from "pg";
import { databaseNotConfigured } from "../errors.js";

const { Pool } = pg;

function createPool(connectionString, applicationName) {
  return new Pool({
    connectionString,
    max: 2,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 1000,
    application_name: applicationName
  });
}

export async function withDatabaseClient(connectionString, roleName, applicationName, fn, options = {}) {
  if (!connectionString) {
    throw databaseNotConfigured(roleName);
  }

  const poolFactory = options.poolFactory ?? createPool;
  const pool = poolFactory(connectionString, applicationName);

  try {
    const client = await pool.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}
