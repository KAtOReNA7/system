import { M2_FORMAL_PERSISTENCE_CANDIDATE_VERSION } from "./formalPersistenceSchema.js";

export const M2_FORMAL_READINESS_STATUSES = Object.freeze([
  "ready",
  "blocked",
  "warning_only"
]);

export const M2_FORMAL_READINESS_BLOCKING_REASON_CODES = Object.freeze([
  "mapping_version_not_active",
  "mapping_version_missing",
  "basic_info_version_missing",
  "copyright_end_missing",
  "copyright_date_conflict",
  "blocking_review_pending",
  "blocking_review_rejected",
  "income_facts_missing",
  "input_snapshot_missing",
  "cutoff_month_invalid",
  "candidate_version_mismatch"
]);

export const M2_FORMAL_READINESS_ADVISORY_REASON_CODES = Object.freeze([
  "advisory_review_present",
  "channel_concentration_advisory",
  "copyright_fallback_used",
  "long_tail_or_inactive",
  "downlist_requires_manual_confirmation",
  "renewal_review_requires_confirmation"
]);

export const M2_FORMAL_READINESS_WARNING_CODES = Object.freeze([
  "not_for_formal_decision",
  "formal_persistence_not_enabled",
  "evaluation_task_api_not_enabled",
  "export_api_not_enabled"
]);

const REQUIRED_ACTION_BY_REASON = Object.freeze({
  mapping_version_not_active: "activate_or_confirm_mapping_version",
  mapping_version_missing: "provide_active_mapping_version",
  basic_info_version_missing: "provide_active_basic_info_version",
  copyright_end_missing: "complete_or_waive_copyright_end",
  copyright_date_conflict: "resolve_copyright_date_conflict",
  blocking_review_pending: "complete_blocking_manual_review",
  blocking_review_rejected: "exclude_from_formal_evaluation_or_fix_source",
  income_facts_missing: "load_or_confirm_income_facts",
  input_snapshot_missing: "build_formal_input_snapshot",
  cutoff_month_invalid: "use_latest_confirmed_complete_month",
  candidate_version_mismatch: "use_frozen_candidate_a_version",
  advisory_review_present: "review_advisory_notes",
  channel_concentration_advisory: "display_channel_concentration_advisory",
  copyright_fallback_used: "replace_fallback_or_show_advisory",
  long_tail_or_inactive: "display_lifecycle_advisory",
  downlist_requires_manual_confirmation: "confirm_downlist_before_action",
  renewal_review_requires_confirmation: "confirm_renewal_before_action",
  not_for_formal_decision: "keep_result_out_of_formal_decision",
  formal_persistence_not_enabled: "enable_formal_persistence_before_execution",
  evaluation_task_api_not_enabled: "enable_task_api_before_execution",
  export_api_not_enabled: "enable_export_api_before_release"
});

export function evaluateFormalReadiness(input) {
  const item = input ?? {};
  const blockingReasons = [];
  const advisoryReasons = [];
  const warnings = [];

  addCandidateVersionReason(item, blockingReasons);
  addMappingReasons(item, blockingReasons);
  addBasicInfoReasons(item, blockingReasons);
  addCopyrightReasons(item, blockingReasons);
  addReviewReasons(item, blockingReasons, advisoryReasons);
  addInputReasons(item, blockingReasons);
  addCutoffReason(item, blockingReasons);
  addAdvisoryFlagReasons(item, advisoryReasons);
  addWarningReasons(item, warnings);

  const readinessStatus =
    blockingReasons.length > 0 ? "blocked" : advisoryReasons.length > 0 || warnings.length > 0 ? "warning_only" : "ready";
  const requiredActions = buildRequiredActions([
    ...blockingReasons,
    ...advisoryReasons,
    ...warnings
  ]);

  return {
    standardWorkId: item.standardWorkId ?? null,
    readinessStatus,
    formalEvaluationAllowed: blockingReasons.length === 0 && item.notForFormalDecision !== true,
    blockingReasons,
    advisoryReasons,
    warnings,
    requiredActions,
    versionRefs: {
      mappingVersionId: item.mappingVersion?.id ?? null,
      mappingVersionStatus: item.mappingVersion?.status ?? null,
      basicInfoVersionId: item.basicInfoVersion?.id ?? null,
      basicInfoVersionStatus: item.basicInfoVersion?.status ?? null,
      latestCompleteMonth: item.latestCompleteMonth ?? null,
      cutoffMonth: item.cutoffMonth ?? null
    },
    gateCheckedAt: item.gateCheckedAt ?? new Date().toISOString(),
    notForFormalDecision: item.notForFormalDecision === true,
    candidateVersion: item.candidateVersion ?? null
  };
}

export function summarizeFormalReadiness(items) {
  const results = items.map((item) =>
    item && Array.isArray(item.blockingReasons) ? item : evaluateFormalReadiness(item)
  );
  const candidateVersions = [...new Set(results.map((item) => item.candidateVersion).filter(Boolean))];

  return {
    total: results.length,
    ready: results.filter((item) => item.readinessStatus === "ready").length,
    blocked: results.filter((item) => item.readinessStatus === "blocked").length,
    warningOnly: results.filter((item) => item.readinessStatus === "warning_only").length,
    blockingReasonDistribution: countReasonCodes(results.flatMap((item) => item.blockingReasons)),
    advisoryReasonDistribution: countReasonCodes(results.flatMap((item) => item.advisoryReasons)),
    requiredActionDistribution: countActionCodes(results.flatMap((item) => item.requiredActions)),
    candidateVersion: candidateVersions.length === 1 ? candidateVersions[0] : candidateVersions,
    formalEvaluationAllowed: results.length > 0 && results.every((item) => item.formalEvaluationAllowed === true),
    notForFormalDecision: true
  };
}

function addCandidateVersionReason(item, blockingReasons) {
  if (item.candidateVersion !== M2_FORMAL_PERSISTENCE_CANDIDATE_VERSION) {
    blockingReasons.push(reason("candidate_version_mismatch", "Candidate version must match frozen candidate-a."));
  }
}

function addMappingReasons(item, blockingReasons) {
  if (!item.mappingVersion?.id) {
    blockingReasons.push(reason("mapping_version_missing", "Active mapping version reference is missing."));
    return;
  }
  if (item.mappingVersion.status !== "active") {
    blockingReasons.push(reason("mapping_version_not_active", "Mapping version is not active."));
  }
}

function addBasicInfoReasons(item, blockingReasons) {
  if (!item.basicInfoVersion?.id) {
    blockingReasons.push(reason("basic_info_version_missing", "Basic info version reference is missing."));
  }
}

function addCopyrightReasons(item, blockingReasons) {
  if (!item.copyrightEnd) {
    blockingReasons.push(reason("copyright_end_missing", "Copyright end date is missing."));
  }
  if (
    item.copyrightConflict === true ||
    (isComparableDate(item.copyrightStart) &&
      isComparableDate(item.copyrightEnd) &&
      normalizeDate(item.copyrightStart) > normalizeDate(item.copyrightEnd))
  ) {
    blockingReasons.push(reason("copyright_date_conflict", "Copyright start is later than copyright end or conflict is declared."));
  }
}

function addReviewReasons(item, blockingReasons, advisoryReasons) {
  const statuses = [
    item.blockingReviewStatus,
    ...reviewItems(item)
      .filter((review) => review.isBlocking === true || review.reviewType === "blocking_manual_review")
      .map((review) => review.reviewStatus)
  ].filter(Boolean);

  if (statuses.some((status) => status === "pending" || status === "data_fix_required")) {
    blockingReasons.push(reason("blocking_review_pending", "Blocking manual review is not completed."));
  }
  if (statuses.some((status) => status === "rejected_for_formal" || status === "rejected")) {
    blockingReasons.push(reason("blocking_review_rejected", "Blocking manual review rejected formal evaluation."));
  }

  const advisoryItems = reviewItems(item).filter(
    (review) => review.reviewType === "advisory_review" || review.isAdvisory === true
  );
  if (advisoryItems.length > 0) {
    advisoryReasons.push(reason("advisory_review_present", "Advisory review item exists."));
  }
}

function addInputReasons(item, blockingReasons) {
  if (item.hasIncomeFacts !== true) {
    blockingReasons.push(reason("income_facts_missing", "Income facts are missing."));
  }
  if (item.hasInputSnapshot !== true) {
    blockingReasons.push(reason("input_snapshot_missing", "Input snapshot is missing."));
  }
  const missingRequiredFields = Object.entries(item.requiredFields ?? {})
    .filter(([, value]) => value !== true)
    .map(([field]) => field);
  for (const field of missingRequiredFields) {
    if (field === "basicInfoVersion") {
      pushUniqueReason(blockingReasons, reason("basic_info_version_missing", "Required basic info field is missing."));
    }
    if (field === "copyrightEnd") {
      pushUniqueReason(blockingReasons, reason("copyright_end_missing", "Required copyright end field is missing."));
    }
  }
}

function addCutoffReason(item, blockingReasons) {
  if (!isValidMonth(item.cutoffMonth) || !isValidMonth(item.latestCompleteMonth)) {
    blockingReasons.push(reason("cutoff_month_invalid", "Cutoff month and latest complete month must be valid months."));
    return;
  }
  if (monthComparable(item.cutoffMonth) > monthComparable(item.latestCompleteMonth)) {
    blockingReasons.push(reason("cutoff_month_invalid", "Cutoff month must not be later than latest complete month."));
  }
}

function addAdvisoryFlagReasons(item, advisoryReasons) {
  for (const code of item.advisoryReviewFlags ?? []) {
    if (M2_FORMAL_READINESS_ADVISORY_REASON_CODES.includes(code)) {
      pushUniqueReason(advisoryReasons, reason(code, `Advisory flag present: ${code}.`));
    }
  }
}

function addWarningReasons(item, warnings) {
  if (item.notForFormalDecision === true) {
    warnings.push(reason("not_for_formal_decision", "Input remains marked as not for formal decision."));
  }
  if (item.formalPersistenceEnabled === false) {
    warnings.push(reason("formal_persistence_not_enabled", "Formal persistence is not enabled."));
  }
  if (item.evaluationTaskApiEnabled === false) {
    warnings.push(reason("evaluation_task_api_not_enabled", "Evaluation task API is not enabled."));
  }
  if (item.exportApiEnabled === false) {
    warnings.push(reason("export_api_not_enabled", "Export API is not enabled."));
  }
}

function buildRequiredActions(reasons) {
  const seen = new Set();
  return reasons.flatMap((item) => {
    const actionCode = REQUIRED_ACTION_BY_REASON[item.code];
    if (!actionCode || seen.has(actionCode)) {
      return [];
    }
    seen.add(actionCode);
    return [{ code: actionCode, sourceReasonCode: item.code }];
  });
}

function countReasonCodes(reasons) {
  return reasons.reduce((counts, item) => {
    counts[item.code] = (counts[item.code] ?? 0) + 1;
    return counts;
  }, {});
}

function countActionCodes(actions) {
  return actions.reduce((counts, item) => {
    counts[item.code] = (counts[item.code] ?? 0) + 1;
    return counts;
  }, {});
}

function reason(code, message) {
  return { code, message };
}

function pushUniqueReason(reasons, nextReason) {
  if (!reasons.some((item) => item.code === nextReason.code)) {
    reasons.push(nextReason);
  }
}

function reviewItems(item) {
  return Array.isArray(item.reviewItems) ? item.reviewItems : [];
}

function isValidMonth(value) {
  return typeof value === "string" && /^\d{4}-\d{2}$/.test(value);
}

function monthComparable(value) {
  const [year, month] = value.split("-").map(Number);
  return year * 12 + month;
}

function isComparableDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}(-\d{2})?$/.test(value);
}

function normalizeDate(value) {
  return value.length === 7 ? `${value}-01` : value;
}
