export const M2_REVIEW_CLOSURE_VERSION = "m2-candidate-b-review-closure-v0.1";

export const REVIEW_PACK_COLUMNS = Object.freeze([
  "reviewItemId",
  "groupDecisionId",
  "candidateVersion",
  "stableWorkReference",
  "reasonCode",
  "reasonGroup",
  "priority",
  "currentStatus",
  "proposedDecision",
  "proposedDecisionConfidence",
  "proposedDecisionReason",
  "requiredBusinessAction",
  "allowedDecisions",
  "reviewerDecision",
  "reviewerReason",
  "reviewerName",
  "reviewedAt",
  "auditNote",
  "dataFixRequiredFlag",
  "waiverScope",
  "waiverExpiry",
  "reimportRequiredFlag",
  "rating",
  "lifecycle",
  "riskLevel",
  "primarySuggestion",
  "riskCodes",
  "riskTypes",
  "suggestionCodes",
  "dataGapType"
]);

export const GROUP_DECISION_TEMPLATE_COLUMNS = Object.freeze([
  "groupDecisionId",
  "reasonCode",
  "itemCount",
  "priorityRange",
  "defaultProposedDecision",
  "allowedFinalDecisions",
  "reviewerDecision",
  "reviewerReason",
  "reviewerName",
  "reviewedAt",
  "waiverScope",
  "waiverExpiry",
  "dataFixRequiredFlag",
  "reimportRequiredFlag",
  "appliesToAllItemsInGroup",
  "excludedReviewItemIds",
  "includedReviewItemIds",
  "auditNote",
  "remediationStatus",
  "autoFixableCount",
  "remainingBlockingCount",
  "recommendedGroupDecisionAfterRemediation",
  "remediationEvidenceSummary",
  "userConfirmationRequired",
  "canApplyWithoutFurtherDataFix",
  "postReimportBlockingCount"
]);

export const FINAL_REVIEW_DECISIONS = Object.freeze([
  "approved",
  "data_fix_required",
  "waiver_granted",
  "rejected_for_formal",
  "no_action_required",
  "pending"
]);

export const CLOSING_REVIEW_STATUSES = new Set([
  "approved",
  "waiver_granted",
  "no_action_required"
]);

export const BLOCKING_REVIEW_STATUSES = new Set([
  "pending",
  "data_fix_required",
  "rejected_for_formal"
]);

const DEFAULT_ALLOWED_DECISIONS = FINAL_REVIEW_DECISIONS.join("|");

export const GROUP_DECISION_POLICIES = Object.freeze({
  "GROUP-DATA-GAP-HIGH-VALUE": {
    groupDecisionId: "GROUP-DATA-GAP-HIGH-VALUE",
    reasonCode: "high_value_with_data_gap",
    reasonGroup: "data_readiness",
    defaultProposedDecision: "data_fix_required",
    allowedFinalDecisions: [
      "data_fix_required",
      "waiver_granted",
      "no_action_required",
      "approved",
      "rejected_for_formal",
      "pending"
    ],
    requiredUserDecision:
      "Confirm all remain data_fix_required, select a scoped exception policy, or request data correction and reimport.",
    shouldFinalApplyByDefault: false,
    defaultDataFixRequiredFlag: "true",
    defaultReimportRequiredFlag: "true",
    defaultWaiverScope: "",
    defaultWaiverExpiry: "",
    readinessEffect:
      "data_fix_required keeps local readiness blocked until the local data fix and reimport pass."
  },
  "GROUP-EXPIRY-HIGH-VALUE": {
    groupDecisionId: "GROUP-EXPIRY-HIGH-VALUE",
    reasonCode: "high_value_with_expiry",
    reasonGroup: "copyright_readiness",
    defaultProposedDecision: "waiver_granted",
    allowedFinalDecisions: [
      "waiver_granted",
      "data_fix_required",
      "no_action_required",
      "approved",
      "rejected_for_formal",
      "pending"
    ],
    requiredUserDecision:
      "Confirm waiver policy, waiverScope, waiverExpiry or no-expiry rationale, and reviewerReason.",
    shouldFinalApplyByDefault: false,
    defaultDataFixRequiredFlag: "false",
    defaultReimportRequiredFlag: "false",
    defaultWaiverScope: "candidate-b local review scope",
    defaultWaiverExpiry: "next formal readiness review",
    readinessEffect:
      "waiver_granted may close the local blocker only when waiver scope and audit reason are explicit."
  },
  "GROUP-INSUFFICIENT-HISTORY": {
    groupDecisionId: "GROUP-INSUFFICIENT-HISTORY",
    reasonCode: "insufficient_history",
    reasonGroup: "history_depth",
    defaultProposedDecision: "pending",
    allowedFinalDecisions: [
      "pending",
      "no_action_required",
      "rejected_for_formal",
      "data_fix_required",
      "waiver_granted",
      "approved"
    ],
    requiredUserDecision:
      "Keep pending, accept as no_action_required, reject for formal, or request more history/source data.",
    shouldFinalApplyByDefault: false,
    defaultDataFixRequiredFlag: "false",
    defaultReimportRequiredFlag: "false",
    defaultWaiverScope: "",
    defaultWaiverExpiry: "",
    readinessEffect:
      "pending or rejected_for_formal keeps local readiness blocked; no_action_required or approved can close this blocker."
  },
  "GROUP-ABNORMAL-SPIKE": {
    groupDecisionId: "GROUP-ABNORMAL-SPIKE",
    reasonCode: "abnormal_spike",
    reasonGroup: "revenue_anomaly",
    defaultProposedDecision: "pending",
    allowedFinalDecisions: [
      "pending",
      "approved",
      "data_fix_required",
      "rejected_for_formal",
      "waiver_granted",
      "no_action_required"
    ],
    requiredUserDecision:
      "Manual inspect, then approve with reason, require data fix, reject for formal, or grant a narrow waiver.",
    shouldFinalApplyByDefault: false,
    defaultDataFixRequiredFlag: "false",
    defaultReimportRequiredFlag: "false",
    defaultWaiverScope: "",
    defaultWaiverExpiry: "",
    readinessEffect:
      "pending, data_fix_required, or rejected_for_formal keeps local readiness blocked."
  }
});

const GROUP_ID_BY_REASON_CODE = Object.freeze(
  Object.fromEntries(
    Object.values(GROUP_DECISION_POLICIES).map((policy) => [policy.reasonCode, policy.groupDecisionId])
  )
);

const REASON_POLICY = Object.freeze({
  high_value_with_data_gap: {
    reasonGroup: "data_readiness",
    proposedDecision: "data_fix_required",
    proposedDecisionConfidence: "0.85",
    proposedDecisionReason:
      "High-value item still depends on missing or incomplete aggregate readiness evidence.",
    requiredBusinessAction:
      "Confirm missing readiness evidence or provide a local data fix before any formal use.",
    dataFixRequiredFlag: "true",
    reimportRequiredFlag: "true",
    waiverScope: "",
    waiverExpiry: "",
    dataGapType: "basic_info_or_copyright_readiness"
  },
  high_value_with_expiry: {
    reasonGroup: "copyright_readiness",
    proposedDecision: "waiver_granted",
    proposedDecisionConfidence: "0.65",
    proposedDecisionReason:
      "High-value item has copyright-expiry risk that may be waived only with explicit business scope.",
    requiredBusinessAction:
      "Confirm copyright status or grant a narrow audited local-development waiver.",
    dataFixRequiredFlag: "false",
    reimportRequiredFlag: "false",
    waiverScope: "candidate-b local review scope",
    waiverExpiry: "next formal readiness review",
    dataGapType: "copyright_expiry"
  },
  abnormal_spike: {
    reasonGroup: "revenue_anomaly",
    proposedDecision: "pending",
    proposedDecisionConfidence: "0.40",
    proposedDecisionReason:
      "Abnormal spike needs human judgment because one-off revenue may distort rating or action.",
    requiredBusinessAction:
      "Review aggregate anomaly context and choose approve, waiver, data fix, reject, or no action.",
    dataFixRequiredFlag: "false",
    reimportRequiredFlag: "false",
    waiverScope: "",
    waiverExpiry: "",
    dataGapType: "revenue_anomaly"
  },
  insufficient_history: {
    reasonGroup: "history_depth",
    proposedDecision: "pending",
    proposedDecisionConfidence: "0.45",
    proposedDecisionReason:
      "Insufficient history cannot be automatically cleared without business confirmation.",
    requiredBusinessAction:
      "Confirm whether short history can be accepted, waived, rejected, or deferred for more data.",
    dataFixRequiredFlag: "false",
    reimportRequiredFlag: "false",
    waiverScope: "",
    waiverExpiry: "",
    dataGapType: "insufficient_history"
  }
});

export function classifyBlockingReviewItem(item) {
  const policy = REASON_POLICY[item?.reasonCode] ?? {
    reasonGroup: "manual_review",
    proposedDecision: "pending",
    proposedDecisionConfidence: "0.30",
    proposedDecisionReason: "No automatic closure rule exists for this reason code.",
    requiredBusinessAction: "Manual business review required.",
    dataFixRequiredFlag: "false",
    reimportRequiredFlag: "false",
    waiverScope: "",
    waiverExpiry: "",
    dataGapType: "manual_review"
  };
  return {
    ...policy,
    allowedDecisions: DEFAULT_ALLOWED_DECISIONS
  };
}

export function buildReviewPackRow(item) {
  const classification = classifyBlockingReviewItem(item);
  const groupDecisionId = groupDecisionIdForReasonCode(item.reasonCode);
  return {
    reviewItemId: String(item.reviewItemId),
    groupDecisionId,
    candidateVersion: item.candidateVersion,
    stableWorkReference: item.stableWorkReference,
    reasonCode: item.reasonCode,
    reasonGroup: classification.reasonGroup,
    priority: String(item.priority),
    currentStatus: item.currentStatus,
    proposedDecision: classification.proposedDecision,
    proposedDecisionConfidence: classification.proposedDecisionConfidence,
    proposedDecisionReason: classification.proposedDecisionReason,
    requiredBusinessAction: classification.requiredBusinessAction,
    allowedDecisions: classification.allowedDecisions,
    reviewerDecision: "",
    reviewerReason: "",
    reviewerName: "",
    reviewedAt: "",
    auditNote: "",
    dataFixRequiredFlag: classification.dataFixRequiredFlag,
    waiverScope: classification.waiverScope,
    waiverExpiry: classification.waiverExpiry,
    reimportRequiredFlag: classification.reimportRequiredFlag,
    rating: item.rating ?? "",
    lifecycle: item.lifecycle ?? "",
    riskLevel: item.riskLevel ?? "",
    primarySuggestion: item.primarySuggestion ?? "",
    riskCodes: joinList(item.riskCodes),
    riskTypes: joinList(item.riskTypes),
    suggestionCodes: joinList(item.suggestionCodes),
    dataGapType: classification.dataGapType
  };
}

export function groupDecisionIdForReasonCode(reasonCode) {
  return GROUP_ID_BY_REASON_CODE[reasonCode] ?? "GROUP-MANUAL-UNCLASSIFIED";
}

export function validateReviewPackSchema(rows) {
  const rowList = rows ?? [];
  const missingColumns = [];
  for (const column of REVIEW_PACK_COLUMNS) {
    if (rowList.length > 0 && !Object.prototype.hasOwnProperty.call(rowList[0], column)) {
      missingColumns.push(column);
    }
  }
  return {
    valid: missingColumns.length === 0,
    missingColumns,
    rowCount: rowList.length
  };
}

export function validateDecisionRows(rows, options = {}) {
  const expectedCandidateVersion = options.candidateVersion;
  const errors = [];
  const decisions = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const reviewItemId = Number(row.reviewItemId);
    const decision = normalizeDecision(row.reviewerDecision);
    const allowed = splitList(row.allowedDecisions);

    if (!Number.isInteger(reviewItemId) || reviewItemId <= 0) {
      errors.push({ rowNumber, field: "reviewItemId", message: "reviewItemId must be a positive integer" });
    }
    if (expectedCandidateVersion && row.candidateVersion !== expectedCandidateVersion) {
      errors.push({ rowNumber, field: "candidateVersion", message: "candidateVersion mismatch" });
    }
    if (decision && !FINAL_REVIEW_DECISIONS.includes(decision)) {
      errors.push({ rowNumber, field: "reviewerDecision", message: `Unsupported decision: ${decision}` });
    }
    if (decision && allowed.length > 0 && !allowed.includes(decision)) {
      errors.push({ rowNumber, field: "reviewerDecision", message: `Decision not allowed for row: ${decision}` });
    }

    if (decision && decision !== "pending") {
      const reason = String(row.reviewerReason ?? "").trim();
      const reviewer = String(row.reviewerName ?? "").trim();
      if (!reason) {
        errors.push({ rowNumber, field: "reviewerReason", message: "reviewerReason is required" });
      }
      if (!reviewer) {
        errors.push({ rowNumber, field: "reviewerName", message: "reviewerName is required" });
      }
      if (decision === "waiver_granted" && !String(row.waiverScope ?? "").trim()) {
        errors.push({ rowNumber, field: "waiverScope", message: "waiverScope is required for waiver_granted" });
      }
      if (decision === "data_fix_required") {
        if (!parseBoolean(row.dataFixRequiredFlag)) {
          errors.push({
            rowNumber,
            field: "dataFixRequiredFlag",
            message: "dataFixRequiredFlag must be true for data_fix_required"
          });
        }
        if (String(row.reimportRequiredFlag ?? "").trim() === "") {
          errors.push({
            rowNumber,
            field: "reimportRequiredFlag",
            message: "reimportRequiredFlag must be set for data_fix_required"
          });
        }
      }
      decisions.push({
        rowNumber,
        reviewItemId,
        decision,
        reviewerReason: reason,
        reviewerName: reviewer,
        reviewedAt: String(row.reviewedAt ?? "").trim(),
        auditNote: String(row.auditNote ?? "").trim(),
        waiverScope: String(row.waiverScope ?? "").trim(),
        waiverExpiry: String(row.waiverExpiry ?? "").trim(),
        dataFixRequiredFlag: parseBoolean(row.dataFixRequiredFlag),
        reimportRequiredFlag: parseBoolean(row.reimportRequiredFlag)
      });
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    decisions
  };
}

export function summarizeBusinessClosure(rows) {
  const rowList = rows ?? [];
  return {
    totalBlockingReviewItems: rowList.length,
    reasonCodeDistribution: distribution(rowList, "reasonCode"),
    reasonGroupDistribution: distribution(rowList, "reasonGroup"),
    priorityDistribution: distribution(rowList.map((row) => ({ bucket: priorityBucket(row.priority) })), "bucket"),
    riskTypeDistribution: delimitedDistribution(rowList, "riskTypes"),
    suggestionCodeDistribution: delimitedDistribution(rowList, "suggestionCodes"),
    dataGapTypeDistribution: distribution(rowList, "dataGapType"),
    proposedDecisionDistribution: distribution(rowList, "proposedDecision"),
    dataFixRequiredCandidateCount: rowList.filter((row) => row.proposedDecision === "data_fix_required").length,
    waiverCandidateCount: rowList.filter((row) => row.proposedDecision === "waiver_granted").length,
    rejectedForFormalCandidateCount: rowList.filter((row) => row.proposedDecision === "rejected_for_formal").length,
    noActionRequiredCandidateCount: rowList.filter((row) => row.proposedDecision === "no_action_required").length,
    approvedCandidateCount: rowList.filter((row) => row.proposedDecision === "approved").length,
    ambiguousManualOnlyCount: rowList.filter((row) => row.proposedDecision === "pending").length,
    requiredBusinessDecisionCategories: Object.keys(distribution(rowList, "reasonGroup")).sort()
  };
}

export function buildGroupDecisionPolicy(rows) {
  const rowList = rows ?? [];
  const groups = Object.values(GROUP_DECISION_POLICIES).map((policy) => {
    const groupRows = rowList.filter((row) => row.groupDecisionId === policy.groupDecisionId);
    return buildGroupPolicyEntry(policy, groupRows);
  });
  const presentGroups = groups.filter((group) => group.itemCount > 0);
  return {
    schema: "m2.authorized_real_data.candidate_b_review_group_decision_policy.v0.1",
    groupCount: presentGroups.length,
    totalBlockingReviewItems: presentGroups.reduce((total, group) => total + group.itemCount, 0),
    groupDistribution: Object.fromEntries(presentGroups.map((group) => [group.groupDecisionId, group.itemCount])),
    proposedGroupDecisionDistribution: distribution(presentGroups, "defaultProposedDecision"),
    finalGroupDecisionDistribution: {},
    groups: presentGroups,
    requiredFieldsPerDecision: requiredFieldsPerDecision(),
    auditMetadataRequirements: [
      "reviewerName",
      "reviewerReason",
      "reviewedAt or apply timestamp",
      "groupDecisionId",
      "affectedReviewItemIds",
      "aggregateOnly=true",
      "rawDetailWritten=false"
    ],
    unconfirmedItemPolicy:
      "Rows with blank reviewerDecision or reviewerDecision=pending are not applied and remain pending.",
    nextUserAction:
      "Fill the private group decision template for only the groups that have a confirmed business policy."
  };
}

export function buildGroupDecisionTemplateRows(rows) {
  return buildGroupDecisionPolicy(rows).groups.map((group) => ({
    groupDecisionId: group.groupDecisionId,
    reasonCode: group.reasonCode,
    itemCount: String(group.itemCount),
    priorityRange: group.priorityRange,
    defaultProposedDecision: group.defaultProposedDecision,
    allowedFinalDecisions: group.allowedFinalDecisions.join("|"),
    reviewerDecision: "",
    reviewerReason: "",
    reviewerName: "",
    reviewedAt: "",
    waiverScope: group.defaultWaiverScope,
    waiverExpiry: group.defaultWaiverExpiry,
    dataFixRequiredFlag: group.defaultDataFixRequiredFlag,
    reimportRequiredFlag: group.defaultReimportRequiredFlag,
    appliesToAllItemsInGroup: "true",
    excludedReviewItemIds: "",
    includedReviewItemIds: "",
    auditNote: "",
    remediationStatus: "not_evaluated",
    autoFixableCount: "0",
    remainingBlockingCount: String(group.itemCount),
    recommendedGroupDecisionAfterRemediation: group.defaultProposedDecision,
    remediationEvidenceSummary: "Pending remediation diagnostics.",
    userConfirmationRequired: "true",
    canApplyWithoutFurtherDataFix: "false",
    postReimportBlockingCount: String(group.itemCount)
  }));
}

export function validateGroupPolicy(policy) {
  const errors = [];
  if (!policy || policy.schema !== "m2.authorized_real_data.candidate_b_review_group_decision_policy.v0.1") {
    errors.push({ field: "schema", message: "Unsupported group policy schema" });
  }
  if (!Array.isArray(policy?.groups) || policy.groups.length === 0) {
    errors.push({ field: "groups", message: "Group policy must contain at least one group" });
  }
  for (const group of policy?.groups ?? []) {
    if (!group.groupDecisionId || !GROUP_DECISION_POLICIES[group.groupDecisionId]) {
      errors.push({ field: "groupDecisionId", message: `Unsupported groupDecisionId: ${group.groupDecisionId}` });
    }
    if (!Number.isInteger(Number(group.itemCount)) || Number(group.itemCount) <= 0) {
      errors.push({ field: "itemCount", message: "itemCount must be positive" });
    }
    if (group.shouldFinalApplyByDefault !== false) {
      errors.push({ field: "shouldFinalApplyByDefault", message: "Group policy cannot final-apply by default" });
    }
  }
  return {
    valid: errors.length === 0,
    errors
  };
}

export function validateGroupDecisionTemplateSchema(rows) {
  const rowList = rows ?? [];
  const missingColumns = [];
  for (const column of GROUP_DECISION_TEMPLATE_COLUMNS) {
    if (rowList.length > 0 && !Object.prototype.hasOwnProperty.call(rowList[0], column)) {
      missingColumns.push(column);
    }
  }
  return {
    valid: missingColumns.length === 0,
    missingColumns,
    rowCount: rowList.length
  };
}

export function validateGroupDecisionRows(rows, options = {}) {
  const currentRows = options.currentRows ?? [];
  const errors = [];
  const decisions = [];
  const seen = new Set();

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const groupDecisionId = String(row.groupDecisionId ?? "").trim();
    const policy = GROUP_DECISION_POLICIES[groupDecisionId];
    const decision = normalizeDecision(row.reviewerDecision);

    if (!policy) {
      errors.push({ rowNumber, field: "groupDecisionId", message: `Unsupported groupDecisionId: ${groupDecisionId}` });
      return;
    }
    if (seen.has(groupDecisionId)) {
      errors.push({ rowNumber, field: "groupDecisionId", message: "Duplicate groupDecisionId" });
    }
    seen.add(groupDecisionId);

    if (!decision || decision === "pending") {
      decisions.push({
        rowNumber,
        groupDecisionId,
        decision: "pending",
        confirmed: false,
        reasonCode: policy.reasonCode,
        affectedReviewItemIds: [],
        reviewerReason: "",
        reviewerName: "",
        reviewedAt: "",
        auditNote: "",
        waiverScope: "",
        waiverExpiry: "",
        dataFixRequiredFlag: false,
        reimportRequiredFlag: false
      });
      return;
    }
    if (!FINAL_REVIEW_DECISIONS.includes(decision)) {
      errors.push({ rowNumber, field: "reviewerDecision", message: `Unsupported decision: ${decision}` });
    }
    if (!policy.allowedFinalDecisions.includes(decision)) {
      errors.push({ rowNumber, field: "reviewerDecision", message: `Decision not allowed for group: ${decision}` });
    }

    const reviewerReason = String(row.reviewerReason ?? "").trim();
    const reviewerName = String(row.reviewerName ?? "").trim();
    const waiverScope = String(row.waiverScope ?? "").trim();
    const waiverExpiry = String(row.waiverExpiry ?? "").trim();
    const dataFixRequiredFlag = parseBoolean(row.dataFixRequiredFlag);
    const reimportRequiredFlag = parseBoolean(row.reimportRequiredFlag);

    if (!reviewerReason) {
      errors.push({ rowNumber, field: "reviewerReason", message: "reviewerReason is required" });
    }
    if (!reviewerName) {
      errors.push({ rowNumber, field: "reviewerName", message: "reviewerName is required" });
    }
    if (decision === "waiver_granted") {
      if (!waiverScope) {
        errors.push({ rowNumber, field: "waiverScope", message: "waiverScope is required for waiver_granted" });
      }
      if (!waiverExpiry) {
        errors.push({ rowNumber, field: "waiverExpiry", message: "waiverExpiry or no-expiry rationale is required" });
      }
    }
    if (decision === "data_fix_required" && !dataFixRequiredFlag) {
      errors.push({
        rowNumber,
        field: "dataFixRequiredFlag",
        message: "dataFixRequiredFlag must be true for data_fix_required"
      });
    }

    const affectedReviewItemIds = resolveGroupAffectedItemIds(row, currentRows, policy, rowNumber, errors);
    decisions.push({
      rowNumber,
      groupDecisionId,
      decision,
      confirmed: true,
      reasonCode: policy.reasonCode,
      affectedReviewItemIds,
      reviewerReason,
      reviewerName,
      reviewedAt: String(row.reviewedAt ?? "").trim(),
      auditNote: String(row.auditNote ?? "").trim(),
      waiverScope,
      waiverExpiry,
      dataFixRequiredFlag,
      reimportRequiredFlag
    });
  });

  return {
    valid: errors.length === 0,
    errors,
    decisions
  };
}

export function planGroupDecisionApplication(currentRows, groupDecisions) {
  const rowList = currentRows ?? [];
  const nextRows = rowList.map((row) => ({ ...row }));
  const nextById = new Map(nextRows.map((row) => [Number(row.reviewItemId), row]));
  const errors = [];
  const updates = [];
  const confirmedGroups = [];
  const unconfirmedGroups = [];

  for (const groupDecision of groupDecisions ?? []) {
    if (!groupDecision.confirmed || groupDecision.decision === "pending") {
      unconfirmedGroups.push(groupDecision.groupDecisionId);
      continue;
    }
    confirmedGroups.push(groupDecision.groupDecisionId);
    for (const reviewItemId of groupDecision.affectedReviewItemIds ?? []) {
      const current = nextById.get(Number(reviewItemId));
      if (!current) {
        errors.push({ reviewItemId, groupDecisionId: groupDecision.groupDecisionId, message: "Review item not found" });
        continue;
      }
      if (current.currentStatus !== "pending" && current.currentStatus !== groupDecision.decision) {
        errors.push({
          reviewItemId,
          groupDecisionId: groupDecision.groupDecisionId,
          message: "Non-pending review item cannot be changed without reset"
        });
        continue;
      }
      current.currentStatus = groupDecision.decision;
      updates.push({
        reviewItemId: Number(reviewItemId),
        decision: groupDecision.decision,
        reviewerReason: groupDecision.reviewerReason,
        reviewerName: groupDecision.reviewerName,
        reviewedAt: groupDecision.reviewedAt,
        auditNote: groupDecision.auditNote,
        waiverScope: groupDecision.waiverScope,
        waiverExpiry: groupDecision.waiverExpiry,
        dataFixRequiredFlag: groupDecision.dataFixRequiredFlag,
        reimportRequiredFlag: groupDecision.reimportRequiredFlag,
        groupDecisionId: groupDecision.groupDecisionId,
        reasonCode: groupDecision.reasonCode
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    updates,
    confirmedGroups,
    unconfirmedGroups,
    affectedItemCount: updates.length,
    nextStatusDistribution: distribution(nextRows, "currentStatus"),
    groupFinalDecisionDistribution: distribution(
      (groupDecisions ?? []).filter((decision) => decision.confirmed),
      "decision"
    )
  };
}

export function summarizeReadinessClosure({ reviewSummary, finalDecisionsApplied, proposedDecisionsGenerated }) {
  const statusDistribution = reviewSummary?.statusDistribution ?? {};
  const blockingStatusDistribution = reviewSummary?.blockingStatusDistribution ?? statusDistribution;
  const remainingBlockingCount = Object.entries(blockingStatusDistribution).reduce((total, [status, count]) => {
    return total + (BLOCKING_REVIEW_STATUSES.has(status) ? Number(count) : 0);
  }, 0);
  const reimportRequiredCount = Number(reviewSummary?.dataFixRequiredCount ?? 0);
  return {
    finalDecisionsApplied: Boolean(finalDecisionsApplied),
    proposedDecisionsGenerated: Boolean(proposedDecisionsGenerated),
    statusDistribution,
    blockingStatusDistribution,
    remainingBlockingCount,
    dataFixRequiredCount: Number(reviewSummary?.dataFixRequiredCount ?? 0),
    waiverCount: Number(reviewSummary?.waiverCount ?? 0),
    rejectedForFormalCount: Number(reviewSummary?.rejectedForFormalCount ?? 0),
    noActionRequiredCount: Number(reviewSummary?.noActionRequiredCount ?? 0),
    approvedCount: Number(reviewSummary?.approvedCount ?? 0),
    pendingCount: Number(reviewSummary?.pendingCount ?? 0),
    auditEventCount: Number(reviewSummary?.auditEventCount ?? 0),
    reimportRequired: reimportRequiredCount > 0,
    candidateCanMoveToNextLocalReadinessStage: remainingBlockingCount === 0 && reimportRequiredCount === 0
  };
}

export function planDecisionApplication(currentRows, decisions) {
  const byId = new Map((currentRows ?? []).map((row) => [Number(row.reviewItemId), row]));
  const nextRows = (currentRows ?? []).map((row) => ({ ...row }));
  const nextById = new Map(nextRows.map((row) => [Number(row.reviewItemId), row]));
  const errors = [];
  const updates = [];

  for (const decision of decisions ?? []) {
    const current = byId.get(Number(decision.reviewItemId));
    if (!current) {
      errors.push({ reviewItemId: decision.reviewItemId, message: "Review item does not exist in current DB set" });
      continue;
    }
    if (current.currentStatus !== "pending" && current.currentStatus !== decision.decision) {
      errors.push({ reviewItemId: decision.reviewItemId, message: "Non-pending review item cannot be changed without reset" });
      continue;
    }
    const next = nextById.get(Number(decision.reviewItemId));
    next.currentStatus = decision.decision;
    updates.push(decision);
  }

  return {
    valid: errors.length === 0,
    errors,
    updates,
    nextStatusDistribution: distribution(nextRows, "currentStatus")
  };
}

export function validateResetConfirmation({ resetDevDecisions, confirmLocalDevReset }) {
  return !resetDevDecisions || Boolean(confirmLocalDevReset);
}

export function assertSanitizedClosureReport(report) {
  const forbiddenKeys = [
    "rawRows",
    "rawBillRows",
    "rawWorkbook",
    "billWorkbook",
    "sourceWorkbook",
    "realBookTitle",
    "workTitle",
    "standardWorkName",
    "authorName",
    "channelName",
    "sourceChannelName",
    "rawRevenueRows"
  ];
  const forbiddenTextTokens = [
    ["postgres", "://"].join(""),
    ["postgresql", "://"].join(""),
    "password=",
    "token=",
    "secret="
  ];
  const detected = [];
  walkSanitizedPayload(report, (key, value) => {
    if (forbiddenKeys.includes(key)) {
      detected.push(key);
    }
    if (typeof value === "string") {
      for (const token of forbiddenTextTokens) {
        if (value.includes(token)) {
          detected.push(token);
        }
      }
    }
  });
  return {
    sanitized: detected.length === 0,
    detected: [...new Set(detected)]
  };
}

function buildGroupPolicyEntry(policy, groupRows) {
  const rows = groupRows ?? [];
  return {
    groupDecisionId: policy.groupDecisionId,
    reasonCode: policy.reasonCode,
    reasonGroup: policy.reasonGroup,
    itemCount: rows.length,
    priorityRange: priorityRange(rows),
    priorityDistribution: distribution(rows.map((row) => ({ bucket: priorityBucket(row.priority) })), "bucket"),
    riskCodeDistribution: delimitedDistribution(rows, "riskCodes"),
    riskTypeDistribution: delimitedDistribution(rows, "riskTypes"),
    suggestionCodeDistribution: delimitedDistribution(rows, "suggestionCodes"),
    defaultProposedDecision: policy.defaultProposedDecision,
    allowedFinalDecisions: policy.allowedFinalDecisions,
    requiredUserDecision: policy.requiredUserDecision,
    shouldFinalApplyByDefault: policy.shouldFinalApplyByDefault,
    defaultDataFixRequiredFlag: policy.defaultDataFixRequiredFlag,
    defaultReimportRequiredFlag: policy.defaultReimportRequiredFlag,
    defaultWaiverScope: policy.defaultWaiverScope,
    defaultWaiverExpiry: policy.defaultWaiverExpiry,
    readinessEffect: policy.readinessEffect,
    reimportRequiredWhenDecisionIsDataFix: true,
    unconfirmedItemsRemainPending: true
  };
}

function requiredFieldsPerDecision() {
  return {
    approved: ["reviewerDecision", "reviewerReason", "reviewerName"],
    data_fix_required: [
      "reviewerDecision",
      "reviewerReason",
      "reviewerName",
      "dataFixRequiredFlag",
      "reimportRequiredFlag"
    ],
    waiver_granted: [
      "reviewerDecision",
      "reviewerReason",
      "reviewerName",
      "waiverScope",
      "waiverExpiry"
    ],
    rejected_for_formal: ["reviewerDecision", "reviewerReason", "reviewerName"],
    no_action_required: ["reviewerDecision", "reviewerReason", "reviewerName"],
    pending: ["reviewerDecision"]
  };
}

function resolveGroupAffectedItemIds(row, currentRows, policy, rowNumber, errors) {
  const groupRows = (currentRows ?? []).filter((item) => item.groupDecisionId === policy.groupDecisionId);
  const allIds = groupRows.map((item) => Number(item.reviewItemId)).sort((left, right) => left - right);
  const includedIds = parseIdList(row.includedReviewItemIds);
  const excludedIds = parseIdList(row.excludedReviewItemIds);
  const appliesToAll = parseBoolean(row.appliesToAllItemsInGroup);
  let affected = appliesToAll || includedIds.length === 0 ? allIds : includedIds;

  const groupIdSet = new Set(allIds);
  for (const id of [...includedIds, ...excludedIds]) {
    if (!groupIdSet.has(id)) {
      errors.push({
        rowNumber,
        field: "includedReviewItemIds",
        message: `Review item ${id} does not belong to ${policy.groupDecisionId}`
      });
    }
  }

  const excludedSet = new Set(excludedIds);
  affected = affected.filter((id) => !excludedSet.has(id));
  if (affected.length === 0) {
    errors.push({
      rowNumber,
      field: "includedReviewItemIds",
      message: "A confirmed group decision must affect at least one review item"
    });
  }
  return affected;
}

function parseIdList(value) {
  return String(value ?? "")
    .split(/[|,;\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);
}

function normalizeDecision(value) {
  return String(value ?? "").trim();
}

function distribution(rows, field) {
  const result = {};
  for (const row of rows ?? []) {
    const key = String(row?.[field] ?? "").trim() || "unknown";
    result[key] = (result[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

function delimitedDistribution(rows, field) {
  const result = {};
  for (const row of rows ?? []) {
    const parts = splitList(row?.[field]);
    if (parts.length === 0) {
      result.unknown = (result.unknown ?? 0) + 1;
      continue;
    }
    for (const part of parts) {
      result[part] = (result[part] ?? 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

function priorityBucket(priority) {
  const value = Number(priority);
  if (value <= 20) {
    return "p1";
  }
  if (value <= 50) {
    return "p2";
  }
  return "p3";
}

function priorityRange(rows) {
  const priorities = (rows ?? [])
    .map((row) => Number(row.priority))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  if (priorities.length === 0) {
    return "";
  }
  const first = priorities[0];
  const last = priorities[priorities.length - 1];
  return first === last ? String(first) : `${first}-${last}`;
}

function joinList(value) {
  if (Array.isArray(value)) {
    return value.join("|");
  }
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function splitList(value) {
  return String(value ?? "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBoolean(value) {
  return ["true", "1", "yes", "y"].includes(String(value ?? "").trim().toLowerCase());
}

function walkSanitizedPayload(value, visitor) {
  if (!value || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => walkSanitizedPayload(item, visitor));
    return;
  }
  for (const [key, nestedValue] of Object.entries(value)) {
    visitor(key, nestedValue);
    walkSanitizedPayload(nestedValue, visitor);
  }
}
