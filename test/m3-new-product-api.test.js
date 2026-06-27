import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
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

function assertM3Dataset(body) {
  assert.equal(body.dataset.mode, "fixture");
  assert.equal(body.dataset.source, "m3-new-product-static-synthetic-fixture");
  assert.equal(body.dataset.formalDataAuthorized, false);
  assert.equal(body.dataset.formalEvaluationAllowed, false);
  assert.equal(body.dataset.m3FormalExecutionAllowed, false);
  assert.equal(body.dataset.syntheticOnly, true);
  assert.equal(body.dataset.notForFormalDecision, true);
}

function assertNoSensitiveOutput(body) {
  const text = JSON.stringify(body);
  for (const forbidden of [
    "postgres://",
    "postgresql://",
    "PGPASSWORD",
    "data/private-output",
    ".xlsx",
    ".csv",
    "真实作品名",
    "原始账单"
  ]) {
    assert.equal(text.includes(forbidden), false, `response leaked forbidden token: ${forbidden}`);
  }
}

test("M3 overview API returns fixture stage summary and distributions", async () => {
  const response = await request("/api/m3/new-products/topics/overview");

  assert.equal(response.statusCode, 200);
  assertJsonHeaders(response);
  assertM3Dataset(response.body);
  assert.equal(response.body.summary.totalTopics, 10);
  assert.equal(response.body.summary.finalComparatorCap, 3);
  assert.equal(response.body.summary.m4CalibrationCandidateCount, 1);
  assert.deepEqual(response.body.summary.backtestCheckpoints, ["first_year", "third_year", "fifth_year"]);
  assert.equal(response.body.distribution.readiness.ready, 8);
  assertNoSensitiveOutput(response.body);
});

test("M3 topic list supports pagination filters and sorting", async () => {
  const response = await request(
    "/api/m3/new-products/topics?source=publication&readiness=ready&sort=fiveYearBase.desc&page=1&pageSize=10"
  );

  assert.equal(response.statusCode, 200);
  assertJsonHeaders(response);
  assertM3Dataset(response.body);
  assert.equal(response.body.items.length, 5);
  assert.equal(response.body.items[0].topicId, "SYN-TOPIC-0006");
  assert.equal(response.body.items[0].syntheticOnly, true);
  assert.equal(response.body.items[0].notForFormalDecision, true);
});

test("M3 topic detail exposes material comparator forecast rating link and backtest sections", async () => {
  const response = await request("/api/m3/new-products/topics/SYN-TOPIC-0001");

  assert.equal(response.statusCode, 200);
  assertJsonHeaders(response);
  assertM3Dataset(response.body);
  for (const key of [
    "topic",
    "inputSnapshot",
    "material",
    "contentFit",
    "comparators",
    "authorRanking",
    "externalSignals",
    "forecast",
    "rating",
    "risks",
    "topicWorkLink",
    "backtestPlan"
  ]) {
    assert.ok(response.body[key], `${key} should exist`);
  }
  assert.equal(response.body.material.rawMaterialStored, false);
  assert.equal(response.body.forecast.annualBreakdown.length, 5);
  assert.equal(
    response.body.comparators.filter((item) => item.selectedAsFinal && item.countsAgainstFinalComparatorCap).length <= 3,
    true
  );
  assert.ok(response.body.comparators.some((item) => item.sameAuthor && !item.countsAgainstFinalComparatorCap));
  assert.ok(response.body.comparators.some((item) => item.comparatorOrigin === "system_selected"));
  assert.ok(response.body.comparators.some((item) => item.comparatorOrigin === "operator_suggested"));
  assert.equal(response.body.rating.noDevelopDecisionOutput, true);
  assert.equal(response.body.topicWorkLink.oneTopicOneWork, true);
  assertNoSensitiveOutput(response.body);
});

test("M3 readiness gaps API reports blocked input fields", async () => {
  const response = await request("/api/m3/new-products/readiness-gaps?severity=high");

  assert.equal(response.statusCode, 200);
  assertJsonHeaders(response);
  assertM3Dataset(response.body);
  assert.ok(response.body.items.some((item) => item.gapCode === "missing_completeClassification"));
  assert.ok(response.body.items.every((item) => item.blocksFormalEvaluation));
});

test("M3 comparator candidates API supports selected-final filter", async () => {
  const response = await request("/api/m3/new-products/comparator-candidates?selectedAsFinal=true&pageSize=100");

  assert.equal(response.statusCode, 200);
  assertJsonHeaders(response);
  assertM3Dataset(response.body);
  assert.ok(response.body.items.length > 0);
  assert.ok(response.body.items.every((item) => item.selectedAsFinal));
  assert.ok(response.body.items.some((item) => item.comparatorOrigin === "operator_suggested"));
});

test("M3 algorithm and backtest APIs expose fixture-only boundaries", async () => {
  const algorithms = await request("/api/m3/new-products/algorithm-versions");
  const backtests = await request("/api/m3/new-products/backtests");
  const detail = await request("/api/m3/new-products/backtests/SYN-M3-BACKTEST-0001");
  const m4Candidates = await request("/api/m3/new-products/m4-calibration-candidates");

  assert.equal(algorithms.statusCode, 200);
  assert.equal(backtests.statusCode, 200);
  assert.equal(detail.statusCode, 200);
  assert.equal(m4Candidates.statusCode, 200);
  assert.equal(algorithms.body.items[0].fixtureOnly, true);
  assert.equal(backtests.body.items[0].syntheticOnly, true);
  assert.equal(detail.body.batch.id, "SYN-M3-BACKTEST-0001");
  assert.equal(m4Candidates.body.items.length, 1);
  assert.equal(m4Candidates.body.items[0].entryOnly, true);
  assert.equal(m4Candidates.body.items[0].m4Executed, false);
  assertNoSensitiveOutput(detail.body);
  assertNoSensitiveOutput(m4Candidates.body);
});

test("M3 formal mode is blocked and write-like routes remain unavailable", async () => {
  const formal = await request("/api/m3/new-products/topics?mode=formal");
  const create = await request("/api/m3/new-products/topics", {
    method: "POST",
    body: JSON.stringify({ title: "SYN" })
  });
  const upload = await request("/api/m3/new-products/topics/SYN-TOPIC-0001/materials", {
    method: "POST",
    body: JSON.stringify({})
  });

  assert.equal(formal.statusCode, 423);
  assertJsonHeaders(formal);
  assert.equal(formal.body.error.code, "formal_data_blocked");
  assert.equal(create.statusCode, 404);
  assert.equal(upload.statusCode, 404);
});

test("M3 invalid filters and unknown ids return public errors", async () => {
  const badFilter = await request("/api/m3/new-products/topics?rating=REAL");
  const missing = await request("/api/m3/new-products/topics/SYN-TOPIC-9999");

  assert.equal(badFilter.statusCode, 400);
  assertJsonHeaders(badFilter);
  assert.equal(badFilter.body.error.code, "bad_request");
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.body.error.code, "not_found");
});
