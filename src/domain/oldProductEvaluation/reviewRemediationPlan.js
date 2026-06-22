export const M2_CANDIDATE_B_REMEDIATION_VERSION = "m2-candidate-b-remediation-v0.1";

export const DATA_GAP_REMEDIATION_SCHEMA =
  "m2.authorized_real_data.candidate_b_data_gap_remediation_summary.v0.1";
export const EXPIRY_WAIVER_POLICY_SCHEMA =
  "m2.authorized_real_data.candidate_b_expiry_waiver_policy_draft.v0.1";
export const MANUAL_EXCEPTION_BRIEF_SCHEMA =
  "m2.authorized_real_data.candidate_b_manual_exception_brief.v0.1";

const DATA_GAP_GROUP_ID = "GROUP-DATA-GAP-HIGH-VALUE";
const EXPIRY_GROUP_ID = "GROUP-EXPIRY-HIGH-VALUE";
const INSUFFICIENT_HISTORY_GROUP_ID = "GROUP-INSUFFICIENT-HISTORY";
const ABNORMAL_SPIKE_GROUP_ID = "GROUP-ABNORMAL-SPIKE";

export function buildDataGapRemediationSummary({ candidateVersion, groupPolicy, diagnostics, generatedAt }) {
  const group = groupById(groupPolicy, DATA_GAP_GROUP_ID);
  const totalGroupItems = Number(group?.itemCount ?? diagnostics?.dataGapItemCount ?? 0);
  const autoFixableCount = Number(diagnostics?.autoFixableCount ?? 0);
  const autoFixedCount = Number(diagnostics?.autoFixedCount ?? 0);
  const needsSourceDataFixCount = Number(
    diagnostics?.needsSourceDataFixCount ??
      Math.max(
        Number(diagnostics?.missingBasicInfoRiskCount ?? 0),
        Number(diagnostics?.missingCopyrightEndRiskCount ?? 0),
        Number(diagnostics?.copyrightEndNullCount ?? 0),
        Number(diagnostics?.aggregateProjectionGapRiskCount ?? 0)
      )
  );
  const canBeNoActionRequiredCandidateCount = Number(diagnostics?.canBeNoActionRequiredCandidateCount ?? 0);
  const shouldRemainBlockingCount = Number(
    diagnostics?.shouldRemainBlockingCount ??
      Math.max(0, totalGroupItems - autoFixedCount - canBeNoActionRequiredCandidateCount)
  );
  const remainingBlockingCount = Number(diagnostics?.remainingBlockingCount ?? shouldRemainBlockingCount);

  return {
    schema: DATA_GAP_REMEDIATION_SCHEMA,
    remediationVersion: M2_CANDIDATE_B_REMEDIATION_VERSION,
    generatedAt: generatedAt ?? null,
    candidateVersion,
    notFinalReleaseApproved: true,
    groupDecisionId: DATA_GAP_GROUP_ID,
    reasonCode: "high_value_with_data_gap",
    totalGroupItems,
    remediationAttempted: true,
    finalDecisionsApplied: false,
    autoFixApplied: autoFixedCount > 0,
    localDbWriteApplied: false,
    localImportPayloadChanged: false,
    classification: {
      autoFixableCount,
      autoFixedCount,
      needsSourceDataFixCount,
      needsBusinessConfirmationCount: Number(diagnostics?.needsBusinessConfirmationCount ?? 0),
      shouldRemainBlockingCount,
      canBeNoActionRequiredCandidateCount
    },
    primaryClassificationDistribution: {
      auto_fixable: autoFixableCount,
      needs_source_data_fix: needsSourceDataFixCount,
      needs_business_confirmation: Number(diagnostics?.needsBusinessConfirmationPrimaryCount ?? 0),
      should_remain_blocking: shouldRemainBlockingCount,
      can_be_no_action_required_candidate: canBeNoActionRequiredCandidateCount
    },
    additionalBusinessConfirmationSignals: {
      businessFormMixedRiskCount: Number(diagnostics?.businessFormMixedRiskCount ?? 0),
      abnormalSpikeRiskCount: Number(diagnostics?.abnormalSpikeRiskCount ?? 0),
      channelConcentrationRiskCount: Number(diagnostics?.channelConcentrationRiskCount ?? 0),
      insufficientHistoryRiskCount: Number(diagnostics?.insufficientHistoryRiskCount ?? 0),
      buyoutOrOneoffIncomeRiskCount: Number(diagnostics?.buyoutOrOneoffIncomeRiskCount ?? 0),
      revenueDeclineRiskCount: Number(diagnostics?.revenueDeclineRiskCount ?? 0)
    },
    evidence: {
      localDbInputSnapshotsChecked: Boolean(diagnostics?.localDbInputSnapshotsChecked),
      inputSnapshotCount: Number(diagnostics?.inputSnapshotCount ?? 0),
      inputSnapshotMissingCount: Number(diagnostics?.inputSnapshotMissingCount ?? 0),
      mappingCoverageIncompleteCount: Number(diagnostics?.mappingCoverageIncompleteCount ?? 0),
      standardWorkReferenceMissingCount: Number(diagnostics?.standardWorkReferenceMissingCount ?? 0),
      missingBasicInfoRiskCount: Number(diagnostics?.missingBasicInfoRiskCount ?? 0),
      missingCopyrightEndRiskCount: Number(diagnostics?.missingCopyrightEndRiskCount ?? 0),
      aggregateProjectionGapRiskCount: Number(diagnostics?.aggregateProjectionGapRiskCount ?? 0),
      copyrightEndNullCount: Number(diagnostics?.copyrightEndNullCount ?? 0),
      copyrightStartNullCount: Number(diagnostics?.copyrightStartNullCount ?? 0),
      activeMonthBucketDistribution: diagnostics?.activeMonthBucketDistribution ?? {},
      riskCodeDistribution: diagnostics?.riskCodeDistribution ?? group?.riskCodeDistribution ?? {},
      suggestionCodeDistribution: diagnostics?.suggestionCodeDistribution ?? group?.suggestionCodeDistribution ?? {},
      sourceEvidenceBoundary: {
        derivedFromLocalDbSnapshotsAndRiskFacts: true,
        rawSourceRowsWritten: false,
        rawSourceFileNamesWritten: false,
        realWorkNamesWritten: false,
        channelNamesWritten: false,
        authorNamesWritten: false
      }
    },
    remediationDecision: {
      recommendedGroupDecisionAfterRemediation:
        remainingBlockingCount > 0 ? "data_fix_required" : "no_action_required",
      remediationStatus:
        autoFixedCount > 0
          ? "auto_fix_applied_pending_reimport"
          : "diagnosed_no_safe_auto_fix",
      remediationEvidenceSummary:
        remainingBlockingCount > 0
          ? "Aggregate local DB evidence still shows missing source readiness fields; keep the group as data_fix_required until source data is corrected and reimported."
          : "Aggregate local DB evidence no longer shows blocking data gaps after remediation.",
      userConfirmationRequired: true,
      canApplyWithoutFurtherDataFix: remainingBlockingCount === 0,
      dataFixRequiredFlag: remainingBlockingCount > 0,
      reimportRequiredFlag: remainingBlockingCount > 0
    },
    beforeAfter: {
      beforeBlockingCount: totalGroupItems,
      autoFixedCount,
      afterBlockingCount: remainingBlockingCount,
      postReimportBlockingCount: Number(diagnostics?.postReimportBlockingCount ?? remainingBlockingCount)
    },
    requiredNextActions:
      remainingBlockingCount > 0
        ? [
            "Confirm whether source master-data correction is available for the data-gap group.",
            "If corrected, rerun local DB-backed import and reconciliation before applying any closing decision.",
            "If not corrected, apply only an explicit audited business decision such as data_fix_required, waiver_granted, rejected_for_formal, or pending."
          ]
        : [
            "Run local import and reconciliation evidence review before applying no_action_required.",
            "Require reviewerReason and reviewerName before any final decision apply."
          ],
    safeOutputBoundary: safeOutputBoundary()
  };
}

export function buildExpiryWaiverPolicyDraft({ candidateVersion, groupPolicy, generatedAt }) {
  const group = groupById(groupPolicy, EXPIRY_GROUP_ID);
  const itemCount = Number(group?.itemCount ?? 0);
  return {
    schema: EXPIRY_WAIVER_POLICY_SCHEMA,
    remediationVersion: M2_CANDIDATE_B_REMEDIATION_VERSION,
    generatedAt: generatedAt ?? null,
    candidateVersion,
    notFinalReleaseApproved: true,
    groupDecisionId: EXPIRY_GROUP_ID,
    reasonCode: "high_value_with_expiry",
    itemCount,
    finalDecisionApplied: false,
    recommendedDecision: "waiver_granted",
    canApplyWithoutFurtherDataFix: true,
    userConfirmationRequired: true,
    requiredFields: ["reviewerDecision", "reviewerReason", "reviewerName", "waiverScope", "waiverExpiry"],
    defaultWaiverScope: group?.defaultWaiverScope ?? "candidate-b local review scope",
    defaultWaiverExpiry: group?.defaultWaiverExpiry ?? "next formal readiness review",
    policyDraft: {
      waiverScope:
        "Local candidate-b readiness review only; does not authorize formal release, external export, or production use.",
      waiverExpiry:
        "Expires at the next formal readiness review or earlier if copyright master data changes.",
      reviewerReasonRequired: true,
      dataFixRequiredFlag: false,
      reimportRequiredFlag: false,
      unconfirmedItemsRemainPending: true
    },
    riskCodeDistribution: group?.riskCodeDistribution ?? {},
    suggestionCodeDistribution: group?.suggestionCodeDistribution ?? {},
    readinessEffect:
      "A confirmed waiver can close this local blocker only after explicit scope, expiry, reviewerName, and reviewerReason are supplied.",
    safeOutputBoundary: safeOutputBoundary()
  };
}

export function buildManualExceptionBrief({ candidateVersion, groupPolicy, generatedAt }) {
  const insufficient = groupById(groupPolicy, INSUFFICIENT_HISTORY_GROUP_ID);
  const spike = groupById(groupPolicy, ABNORMAL_SPIKE_GROUP_ID);
  const groups = [insufficient, spike].filter(Boolean).map((group) => ({
    groupDecisionId: group.groupDecisionId,
    reasonCode: group.reasonCode,
    itemCount: Number(group.itemCount ?? 0),
    defaultProposedDecision: group.defaultProposedDecision,
    recommendedDecision: "pending",
    userConfirmationRequired: true,
    canApplyWithoutFurtherDataFix: false,
    reimportRequiredFlag: false,
    riskCodeDistribution: group.riskCodeDistribution ?? {},
    suggestionCodeDistribution: group.suggestionCodeDistribution ?? {},
    requiredBusinessDecision:
      group.groupDecisionId === INSUFFICIENT_HISTORY_GROUP_ID
        ? "Decide whether short history can be accepted, deferred, rejected for formal use, or handled by additional local source evidence."
        : "Inspect aggregate spike evidence and decide whether the spike is valid one-off income, a data issue, or a formal blocker."
  }));
  return {
    schema: MANUAL_EXCEPTION_BRIEF_SCHEMA,
    remediationVersion: M2_CANDIDATE_B_REMEDIATION_VERSION,
    generatedAt: generatedAt ?? null,
    candidateVersion,
    notFinalReleaseApproved: true,
    finalDecisionApplied: false,
    groups,
    totalManualExceptionItems: groups.reduce((total, group) => total + group.itemCount, 0),
    conclusion:
      "Manual exception groups remain pending by default; no automatic closure is safe without user/business confirmation.",
    safeOutputBoundary: safeOutputBoundary()
  };
}

export function buildRemediatedGroupDecisionTemplateRows({
  templateRows,
  dataGapSummary,
  expiryWaiverPolicy,
  manualExceptionBrief
}) {
  const manualByGroup = new Map((manualExceptionBrief?.groups ?? []).map((group) => [group.groupDecisionId, group]));
  return (templateRows ?? []).map((row) => {
    if (row.groupDecisionId === DATA_GAP_GROUP_ID) {
      return {
        ...row,
        remediationStatus: dataGapSummary.remediationDecision.remediationStatus,
        autoFixableCount: String(dataGapSummary.classification.autoFixableCount),
        remainingBlockingCount: String(dataGapSummary.beforeAfter.afterBlockingCount),
        recommendedGroupDecisionAfterRemediation:
          dataGapSummary.remediationDecision.recommendedGroupDecisionAfterRemediation,
        remediationEvidenceSummary: dataGapSummary.remediationDecision.remediationEvidenceSummary,
        userConfirmationRequired: String(dataGapSummary.remediationDecision.userConfirmationRequired),
        canApplyWithoutFurtherDataFix: String(dataGapSummary.remediationDecision.canApplyWithoutFurtherDataFix),
        dataFixRequiredFlag: String(dataGapSummary.remediationDecision.dataFixRequiredFlag),
        reimportRequiredFlag: String(dataGapSummary.remediationDecision.reimportRequiredFlag),
        postReimportBlockingCount: String(dataGapSummary.beforeAfter.postReimportBlockingCount)
      };
    }
    if (row.groupDecisionId === EXPIRY_GROUP_ID) {
      return {
        ...row,
        remediationStatus: "waiver_policy_drafted_pending_user_confirmation",
        autoFixableCount: "0",
        remainingBlockingCount: String(expiryWaiverPolicy.itemCount),
        recommendedGroupDecisionAfterRemediation: expiryWaiverPolicy.recommendedDecision,
        remediationEvidenceSummary:
          "Expiry blockers can use a scoped local waiver only after reviewer reason, waiver scope, and waiver expiry are confirmed.",
        userConfirmationRequired: String(expiryWaiverPolicy.userConfirmationRequired),
        canApplyWithoutFurtherDataFix: String(expiryWaiverPolicy.canApplyWithoutFurtherDataFix),
        dataFixRequiredFlag: "false",
        reimportRequiredFlag: "false",
        postReimportBlockingCount: String(expiryWaiverPolicy.itemCount)
      };
    }
    const manual = manualByGroup.get(row.groupDecisionId);
    if (manual) {
      return {
        ...row,
        remediationStatus: "manual_exception_briefed_pending_user_confirmation",
        autoFixableCount: "0",
        remainingBlockingCount: String(manual.itemCount),
        recommendedGroupDecisionAfterRemediation: manual.recommendedDecision,
        remediationEvidenceSummary: manual.requiredBusinessDecision,
        userConfirmationRequired: String(manual.userConfirmationRequired),
        canApplyWithoutFurtherDataFix: String(manual.canApplyWithoutFurtherDataFix),
        dataFixRequiredFlag: "false",
        reimportRequiredFlag: String(manual.reimportRequiredFlag),
        postReimportBlockingCount: String(manual.itemCount)
      };
    }
    return row;
  });
}

export function buildReadinessRemediationPatch({
  currentReadiness,
  dataGapSummary,
  expiryWaiverPolicy,
  manualExceptionBrief,
  generatedAt
}) {
  const current = currentReadiness ?? {};
  const readiness = current.readiness ?? {};
  const dataGapRemaining = Number(dataGapSummary?.beforeAfter?.afterBlockingCount ?? 0);
  const expiryRemaining = Number(expiryWaiverPolicy?.itemCount ?? 0);
  const manualRemaining = Number(manualExceptionBrief?.totalManualExceptionItems ?? 0);
  const remainingAfterRemediation = dataGapRemaining + expiryRemaining + manualRemaining;
  return {
    ...current,
    generatedAt: generatedAt ?? current.generatedAt ?? null,
    remediation: {
      remediationVersion: M2_CANDIDATE_B_REMEDIATION_VERSION,
      generatedAt: generatedAt ?? null,
      finalDecisionsApplied: false,
      autoFixApplied: Boolean(dataGapSummary?.autoFixApplied),
      beforeBlockingCount: Number(readiness.remainingBlockingCount ?? 0),
      afterRemediationBlockingCount: remainingAfterRemediation,
      dataGapBeforeCount: Number(dataGapSummary?.beforeAfter?.beforeBlockingCount ?? 0),
      dataGapAutoFixedCount: Number(dataGapSummary?.beforeAfter?.autoFixedCount ?? 0),
      dataGapRemainingBlockingCount: dataGapRemaining,
      expiryWaiverCandidateCount: expiryRemaining,
      manualExceptionPendingCount: manualRemaining,
      reimportRequired: Boolean(dataGapSummary?.remediationDecision?.reimportRequiredFlag),
      candidateCanMoveToNextLocalReadinessStage: false,
      conclusion:
        "Remediation diagnostics were generated, but no final business decisions were applied. candidate-b remains a local development candidate pending user/business confirmation."
    },
    conclusion:
      "Remediation diagnostics were generated, but final decisions were not applied. Blocking items remain pending until user/business confirmation and any required local data fix/reimport are complete."
  };
}

export function validateDataGapRemediationSummary(summary) {
  const errors = [];
  if (summary?.schema !== DATA_GAP_REMEDIATION_SCHEMA) {
    errors.push({ field: "schema", message: "Unsupported data-gap remediation schema" });
  }
  if (Number(summary?.totalGroupItems ?? 0) < 0) {
    errors.push({ field: "totalGroupItems", message: "totalGroupItems must be non-negative" });
  }
  if (Number(summary?.classification?.autoFixableCount ?? 0) < Number(summary?.classification?.autoFixedCount ?? 0)) {
    errors.push({ field: "classification", message: "autoFixedCount cannot exceed autoFixableCount" });
  }
  if (!summary?.remediationDecision?.recommendedGroupDecisionAfterRemediation) {
    errors.push({ field: "remediationDecision", message: "recommendedGroupDecisionAfterRemediation is required" });
  }
  return { valid: errors.length === 0, errors };
}

export function validateExpiryWaiverPolicyDraft(policy) {
  const errors = [];
  if (policy?.schema !== EXPIRY_WAIVER_POLICY_SCHEMA) {
    errors.push({ field: "schema", message: "Unsupported expiry waiver policy schema" });
  }
  for (const field of ["reviewerDecision", "reviewerReason", "reviewerName", "waiverScope", "waiverExpiry"]) {
    if (!policy?.requiredFields?.includes(field)) {
      errors.push({ field: "requiredFields", message: `${field} is required for waiver policy` });
    }
  }
  if (policy?.finalDecisionApplied !== false) {
    errors.push({ field: "finalDecisionApplied", message: "Policy draft must not apply final decisions" });
  }
  return { valid: errors.length === 0, errors };
}

export function validateManualExceptionBrief(brief) {
  const errors = [];
  if (brief?.schema !== MANUAL_EXCEPTION_BRIEF_SCHEMA) {
    errors.push({ field: "schema", message: "Unsupported manual exception brief schema" });
  }
  if (!Array.isArray(brief?.groups)) {
    errors.push({ field: "groups", message: "Manual exception groups are required" });
  }
  if (brief?.finalDecisionApplied !== false) {
    errors.push({ field: "finalDecisionApplied", message: "Manual exception brief must not apply final decisions" });
  }
  return { valid: errors.length === 0, errors };
}

export function assertSanitizedRemediationReport(report) {
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
    "rawRevenueRows",
    "connectionString",
    "password",
    "token",
    "secret"
  ];
  const forbiddenTextTokens = [
    ["postgres", "://"].join(""),
    ["postgresql", "://"].join(""),
    "password=",
    "token=",
    "secret=",
    ".pgpass"
  ];
  const detected = [];
  walkSanitizedPayload(report, (key, value) => {
    if (forbiddenKeys.includes(key)) {
      detected.push(key);
    }
    if (typeof value === "string") {
      for (const token of forbiddenTextTokens) {
        if (value.toLowerCase().includes(token.toLowerCase())) {
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

function groupById(groupPolicy, groupDecisionId) {
  return (groupPolicy?.groups ?? []).find((group) => group.groupDecisionId === groupDecisionId) ?? null;
}

function safeOutputBoundary() {
  return {
    rawRowsWritten: false,
    realWorkNamesWritten: false,
    realAuthorNamesWritten: false,
    realChannelNamesWritten: false,
    exactPerWorkRevenueDetailWritten: false,
    secretsWritten: false,
    connectionStringsWritten: false,
    privateWorkbookNamesWritten: false,
    dumpsOrTempDbFilesWritten: false
  };
}

function walkSanitizedPayload(value, visit, key = "") {
  visit(key, value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkSanitizedPayload(item, visit, `${key}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [childKey, childValue] of Object.entries(value)) {
      walkSanitizedPayload(childValue, visit, childKey);
    }
  }
}
