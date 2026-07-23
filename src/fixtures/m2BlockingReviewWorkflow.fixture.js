export const M2_BLOCKING_REVIEW_DATASET = Object.freeze({
  mode: "fixture",
  source: "m2-fr-3-blocking-review-synthetic-fixture",
  candidateVersion: "candidate-a",
  stage: "M2-FR-3",
  syntheticOnly: true,
  formalEvaluationAllowed: false,
  formalDataAuthorized: false,
  notForFormalDecision: true,
  databaseWritten: false,
  reviewAggregate: {
    simulatedBlockingReviewCount: 513,
    sampleItemCount: 10,
    aggregateOnly: true
  }
});

export const M2_BLOCKING_REVIEW_FIXTURE_ITEMS = Object.freeze([
  {
    reviewItemId: "SYN-FR-REVIEW-001",
    standardWorkId: "SYN-FR-WORK-001",
    workLabel: "Synthetic review work 001",
    reviewType: "blocking_manual_review",
    reviewStatus: "pending",
    reasonCode: "high_value_with_data_gap",
    reasonLabel: "High value candidate with unresolved synthetic data gap",
    isBlocking: true,
    suggestedAction: "confirm missing synthetic input before formal entry",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z"
  },
  {
    reviewItemId: "SYN-FR-REVIEW-002",
    standardWorkId: "SYN-FR-WORK-002",
    workLabel: "Synthetic review work 002",
    reviewType: "blocking_manual_review",
    reviewStatus: "approved",
    reasonCode: "high_value_with_expiry",
    reasonLabel: "High value candidate with synthetic expiry review completed",
    isBlocking: true,
    suggestedAction: "retain audit trace and allow formal entry after other gates pass",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-02T00:00:00.000Z"
  },
  {
    reviewItemId: "SYN-FR-REVIEW-003",
    standardWorkId: "SYN-FR-WORK-003",
    workLabel: "Synthetic review work 003",
    reviewType: "blocking_manual_review",
    reviewStatus: "data_fix_required",
    reasonCode: "abnormal_spike",
    reasonLabel: "Synthetic abnormal spike requires data correction",
    isBlocking: true,
    suggestedAction: "request source-side synthetic correction before formal entry",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-02T00:00:00.000Z"
  },
  {
    reviewItemId: "SYN-FR-REVIEW-004",
    standardWorkId: "SYN-FR-WORK-004",
    workLabel: "Synthetic review work 004",
    reviewType: "blocking_manual_review",
    reviewStatus: "waiver_granted",
    reasonCode: "buyout_or_oneoff_income",
    reasonLabel: "Synthetic one-off income accepted with waiver",
    isBlocking: true,
    suggestedAction: "keep waiver audit event attached to formal readiness packet",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-03T00:00:00.000Z"
  },
  {
    reviewItemId: "SYN-FR-REVIEW-005",
    standardWorkId: "SYN-FR-WORK-005",
    workLabel: "Synthetic review work 005",
    reviewType: "blocking_manual_review",
    reviewStatus: "rejected_for_formal",
    reasonCode: "insufficient_history",
    reasonLabel: "Synthetic history is insufficient for formal entry",
    isBlocking: true,
    suggestedAction: "exclude from formal candidate set until more synthetic history exists",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-03T00:00:00.000Z"
  },
  {
    reviewItemId: "SYN-FR-REVIEW-006",
    standardWorkId: "SYN-FR-WORK-006",
    workLabel: "Synthetic review work 006",
    reviewType: "blocking_manual_review",
    reviewStatus: "pending",
    reasonCode: "channel_structure_unclear",
    reasonLabel: "Synthetic channel structure requires manual confirmation",
    isBlocking: true,
    suggestedAction: "confirm synthetic channel structure before formal entry",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z"
  },
  {
    reviewItemId: "SYN-FR-REVIEW-007",
    standardWorkId: "SYN-FR-WORK-007",
    workLabel: "Synthetic review work 007",
    reviewType: "advisory_review",
    reviewStatus: "pending",
    reasonCode: "advisory_lifecycle_note",
    reasonLabel: "Synthetic advisory lifecycle note",
    isBlocking: false,
    suggestedAction: "review later without blocking formal entry",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z"
  },
  {
    reviewItemId: "SYN-FR-REVIEW-008",
    standardWorkId: "SYN-FR-WORK-008",
    workLabel: "Synthetic review work 008",
    reviewType: "blocking_manual_review",
    reviewStatus: "approved",
    reasonCode: "mixed_blocking_advisory",
    reasonLabel: "Synthetic mixed blocking and advisory review completed",
    isBlocking: true,
    advisoryFlags: ["synthetic_cross_channel_note"],
    suggestedAction: "retain mixed-review audit context",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:00.000Z"
  },
  {
    reviewItemId: "SYN-FR-REVIEW-009",
    standardWorkId: "SYN-FR-WORK-009",
    workLabel: "Synthetic review work 009",
    reviewType: "advisory_review",
    reviewStatus: "no_action_required",
    reasonCode: "advisory_mapping_note",
    reasonLabel: "Synthetic advisory mapping note",
    isBlocking: false,
    suggestedAction: "no action required for this fixture advisory item",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:00.000Z"
  },
  {
    reviewItemId: "SYN-FR-REVIEW-010",
    standardWorkId: "SYN-FR-WORK-010",
    workLabel: "Synthetic review work 010",
    reviewType: "blocking_manual_review",
    reviewStatus: "pending",
    reasonCode: "high_value_with_data_gap",
    reasonLabel: "Second synthetic high value data gap sample",
    isBlocking: true,
    suggestedAction: "confirm aggregate-level review treatment",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z"
  }
]);

export const M2_BLOCKING_REVIEW_REQUIRED_REASON_CODES = Object.freeze([
  "high_value_with_data_gap",
  "high_value_with_expiry",
  "abnormal_spike",
  "buyout_or_oneoff_income",
  "insufficient_history",
  "channel_structure_unclear",
  "mixed_blocking_advisory"
]);

export const FORBIDDEN_M2_BLOCKING_REVIEW_TOKENS = Object.freeze([
  "postgres://",
  "postgresql://",
  "switch_mapping_version",
  "evaluation-tasks",
  "local_dry_run",
  "CREATE TABLE"
]);
