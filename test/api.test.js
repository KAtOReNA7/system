import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { createApp } from "../src/http/app.js";
import {
  syntheticJobs,
  syntheticMappingVersions,
  syntheticWorks
} from "./fixtures/syntheticBusinessData.js";

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
      body
    };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("GET /api/system/status returns a clear error when database is not configured", async () => {
  const app = createApp(baseConfig);
  const response = await request(app, "/api/system/status");

  assert.equal(response.statusCode, 503);
  assert.equal(response.body.error.code, "database_not_configured");
  assert.equal(typeof response.body.error.requestId, "string");
});

test("GET /api/system/status returns system readiness from repository", async () => {
  const app = createApp(baseConfig, {
    getSystemStatus: async () => ({
      state: "schema_initialized",
      mappingVersionReady: false,
      billImportReady: false
    })
  });

  const response = await request(app, "/api/system/status");

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    status: "ok",
    system: {
      state: "schema_initialized",
      mappingVersionReady: false,
      billImportReady: false
    }
  });
});

test("GET /api/works returns an empty list for an empty database repository", async () => {
  const app = createApp(baseConfig, {
    listWorks: async (_config, pagination) => ({
      items: [],
      pagination: { ...pagination, total: 0 }
    })
  });

  const response = await request(app, "/api/works");

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    items: [],
    pagination: { page: 1, pageSize: 20, total: 0 }
  });
});

test("GET /api/works supports synthetic fixtures without real data", async () => {
  const app = createApp(baseConfig, {
    listWorks: async (_config, pagination) => ({
      items: syntheticWorks,
      pagination: { ...pagination, total: syntheticWorks.length }
    })
  });

  const response = await request(app, "/api/works?page=1&pageSize=20");

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.items[0].standardWorkId, "900001");
  assert.equal(response.body.pagination.total, 1);
});

test("GET /api/works/:id returns unified 404 when not found", async () => {
  const app = createApp(baseConfig, {
    getWorkById: async () => null
  });

  const response = await request(app, "/api/works/not-found");

  assert.equal(response.statusCode, 404);
  assert.equal(response.body.error.code, "not_found");
  assert.equal(response.body.error.message, "Work not found");
  assert.equal(response.body.error.requestId, response.requestId);
});

test("GET /api/mapping-versions returns empty list for empty repository", async () => {
  const app = createApp(baseConfig, {
    listMappingVersions: async (_config, pagination) => ({
      items: [],
      pagination: { ...pagination, total: 0 }
    })
  });

  const response = await request(app, "/api/mapping-versions");

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    items: [],
    pagination: { page: 1, pageSize: 20, total: 0 }
  });
});

test("GET /api/mapping-versions can return synthetic fixture summaries", async () => {
  const app = createApp(baseConfig, {
    listMappingVersions: async (_config, pagination) => ({
      items: syntheticMappingVersions,
      pagination: { ...pagination, total: syntheticMappingVersions.length }
    })
  });

  const response = await request(app, "/api/mapping-versions");

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.items[0].triggerType, "synthetic_fixture");
});

test("GET /api/jobs returns empty list for empty repository", async () => {
  const app = createApp(baseConfig, {
    listJobs: async (_config, pagination) => ({
      items: [],
      pagination: { ...pagination, total: 0 }
    })
  });

  const response = await request(app, "/api/jobs");

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    items: [],
    pagination: { page: 1, pageSize: 20, total: 0 }
  });
});

test("GET /api/jobs can return synthetic job status structures", async () => {
  const app = createApp(baseConfig, {
    listJobs: async (_config, pagination) => ({
      items: syntheticJobs,
      pagination: { ...pagination, total: syntheticJobs.length }
    })
  });

  const response = await request(app, "/api/jobs");

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.items[0].status, "pending");
});

test("bad pagination returns unified 400", async () => {
  const app = createApp(baseConfig, {
    listWorks: async () => {
      throw new Error("should not be called");
    }
  });

  const response = await request(app, "/api/works?page=abc");

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error.code, "bad_request");
  assert.equal(response.body.error.message, "page must be a positive integer");
});

test("unexpected errors do not leak sensitive connection details", async () => {
  const app = createApp(baseConfig, {
    listJobs: async () => {
      throw new Error("postgresql://application_ro:secret-value@127.0.0.1/db SELECT * FROM private");
    }
  });

  const response = await request(app, "/api/jobs");

  assert.equal(response.statusCode, 500);
  assert.equal(response.body.error.code, "internal_error");
  assert.equal(response.body.error.message, "Internal server error");
  assert.equal(JSON.stringify(response.body).includes("secret-value"), false);
  assert.equal(JSON.stringify(response.body).includes("SELECT *"), false);
});
