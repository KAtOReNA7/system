import {
  buildExportPackage,
  transitionReleaseGate
} from "../domain/oldProductEvaluation/exportReleaseGate.js";
import { M2_FORMAL_PERSISTENCE_CANDIDATE_VERSION } from "../domain/oldProductEvaluation/formalPersistenceSchema.js";
import { M2_BLOCKING_REVIEW_FIXTURE_ITEMS } from "./m2BlockingReviewWorkflow.fixture.js";
import { getM2FormalReadinessFixture } from "./m2FormalReadinessGate.fixture.js";

const approvedReview = Object.freeze({
  ...M2_BLOCKING_REVIEW_FIXTURE_ITEMS.find((item) => item.reviewStatus === "approved"),
  reviewItemId: "SYN-FR-EXPORT-REVIEW-APPROVED",
  standardWorkId: "SYN-FR-WORK-EXPORT-001"
});

const waiverReview = Object.freeze({
  ...M2_BLOCKING_REVIEW_FIXTURE_ITEMS.find((item) => item.reviewStatus === "waiver_granted"),
  reviewItemId: "SYN-FR-EXPORT-REVIEW-WAIVER",
  standardWorkId: "SYN-FR-WORK-EXPORT-004"
});

const pendingReview = Object.freeze({
  ...M2_BLOCKING_REVIEW_FIXTURE_ITEMS.find((item) => item.reviewStatus === "pending"),
  reviewItemId: "SYN-FR-EXPORT-REVIEW-PENDING",
  standardWorkId: "SYN-FR-WORK-EXPORT-003"
});

const readyBase = Object.freeze({
  ...getM2FormalReadinessFixture("fully_ready"),
  candidateVersion: M2_FORMAL_PERSISTENCE_CANDIDATE_VERSION,
  standardWorkId: "SYN-FR-WORK-EXPORT-001",
  reviewItems: Object.freeze([approvedReview]),
  rating: "A",
  lifecycle: "stable",
  riskTags: Object.freeze(["synthetic_low_risk"]),
  suggestionCodes: Object.freeze(["synthetic_keep_watch"]),
  algorithmVersion: "fixture-old-product-v1",
  parameterVersion: "candidate-a-fixture",
  cutoffMonth: "2026-04",
  generatedAt: "2026-06-22T00:00:00.000Z",
  notForFormalDecision: true,
  formalEvaluationExecuted: false
});

export const M2_EXPORT_RELEASE_GATE_DATASET = Object.freeze({
  mode: "fixture",
  source: "m2-fr-6-export-release-gate-synthetic-fixture",
  stage: "M2-FR-6",
  candidateVersion: M2_FORMAL_PERSISTENCE_CANDIDATE_VERSION,
  syntheticOnly: true,
  notForFormalDecision: true,
  formalEvaluationExecuted: false,
  formalExportCreated: false,
  databaseConnected: false,
  databaseWritten: false,
  migrationExecuted: false,
  dbMigrationsModified: false,
  mappingVersionActivated: false,
  switchMappingVersionCalled: false
});

export const M2_EXPORT_RELEASE_GATE_CASES = Object.freeze([
  exportCase("eligible_export_package", "SYN-FR-EXPORT-001", readyBase),
  exportCase("blocked_readiness", "SYN-FR-EXPORT-002", {
    ...readyBase,
    standardWorkId: "SYN-FR-WORK-EXPORT-002",
    readinessGate: { readinessStatus: "blocked", blockingReasons: [{ code: "mapping_version_missing" }] },
    readinessStatus: "blocked"
  }),
  exportCase("pending_blocking_review", "SYN-FR-EXPORT-003", {
    ...readyBase,
    standardWorkId: "SYN-FR-WORK-EXPORT-003",
    reviewItems: Object.freeze([pendingReview])
  }),
  exportCase("waiver_granted_review", "SYN-FR-EXPORT-004", {
    ...readyBase,
    standardWorkId: "SYN-FR-WORK-EXPORT-004",
    reviewItems: Object.freeze([waiverReview])
  }),
  exportCase("downlist_requires_confirmation", "SYN-FR-EXPORT-005", {
    ...readyBase,
    standardWorkId: "SYN-FR-WORK-EXPORT-005",
    downlistOrSuspendCandidate: true,
    downlistManualConfirmed: false
  }),
  exportCase("renewal_requires_confirmation", "SYN-FR-EXPORT-006", {
    ...readyBase,
    standardWorkId: "SYN-FR-WORK-EXPORT-006",
    renewalReviewCandidate: true,
    renewalManualConfirmed: false
  }),
  exportCase("not_for_formal_decision_visible", "SYN-FR-EXPORT-007", {
    ...readyBase,
    standardWorkId: "SYN-FR-WORK-EXPORT-007",
    notForFormalDecision: true
  }),
  exportCase("formal_style_release_blocked", "SYN-FR-EXPORT-008", {
    ...readyBase,
    standardWorkId: "SYN-FR-WORK-EXPORT-008",
    requestedExportMode: "formal",
    formalEvaluationExecuted: false
  }),
  exportCase("forbidden_field_detection", "SYN-FR-EXPORT-009", {
    ...readyBase,
    standardWorkId: "SYN-FR-WORK-EXPORT-009",
    rawBillRows: Object.freeze(["SYN-FORBIDDEN-ROW"])
  })
]);

export const M2_EXPORT_RELEASE_GATE_FIXTURE_PACKAGES = Object.freeze(
  M2_EXPORT_RELEASE_GATE_CASES.map((item) => buildExportPackage(item.input))
);

const eligiblePackage = buildExportPackage(M2_EXPORT_RELEASE_GATE_CASES[0].input);
const pendingRelease = transitionReleaseGate(
  {
    ...eligiblePackage.releaseGate,
    exportId: eligiblePackage.exportId,
    exportEligibilityStatus: eligiblePackage.eligibility.exportEligibilityStatus
  },
  "submit_for_approval",
  "SYN-FIXTURE-OPERATOR",
  "Synthetic submit for approval",
  { transitionedAt: "2026-06-22T00:10:00.000Z" }
).releaseGate;
const approvedRelease = transitionReleaseGate(
  pendingRelease,
  "approve_export",
  "SYN-FIXTURE-APPROVER",
  "Synthetic export approval",
  { transitionedAt: "2026-06-22T00:20:00.000Z" }
).releaseGate;
const releasedRelease = transitionReleaseGate(
  approvedRelease,
  "release",
  "SYN-FIXTURE-RELEASER",
  "Synthetic release",
  { transitionedAt: "2026-06-22T00:30:00.000Z" }
).releaseGate;
const rolledBackRelease = transitionReleaseGate(
  releasedRelease,
  "rollback",
  "SYN-FIXTURE-RELEASER",
  "Synthetic rollback",
  { transitionedAt: "2026-06-22T00:40:00.000Z" }
).releaseGate;
const invalidatedRelease = transitionReleaseGate(
  approvedRelease,
  "invalidate",
  "SYN-FIXTURE-RELEASER",
  "Synthetic invalidation",
  { transitionedAt: "2026-06-22T00:50:00.000Z" }
).releaseGate;

export const M2_EXPORT_RELEASE_GATE_FLOW_FIXTURES = Object.freeze({
  eligiblePackage,
  pendingRelease,
  approvedRelease,
  releasedRelease,
  rolledBackRelease,
  invalidatedRelease
});

export const FORBIDDEN_M2_EXPORT_RELEASE_GATE_TOKENS = Object.freeze([
  "postgres://",
  "postgresql://",
  "switch_mapping_version",
  "local_dry_run",
  "CREATE TABLE",
  "db/migrations"
]);

function exportCase(caseId, exportId, input) {
  return Object.freeze({
    caseId,
    exportId,
    input: Object.freeze({
      ...input,
      exportId
    })
  });
}
