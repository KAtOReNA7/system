import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import http from "node:http";
import test from "node:test";
import { createApp } from "../src/http/app.js";
import {
  createEvaluationTask,
  summarizeEvaluationTasks,
  transitionEvaluationTask
} from "../src/domain/oldProductEvaluation/evaluationTaskWorkflow.js";
import {
  createM2EvaluationTaskFixture,
  getM2EvaluationTaskFixtureById,
  listM2EvaluationTaskFixtures,
  simulateM2EvaluationTaskAction
} from "../src/repositories/m2EvaluationTaskFixtureRepository.js";
import {
  FORBIDDEN_M2_EVALUATION_TASK_TOKENS,
  M2_EVALUATION_TASK_CREATION_CASES,
  M2_EVALUATION_TASK_FIXTURE_TASKS
} from "./fixtures/m2EvaluationTask.fixture.js";

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

const fixtureTaskPath = `/api/m2/fixture/${["evaluation", "tasks"].join("-")}`;

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

function assertGuardFlags(body) {
  assert.equal(body.mode, "fixture");
  assert.equal(body.notForFormalDecision, true);
  assert.equal(body.formalEvaluationExecuted, false);
  assert.equal(body.databaseWritten, false);
  assert.equal(body.mappingVersionActivated, false);
  assert.equal(body.switchMappingVersionCalled, false);
}

function caseById(caseId) {
  return M2_EVALUATION_TASK_CREATION_CASES.find((item) => item.caseId === caseId);
}

function searchParams(values = {}) {
  return new URLSearchParams(values);
}

test("ready readiness creates queued task", () => {
  const result = createEvaluationTask(caseById("ready_queued").input);

  assert.equal(result.task.status, "queued");
  assert.equal(result.task.readinessStatus, "ready");
  assert.equal(result.task.formalEvaluationExecuted, false);
  assert.equal(result.task.databaseWritten, false);
  assert.equal(result.readinessGate.blockingReasons.length, 0);
});

test("blocked readiness creates blocked task instead of queued", () => {
  const result = createEvaluationTask(caseById("blocked_mapping_missing").input);

  assert.equal(result.task.status, "blocked");
  assert.equal(result.task.readinessStatus, "blocked");
  assert.ok(result.task.blockingReasons.some((item) => item.code === "mapping_version_missing"));
});

test("warning_only readiness creates queued task and preserves advisory reasons", () => {
  const result = createEvaluationTask(caseById("warning_only_queued").input);

  assert.equal(result.task.status, "queued");
  assert.equal(result.task.readinessStatus, "warning_only");
  assert.ok(result.task.advisoryReasons.some((item) => item.code === "advisory_review_present"));
});

test("specific readiness blockers create blocked tasks", () => {
  const cases = [
    ["blocked_mapping_missing", "mapping_version_missing"],
    ["blocked_copyright_missing", "copyright_end_missing"],
    ["blocked_review_pending", "blocking_review_pending"],
    ["blocked_review_rejected", "blocking_review_rejected"]
  ];

  for (const [caseId, reasonCode] of cases) {
    const result = createEvaluationTask(caseById(caseId).input);
    assert.equal(result.task.status, "blocked", `${caseId} should be blocked`);
    assert.ok(result.task.blockingReasons.some((item) => item.code === reasonCode));
  }
});

test("approved and waiver review cases can create queued fixture tasks", () => {
  for (const caseId of ["manual_review_approved_queued", "manual_review_waiver_queued"]) {
    const result = createEvaluationTask(caseById(caseId).input);
    assert.equal(result.task.status, "queued", `${caseId} should be queued`);
    assert.equal(result.task.readinessStatus, "ready");
    assert.equal(result.task.reviewSummary?.unresolvedBlockingCount ?? 0, 0);
  }
});

test("cancel and retry transitions generate audit events without persistence", () => {
  const queued = createEvaluationTask(caseById("ready_queued").input).task;
  const cancelled = transitionEvaluationTask(
    queued,
    "cancel",
    "SYN-ACTOR-001",
    "Synthetic cancel test"
  );
  assert.equal(cancelled.task.status, "cancelled");
  assert.equal(cancelled.auditEvent.action, "cancel");
  assertGuardFlags(cancelled);

  const running = transitionEvaluationTask(queued, "start", "SYN-ACTOR-001", "Synthetic start").task;
  const failed = transitionEvaluationTask(running, "fail", "SYN-ACTOR-001", "Synthetic fail").task;
  const retried = transitionEvaluationTask(failed, "retry", "SYN-ACTOR-001", "Synthetic retry");
  assert.equal(retried.task.status, "retry_requested");
  assert.equal(retried.auditEvent.action, "retry");
  assertGuardFlags(retried);
});

test("unknown action and status throw", () => {
  const queued = createEvaluationTask(caseById("ready_queued").input).task;
  assert.throws(
    () => transitionEvaluationTask(queued, "unknown", "SYN-ACTOR-001", "Synthetic reason"),
    /unknown evaluation task action/
  );
  assert.throws(
    () =>
      transitionEvaluationTask(
        { ...queued, status: "unknown_status" },
        "cancel",
        "SYN-ACTOR-001",
        "Synthetic reason"
      ),
    /unknown evaluation task status/
  );
});

test("summarizeEvaluationTasks outputs task and readiness distributions", () => {
  const summary = summarizeEvaluationTasks(M2_EVALUATION_TASK_FIXTURE_TASKS);

  assert.equal(summary.total, 7);
  assert.equal(summary.statusDistribution.queued, 2);
  assert.equal(summary.statusDistribution.blocked, 1);
  assert.equal(summary.statusDistribution.cancelled, 1);
  assert.equal(summary.statusDistribution.failed, 1);
  assert.equal(summary.statusDistribution.retry_requested, 1);
  assert.equal(summary.readinessDistribution.blocked, 1);
  assert.equal(summary.databaseWritten, false);
});

test("fixture repository lists details creates and simulates actions", async () => {
  const list = await listM2EvaluationTaskFixtures(baseConfig, {
    pagination: { page: 1, pageSize: 20 },
    searchParams: searchParams({ status: "blocked" })
  });
  assertGuardFlags(list);
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].status, "blocked");

  const detail = await getM2EvaluationTaskFixtureById(baseConfig, "SYN-FR-TASK-001");
  assertGuardFlags(detail);
  assert.equal(detail.item.taskId, "SYN-FR-TASK-001");

  const created = await createM2EvaluationTaskFixture(baseConfig, {
    caseId: "blocked_review_pending",
    actor: "SYN-ACTOR-002",
    reason: "Synthetic create test"
  });
  assertGuardFlags(created);
  assert.equal(created.task.status, "blocked");
  assert.ok(created.task.blockingReasons.some((item) => item.code === "blocking_review_pending"));

  const action = await simulateM2EvaluationTaskAction(baseConfig, "SYN-FR-TASK-001", {
    action: "cancel",
    actor: "SYN-ACTOR-003",
    reason: "Synthetic action test"
  });
  assertGuardFlags(action);
  assert.equal(action.task.status, "cancelled");
  assert.equal(action.auditEvent.action, "cancel");
});

test("fixture runtime API list detail create and action are available without database", async () => {
  const list = await request(`${fixtureTaskPath}?page=1&pageSize=20`);
  assert.equal(list.statusCode, 200);
  assertJsonHeaders(list);
  assertGuardFlags(list.body);
  assert.equal(list.body.items[0].taskId, "SYN-FR-TASK-001");

  const detail = await request(`${fixtureTaskPath}/SYN-FR-TASK-001`);
  assert.equal(detail.statusCode, 200);
  assertJsonHeaders(detail);
  assertGuardFlags(detail.body);
  assert.equal(detail.body.item.taskId, "SYN-FR-TASK-001");

  const created = await request(fixtureTaskPath, {
    method: "POST",
    body: JSON.stringify({ caseId: "blocked_mapping_missing" })
  });
  assert.equal(created.statusCode, 200);
  assertJsonHeaders(created);
  assertGuardFlags(created.body);
  assert.equal(created.body.task.status, "blocked");

  const action = await request(`${fixtureTaskPath}/SYN-FR-TASK-FAILED/actions`, {
    method: "POST",
    body: JSON.stringify({ action: "retry" })
  });
  assert.equal(action.statusCode, 200);
  assertJsonHeaders(action);
  assertGuardFlags(action.body);
  assert.equal(action.body.task.status, "retry_requested");
});

test("fixture runtime API rejects unsupported input and formal mode", async () => {
  const invalidCase = await request(fixtureTaskPath, {
    method: "POST",
    body: JSON.stringify({ caseId: "real_case" })
  });
  assert.equal(invalidCase.statusCode, 400);
  assert.equal(invalidCase.body.error.code, "bad_request");

  const invalidAction = await request(`${fixtureTaskPath}/SYN-FR-TASK-001/actions`, {
    method: "POST",
    body: JSON.stringify({ action: "retry" })
  });
  assert.equal(invalidAction.statusCode, 400);
  assert.equal(invalidAction.body.error.code, "bad_request");

  const formalMode = await request(`${fixtureTaskPath}?mode=formal`);
  assert.equal(formalMode.statusCode, 423);
  assert.equal(formalMode.body.error.code, "formal_data_blocked");
});

test("formal old-products task API remains unavailable", async () => {
  const oldProductTaskPath = `/api/m2/old-products/${["evaluation", "tasks"].join("-")}`;
  const response = await request(oldProductTaskPath, {
    method: "POST",
    body: JSON.stringify({ caseId: "ready_queued" })
  });
  assert.equal(response.statusCode, 404);
  assert.equal(response.body.error.code, "not_found");
});

test("admin includes fixture task page without formal persistence capability", () => {
  const html = readFileSync("public/admin/index.html", "utf8");
  const js = readFileSync("public/admin/app.js", "utf8");

  assert.match(html, /#m2-fixture-tasks/);
  assert.match(html, /Evaluation task fixture queue/);
  assert.match(js, /M2_FIXTURE_TASK_API/);
  assert.match(js, /Simulate create task/);
  assert.match(js, /formalEvaluationExecuted=false/);
  assert.match(js, /databaseWritten=false/);
  assert.match(js, /switchMappingVersionCalled=false/);
  assert.doesNotMatch(js, /\/api\/m2\/old-products\/evaluation-tasks/i);
  assert.doesNotMatch(js, /switch_mapping_version/i);
  assert.doesNotMatch(js, /local_dry_run/i);
});

test("FR-4 source files do not read data, connect database, execute migration or add export ability", () => {
  const files = [
    "src/domain/oldProductEvaluation/evaluationTaskWorkflow.js",
    "src/repositories/m2EvaluationTaskFixtureRepository.js",
    "src/http/app.js",
    "public/admin/app.js"
  ];

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const token of FORBIDDEN_M2_EVALUATION_TASK_TOKENS) {
      assert.equal(source.includes(token), false, `${file} should not contain ${token}`);
    }
    assert.doesNotMatch(source, /from ["']node:fs["']/);
    assert.doesNotMatch(source, /new\s+(Pool|Client)\b/);
    assert.doesNotMatch(source, /\/export\b/i);
  }
});
