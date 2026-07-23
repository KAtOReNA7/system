import assert from "node:assert/strict";
import http from "node:http";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { createApp } from "../src/http/app.js";
import { createFixtureApp } from "../src/http/fixtureApp.js";
import {
  toM2FormalExportDetail
} from "../src/repositories/m2EvaluationExportRepository.js";
import { listenOnFetchSafePort } from "./helpers/listenOnFetchSafePort.js";

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

async function request(app, pathname) {
  const server = http.createServer(app);
  const port = await listenOnFetchSafePort(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`);
    return {
      statusCode: response.status,
      body: await response.json()
    };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function listJavaScriptFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listJavaScriptFiles(absolute));
    } else if (/\.(?:js|mjs)$/u.test(entry.name)) {
      files.push(absolute);
    }
  }
  return files;
}

test("formal composition root does not enable fixture repositories", async () => {
  const response = await request(
    createApp(baseConfig),
    "/api/m2/old-products/evaluations/overview"
  );

  assert.equal(response.statusCode, 409);
  assert.equal(response.body.error.code, "fixture_only");
});

test("explicit fixture composition root enables synthetic development routes", async () => {
  const response = await request(
    createFixtureApp(baseConfig),
    "/api/m2/old-products/evaluations/overview"
  );

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.dataset.mode, "fixture");
  assert.equal(response.body.dataset.notForFormalDecision, true);
});

test("source modules never import test fixture paths", async () => {
  const files = await listJavaScriptFiles("src");
  const violations = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    if (/test[\\/]fixtures/u.test(source)) {
      violations.push(path.relative(process.cwd(), file).replaceAll("\\", "/"));
    }
  }

  assert.deepEqual(violations, []);
});

test("formal export detail is point-only even when a legacy row has scenario columns", () => {
  const detail = toM2FormalExportDetail({
    standardWorkId: "SYN-POINT-ONLY",
    cutoffMonth: "2026-04-01",
    ratingScore: "88.5",
    forecastPointEstimate: "1234.56",
    forecastOptimisticTotal: "2345.67",
    forecastPessimisticTotal: "345.67",
    risks: [],
    snapshot: {}
  });

  assert.equal(detail.forecastPointEstimate, 1234.56);
  assert.equal(detail.pointEstimateOnly, true);
  assert.equal(detail.scenarioFieldsIncluded, false);
  assert.equal(Object.hasOwn(detail, "forecastBaseTotal"), false);
  assert.equal(Object.hasOwn(detail, "forecastOptimisticTotal"), false);
  assert.equal(Object.hasOwn(detail, "forecastPessimisticTotal"), false);
});

test("formal export query does not select scenario endpoints", async () => {
  const source = await readFile(
    "src/repositories/m2EvaluationExportRepository.js",
    "utf8"
  );

  assert.doesNotMatch(source, /forecast_optimistic_total/u);
  assert.doesNotMatch(source, /forecast_pessimistic_total/u);
  assert.match(source, /forecast_base_total AS "forecastPointEstimate"/u);
});
