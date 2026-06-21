import { createEvaluationTask, transitionEvaluationTask } from "../../src/domain/oldProductEvaluation/evaluationTaskWorkflow.js";
import {
  M2_FORMAL_PERSISTENCE_CANDIDATE_VERSION
} from "../../src/domain/oldProductEvaluation/formalPersistenceSchema.js";
import {
  M2_BLOCKING_REVIEW_FIXTURE_ITEMS
} from "./m2BlockingReviewWorkflow.fixture.js";
import {
  getM2FormalReadinessFixture
} from "./m2FormalReadinessGate.fixture.js";

const readyInput = getM2FormalReadinessFixture("fully_ready");
const warningOnlyInput = getM2FormalReadinessFixture("advisory_only_review");
const mappingMissingInput = getM2FormalReadinessFixture("mapping_version_missing");
const copyrightMissingInput = getM2FormalReadinessFixture("copyright_end_missing");
const reviewPendingInput = getM2FormalReadinessFixture("blocking_review_pending");
const reviewRejectedInput = getM2FormalReadinessFixture("blocking_review_rejected");

const approvedReviewInput = Object.freeze({
  ...readyInput,
  caseId: "manual_review_approved",
  standardWorkId: "SYN-FR-WORK-016",
  blockingReviewStatus: "approved",
  reviewItems: Object.freeze([
    Object.freeze({
      ...M2_BLOCKING_REVIEW_FIXTURE_ITEMS.find((item) => item.reviewStatus === "approved"),
      reviewItemId: "SYN-FR-REVIEW-APPROVED-FOR-TASK",
      standardWorkId: "SYN-FR-WORK-016"
    })
  ])
});

const waiverReviewInput = Object.freeze({
  ...readyInput,
  caseId: "manual_review_waiver",
  standardWorkId: "SYN-FR-WORK-017",
  blockingReviewStatus: "waiver_granted",
  reviewItems: Object.freeze([
    Object.freeze({
      ...M2_BLOCKING_REVIEW_FIXTURE_ITEMS.find((item) => item.reviewStatus === "waiver_granted"),
      reviewItemId: "SYN-FR-REVIEW-WAIVER-FOR-TASK",
      standardWorkId: "SYN-FR-WORK-017"
    })
  ])
});

export const M2_EVALUATION_TASK_DATASET = Object.freeze({
  mode: "fixture",
  source: "m2-fr-4-evaluation-task-synthetic-fixture",
  stage: "M2-FR-4",
  candidateVersion: M2_FORMAL_PERSISTENCE_CANDIDATE_VERSION,
  syntheticOnly: true,
  notForFormalDecision: true,
  formalEvaluationExecuted: false,
  databaseConnected: false,
  databaseWritten: false,
  migrationExecuted: false,
  dbMigrationsModified: false,
  mappingVersionActivated: false,
  switchMappingVersionCalled: false,
  exportApiAdded: false
});

export const M2_EVALUATION_TASK_CREATION_CASES = Object.freeze([
  taskCase("ready_queued", "SYN-FR-TASK-001", readyInput, { expectedStatus: "queued" }),
  taskCase("blocked_mapping_missing", "SYN-FR-TASK-002", mappingMissingInput, { expectedStatus: "blocked" }),
  taskCase("warning_only_queued", "SYN-FR-TASK-003", warningOnlyInput, { expectedStatus: "queued" }),
  taskCase("blocked_copyright_missing", "SYN-FR-TASK-004", copyrightMissingInput, { expectedStatus: "blocked" }),
  taskCase("blocked_review_pending", "SYN-FR-TASK-005", reviewPendingInput, { expectedStatus: "blocked" }),
  taskCase("blocked_review_rejected", "SYN-FR-TASK-006", reviewRejectedInput, { expectedStatus: "blocked" }),
  taskCase("manual_review_approved_queued", "SYN-FR-TASK-007", approvedReviewInput, { expectedStatus: "queued" }),
  taskCase("manual_review_waiver_queued", "SYN-FR-TASK-008", waiverReviewInput, { expectedStatus: "queued" }),
  taskCase("warning_only_draft", "SYN-FR-TASK-009", warningOnlyInput, {
    expectedStatus: "draft",
    initialStatus: "draft"
  })
]);

const queuedTask = createEvaluationTask(M2_EVALUATION_TASK_CREATION_CASES[0].input).task;
const blockedTask = createEvaluationTask(M2_EVALUATION_TASK_CREATION_CASES[1].input).task;
const warningTask = createEvaluationTask(M2_EVALUATION_TASK_CREATION_CASES[2].input).task;
const cancelledTask = transitionEvaluationTask(
  queuedTask,
  "cancel",
  "SYN-FIXTURE-OPERATOR",
  "Synthetic cancellation fixture",
  { transitionedAt: "2026-06-22T01:00:00.000Z" }
).task;
const runningTask = transitionEvaluationTask(
  queuedTask,
  "start",
  "SYN-FIXTURE-OPERATOR",
  "Synthetic start fixture",
  { transitionedAt: "2026-06-22T01:10:00.000Z" }
).task;
const completedTask = transitionEvaluationTask(
  runningTask,
  "complete",
  "SYN-FIXTURE-OPERATOR",
  "Synthetic completion fixture",
  { transitionedAt: "2026-06-22T01:20:00.000Z" }
).task;
const failedTask = transitionEvaluationTask(
  runningTask,
  "fail",
  "SYN-FIXTURE-OPERATOR",
  "Synthetic failure fixture",
  { transitionedAt: "2026-06-22T01:30:00.000Z" }
).task;
const retryRequestedTask = transitionEvaluationTask(
  failedTask,
  "retry",
  "SYN-FIXTURE-OPERATOR",
  "Synthetic retry fixture",
  { transitionedAt: "2026-06-22T01:40:00.000Z" }
).task;

export const M2_EVALUATION_TASK_FIXTURE_TASKS = Object.freeze([
  queuedTask,
  blockedTask,
  warningTask,
  { ...cancelledTask, taskId: "SYN-FR-TASK-CANCELLED", status: "cancelled" },
  { ...failedTask, taskId: "SYN-FR-TASK-FAILED", status: "failed" },
  { ...retryRequestedTask, taskId: "SYN-FR-TASK-RETRY", status: "retry_requested" },
  { ...completedTask, taskId: "SYN-FR-TASK-COMPLETED", status: "completed" }
]);

export const M2_EVALUATION_TASK_MIXED_BATCH = Object.freeze({
  batchId: "SYN-FR-TASK-BATCH-001",
  caseIds: Object.freeze(["ready_queued", "blocked_mapping_missing", "warning_only_queued"]),
  taskIds: Object.freeze(["SYN-FR-TASK-001", "SYN-FR-TASK-002", "SYN-FR-TASK-003"]),
  syntheticOnly: true,
  notForFormalDecision: true
});

export const FORBIDDEN_M2_EVALUATION_TASK_TOKENS = Object.freeze([
  "postgres://",
  "postgresql://",
  "switch_mapping_version",
  "local_dry_run",
  "CREATE TABLE",
  "db/migrations"
]);

function taskCase(caseId, taskId, readinessInput, options = {}) {
  return Object.freeze({
    caseId,
    expectedStatus: options.expectedStatus,
    input: Object.freeze({
      taskId,
      readinessInput,
      initialStatus: options.initialStatus,
      actor: "SYN-FIXTURE-OPERATOR",
      reason: `Synthetic creation case ${caseId}`,
      createdAt: "2026-06-22T00:00:00.000Z"
    })
  });
}
