import { badRequest } from "../errors.js";
import {
  createEvaluationTask,
  summarizeEvaluationTasks,
  transitionEvaluationTask
} from "../domain/oldProductEvaluation/evaluationTaskWorkflow.js";
import { buildAdvisoryDisplayModel } from "../domain/oldProductEvaluation/advisoryReviewDisplay.js";
import {
  M2_EVALUATION_TASK_CREATION_CASES,
  M2_EVALUATION_TASK_DATASET,
  M2_EVALUATION_TASK_FIXTURE_TASKS,
  M2_EVALUATION_TASK_MIXED_BATCH
} from "../../test/fixtures/m2EvaluationTask.fixture.js";

const ALLOWED_QUERY_KEYS = new Set([
  "page",
  "pageSize",
  "status",
  "readinessStatus",
  "caseId"
]);

const TASK_STATUSES = [
  "draft",
  "blocked",
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
  "retry_requested"
];

const READINESS_STATUSES = ["ready", "blocked", "warning_only"];

export async function listM2EvaluationTaskFixtures(_config, { pagination, searchParams }) {
  validateQueryKeys(searchParams);
  const filtered = applyFilters(M2_EVALUATION_TASK_FIXTURE_TASKS, searchParams);
  return withDataset({
    items: paginate(filtered.map(toTaskSummary), pagination),
    pagination: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total: filtered.length
    },
    workflowSummary: summarizeEvaluationTasks(filtered),
    mixedBatch: clone(M2_EVALUATION_TASK_MIXED_BATCH)
  });
}

export async function getM2EvaluationTaskFixtureById(_config, taskId) {
  const task = M2_EVALUATION_TASK_FIXTURE_TASKS.find((item) => item.taskId === taskId);
  if (!task) {
    return null;
  }
  return withDataset({
    item: toTaskDetail(task)
  });
}

export async function createM2EvaluationTaskFixture(_config, payload) {
  const caseId = requireString(payload?.caseId, "caseId");
  const taskCase = M2_EVALUATION_TASK_CREATION_CASES.find((item) => item.caseId === caseId);
  if (!taskCase) {
    throw badRequest("caseId is not supported");
  }
  const input = {
    ...clone(taskCase.input),
    initialStatus: payload?.initialStatus ?? taskCase.input.initialStatus,
    actor: payload?.actor ?? "SYN-FIXTURE-OPERATOR",
    reason: payload?.reason ?? `Fixture-only task creation for ${caseId}`
  };
  const result = createEvaluationTask(input);
  return withDataset({
    caseId,
    expectedStatus: taskCase.expectedStatus,
    ...result
  });
}

export async function simulateM2EvaluationTaskAction(_config, taskId, payload) {
  const task = M2_EVALUATION_TASK_FIXTURE_TASKS.find((item) => item.taskId === taskId);
  if (!task) {
    return null;
  }
  const action = requireString(payload?.action, "action");
  const actor = requireString(payload?.actor ?? "SYN-FIXTURE-OPERATOR", "actor");
  const reason = requireString(payload?.reason ?? "Fixture-only task transition", "reason");
  let result;
  try {
    result = transitionEvaluationTask(task, action, actor, reason, {
      transitionedAt: "2026-06-22T02:00:00.000Z"
    });
  } catch (error) {
    throw badRequest(error.message);
  }
  return withDataset(result);
}

export function getM2EvaluationTaskDataset() {
  return clone(M2_EVALUATION_TASK_DATASET);
}

function withDataset(body) {
  return {
    dataset: getM2EvaluationTaskDataset(),
    mode: "fixture",
    notForFormalDecision: true,
    formalEvaluationExecuted: false,
    databaseWritten: false,
    mappingVersionActivated: false,
    switchMappingVersionCalled: false,
    ...clone(body)
  };
}

function applyFilters(tasks, searchParams) {
  const status = searchParams.get("status");
  const readinessStatus = searchParams.get("readinessStatus");
  const caseId = searchParams.get("caseId");

  validateAllowedValue(status, TASK_STATUSES, "status");
  validateAllowedValue(readinessStatus, READINESS_STATUSES, "readinessStatus");

  return tasks.filter((task) =>
    (!status || task.status === status) &&
    (!readinessStatus || task.readinessStatus === readinessStatus) &&
    (!caseId || task.taskId.includes(caseId) || task.reason?.includes(caseId))
  );
}

function validateQueryKeys(searchParams) {
  for (const key of searchParams.keys()) {
    if (!ALLOWED_QUERY_KEYS.has(key)) {
      throw badRequest(`filter ${key} is not supported`);
    }
  }
}

function validateAllowedValue(value, allowed, name) {
  if (value && !allowed.includes(value)) {
    throw badRequest(`${name} is not supported`);
  }
}

function requireString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw badRequest(`${name} is required`);
  }
  return value.trim();
}

function paginate(items, pagination) {
  const start = (pagination.page - 1) * pagination.pageSize;
  return items.slice(start, start + pagination.pageSize);
}

function toTaskSummary(task) {
  return {
    taskId: task.taskId,
    standardWorkId: task.standardWorkId,
    status: task.status,
    readinessStatus: task.readinessStatus,
    blockingReasonCount: task.blockingReasons.length,
    advisoryReasonCount: task.advisoryReasons.length,
    readinessAdvisoryReasons: task.advisoryReasons.map((item) => item.code),
    warningCount: task.warnings.length,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    mode: task.mode,
    notForFormalDecision: task.notForFormalDecision,
    formalEvaluationExecuted: task.formalEvaluationExecuted,
    databaseWritten: task.databaseWritten
  };
}

function toTaskDetail(task) {
  return {
    ...clone(task),
    advisoryReviewDisplay: task.advisoryReasons.map((item, index) =>
      buildAdvisoryDisplayModel({
        reviewItemId: `${task.taskId}-ADVISORY-${index + 1}`,
        standardWorkId: task.standardWorkId,
        reviewType: "advisory_review",
        isBlocking: false,
        reasonCode: item.code,
        reasonLabel: item.message
      })
    )
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
