export const SHELF_STATUSES = Object.freeze({
  ACTIVE_ON_SHELF: "active_on_shelf",
  LIKELY_OFF_SHELF: "likely_off_shelf",
  RIGHTS_EXPIRED_LIKELY_OFF_SHELF: "rights_expired_likely_off_shelf",
  OFF_SHELF_BUT_TAIL_REVENUE: "off_shelf_but_tail_revenue",
  UNKNOWN: "unknown_shelf_status"
});

const STATUS_LABELS = Object.freeze({
  active_on_shelf: "仍在架或可运营",
  likely_off_shelf: "大概率下架",
  rights_expired_likely_off_shelf: "版权到期，大概率下架",
  off_shelf_but_tail_revenue: "已下架但仍有存量会员/已购用户尾部收入",
  unknown_shelf_status: "无法判断"
});

// Shelf status is a status signal, not a rating override:
// - Expired rights are a strong off-shelf signal.
// - Zero revenue alone never proves off-shelf.
// - Off-shelf works can still have small tail revenue from paid users or members.
// - Expired rights plus tail revenue means off-shelf with tail revenue.
// - Shelf status can constrain current operations, but must not erase historical
//   rating value.
export function inferShelfStatus(input = {}) {
  const currentRightsStatus = clean(input.currentRightsStatus ?? input.rightsStatus);
  const remainingCopyrightMonths = numberOrNull(input.remainingCopyrightMonths);
  const recentSalesRevenue = number(input.recentSalesRevenue ?? input.salesRevenueLast3m ?? input.last3MonthRevenue);
  const recentSalesRevenue6m = number(input.salesRevenueLast6m ?? input.last6MonthRevenue);
  const salesRevenue12m = number(input.salesRevenue12m ?? input.last12MonthRevenue);
  const recentPositiveMonthCount = number(input.recentPositiveMonthCount ?? input.positiveMonthCountLast6m);
  const monthsSinceLatestIncome = numberOrNull(input.monthsSinceLatestIncome);
  const revenueModel = clean(input.revenueModel);

  let shelfStatus = SHELF_STATUSES.UNKNOWN;
  const reasons = [];

  const expired =
    currentRightsStatus === "expired" ||
    currentRightsStatus === "rights_expired" ||
    (remainingCopyrightMonths != null && remainingCopyrightMonths < 0);
  const activeRights =
    currentRightsStatus === "active" ||
    currentRightsStatus === "perpetual" ||
    (remainingCopyrightMonths != null && remainingCopyrightMonths >= 0);

  if (expired && (recentSalesRevenue > 0 || recentSalesRevenue6m > 0 || salesRevenue12m > 0)) {
    shelfStatus = SHELF_STATUSES.OFF_SHELF_BUT_TAIL_REVENUE;
    reasons.push("版权已到期但仍有尾部收入，推断为下架后存量收入或需权利核查收入");
  } else if (expired) {
    shelfStatus = SHELF_STATUSES.RIGHTS_EXPIRED_LIKELY_OFF_SHELF;
    reasons.push("版权已到期且近期未见尾部收入，大概率下架");
  } else if (activeRights && recentPositiveMonthCount >= 2 && (recentSalesRevenue6m > 0 || salesRevenue12m > 0)) {
    shelfStatus = SHELF_STATUSES.ACTIVE_ON_SHELF;
    reasons.push("权利有效且近期仍有持续实销收入，推断仍在架或可运营");
  } else if (activeRights && salesRevenue12m > 0 && monthsSinceLatestIncome != null && monthsSinceLatestIncome <= 6) {
    shelfStatus = SHELF_STATUSES.ACTIVE_ON_SHELF;
    reasons.push("权利有效且近 6 个月内仍有收入，推断可运营");
  } else if (!activeRights && monthsSinceLatestIncome != null && monthsSinceLatestIncome >= 12 && revenueModel !== "pure_buyout") {
    shelfStatus = SHELF_STATUSES.LIKELY_OFF_SHELF;
    reasons.push("近期渠道收入断流且权利状态不明，推断大概率下架");
  } else if (salesRevenue12m === 0 && revenueModel === "pure_buyout") {
    shelfStatus = SHELF_STATUSES.UNKNOWN;
    reasons.push("买断后无持续实销不等于下架，只能说明收入模式可能为买断");
  } else if (salesRevenue12m === 0) {
    shelfStatus = SHELF_STATUSES.UNKNOWN;
    reasons.push("收入为 0 不能单独判断下架");
  } else {
    reasons.push("权利、近期收入或渠道状态证据不足，无法判断");
  }

  return {
    shelfStatus,
    shelfStatusChinese: STATUS_LABELS[shelfStatus],
    shelfStatusConfidence: shelfStatus === SHELF_STATUSES.UNKNOWN ? "low" : "medium",
    shelfStatusReasonChinese: reasons,
    affectsOperationalDecision: shelfStatus !== SHELF_STATUSES.ACTIVE_ON_SHELF,
    doesNotRewriteHistoricalRating: true
  };
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
