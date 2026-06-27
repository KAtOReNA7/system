export const SHELF_STATUSES = Object.freeze({
  ACTIVE_ON_SHELF_CONFIDENT: "active_on_shelf_confident",
  ACTIVE_OR_AVAILABLE_INFERRED: "active_or_available_inferred",
  ACTIVE_ON_SHELF: "active_on_shelf",
  LIKELY_OFF_SHELF: "likely_off_shelf",
  RIGHTS_EXPIRED_LIKELY_OFF_SHELF: "rights_expired_likely_off_shelf",
  RIGHTS_EXPIRED_NEEDS_REVIEW: "rights_expired_needs_review",
  ACTIVE_RIGHTS_SPARSE_REVENUE_REVIEW: "active_rights_sparse_revenue_review",
  OFF_SHELF_BUT_TAIL_REVENUE: "off_shelf_but_tail_revenue",
  UNKNOWN: "unknown_shelf_status"
});

export const SHELF_REVIEW_PROMPTS = Object.freeze({
  EXPIRED_WITH_TAIL_REVENUE: "expired_with_tail_revenue_review",
  ACTIVE_RIGHTS_SPARSE_REVENUE: "active_rights_sparse_revenue_review"
});

// Shelf status is a status signal, not a rating override:
// - Copyright ledger status is highly trusted in local real-data development.
// - Expired rights can be used as the shelf/copyright status signal.
// - Zero revenue alone never proves off-shelf.
// - Off-shelf works can still have small tail revenue from paid users or members.
// - Tail revenue is a review note, not a constraint that rewrites the ledger status.
// - Shelf status can constrain current operations, but must not erase historical
//   rating value.
export function inferShelfStatus(input = {}) {
  return inferShelfStatusV4(input);
}

function inferShelfStatusV4(input = {}) {
  const currentRightsStatus = clean(input.currentRightsStatus ?? input.rightsStatus);
  const remainingCopyrightMonths = numberOrNull(input.remainingCopyrightMonths);
  const recentSalesRevenue = number(input.recentSalesRevenue ?? input.salesRevenueLast3m ?? input.last3MonthRevenue);
  const recentSalesRevenue6m = number(input.salesRevenueLast6m ?? input.last6MonthRevenue);
  const salesRevenue12m = number(input.salesRevenue12m ?? input.last12MonthRevenue);
  const recentPositiveMonthCount = number(input.recentPositiveMonthCount ?? input.positiveMonthCountLast6m);
  const monthsSinceLatestIncome = numberOrNull(input.monthsSinceLatestIncome);
  const revenueModel = clean(input.revenueModel);
  const explicitShelfStatus = clean(input.explicitShelfStatus ?? input.currentShelfStatus ?? input.shelfStatus);
  const explicitOnShelf = ["active_on_shelf", "on_shelf", "available", "true"].includes(explicitShelfStatus);
  const explicitOffShelf = ["off_shelf", "downlisted", "inactive"].includes(explicitShelfStatus);
  const hasRevenue = recentSalesRevenue > 0 || recentSalesRevenue6m > 0 || salesRevenue12m > 0;

  const expired =
    currentRightsStatus === "expired" ||
    currentRightsStatus === "rights_expired" ||
    (remainingCopyrightMonths != null && remainingCopyrightMonths < 0);
  const activeRights =
    currentRightsStatus === "active" ||
    currentRightsStatus === "perpetual" ||
    (remainingCopyrightMonths != null && remainingCopyrightMonths >= 0);

  let shelfStatus = SHELF_STATUSES.UNKNOWN;
  let confidence = "low";
  const reasons = [];
  const reviewPrompts = [];

  if (explicitOnShelf && activeRights) {
    shelfStatus = SHELF_STATUSES.ACTIVE_ON_SHELF_CONFIDENT;
    confidence = "high";
    reasons.push("\u6709\u660e\u786e\u5728\u67b6/\u53ef\u7528\u4fe1\u53f7\u4e14\u6743\u5229\u6709\u6548");
  } else if (expired && hasRevenue) {
    shelfStatus = SHELF_STATUSES.RIGHTS_EXPIRED_LIKELY_OFF_SHELF;
    confidence = "high";
    reasons.push("\u7248\u6743\u53f0\u8d26\u663e\u793a\u6743\u5229\u5230\u671f\uff0c\u6309\u9ad8\u53ef\u4fe1\u72b6\u6001\u4f5c\u4e3a\u4e0b\u67b6/\u6743\u5229\u72b6\u6001\u4fe1\u53f7");
    reasons.push("\u5c3e\u90e8\u6536\u5165\u4ec5\u4f5c\u540e\u7eed\u8fd0\u8425\u6838\u67e5\u7ebf\u7d22\uff0c\u4e0d\u53cd\u5411\u6539\u5199\u7248\u6743\u53f0\u8d26\u72b6\u6001");
    reviewPrompts.push(SHELF_REVIEW_PROMPTS.EXPIRED_WITH_TAIL_REVENUE);
  } else if (expired) {
    shelfStatus = SHELF_STATUSES.RIGHTS_EXPIRED_LIKELY_OFF_SHELF;
    confidence = "high";
    reasons.push("\u7248\u6743\u53f0\u8d26\u663e\u793a\u6743\u5229\u5230\u671f\uff0c\u6309\u9ad8\u53ef\u4fe1\u72b6\u6001\u4f5c\u4e3a\u4e0b\u67b6/\u6743\u5229\u72b6\u6001\u4fe1\u53f7");
  } else if (explicitOffShelf) {
    shelfStatus = SHELF_STATUSES.LIKELY_OFF_SHELF;
    confidence = "medium";
    reasons.push("\u5b58\u5728\u660e\u786e\u4e0b\u67b6/\u505c\u7528\u4fe1\u53f7\uff0c\u4f46\u4ecd\u9700\u4eba\u5de5\u786e\u8ba4");
  } else if (activeRights && recentPositiveMonthCount >= 2 && (recentSalesRevenue6m > 0 || salesRevenue12m > 0)) {
    shelfStatus = SHELF_STATUSES.ACTIVE_OR_AVAILABLE_INFERRED;
    confidence = "medium";
    reasons.push("\u6743\u5229\u6709\u6548\u4e14\u8fd1\u671f\u6709\u6301\u7eed\u6536\u5165\uff0c\u63a8\u65ad\u53ef\u8fd0\u8425\u6216\u5728\u67b6");
  } else if (activeRights && salesRevenue12m > 0 && monthsSinceLatestIncome != null && monthsSinceLatestIncome <= 6) {
    shelfStatus = SHELF_STATUSES.ACTIVE_OR_AVAILABLE_INFERRED;
    confidence = "medium";
    reasons.push("\u6743\u5229\u6709\u6548\u4e14\u8fd1 6 \u4e2a\u6708\u5185\u6709\u6536\u5165\uff0c\u4ec5\u4f5c\u53ef\u8fd0\u8425\u63a8\u65ad");
  } else if (activeRights && hasRevenue) {
    shelfStatus = SHELF_STATUSES.ACTIVE_RIGHTS_SPARSE_REVENUE_REVIEW;
    confidence = "medium";
    reasons.push("\u6743\u5229\u6709\u6548\uff0c\u4f46\u6536\u5165\u4fe1\u53f7\u7a00\u758f\u6216\u9648\u65e7\uff0c\u4e0d\u76f4\u63a5\u5224\u65ad\u4e0b\u67b6\uff0c\u8fdb\u5165\u590d\u6838\u6876");
    reviewPrompts.push(SHELF_REVIEW_PROMPTS.ACTIVE_RIGHTS_SPARSE_REVENUE);
  } else if (!activeRights && monthsSinceLatestIncome != null && monthsSinceLatestIncome >= 12 && revenueModel !== "pure_buyout") {
    shelfStatus = SHELF_STATUSES.LIKELY_OFF_SHELF;
    confidence = "low";
    reasons.push("\u6743\u5229\u72b6\u6001\u4e0d\u660e\u4e14\u957f\u671f\u65e0\u6536\u5165\uff0c\u4ec5\u4f5c\u4f4e\u7f6e\u4fe1\u4e0b\u67b6\u63a8\u65ad");
  } else if (salesRevenue12m === 0 && revenueModel === "pure_buyout" && activeRights) {
    shelfStatus = SHELF_STATUSES.ACTIVE_OR_AVAILABLE_INFERRED;
    confidence = "medium";
    reasons.push("\u7eaf\u4e70\u65ad\u65e0\u6301\u7eed\u5b9e\u9500\u4e0d\u7b49\u4e8e\u4e0b\u67b6\uff1b\u6743\u5229\u672a\u5230\u671f\u65f6\u4fdd\u6301\u53ef\u8fd0\u8425/\u5728\u67b6\u63a8\u65ad");
  } else if (salesRevenue12m === 0 && activeRights) {
    shelfStatus = SHELF_STATUSES.ACTIVE_OR_AVAILABLE_INFERRED;
    confidence = "medium";
    reasons.push("\u6743\u5229\u672a\u5230\u671f\uff0c\u6536\u5165\u4e3a 0 \u4e0d\u53cd\u5411\u5224\u65ad\u4e0b\u67b6\uff0c\u4fdd\u6301\u53ef\u8fd0\u8425/\u5728\u67b6\u63a8\u65ad");
  } else {
    reasons.push("\u7f3a\u5c11\u660e\u786e\u4e0a\u67b6\u5b57\u6bb5\u6216\u8db3\u591f\u6536\u5165\u4fe1\u53f7\uff0c\u4fdd\u6301\u4f4e\u7f6e\u4fe1\u4eba\u5de5\u786e\u8ba4");
  }

  return {
    shelfStatus,
    shelfStatusChinese: statusLabel(shelfStatus),
    shelfStatusConfidence: confidence,
    shelfStatusReasonChinese: reasons,
    shelfStatusReviewPrompts: reviewPrompts,
    shelfStatusReviewPromptChinese: reviewPrompts.map(reviewPromptLabel),
    requiresShelfStatusReview: reviewPrompts.length > 0 || shelfStatus === SHELF_STATUSES.UNKNOWN,
    affectsOperationalDecision: shelfStatus !== SHELF_STATUSES.ACTIVE_ON_SHELF_CONFIDENT && shelfStatus !== SHELF_STATUSES.ACTIVE_OR_AVAILABLE_INFERRED,
    doesNotRewriteHistoricalRating: true
  };
}

function statusLabel(status) {
  return {
    active_on_shelf_confident: "\u5728\u67b6\u72b6\u6001\u5df2\u786e\u8ba4",
    active_or_available_inferred: "\u53ef\u8fd0\u8425\u6216\u5728\u67b6\uff08\u63a8\u65ad\uff09",
    active_on_shelf: "\u4ecd\u5728\u67b6\u6216\u53ef\u8fd0\u8425",
    likely_off_shelf: "\u7591\u4f3c\u4e0b\u67b6\uff08\u9700\u4eba\u5de5\u786e\u8ba4\uff09",
    rights_expired_likely_off_shelf: "\u7248\u6743\u5230\u671f\uff0c\u7591\u4f3c\u4e0b\u67b6",
    rights_expired_needs_review: "\u6743\u5229\u5230\u671f\u9700\u4eba\u5de5\u6838\u67e5",
    active_rights_sparse_revenue_review: "\u7248\u6743\u6709\u6548\u4f46\u6536\u5165\u7a00\u758f\uff08\u9700\u590d\u6838\uff09",
    off_shelf_but_tail_revenue: "\u5df2\u4e0b\u67b6\u4f46\u6709\u5c3e\u90e8\u6536\u5165",
    unknown_shelf_status: "\u65e0\u6cd5\u5224\u65ad"
  }[status] ?? "\u65e0\u6cd5\u5224\u65ad";
}

function reviewPromptLabel(prompt) {
  return {
    expired_with_tail_revenue_review: "\u7248\u6743\u5230\u671f\u4f46\u4ecd\u6709\u5c3e\u90e8\u6536\u5165\uff0c\u9700\u6838\u67e5\u7ed3\u7b97\u6ede\u540e/\u7eed\u7ea6\u672a\u5165\u8d26/\u6570\u636e\u5f02\u5e38",
    active_rights_sparse_revenue_review: "\u7248\u6743\u6709\u6548\u4f46\u6536\u5165\u4fe1\u53f7\u7a00\u758f\u6216\u9648\u65e7\uff0c\u9700\u590d\u6838\u8d27\u67b6/\u53ef\u8fd0\u8425\u72b6\u6001"
  }[prompt] ?? "\u9700\u590d\u6838";
}

function clean(value) {
  return value == null ? "" : String(value).trim();
}

function number(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function numberOrNull(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}
