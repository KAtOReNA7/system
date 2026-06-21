import { M2_FORMAL_PERSISTENCE_CANDIDATE_VERSION } from "../../src/domain/oldProductEvaluation/formalPersistenceSchema.js";

const READY_BASE = Object.freeze({
  candidateVersion: M2_FORMAL_PERSISTENCE_CANDIDATE_VERSION,
  mappingVersion: Object.freeze({ id: 101, status: "active" }),
  basicInfoVersion: Object.freeze({ id: 201, status: "active" }),
  copyrightStart: "2023-01-01",
  copyrightEnd: "2028-12-31",
  blockingReviewStatus: "approved",
  advisoryReviewFlags: Object.freeze([]),
  latestCompleteMonth: "2026-04",
  cutoffMonth: "2026-04",
  hasIncomeFacts: true,
  hasInputSnapshot: true,
  requiredFields: Object.freeze({
    mappingVersion: true,
    basicInfoVersion: true,
    copyrightEnd: true
  }),
  reviewItems: Object.freeze([]),
  formalPersistenceEnabled: true,
  evaluationTaskApiEnabled: true,
  exportApiEnabled: true,
  notForFormalDecision: false,
  gateCheckedAt: "2026-06-22T00:00:00.000Z"
});

export const M2_FORMAL_READINESS_FIXTURE_ITEMS = Object.freeze([
  fixture("fully_ready", "SYN-FR-WORK-001", {}),
  fixture("mapping_version_missing", "SYN-FR-WORK-002", { mappingVersion: null }),
  fixture("mapping_version_inactive", "SYN-FR-WORK-003", {
    mappingVersion: Object.freeze({ id: 102, status: "validated" })
  }),
  fixture("basic_info_missing", "SYN-FR-WORK-004", { basicInfoVersion: null }),
  fixture("copyright_end_missing", "SYN-FR-WORK-005", { copyrightEnd: null }),
  fixture("copyright_conflict", "SYN-FR-WORK-006", {
    copyrightStart: "2029-01-01",
    copyrightEnd: "2028-12-31"
  }),
  fixture("blocking_review_pending", "SYN-FR-WORK-007", { blockingReviewStatus: "pending" }),
  fixture("blocking_review_rejected", "SYN-FR-WORK-008", {
    blockingReviewStatus: "rejected_for_formal"
  }),
  fixture("advisory_only_review", "SYN-FR-WORK-009", {
    reviewItems: Object.freeze([
      Object.freeze({
        reviewType: "advisory_review",
        reviewStatus: "pending",
        reviewReasonCode: "channel_concentration_advisory",
        isAdvisory: true
      })
    ])
  }),
  fixture("missing_income_facts", "SYN-FR-WORK-010", { hasIncomeFacts: false }),
  fixture("missing_input_snapshot", "SYN-FR-WORK-011", { hasInputSnapshot: false }),
  fixture("cutoff_month_invalid", "SYN-FR-WORK-012", { cutoffMonth: "2026-05" }),
  fixture("candidate_version_mismatch", "SYN-FR-WORK-013", {
    candidateVersion: "m2-c3-cleaned-bill-nonformal-v0.2/not-candidate-a"
  }),
  fixture("multiple_blocking_reasons", "SYN-FR-WORK-014", {
    mappingVersion: null,
    basicInfoVersion: null,
    copyrightEnd: null,
    hasIncomeFacts: false,
    hasInputSnapshot: false
  }),
  fixture("mixed_blocking_and_advisory_reasons", "SYN-FR-WORK-015", {
    mappingVersion: Object.freeze({ id: 103, status: "building" }),
    advisoryReviewFlags: Object.freeze([
      "channel_concentration_advisory",
      "downlist_requires_manual_confirmation"
    ])
  })
]);

export function getM2FormalReadinessFixture(caseId) {
  return M2_FORMAL_READINESS_FIXTURE_ITEMS.find((item) => item.caseId === caseId);
}

function fixture(caseId, standardWorkId, overrides) {
  return Object.freeze({
    ...READY_BASE,
    ...overrides,
    caseId,
    standardWorkId
  });
}
