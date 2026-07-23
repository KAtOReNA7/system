import assert from "node:assert/strict";
import http from "node:http";
import { loadConfig } from "../../src/config.js";
import { createApp } from "../../src/http/app.js";
import { createFixtureApp as createFixtureHttpApp } from "../../src/http/fixtureApp.js";
import {
  syntheticJobs,
  syntheticMappingVersions,
  syntheticWorks
} from "../../test/fixtures/syntheticBusinessData.js";
import {
  assertNoDataDirectoryInput,
  assertSmokeEnvironment,
  parseDatabaseUrl
} from "./smoke-safety.mjs";

const mode = process.argv.includes("--database-empty")
  ? "database-empty"
  : process.argv.includes("--database-synthetic")
    ? "database-synthetic"
    : "fixture";

function createFixtureApp() {
  const config = {
    service: "m1-audiobook-evaluation",
    appEnv: "test",
    port: 0,
    database: {
      rwUrl: undefined,
      readonlyUrl: undefined,
      backgroundUrl: undefined
    }
  };

  return createFixtureHttpApp(config, {
    getSystemStatus: async () => ({
      state: "schema_initialized",
      mappingVersionReady: false,
      billImportReady: false
    }),
    listWorks: async (_config, pagination) => ({
      items: syntheticWorks,
      pagination: { ...pagination, total: syntheticWorks.length }
    }),
    getWorkById: async (_config, id) => syntheticWorks.find((item) => item.id === id) ?? null,
    listMappingVersions: async (_config, pagination) => ({
      items: syntheticMappingVersions,
      pagination: { ...pagination, total: syntheticMappingVersions.length }
    }),
    getMappingVersionById: async (_config, id) => syntheticMappingVersions.find((item) => item.id === String(id)) ?? null,
    listJobs: async (_config, pagination) => ({
      items: syntheticJobs,
      pagination: { ...pagination, total: syntheticJobs.length }
    }),
    getJobById: async (_config, id) => syntheticJobs.find((item) => item.id === String(id)) ?? null
  });
}

function createDatabaseApp() {
  assertSmokeEnvironment();
  assertNoDataDirectoryInput();
  parseDatabaseUrl(process.env.M1_DATABASE_READONLY_URL, "M1_DATABASE_READONLY_URL", "application_ro");
  parseDatabaseUrl(process.env.M1_DATABASE_BACKGROUND_URL, "M1_DATABASE_BACKGROUND_URL", "background_worker");
  const config = loadConfig({
    ...process.env,
    M1_APP_ENV: process.env.M1_APP_ENV || "local"
  });
  return createApp(config);
}

async function withServer(app, fn) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function request(baseUrl, path) {
  const response = await fetch(`${baseUrl}${path}`);
  return {
    statusCode: response.status,
    requestId: response.headers.get("x-request-id"),
    body: await response.json()
  };
}

function assertUniformError(response, statusCode, code) {
  assert.equal(response.statusCode, statusCode);
  assert.equal(response.body.error.code, code);
  assert.equal(typeof response.body.error.message, "string");
  assert.equal(response.body.error.requestId, response.requestId);
  const serialized = JSON.stringify(response.body);
  assert.equal(serialized.includes("postgres://"), false);
  assert.equal(serialized.includes("postgresql://"), false);
  assert.equal(serialized.includes("SELECT "), false);
  assert.equal(serialized.includes("password"), false);
  assert.equal(serialized.includes("stack"), false);
}

async function assertCommonApiBehavior(baseUrl) {
  assertUniformError(await request(baseUrl, "/api/works/not-found"), 404, "not_found");
  assertUniformError(await request(baseUrl, "/api/mapping-versions/999999"), 404, "not_found");
  assertUniformError(await request(baseUrl, "/api/jobs/999999"), 404, "not_found");
  assertUniformError(await request(baseUrl, "/api/works?page=0"), 400, "bad_request");
  assertUniformError(await request(baseUrl, "/api/jobs?pageSize=101"), 400, "bad_request");
}

async function assertFixtureMode(baseUrl) {
  const status = await request(baseUrl, "/api/system/status");
  assert.equal(status.statusCode, 200);
  assert.equal(status.body.system.state, "schema_initialized");

  const works = await request(baseUrl, "/api/works?page=1&pageSize=1");
  assert.equal(works.statusCode, 200);
  assert.equal(works.body.pagination.total, syntheticWorks.length);
  assert.equal(works.body.items.length, 1);

  const work = await request(baseUrl, `/api/works/${syntheticWorks[0].id}`);
  assert.equal(work.statusCode, 200);
  assert.equal(work.body.item.standardWorkId, syntheticWorks[0].standardWorkId);

  const mappings = await request(baseUrl, "/api/mapping-versions?page=1&pageSize=1");
  assert.equal(mappings.statusCode, 200);
  assert.equal(mappings.body.items[0].triggerType, "synthetic_fixture");

  const mapping = await request(baseUrl, `/api/mapping-versions/${syntheticMappingVersions[0].id}`);
  assert.equal(mapping.statusCode, 200);
  assert.equal(mapping.body.item.versionNo, syntheticMappingVersions[0].versionNo);

  const jobs = await request(baseUrl, "/api/jobs?page=1&pageSize=1");
  assert.equal(jobs.statusCode, 200);
  assert.equal(jobs.body.items[0].status, "pending");

  const job = await request(baseUrl, `/api/jobs/${syntheticJobs[0].id}`);
  assert.equal(job.statusCode, 200);
  assert.equal(job.body.item.type, syntheticJobs[0].type);

  await assertCommonApiBehavior(baseUrl);
}

async function assertDatabaseEmptyMode(baseUrl) {
  const status = await request(baseUrl, "/api/system/status");
  assert.equal(status.statusCode, 200);
  assert.equal(status.body.system.state, "schema_initialized");
  assert.equal(status.body.system.mappingVersionReady, false);
  assert.equal(status.body.system.billImportReady, false);

  const works = await request(baseUrl, "/api/works");
  assert.equal(works.statusCode, 200);
  assert.equal(works.body.pagination.total, 0);
  assert.deepEqual(works.body.items, []);

  const mappings = await request(baseUrl, "/api/mapping-versions");
  assert.equal(mappings.statusCode, 200);
  assert.equal(mappings.body.pagination.total, 0);
  assert.deepEqual(mappings.body.items, []);

  const jobs = await request(baseUrl, "/api/jobs");
  assert.equal(jobs.statusCode, 200);
  assert.equal(jobs.body.pagination.total, 0);
  assert.deepEqual(jobs.body.items, []);

  await assertCommonApiBehavior(baseUrl);
}

async function assertDatabaseSyntheticMode(baseUrl) {
  const works = await request(baseUrl, "/api/works?page=1&pageSize=1");
  assert.equal(works.statusCode, 200);
  assert.equal(works.body.pagination.total, 2);
  assert.equal(works.body.items.length, 1);
  assert.equal(works.body.items[0].standardWorkId, "990001");

  const work = await request(baseUrl, "/api/works/990002");
  assert.equal(work.statusCode, 200);
  assert.equal(work.body.item.standardWorkId, "990002");
  assert.equal(work.body.item.completeness.missingBasicInfoRecord, true);

  const mappings = await request(baseUrl, "/api/mapping-versions");
  assert.equal(mappings.statusCode, 200);
  assert.equal(mappings.body.pagination.total, 1);
  assert.equal(mappings.body.items[0].triggerType, "synthetic_smoke");
  assert.equal(mappings.body.items[0].versionNo, 990001);

  const mapping = await request(baseUrl, `/api/mapping-versions/${mappings.body.items[0].id}`);
  assert.equal(mapping.statusCode, 200);
  assert.equal(mapping.body.item.triggerType, "synthetic_smoke");

  const jobs = await request(baseUrl, "/api/jobs?page=1&pageSize=2");
  assert.equal(jobs.statusCode, 200);
  assert.equal(jobs.body.pagination.total, 2);
  assert.deepEqual(jobs.body.items.map((item) => item.logicalOperationKey).sort(), [
    "SYN-JOB-001",
    "SYN-JOB-002"
  ]);

  const job = await request(baseUrl, `/api/jobs/${jobs.body.items[0].id}`);
  assert.equal(job.statusCode, 200);
  assert.equal(job.body.item.logicalOperationKey.startsWith("SYN-JOB-"), true);

  await assertCommonApiBehavior(baseUrl);
}

async function main() {
  const app = mode === "fixture" ? createFixtureApp() : createDatabaseApp();
  await withServer(app, async (baseUrl) => {
    if (mode === "fixture") {
      await assertFixtureMode(baseUrl);
    } else if (mode === "database-empty") {
      await assertDatabaseEmptyMode(baseUrl);
    } else {
      await assertDatabaseSyntheticMode(baseUrl);
    }
  });

  console.log(JSON.stringify({
    status: "ok",
    mode,
    realDataImported: false,
    formalDatabaseConnected: false
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    status: "failed",
    mode,
    message: error.message,
    realDataImported: false,
    formalDatabaseConnected: false
  }, null, 2));
  process.exitCode = 1;
});
