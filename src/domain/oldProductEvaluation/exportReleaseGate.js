import { M2_FORMAL_PERSISTENCE_CANDIDATE_VERSION } from "./formalPersistenceSchema.js";

export const M2_EXPORT_RELEASE_GATE_STATUSES = Object.freeze([
  "draft",
  "pending_approval",
  "approved_for_export",
  "rejected",
  "released",
  "rolled_back",
  "invalidated"
]);

export const M2_EXPORT_RELEASE_GATE_ACTIONS = Object.freeze([
  "submit_for_approval",
  "approve_export",
  "reject_export",
  "release",
  "rollback",
  "invalidate"
]);

export const M2_EXPORT_ALLOWED_FIELDS = Object.freeze([
  "standardWorkId",
  "rating",
  "lifecycle",
  "riskTags",
  "suggestionCodes",
  "reviewStatus",
  "readinessStatus",
  "candidateVersion",
  "algorithmVersion",
  "parameterVersion",
  "cutoffMonth",
  "generatedAt",
  "exportEligibilityStatus",
  "auditSummary",
  "notForFormalDecision",
  "formalEvaluationExecuted",
  "mode"
]);

export const M2_EXPORT_FORBIDDEN_FIELDS = Object.freeze([
  "rawBillRows",
  "realBookTitle",
  "authorName",
  "channelName",
  "perWorkRevenueDetails",
  "databaseConnectionInfo",
  "envContent",
  "operatorConfirmationBody",
  "reidentifiableRevenueCombination"
]);

const APPROVED_REVIEW_STATUSES = new Set(["approved", "waiver_granted", "no_action_required"]);
const RELEASE_ALLOWED_TRANSITIONS = Object.freeze({
  draft: Object.freeze(["submit_for_approval", "invalidate"]),
  pending_approval: Object.freeze(["approve_export", "reject_export", "invalidate"]),
  approved_for_export: Object.freeze(["release", "rollback", "invalidate"]),
  rejected: Object.freeze(["submit_for_approval", "invalidate"]),
  released: Object.freeze(["rollback", "invalidate"]),
  rolled_back: Object.freeze(["invalidate"]),
  invalidated: Object.freeze([])
});

const ACTION_TO_STATUS = Object.freeze({
  submit_for_approval: "pending_approval",
  approve_export: "approved_for_export",
  reject_export: "rejected",
  release: "released",
  rollback: "rolled_back",
  invalidate: "invalidated"
});

export function evaluateExportEligibility(input) {
  const item = input ?? {};
  const blockingReasons = [];
  const warnings = [];
  const forbiddenFieldCheck = detectForbiddenFields(item);

  if (item.readinessGate?.readinessStatus === "blocked" || item.readinessStatus === "blocked") {
    blockingReasons.push(reason("readiness_blocked", "Readiness gate is blocked."));
  }
  if (Array.isArray(item.readinessGate?.blockingReasons) && item.readinessGate.blockingReasons.length > 0) {
    pushUnique(blockingReasons, reason("readiness_blocking_reasons_present", "Readiness gate has blocking reasons."));
  }
  if (!allBlockingReviewsApproved(item.reviewItems ?? item.blockingReviewItems ?? [])) {
    blockingReasons.push(reason("blocking_review_not_approved", "Blocking manual reviews must be approved or waived."));
  }
  if (item.downlistOrSuspendCandidate === true && item.downlistManualConfirmed !== true) {
    blockingReasons.push(reason("downlist_manual_confirmation_missing", "Downlist or suspend candidate requires manual confirmation."));
  }
  if (item.renewalReviewCandidate === true && item.renewalManualConfirmed !== true) {
    blockingReasons.push(reason("renewal_manual_confirmation_missing", "Renewal review candidate requires manual confirmation."));
  }
  if (item.candidateVersion !== M2_FORMAL_PERSISTENCE_CANDIDATE_VERSION) {
    blockingReasons.push(reason("candidate_version_mismatch", "Candidate version must match frozen candidate-a."));
  }
  if (item.requestedExportMode === "formal" && item.formalEvaluationExecuted !== true) {
    blockingReasons.push(reason("formal_evaluation_not_executed", "Formal-style release is not allowed when formal evaluation has not executed."));
  }
  if (forbiddenFieldCheck.hasForbiddenFields) {
    blockingReasons.push(reason("forbidden_fields_present", "Forbidden or sensitive fields are present."));
  }

  if (item.notForFormalDecision !== true) {
    warnings.push(reason("not_for_formal_decision_not_marked", "Fixture export must visibly retain notForFormalDecision=true."));
  }
  if (item.formalEvaluationExecuted === true) {
    warnings.push(reason("formal_evaluation_marker_unexpected", "Fixture export should not claim formal evaluation execution."));
  }

  return withGuardFlags({
    standardWorkId: item.standardWorkId ?? null,
    exportEligibilityStatus: blockingReasons.length === 0 ? "eligible" : "blocked",
    canSubmitForApproval: blockingReasons.length === 0,
    blockingReasons,
    warnings,
    forbiddenFieldCheck,
    candidateVersion: item.candidateVersion ?? null,
    notForFormalDecision: true,
    formalEvaluationExecuted: false
  });
}

export function buildExportPackage(input) {
  const item = input ?? {};
  const eligibility = evaluateExportEligibility(item);
  const generatedAt = item.generatedAt ?? "2026-06-22T00:00:00.000Z";
  const payload = {
    standardWorkId: item.standardWorkId ?? "SYN-FR-WORK-UNKNOWN",
    rating: item.rating ?? "not_rated",
    lifecycle: item.lifecycle ?? "unknown",
    riskTags: clone(item.riskTags ?? []),
    suggestionCodes: clone(item.suggestionCodes ?? []),
    reviewStatus: item.reviewStatus ?? summarizeReviewStatus(item.reviewItems ?? item.blockingReviewItems ?? []),
    readinessStatus: item.readinessGate?.readinessStatus ?? item.readinessStatus ?? "unknown",
    candidateVersion: item.candidateVersion ?? null,
    algorithmVersion: item.algorithmVersion ?? "fixture-old-product-v1",
    parameterVersion: item.parameterVersion ?? "candidate-a-fixture",
    cutoffMonth: item.cutoffMonth ?? "2026-04",
    generatedAt,
    exportEligibilityStatus: eligibility.exportEligibilityStatus,
    auditSummary: {
      eventCount: Array.isArray(item.auditEvents) ? item.auditEvents.length : 0,
      latestEventAt: lastAuditEventAt(item.auditEvents) ?? generatedAt,
      releaseGateStatus: item.releaseGate?.status ?? "draft"
    },
    notForFormalDecision: true,
    formalEvaluationExecuted: false,
    mode: "fixture"
  };
  const disallowedOutputFields = Object.keys(payload).filter(
    (field) => !M2_EXPORT_ALLOWED_FIELDS.includes(field)
  );

  return withGuardFlags({
    exportId: item.exportId ?? `SYN-FR-EXPORT-${payload.standardWorkId}`,
    packageStatus: eligibility.exportEligibilityStatus === "eligible" ? "draft" : "blocked",
    payload,
    allowedFields: [...M2_EXPORT_ALLOWED_FIELDS],
    disallowedOutputFields,
    eligibility,
    releaseGate: item.releaseGate ?? {
      releaseId: item.releaseId ?? `SYN-FR-RELEASE-${payload.standardWorkId}`,
      status: "draft",
      auditEvents: []
    }
  });
}

export function transitionReleaseGate(releaseState, action, actor, reasonText, options = {}) {
  const state = normalizeReleaseState(releaseState);
  validateAction(action);
  const normalizedActor = requireNonEmptyString(actor, "actor");
  const normalizedReason = requireNonEmptyString(reasonText, "reason");
  const allowed = RELEASE_ALLOWED_TRANSITIONS[state.status] ?? [];
  if (!allowed.includes(action)) {
    throw new Error(`action ${action} is not allowed from release status ${state.status}`);
  }
  if (
    action === "submit_for_approval" &&
    state.exportEligibilityStatus &&
    state.exportEligibilityStatus !== "eligible"
  ) {
    throw new Error("blocked export package cannot be submitted for approval");
  }
  const nextStatus = ACTION_TO_STATUS[action];
  const occurredAt = options.transitionedAt ?? "2026-06-22T00:00:00.000Z";
  const event = {
    eventId: `SYN-FR-EXPORT-AUDIT-${state.releaseId}-${action}-${nextStatus}`,
    releaseId: state.releaseId,
    exportId: state.exportId,
    action,
    actor: normalizedActor,
    reason: normalizedReason,
    previousStatus: state.status,
    nextStatus,
    occurredAt,
    fixtureOnly: true,
    databaseWritten: false,
    formalExportCreated: false,
    formalEvaluationExecuted: false,
    notForFormalDecision: true
  };

  return withGuardFlags({
    releaseGate: {
      ...state,
      status: nextStatus,
      updatedAt: occurredAt,
      auditEvents: [...(state.auditEvents ?? []), event]
    },
    auditEvent: event,
    before: clone(state),
    after: {
      ...state,
      status: nextStatus,
      updatedAt: occurredAt,
      auditEvents: [...(state.auditEvents ?? []), event]
    }
  });
}

export function summarizeExportPackages(packages) {
  if (!Array.isArray(packages)) {
    throw new Error("export packages must be an array");
  }
  const statusDistribution = {};
  const eligibilityDistribution = {};
  for (const item of packages) {
    const status = item.releaseGate?.status ?? item.packageStatus ?? "unknown";
    const eligibility = item.eligibility?.exportEligibilityStatus ?? item.exportEligibilityStatus ?? "unknown";
    statusDistribution[status] = (statusDistribution[status] ?? 0) + 1;
    eligibilityDistribution[eligibility] = (eligibilityDistribution[eligibility] ?? 0) + 1;
  }

  return withGuardFlags({
    total: packages.length,
    statusDistribution,
    eligibilityDistribution,
    eligibleCount: eligibilityDistribution.eligible ?? 0,
    blockedCount: eligibilityDistribution.blocked ?? 0
  });
}

export function detectForbiddenFields(input) {
  const keys = new Set([
    ...Object.keys(input ?? {}),
    ...Object.keys(input?.payload ?? {}),
    ...Object.keys(input?.sourceFields ?? {})
  ]);
  const detectedFields = M2_EXPORT_FORBIDDEN_FIELDS.filter((field) => keys.has(field));
  return {
    hasForbiddenFields: detectedFields.length > 0,
    detectedFields,
    allowedFields: [...M2_EXPORT_ALLOWED_FIELDS],
    forbiddenFields: [...M2_EXPORT_FORBIDDEN_FIELDS]
  };
}

function allBlockingReviewsApproved(items) {
  if (!Array.isArray(items)) {
    return false;
  }
  return items
    .filter((item) => item.isBlocking === true || item.reviewType === "blocking_manual_review")
    .every((item) => APPROVED_REVIEW_STATUSES.has(item.reviewStatus));
}

function summarizeReviewStatus(items) {
  const blockingItems = Array.isArray(items)
    ? items.filter((item) => item.isBlocking === true || item.reviewType === "blocking_manual_review")
    : [];
  if (blockingItems.length === 0) {
    return "no_blocking_review";
  }
  if (blockingItems.every((item) => APPROVED_REVIEW_STATUSES.has(item.reviewStatus))) {
    return "approved_or_waived";
  }
  return "blocking_review_open";
}

function normalizeReleaseState(releaseState) {
  if (!releaseState || typeof releaseState !== "object") {
    throw new Error("releaseState must be an object");
  }
  requireNonEmptyString(releaseState.releaseId, "releaseId");
  if (!M2_EXPORT_RELEASE_GATE_STATUSES.includes(releaseState.status)) {
    throw new Error(`unknown release status: ${releaseState.status}`);
  }
  return {
    exportId: releaseState.exportId ?? null,
    releaseId: releaseState.releaseId,
    status: releaseState.status,
    exportEligibilityStatus: releaseState.exportEligibilityStatus,
    auditEvents: Array.isArray(releaseState.auditEvents) ? clone(releaseState.auditEvents) : [],
    updatedAt: releaseState.updatedAt ?? null
  };
}

function validateAction(action) {
  if (!M2_EXPORT_RELEASE_GATE_ACTIONS.includes(action)) {
    throw new Error(`unknown release action: ${action}`);
  }
}

function lastAuditEventAt(events) {
  if (!Array.isArray(events) || events.length === 0) {
    return null;
  }
  return events[events.length - 1]?.occurredAt ?? null;
}

function reason(code, message) {
  return { code, message };
}

function pushUnique(reasons, nextReason) {
  if (!reasons.some((item) => item.code === nextReason.code)) {
    reasons.push(nextReason);
  }
}

function withGuardFlags(value) {
  return {
    ...value,
    mode: "fixture",
    notForFormalDecision: true,
    formalEvaluationExecuted: false,
    databaseWritten: false,
    mappingVersionActivated: false,
    switchMappingVersionCalled: false,
    formalExportCreated: false
  };
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
