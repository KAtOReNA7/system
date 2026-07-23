import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import http from "node:http";
import test from "node:test";
import { createFixtureApp } from "../src/http/fixtureApp.js";
import {
  buildAdvisoryDisplayModel,
  groupAdvisoryReasons,
  M2_ADVISORY_REVIEW_FIXTURE_AGGREGATE,
  M2_ADVISORY_REVIEW_REASON_CODES,
  summarizeAdvisoryReviews
} from "../src/domain/oldProductEvaluation/advisoryReviewDisplay.js";
import {
  getM2AdvisoryReviewSummaryFixture,
  listM2BlockingReviewItems
} from "../src/repositories/m2BlockingReviewFixtureRepository.js";
import { getM2EvaluationTaskFixtureById } from "../src/repositories/m2EvaluationTaskFixtureRepository.js";
import { M2_BLOCKING_REVIEW_FIXTURE_ITEMS } from "../src/fixtures/m2BlockingReviewWorkflow.fixture.js";

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

async function request(path) {
  const app = createFixtureApp(baseConfig);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    return {
      statusCode: response.status,
      requestId: response.headers.get("x-request-id"),
      cacheControl: response.headers.get("cache-control"),
      body: await response.json()
    };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function assertFixtureGuardFlags(body) {
  assert.equal(body.mode, "fixture");
  assert.equal(body.notForFormalDecision, true);
  assert.equal(body.formalEvaluationExecuted, false);
  assert.equal(body.databaseWritten, false);
}

test("advisory review display model does not block formal eligibility", () => {
  const advisory = buildAdvisoryDisplayModel({
    reviewItemId: "SYN-ADVISORY-001",
    standardWorkId: "SYN-FR-WORK-900",
    reviewType: "advisory_review",
    reasonCode: "channel_concentration_advisory",
    isBlocking: false
  });

  assert.equal(advisory.reviewClass, "advisory_review");
  assert.equal(advisory.displayKind, "advisory_review");
  assert.equal(advisory.blocksFormalEntry, false);
  assert.equal(advisory.advisoryOnly, true);
  assert.equal(advisory.automaticActionCreated, false);
});

test("blocking review display model remains distinct and blocks entry", () => {
  const blocking = buildAdvisoryDisplayModel(M2_BLOCKING_REVIEW_FIXTURE_ITEMS[0]);

  assert.equal(blocking.reviewClass, "blocking_review");
  assert.equal(blocking.displayKind, "blocking_review");
  assert.equal(blocking.blocksFormalEntry, true);
  assert.equal(blocking.advisoryOnly, false);
});

test("advisory reason grouping covers required reason families", () => {
  const items = M2_ADVISORY_REVIEW_REASON_CODES.map((reasonCode, index) => ({
    reviewItemId: `SYN-ADVISORY-${String(index + 1).padStart(3, "0")}`,
    standardWorkId: `SYN-FR-WORK-${String(index + 1).padStart(3, "0")}`,
    reviewType: "advisory_review",
    reasonCode,
    isBlocking: false
  }));
  const grouped = groupAdvisoryReasons(items);

  for (const reasonCode of M2_ADVISORY_REVIEW_REASON_CODES) {
    assert.equal(grouped[reasonCode], 1, `${reasonCode} should be grouped`);
  }
});

test("summary distinguishes warning action-candidate display-only and manual confirmation", () => {
  const summary = summarizeAdvisoryReviews([], {
    aggregate: M2_ADVISORY_REVIEW_FIXTURE_AGGREGATE
  });

  assert.equal(summary.advisoryReviewCount, 2331);
  assert.equal(summary.blockingReviewCount, 513);
  assert.equal(summary.advisoryReviewBlocksFormal, false);
  assert.equal(summary.downlistDisplayCount, 167);
  assert.equal(summary.renewalReviewDisplayCount, 133);
  assert.equal(summary.requiresManualConfirmationBeforeExportCount, 300);
  assert.equal(summary.displayOnlyCount, 499);
  assert.equal(summary.actionCandidateCount, 300);
  assert.ok(summary.warningCount > 0);
});

test("downlist and renewal advisory prompts require manual confirmation but create no automatic action", () => {
  for (const reasonCode of [
    "downlist_requires_manual_confirmation",
    "renewal_review_requires_confirmation"
  ]) {
    const model = buildAdvisoryDisplayModel({
      reviewItemId: `SYN-${reasonCode}`,
      reviewType: "advisory_review",
      reasonCode,
      isBlocking: false
    });

    assert.equal(model.blocksFormalEntry, false);
    assert.equal(model.displayKind, "action_candidate");
    assert.equal(model.requiresManualConfirmationBeforeExport, true);
    assert.equal(model.automaticActionCreated, false);
  }
});

test("summary repository and API expose fixture guard flags", async () => {
  const repositorySummary = await getM2AdvisoryReviewSummaryFixture(baseConfig);
  assertFixtureGuardFlags(repositorySummary);
  assert.equal(repositorySummary.advisoryReviewCount, 2331);
  assert.equal(repositorySummary.advisorySummary.advisoryReviewBlocksFormal, false);

  const response = await request("/api/m2/fixture/advisory-reviews/summary");
  assert.equal(response.statusCode, 200);
  assert.equal(typeof response.requestId, "string");
  assert.equal(response.cacheControl, "no-store");
  assertFixtureGuardFlags(response.body);
  assert.equal(response.body.advisoryReviewCount, 2331);
  assert.equal(response.body.requiresManualConfirmationBeforeExportCount, 300);
});

test("review list API separates blocking and advisory display semantics", async () => {
  const list = await listM2BlockingReviewItems(baseConfig, {
    pagination: { page: 1, pageSize: 20 },
    searchParams: new URLSearchParams()
  });
  const blocking = list.items.find((item) => item.isBlocking === true);
  const advisory = list.items.find((item) => item.isBlocking === false);

  assert.equal(blocking.displayModel.reviewClass, "blocking_review");
  assert.equal(blocking.displayModel.blocksFormalEntry, true);
  assert.equal(advisory.displayModel.reviewClass, "advisory_review");
  assert.equal(advisory.displayModel.blocksFormalEntry, false);
});

test("evaluation task detail preserves readiness advisory display reasons", async () => {
  const detail = await getM2EvaluationTaskFixtureById(baseConfig, "SYN-FR-TASK-003");

  assertFixtureGuardFlags(detail);
  assert.equal(detail.item.advisoryReasons.length > 0, true);
  assert.equal(detail.item.advisoryReviewDisplay.length > 0, true);
  assert.equal(detail.item.advisoryReviewDisplay[0].blocksFormalEntry, false);
});

test("admin page displays advisory summary without turning advisory into blocking", () => {
  const js = readFileSync("public/admin/app.js", "utf8");

  assert.match(js, /Advisory review summary/);
  assert.match(js, /does not block formal eligibility/);
  assert.match(js, /manual confirmation before downstream action/);
  assert.match(js, /M2_ADVISORY_SUMMARY_API/);
  assert.doesNotMatch(js, /switch_mapping_version/i);
  assert.doesNotMatch(js, /\/export\b/i);
});

test("FR-5 source files do not read data connect database execute migration or add formal capability", () => {
  const files = [
    "src/domain/oldProductEvaluation/advisoryReviewDisplay.js",
    "src/repositories/m2BlockingReviewFixtureRepository.js",
    "src/repositories/m2EvaluationTaskFixtureRepository.js",
    "src/http/app.js",
    "public/admin/app.js"
  ];

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /from ["']node:fs["']/);
    assert.doesNotMatch(source, /new\s+(Pool|Client)\b/);
    assert.doesNotMatch(source, /db\/migrations/);
    assert.doesNotMatch(source, /switch_mapping_version/i);
    assert.doesNotMatch(source, /local_dry_run/i);
    assert.doesNotMatch(source, /CREATE TABLE/i);
  }
});
