import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { createApp } from "../src/http/app.js";
import {
  expectedM2OldProductCoverage,
  forbiddenM2OldProductOutputTokens
} from "./fixtures/m2OldProductEvaluationFixtureCases.js";

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

async function request(path, options = {}) {
  const app = createApp(baseConfig);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, options);
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

function assertJsonHeaders(response) {
  assert.equal(typeof response.requestId, "string");
  assert.equal(response.cacheControl, "no-store");
  if (response.body.error) {
    assert.equal(response.body.error.requestId, response.requestId);
  }
}

function assertFixtureDataset(body) {
  assert.equal(body.dataset.mode, "fixture");
  assert.equal(body.dataset.source, "m2-b-static-synthetic-fixture");
  assert.equal(body.dataset.formalDataAuthorized, false);
  assert.equal(body.dataset.formalEvaluationAllowed, false);
  assert.equal(body.dataset.syntheticValue, true);
  assert.equal(body.dataset.cutoffMonth, "2026-04");
  assert.deepEqual(body.dataset.incompleteMonths, ["2026-05"]);
}

function assertNoSensitiveOutput(body) {
  const text = JSON.stringify(body);
  for (const token of forbiddenM2OldProductOutputTokens) {
    assert.equal(text.includes(token), false, `response leaked forbidden token: ${token}`);
  }
}

test("overview API returns fixture dataset and core distributions", async () => {
  const response = await request("/api/m2/old-products/evaluations/overview");

  assert.equal(response.statusCode, 200);
  assertJsonHeaders(response);
  assertFixtureDataset(response.body);
  assert.equal(response.body.summary.eligibleWorks, 7);
  assert.equal(response.body.summary.blockedWorks, 3);
  assert.equal(response.body.distribution.rating["S+"], 1);
  assert.equal(response.body.distribution.lifecycle.growth, 1);
  assertNoSensitiveOutput(response.body);
});

test("list API supports pagination", async () => {
  const response = await request("/api/m2/old-products/evaluations?page=2&pageSize=2");

  assert.equal(response.statusCode, 200);
  assertJsonHeaders(response);
  assertFixtureDataset(response.body);
  assert.equal(response.body.items.length, 2);
  assert.deepEqual(response.body.pagination, { page: 2, pageSize: 2, total: 7 });
});

test("list API supports filters", async () => {
  const response = await request(
    "/api/m2/old-products/evaluations?rating=S%2B&lifecycle=growth&businessForm=audio_product&readiness=ready&resultStatus=current&algorithmVersion=fixture-old-product-v1&cutoffMonth=2026-04"
  );

  assert.equal(response.statusCode, 200);
  assertJsonHeaders(response);
  assertFixtureDataset(response.body);
  assert.equal(response.body.items.length, 1);
  assert.equal(response.body.items[0].standardWorkId, "SYN-WORK-0001");
});

test("list API supports combined interaction filters and reset-equivalent defaults", async () => {
  const filtered = await request(
    "/api/m2/old-products/evaluations?query=SYN-WORK-0003&rating=A&lifecycle=declining&risk=high&readiness=blocked&resultStatus=current&sort=riskSeverity.desc&page=1&pageSize=20"
  );

  assert.equal(filtered.statusCode, 200);
  assertJsonHeaders(filtered);
  assertFixtureDataset(filtered.body);
  assert.equal(filtered.body.items.length, 1);
  assert.equal(filtered.body.items[0].standardWorkId, "SYN-WORK-0003");
  assert.equal(filtered.body.items[0].riskLevel, "high");
  assert.equal(filtered.body.items[0].readiness, "blocked");

  const resetEquivalent = await request("/api/m2/old-products/evaluations?page=1&pageSize=20&sort=updatedAt.desc");

  assert.equal(resetEquivalent.statusCode, 200);
  assertJsonHeaders(resetEquivalent);
  assertFixtureDataset(resetEquivalent.body);
  assert.equal(resetEquivalent.body.pagination.total, 7);
  assert.equal(resetEquivalent.body.items[0].standardWorkId, "SYN-WORK-0001");
});

test("list API supports sorting", async () => {
  const response = await request("/api/m2/old-products/evaluations?sort=forecastTotal.asc");

  assert.equal(response.statusCode, 200);
  assertJsonHeaders(response);
  assert.equal(response.body.items[0].standardWorkId, "SYN-WORK-0005");
});

test("invalid pagination returns bad_request", async () => {
  const response = await request("/api/m2/old-products/evaluations?page=0");

  assert.equal(response.statusCode, 400);
  assertJsonHeaders(response);
  assert.equal(response.body.error.code, "bad_request");
});

test("invalid filter returns bad_request", async () => {
  const response = await request("/api/m2/old-products/evaluations?rating=REAL");

  assert.equal(response.statusCode, 400);
  assertJsonHeaders(response);
  assert.equal(response.body.error.code, "bad_request");
});

test("invalid sort returns bad_request", async () => {
  const response = await request("/api/m2/old-products/evaluations?sort=unsupported.desc");

  assert.equal(response.statusCode, 400);
  assertJsonHeaders(response);
  assert.equal(response.body.error.code, "bad_request");
});

test("detail API returns all required sections", async () => {
  const response = await request("/api/m2/old-products/evaluations/SYN-WORK-0001");

  assert.equal(response.statusCode, 200);
  assertJsonHeaders(response);
  assertFixtureDataset(response.body);
  for (const key of [
    "work",
    "readiness",
    "incomeSummary",
    "lifecycle",
    "forecast",
    "rating",
    "risks",
    "suggestions",
    "backtestSummary",
    "inputSnapshot",
    "algorithmVersion"
  ]) {
    assert.ok(response.body[key], `${key} should exist`);
  }
  assert.deepEqual(Object.keys(response.body.forecast.scenarios), expectedM2OldProductCoverage.forecastScenarios);
  assertNoSensitiveOutput(response.body);
});

test("unknown detail returns not_found", async () => {
  const response = await request("/api/m2/old-products/evaluations/SYN-WORK-9999");

  assert.equal(response.statusCode, 404);
  assertJsonHeaders(response);
  assert.equal(response.body.error.code, "not_found");
});

test("readiness gaps API returns synthetic gap list", async () => {
  const response = await request("/api/m2/old-products/readiness-gaps");

  assert.equal(response.statusCode, 200);
  assertJsonHeaders(response);
  assertFixtureDataset(response.body);
  assert.ok(response.body.items.some((item) => item.gapCode === "missing_classification"));
  assert.ok(response.body.items.some((item) => item.gapCode === "missing_copyright_end"));
});

test("readiness gaps API supports gap code severity and readiness filters", async () => {
  const response = await request(
    "/api/m2/old-products/readiness-gaps?gapCode=missing_classification&severity=high&readiness=blocked&page=1&pageSize=20"
  );

  assert.equal(response.statusCode, 200);
  assertJsonHeaders(response);
  assertFixtureDataset(response.body);
  assert.equal(response.body.items.length, 1);
  assert.equal(response.body.items[0].standardWorkId, "SYN-WORK-0003");
  assert.equal(response.body.items[0].gapCode, "missing_classification");
  assert.equal(response.body.items[0].severity, "high");
  assert.equal(response.body.items[0].readiness, "blocked");
  assert.equal(response.body.items[0].blocksFormalEvaluation, true);
});

test("invalid readiness gap filter returns bad_request", async () => {
  const response = await request("/api/m2/old-products/readiness-gaps?gapCode=real_gap");

  assert.equal(response.statusCode, 400);
  assertJsonHeaders(response);
  assert.equal(response.body.error.code, "bad_request");
});

test("algorithm versions API returns fixture-only algorithm version", async () => {
  const response = await request("/api/m2/old-products/algorithm-versions");

  assert.equal(response.statusCode, 200);
  assertJsonHeaders(response);
  assertFixtureDataset(response.body);
  assert.equal(response.body.items[0].versionKey, "fixture-old-product-v1");
  assert.equal(response.body.items[0].fixtureOnly, true);
});

test("backtests list API returns synthetic backtest batches", async () => {
  const response = await request("/api/m2/old-products/backtests");

  assert.equal(response.statusCode, 200);
  assertJsonHeaders(response);
  assertFixtureDataset(response.body);
  assert.equal(response.body.items[0].id, "SYN-BACKTEST-0001");
});

test("backtest detail API returns covered missed over and under fixtures", async () => {
  const response = await request("/api/m2/old-products/backtests/SYN-BACKTEST-0001");

  assert.equal(response.statusCode, 200);
  assertJsonHeaders(response);
  assertFixtureDataset(response.body);
  const outcomes = response.body.items.map((item) => item.outcome).sort();
  assert.deepEqual(outcomes, [...expectedM2OldProductCoverage.backtestOutcomes].sort());
  assert.equal(response.body.batch.id, "SYN-BACKTEST-0001");
  assert.equal(response.body.metrics.covered, 1);
});

test("mode=formal returns formal_data_blocked without reading real data", async () => {
  const response = await request("/api/m2/old-products/evaluations?mode=formal");

  assert.equal(response.statusCode, 423);
  assertJsonHeaders(response);
  assert.equal(response.body.error.code, "formal_data_blocked");
  assertNoSensitiveOutput(response.body);
});

test("formal mode header returns formal_data_blocked", async () => {
  const response = await request("/api/m2/old-products/evaluations/overview", {
    headers: { "x-m2-mode": "formal" }
  });

  assert.equal(response.statusCode, 423);
  assertJsonHeaders(response);
  assert.equal(response.body.error.code, "formal_data_blocked");
});

test("controlled task endpoints are unavailable and do not create tasks", async () => {
  const response = await request("/api/m2/old-products/evaluation-tasks", {
    method: "POST",
    body: JSON.stringify({ mode: "fixture" })
  });

  assert.equal(response.statusCode, 404);
  assertJsonHeaders(response);
  assert.equal(response.body.error.code, "not_found");
});

test("write task and export endpoints remain unavailable", async () => {
  const paths = [
    "/api/m2/old-products/evaluation-tasks",
    "/api/m2/old-products/evaluation-tasks/SYN-TASK-0001/cancel",
    "/api/m2/old-products/evaluation-tasks/SYN-TASK-0001/retry",
    "/api/m2/old-products/export",
    "/api/m2/old-products/evaluations/export"
  ];

  for (const path of paths) {
    const response = await request(path, { method: "POST" });
    assert.equal(response.statusCode, 404);
    assertJsonHeaders(response);
    assert.equal(response.body.error.code, "not_found");
  }
});

test("fixture responses cover required synthetic cases", async () => {
  const response = await request("/api/m2/old-products/evaluations?pageSize=100");

  assert.equal(response.statusCode, 200);
  const items = response.body.items;
  assert.deepEqual(items.map((item) => item.standardWorkId).sort(), expectedM2OldProductCoverage.standardWorkIds);
  assert.deepEqual([...new Set(items.map((item) => item.rating))].sort(), [...expectedM2OldProductCoverage.ratings].sort());
  assert.deepEqual(
    [...new Set(items.map((item) => item.lifecycle))].sort(),
    [...expectedM2OldProductCoverage.lifecycles].sort()
  );
  assert.deepEqual(
    [...new Set(items.map((item) => item.resultStatus))].sort(),
    [...expectedM2OldProductCoverage.resultStatuses].sort()
  );
});

test("M2 API output does not expose real data or technical internals", async () => {
  const paths = [
    "/api/m2/old-products/evaluations/overview",
    "/api/m2/old-products/evaluations?pageSize=100",
    "/api/m2/old-products/evaluations/SYN-WORK-0001",
    "/api/m2/old-products/readiness-gaps",
    "/api/m2/old-products/algorithm-versions",
    "/api/m2/old-products/backtests",
    "/api/m2/old-products/backtests/SYN-BACKTEST-0001"
  ];

  for (const path of paths) {
    const response = await request(path);
    assert.equal(response.statusCode, 200);
    assertNoSensitiveOutput(response.body);
  }
});

test("M2 fixture APIs work without database configuration", async () => {
  const response = await request("/api/m2/old-products/evaluations/overview");

  assert.equal(response.statusCode, 200);
  assertFixtureDataset(response.body);
});

test("mapping activation and switch_mapping_version are not reachable", async () => {
  const activation = await request("/api/m2/old-products/mapping-activation", { method: "POST" });
  const switchMapping = await request("/api/m2/old-products/switch_mapping_version", { method: "POST" });

  assert.equal(activation.statusCode, 404);
  assert.equal(switchMapping.statusCode, 404);
  assert.equal(activation.body.error.code, "not_found");
  assert.equal(switchMapping.body.error.code, "not_found");
});
