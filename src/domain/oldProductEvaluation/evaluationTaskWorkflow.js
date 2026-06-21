import { evaluateFormalReadiness } from "./formalReadinessGate.js";
import { summarizeReviewItems } from "./blockingReviewWorkflow.js";

const VALID_STATUSES = new Set([
  "draft",
  "blocked",
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
  "retry_requested"
]);

const VALID_ACTIONS = new Set([
  "create",
  "queue",
  "start",
  "complete",
  "fail",
  "cancel",
  "retry"
]);

const ACTION_TO_STATUS = Object.freeze({
  queue: "queued",
  start: "running",
  complete: "completed",
  fail: "failed",
  cancel: "cancelled",
  retry: "retry_requested"
});

const ALLOWED_TRANSITIONS = Object.freeze({
  draft: Object.freeze(["queue", "cancel"]),
  blocked: Object.freeze(["cancel"]),
  queued: Object.freeze(["start", "fail", "cancel"]),
  running: Object.freeze(["complete", "fail", "cancel"]),
  completed: Object.freeze([]),
  failed: Object.freeze(["retry", "cancel"]),
  cancelled: Object.freeze([]),
  retry_requested: Object.freeze(["queue", "cancel"])
});

export const M2_EVALUATION_TASK_STATUSES = Object.freeze([...VALID_STATUSES]);
export const M2_EVALUATION_TASK_ACTIONS = Object.freeze([...VALID_ACTIONS]);

export function createEvaluationTask(input) {
  const taskInput = input ?? {};
  const readinessInput = taskInput.readinessInput ?? taskInput;
  const readinessGate = evaluateFormalReadiness(readinessInput);
  const reviewItems = normalizeReviewItems(readinessInput);
  const reviewSummary = reviewItems.length > 0 ? summarizeReviewItems(reviewItems) : null;
  const requestedInitialStatus = taskInput.initialStatus;
  const status = initialTaskStatus(readinessGate, requestedInitialStatus);
  const createdAt = taskInput.createdAt ?? "2026-06-22T00:00:00.000Z";
  const actor = taskInput.actor ?? "SYN-FIXTURE-OPERATOR";
  const reason = taskInput.reason ?? "Fixture-only evaluation task creation";
  const task = withGuardFlags({
    taskId: taskInput.taskId ?? `SYN-FR-TASK-${readinessGate.standardWorkId ?? "UNKNOWN"}`,
    standardWorkId: readinessGate.standardWorkId,
    candidateVersion: readinessGate.candidateVersion,
    status,
    requestedInitialStatus: requestedInitialStatus ?? null,
    readinessStatus: readinessGate.readinessStatus,
    readinessGate,
    blockingReasons: readinessGate.blockingReasons,
    advisoryReasons: readinessGate.advisoryReasons,
    warnings: readinessGate.warnings,
    requiredActions: readinessGate.requiredActions,
    reviewSummary,
    createdAt,
    updatedAt: createdAt,
    actor,
    reason,
    auditEvents: [
      auditEvent({
        taskId: taskInput.taskId ?? `SYN-FR-TASK-${readinessGate.standardWorkId ?? "UNKNOWN"}`,
        action: "create",
        actor,
        reason,
        previousStatus: null,
        nextStatus: status,
        occurredAt: createdAt
      })
    ]
  });

  return {
    task,
    readinessGate,
    auditEvent: task.auditEvents[0],
    databaseWritten: false,
    formalEvaluationExecuted: false,
    mappingVersionActivated: false,
    switchMappingVersionCalled: false,
    notForFormalDecision: true,
    mode: "fixture"
  };
}

export function transitionEvaluationTask(task, action, actor, reason, options = {}) {
  validateTask(task);
  validateAction(action);
  const normalizedActor = requireNonEmptyString(actor, "actor");
  const normalizedReason = requireNonEmptyString(reason, "reason");
  const occurredAt = options.transitionedAt ?? "2026-06-22T00:00:00.000Z";

  if (action === "create") {
    const event = auditEvent({
      taskId: task.taskId,
      action,
      actor: normalizedActor,
      reason: normalizedReason,
      previousStatus: task.status,
      nextStatus: task.status,
      occurredAt
    });
    return {
      task: withGuardFlags({ ...clone(task), auditEvents: [...(task.auditEvents ?? []), event] }),
      auditEvent: event,
      databaseWritten: false,
      formalEvaluationExecuted: false,
      mappingVersionActivated: false,
      switchMappingVersionCalled: false,
      notForFormalDecision: true,
      mode: "fixture"
    };
  }

  const allowed = ALLOWED_TRANSITIONS[task.status] ?? [];
  if (!allowed.includes(action)) {
    throw new Error(`action ${action} is not allowed from task status ${task.status}`);
  }

  const nextStatus = ACTION_TO_STATUS[action];
  if (nextStatus === "queued" && task.readinessStatus === "blocked") {
    throw new Error("blocked readiness cannot be queued");
  }

  const event = auditEvent({
    taskId: task.taskId,
    action,
    actor: normalizedActor,
    reason: normalizedReason,
    previousStatus: task.status,
    nextStatus,
    occurredAt
  });
  const nextTask = withGuardFlags({
    ...clone(task),
    status: nextStatus,
    updatedAt: occurredAt,
    auditEvents: [...(task.auditEvents ?? []), event]
  });

  return {
    task: nextTask,
    auditEvent: event,
    databaseWritten: false,
    formalEvaluationExecuted: false,
    mappingVersionActivated: false,
    switchMappingVersionCalled: false,
    notForFormalDecision: true,
    mode: "fixture"
  };
}

export function summarizeEvaluationTasks(tasks) {
  if (!Array.isArray(tasks)) {
    throw new Error("evaluation tasks must be an array");
  }
  const statusDistribution = Object.fromEntries(M2_EVALUATION_TASK_STATUSES.map((status) => [status, 0]));
  const readinessDistribution = { ready: 0, blocked: 0, warning_only: 0 };

  for (const task of tasks) {
    validateTask(task);
    statusDistribution[task.status] += 1;
    if (Object.hasOwn(readinessDistribution, task.readinessStatus)) {
      readinessDistribution[task.readinessStatus] += 1;
    }
  }

  return {
    total: tasks.length,
    statusDistribution,
    readinessDistribution,
    blockedTaskCount: tasks.filter((task) => task.status === "blocked").length,
    executableSimulationCount: tasks.filter((task) => ["queued", "running", "completed"].includes(task.status)).length,
    formalEvaluationExecuted: false,
    databaseWritten: false,
    notForFormalDecision: true
  };
}

function initialTaskStatus(readinessGate, requestedInitialStatus) {
  if (readinessGate.readinessStatus === "blocked") {
    return "blocked";
  }
  if (readinessGate.readinessStatus === "warning_only") {
    if (requestedInitialStatus === "draft") {
      return "draft";
    }
    return "queued";
  }
  return "queued";
}

function validateTask(task) {
  if (!task || typeof task !== "object") {
    throw new Error("evaluation task must be an object");
  }
  requireNonEmptyString(task.taskId, "taskId");
  if (!VALID_STATUSES.has(task.status)) {
    throw new Error(`unknown evaluation task status: ${task.status}`);
  }
}

function validateAction(action) {
  if (!VALID_ACTIONS.has(action)) {
    throw new Error(`unknown evaluation task action: ${action}`);
  }
}

function auditEvent({ taskId, action, actor, reason, previousStatus, nextStatus, occurredAt }) {
  return {
    eventId: `SYN-FR-TASK-AUDIT-${taskId}-${action}-${nextStatus}`,
    taskId,
    action,
    actor,
    reason,
    previousStatus,
    nextStatus,
    occurredAt,
    fixtureOnly: true,
    formalEvaluationExecuted: false,
    databaseWritten: false,
    notForFormalDecision: true
  };
}

function withGuardFlags(value) {
  return {
    ...value,
    mode: "fixture",
    syntheticOnly: true,
    notForFormalDecision: true,
    formalEvaluationExecuted: false,
    databaseWritten: false,
    mappingVersionActivated: false,
    switchMappingVersionCalled: false
  };
}

function normalizeReviewItems(readinessInput) {
  if (!Array.isArray(readinessInput.reviewItems)) {
    return [];
  }
  return readinessInput.reviewItems.map((item, index) => ({
    reviewItemId: item.reviewItemId ?? `SYN-FR-TASK-REVIEW-${readinessInput.standardWorkId ?? "UNKNOWN"}-${index + 1}`,
    reasonCode: item.reasonCode ?? item.reviewReasonCode ?? "advisory_review_present",
    reviewType: item.reviewType ?? (item.isBlocking === true ? "blocking_manual_review" : "advisory_review"),
    reviewStatus: item.reviewStatus ?? "pending",
    isBlocking: item.isBlocking === true || item.reviewType === "blocking_manual_review"
  }));
}

function requireNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
