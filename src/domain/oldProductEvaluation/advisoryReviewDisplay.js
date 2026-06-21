const ADVISORY_REASON_DEFINITIONS = Object.freeze({
  channel_structure_unclear: definition(
    "warning",
    "Channel structure requires operator interpretation.",
    false
  ),
  copyright_missing: definition(
    "warning",
    "Copyright fields are missing in the fixture readiness packet.",
    false
  ),
  abnormal_spike: definition(
    "warning",
    "Synthetic abnormal spike should be reviewed before downstream use.",
    false
  ),
  buyout_or_oneoff_income: definition(
    "warning",
    "Synthetic one-off or buyout-like income is visible for review.",
    false
  ),
  high_value_with_expiry: definition(
    "warning",
    "High value item with expiry context should remain visible.",
    false
  ),
  insufficient_history: definition(
    "warning",
    "Synthetic history is insufficient for confident downstream interpretation.",
    false
  ),
  channel_concentration_advisory: definition(
    "advisory_review",
    "Channel concentration is an advisory note only.",
    false
  ),
  copyright_fallback_used: definition(
    "display_only_note",
    "A copyright fallback was used and must remain visible.",
    false
  ),
  long_tail_or_inactive: definition(
    "display_only_note",
    "Long-tail or inactive lifecycle context is displayed without automatic action.",
    false
  ),
  downlist_requires_manual_confirmation: definition(
    "action_candidate",
    "Downlist-related advisory requires manual confirmation before any downstream execution.",
    true
  ),
  renewal_review_requires_confirmation: definition(
    "action_candidate",
    "Renewal-related advisory requires manual confirmation before any downstream execution.",
    true
  )
});

export const M2_ADVISORY_REVIEW_REASON_CODES = Object.freeze(
  Object.keys(ADVISORY_REASON_DEFINITIONS)
);

export const M2_ADVISORY_REVIEW_FIXTURE_AGGREGATE = Object.freeze({
  advisoryReviewCount: 2331,
  advisoryReasonDistribution: Object.freeze({
    channel_structure_unclear: 190,
    copyright_missing: 276,
    abnormal_spike: 251,
    buyout_or_oneoff_income: 132,
    high_value_with_expiry: 144,
    insufficient_history: 318,
    channel_concentration_advisory: 221,
    copyright_fallback_used: 208,
    long_tail_or_inactive: 291,
    downlist_requires_manual_confirmation: 167,
    renewal_review_requires_confirmation: 133
  }),
  blockingReviewCount: 513
});

export function buildAdvisoryDisplayModel(item) {
  const normalized = normalizeItem(item);
  const isBlocking =
    normalized.isBlocking === true || normalized.reviewType === "blocking_manual_review";

  if (isBlocking) {
    return {
      reviewItemId: normalized.reviewItemId,
      standardWorkId: normalized.standardWorkId,
      reasonCode: normalized.reasonCode,
      reasonLabel: normalized.reasonLabel,
      reviewClass: "blocking_review",
      displayKind: "blocking_review",
      blocksFormalEntry: true,
      advisoryOnly: false,
      requiresManualConfirmationBeforeExport: false,
      automaticActionCreated: false,
      displayMessage: normalized.reasonLabel || "Blocking manual review item."
    };
  }

  const reason = reasonDefinition(normalized.reasonCode);
  return {
    reviewItemId: normalized.reviewItemId,
    standardWorkId: normalized.standardWorkId,
    reasonCode: normalized.reasonCode,
    reasonLabel: normalized.reasonLabel,
    reviewClass: "advisory_review",
    displayKind: reason.displayKind,
    blocksFormalEntry: false,
    advisoryOnly: true,
    requiresManualConfirmationBeforeExport: reason.requiresManualConfirmationBeforeExport,
    automaticActionCreated: false,
    displayMessage: reason.displayMessage,
    formalEligibilityImpact: "does_not_block_formal_eligibility"
  };
}

export function groupAdvisoryReasons(items) {
  return advisoryModels(items).reduce((distribution, item) => {
    distribution[item.reasonCode] = (distribution[item.reasonCode] ?? 0) + 1;
    return distribution;
  }, {});
}

export function summarizeAdvisoryReviews(items, options = {}) {
  const models = assertArray(items).map(buildAdvisoryDisplayModel);
  const advisoryItems = models.filter((item) => item.reviewClass === "advisory_review");
  const blockingItems = models.filter((item) => item.reviewClass === "blocking_review");
  const aggregate = options.aggregate ?? {};
  const advisoryReasonDistribution =
    aggregate.advisoryReasonDistribution ?? groupAdvisoryReasons(items);

  return {
    mode: "fixture",
    notForFormalDecision: true,
    formalEvaluationExecuted: false,
    databaseWritten: false,
    advisoryReviewCount: aggregate.advisoryReviewCount ?? advisoryItems.length,
    advisoryReasonDistribution,
    blockingReviewCount: aggregate.blockingReviewCount ?? blockingItems.length,
    displayOnlyCount: countByDisplayKind(advisoryReasonDistribution, "display_only_note"),
    warningCount: countByDisplayKind(advisoryReasonDistribution, "warning"),
    actionCandidateCount: countByDisplayKind(advisoryReasonDistribution, "action_candidate"),
    requiresManualConfirmationBeforeExportCount: countManualConfirmation(
      advisoryReasonDistribution
    ),
    renewalReviewDisplayCount:
      advisoryReasonDistribution.renewal_review_requires_confirmation ?? 0,
    downlistDisplayCount:
      advisoryReasonDistribution.downlist_requires_manual_confirmation ?? 0,
    advisoryReviewBlocksFormal: false,
    topReasons: topReasons(advisoryReasonDistribution),
    sampleItems: models
  };
}

function advisoryModels(items) {
  return assertArray(items)
    .map(buildAdvisoryDisplayModel)
    .filter((item) => item.reviewClass === "advisory_review");
}

function countByDisplayKind(distribution, displayKind) {
  return Object.entries(distribution).reduce((total, [reasonCode, count]) => {
    const reason = reasonDefinition(reasonCode);
    return reason.displayKind === displayKind ? total + count : total;
  }, 0);
}

function countManualConfirmation(distribution) {
  return Object.entries(distribution).reduce((total, [reasonCode, count]) => {
    const reason = reasonDefinition(reasonCode);
    return reason.requiresManualConfirmationBeforeExport ? total + count : total;
  }, 0);
}

function topReasons(distribution) {
  return Object.entries(distribution)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 5)
    .map(([reasonCode, count]) => ({
      reasonCode,
      count,
      displayKind: reasonDefinition(reasonCode).displayKind
    }));
}

function reasonDefinition(reasonCode) {
  return (
    ADVISORY_REASON_DEFINITIONS[reasonCode] ??
    definition("display_only_note", "Advisory note is displayed without automatic action.", false)
  );
}

function definition(displayKind, displayMessage, requiresManualConfirmationBeforeExport) {
  return {
    displayKind,
    displayMessage,
    requiresManualConfirmationBeforeExport
  };
}

function normalizeItem(item) {
  if (!item || typeof item !== "object") {
    throw new Error("advisory display item must be an object");
  }
  return {
    reviewItemId: item.reviewItemId ?? item.taskId ?? "SYN-ADVISORY-ITEM",
    standardWorkId: item.standardWorkId ?? null,
    reasonCode: item.reasonCode ?? item.code ?? "advisory_review_present",
    reasonLabel: item.reasonLabel ?? item.message ?? "",
    reviewType: item.reviewType ?? "advisory_review",
    isBlocking: item.isBlocking === true
  };
}

function assertArray(items) {
  if (!Array.isArray(items)) {
    throw new Error("advisory review items must be an array");
  }
  return items;
}
