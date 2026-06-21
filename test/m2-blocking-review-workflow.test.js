import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import http from "node:http";
import test from "node:test";
import { createApp } from "../src/http/app.js";
import {
  blocksFormalEntry,
  canEnterFormalAfterReview,
  summarizeReviewItems,
  transitionReviewItem
} from "../src/domain/oldProductEvaluation/blockingReviewWorkflow.js";
import {
  M2_BLOCKING_REVIEW_FIXTURE_ITEMS,
  M2_BLOCKING_REVIEW_REQUIRED_REASON_CODES,
  FORBIDDEN_M2_BLOCKING_REVIEW_TOKENS
} from "./fixtures/m2BlockingReviewWorkflow.fixture.js";
import {
  getM2BlockingReviewItemById,
  listM2BlockingReviewItems,
  simulateM2BlockingReviewAction
} from "../src/repositories/m2BlockingReviewFixtureRepository.js";

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
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(options.headers ?? {})
      }
    });
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

function assertFixtureBoundary(body) {
  assert.equal(body.dataset.mode, "fixture");
  assert.equal(body.dataset.formalEvaluationAllowed, false);
  assert.equal(body.dataset.notForFormalDecision, true);
  assert.equal(body.dataset.databaseWritten, false);
  assert.equal(body.mode, "fixture");
  assert.equal(body.formalEvaluationAllowed, false);
  assert.equal(body.notForFormalDecision, true);
  assert.equal(body.databaseWritten, false);
}

function searchParams(values = {}) {
  return new URLSearchParams(values);
}

test("blocking review state machine blocks and unblocks formal entry as expected", () => {
  const byStatus = Object.fromEntries(
    M2_BLOCKING_REVIEW_FIXTURE_ITEMS.map((item) => [item.reviewStatus, item])
  );

  assert.equal(blocksFormalEntry(byStatus.pending), true);
  assert.equal(blocksFormalEntry(byStatus.approved), false);
  assert.equal(blocksFormalEntry(byStatus.data_fix_required), true);
  assert.equal(blocksFormalEntry(byStatus.waiver_granted), false);
  assert.equal(blocksFormalEntry(byStatus.rejected_for_formal), true);

  const advisory = M2_BLOCKING_REVIEW_FIXTURE_ITEMS.find(
    (item) => item.reviewType === "advisory_review" && item.reviewStatus === "pending"
  );
  assert.equal(blocksFormalEntry(advisory), false);
});

test("transitionReviewItem emits audit event and never writes database", () => {
  const item = M2_BLOCKING_REVIEW_FIXTURE_ITEMS[0];
  const result = transitionReviewItem(
    item,
    "approve",
    "SYN-ACTOR-001",
    "Synthetic approval for test",
    { transitionedAt: "2026-06-05T00:00:00.000Z" }
  );

  assert.equal(result.item.reviewStatus, "approved");
  assert.equal(result.auditEvent.previousStatus, "pending");
  assert.equal(result.auditEvent.nextStatus, "approved");
  assert.equal(result.auditEvent.actor, "SYN-ACTOR-001");
  assert.equal(result.databaseWritten, false);
  assert.equal(result.notForFormalDecision, true);
});

test("unknown action and status throw explicit errors", () => {
  const item = M2_BLOCKING_REVIEW_FIXTURE_ITEMS[0];
  assert.throws(
    () => transitionReviewItem(item, "unknown_action", "SYN-ACTOR-001", "Synthetic reason"),
    /unknown review action/
  );
  assert.throws(
    () =>
      transitionReviewItem(
        { ...item, reviewStatus: "unknown_status" },
        "approve",
        "SYN-ACTOR-001",
        "Synthetic reason"
      ),
    /unknown review status/
  );
});

test("summarizeReviewItems returns distributions and formal-entry decision", () => {
  const summary = summarizeReviewItems(M2_BLOCKING_REVIEW_FIXTURE_ITEMS);

  assert.equal(summary.total, 10);
  assert.equal(summary.blockingCount, 8);
  assert.equal(summary.advisoryCount, 2);
  assert.equal(summary.statusDistribution.pending, 4);
  assert.equal(summary.reasonDistribution.high_value_with_data_gap, 2);
  assert.equal(summary.readyForFormalAfterReview, false);
  assert.equal(canEnterFormalAfterReview(M2_BLOCKING_REVIEW_FIXTURE_ITEMS), false);
});

test("fixture covers all required blocking review reason families", () => {
  const reasonCodes = new Set(M2_BLOCKING_REVIEW_FIXTURE_ITEMS.map((item) => item.reasonCode));
  for (const required of M2_BLOCKING_REVIEW_REQUIRED_REASON_CODES) {
    assert.equal(reasonCodes.has(required), true, `${required} should exist`);
  }
});

test("repository lists filters details and simulates action without database", async () => {
  const list = await listM2BlockingReviewItems(baseConfig, {
    pagination: { page: 1, pageSize: 20 },
    searchParams: searchParams({ reviewStatus: "pending", isBlocking: "true" })
  });

  assertFixtureBoundary(list);
  assert.equal(list.items.length, 3);
  assert.equal(list.aggregate.simulatedBlockingReviewCount, 513);
  assert.equal(list.workflowSummary.unresolvedBlockingCount, 3);

  const detail = await getM2BlockingReviewItemById(baseConfig, "SYN-FR-REVIEW-001");
  assertFixtureBoundary(detail);
  assert.equal(detail.item.reviewItemId, "SYN-FR-REVIEW-001");
  assert.equal(detail.workflowImpact.blocksFormalEntry, true);

  const simulated = await simulateM2BlockingReviewAction(baseConfig, "SYN-FR-REVIEW-001", {
    action: "grant_waiver",
    actor: "SYN-ACTOR-002",
    reason: "Synthetic waiver for fixture test"
  });
  assertFixtureBoundary(simulated);
  assert.equal(simulated.item.reviewStatus, "waiver_granted");
  assert.equal(simulated.auditEvent.action, "grant_waiver");
  assert.equal(simulated.databaseWritten, false);
});

test("repository rejects unsupported filters and invalid boolean values", async () => {
  await assert.rejects(
    () =>
      listM2BlockingReviewItems(baseConfig, {
        pagination: { page: 1, pageSize: 20 },
        searchParams: searchParams({ unknown: "1" })
      }),
    /filter unknown is not supported/
  );
  await assert.rejects(
    () =>
      listM2BlockingReviewItems(baseConfig, {
        pagination: { page: 1, pageSize: 20 },
        searchParams: searchParams({ isBlocking: "maybe" })
      }),
    /isBlocking must be true or false/
  );
});

test("fixture API list detail and action endpoints expose only synthetic review workflow", async () => {
  const list = await request("/api/m2/formal-readiness/reviews?page=1&pageSize=20");
  assert.equal(list.statusCode, 200);
  assertJsonHeaders(list);
  assertFixtureBoundary(list.body);
  assert.equal(list.body.items[0].reviewItemId, "SYN-FR-REVIEW-001");
  assert.equal(list.body.aggregate.simulatedBlockingReviewCount, 513);

  const filtered = await request(
    "/api/m2/formal-readiness/reviews?reviewType=advisory_review&isBlocking=false"
  );
  assert.equal(filtered.statusCode, 200);
  assert.equal(filtered.body.items.length, 2);
  assert.equal(filtered.body.workflowSummary.advisoryCount, 2);

  const detail = await request("/api/m2/formal-readiness/reviews/SYN-FR-REVIEW-001");
  assert.equal(detail.statusCode, 200);
  assertJsonHeaders(detail);
  assertFixtureBoundary(detail.body);
  assert.equal(detail.body.item.blocksFormalEntry, true);

  const action = await request("/api/m2/formal-readiness/reviews/SYN-FR-REVIEW-001/actions", {
    method: "POST",
    body: JSON.stringify({
      action: "approve",
      actor: "SYN-ACTOR-003",
      reason: "Synthetic API transition"
    })
  });
  assert.equal(action.statusCode, 200);
  assertJsonHeaders(action);
  assertFixtureBoundary(action.body);
  assert.equal(action.body.item.reviewStatus, "approved");
  assert.equal(action.body.databaseWritten, false);
});

test("fixture API returns expected errors and formal mode remains blocked", async () => {
  const missing = await request("/api/m2/formal-readiness/reviews/SYN-FR-REVIEW-999");
  assert.equal(missing.statusCode, 404);
  assertJsonHeaders(missing);
  assert.equal(missing.body.error.code, "not_found");

  const invalidFilter = await request("/api/m2/formal-readiness/reviews?reviewStatus=real");
  assert.equal(invalidFilter.statusCode, 400);
  assert.equal(invalidFilter.body.error.code, "bad_request");

  const invalidPayload = await request("/api/m2/formal-readiness/reviews/SYN-FR-REVIEW-001/actions", {
    method: "POST",
    body: JSON.stringify({ action: "" })
  });
  assert.equal(invalidPayload.statusCode, 400);
  assert.equal(invalidPayload.body.error.code, "bad_request");

  const formalMode = await request("/api/m2/formal-readiness/reviews?mode=formal");
  assert.equal(formalMode.statusCode, 423);
  assert.equal(formalMode.body.error.code, "formal_data_blocked");
});

test("admin surface includes fixture review page and no formal task export or migration capability", () => {
  const html = readFileSync("public/admin/index.html", "utf8");
  const js = readFileSync("public/admin/app.js", "utf8");

  assert.match(html, /#m2-reviews/);
  assert.match(html, /Blocking manual review queue/);
  assert.match(js, /\/api\/m2\/formal-readiness\/reviews/);
  assert.match(js, /databaseWritten=false/);
  assert.match(js, /Fixture transition simulator/);
  assert.doesNotMatch(js, /evaluation-tasks/i);
  assert.doesNotMatch(js, /switch_mapping_version/i);
  assert.doesNotMatch(js, /export formal result/i);
});

test("FR-3 source files do not read real data or create persistence abilities", () => {
  const files = [
    "src/domain/oldProductEvaluation/blockingReviewWorkflow.js",
    "src/repositories/m2BlockingReviewFixtureRepository.js",
    "src/http/app.js",
    "public/admin/app.js"
  ];

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const token of FORBIDDEN_M2_BLOCKING_REVIEW_TOKENS) {
      assert.equal(source.includes(token), false, `${file} should not contain ${token}`);
    }
    assert.doesNotMatch(source, /from ["']node:fs["']/);
    assert.doesNotMatch(source, /new\s+(Pool|Client)\b/);
    assert.doesNotMatch(source, /db\/migrations/);
  }
});
