import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { checkDatabaseHealth } from "../src/db/health.js";
import { sanitizeError } from "../src/errors.js";
import { createApp } from "../src/http/app.js";

const baseConfig = {
  service: "m1-audiobook-evaluation",
  appEnv: "test",
  port: 0,
  database: {
    rwUrl: undefined,
    readonlyUrl: undefined,
    backgroundUrl: undefined
  }
};

async function request(app, path) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    const body = await response.json();
    return {
      statusCode: response.status,
      requestId: response.headers.get("x-request-id"),
      cacheControl: response.headers.get("cache-control"),
      body
    };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("GET /health returns ok without a database", async () => {
  let databaseWasCalled = false;
  const app = createApp(baseConfig, {
    dbHealthChecker: async () => {
      databaseWasCalled = true;
      return { status: "ok", database: { connected: true } };
    }
  });

  const response = await request(app, "/health");

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, "ok");
  assert.equal(response.body.service, "m1-audiobook-evaluation");
  assert.equal(typeof response.requestId, "string");
  assert.equal(response.cacheControl, "no-store");
  assert.equal(databaseWasCalled, false);
});

test("GET /health/db returns degraded when database is not configured", async () => {
  const app = createApp(baseConfig);
  const response = await request(app, "/health/db");

  assert.equal(response.statusCode, 503);
  assert.equal(response.body.status, "degraded");
  assert.equal(response.body.database.connected, false);
  assert.equal(response.body.database.reason, "database_not_configured");
});

test("GET /health/db returns database_unavailable without exposing database errors", async () => {
  const config = {
    ...baseConfig,
    database: {
      ...baseConfig.database,
      readonlyUrl: "postgresql://application_ro:secret@127.0.0.1:1/m1_dev"
    }
  };
  const result = await checkDatabaseHealth(config, {
    poolFactory: () => ({
      connect: async () => {
        throw new Error("postgresql://application_ro:secret@127.0.0.1:1/m1_dev SELECT 1");
      },
      end: async () => {}
    })
  });

  assert.equal(result.status, "degraded");
  assert.equal(result.database.connected, false);
  assert.equal(result.database.reason, "database_unavailable");
  assert.equal(JSON.stringify(result).includes("secret"), false);
  assert.equal(JSON.stringify(result).includes("SELECT 1"), false);
});

test("database health check does not read business data when not configured", async () => {
  const result = await checkDatabaseHealth(baseConfig);
  assert.equal(result.status, "degraded");
  assert.equal(result.database.reason, "database_not_configured");
});

test("database errors are sanitized and do not expose passwords or URLs", () => {
  const sanitized = sanitizeError(
    new Error("failed to connect to postgresql://application_ro:super-secret@127.0.0.1:5432/m1_dev")
  );

  assert.equal(sanitized.message.includes("super-secret"), false);
  assert.equal(sanitized.message.includes("postgresql://"), false);
  assert.equal(sanitized.message.includes("[database-url-redacted]"), true);
});
