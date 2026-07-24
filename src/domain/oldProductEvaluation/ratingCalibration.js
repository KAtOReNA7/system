export const M2_RATING_SUGGESTION_CALIBRATED_VERSION =
  "m2-realdata-dev-rating-suggestion-calibrated-v1.0";

export const M2_COMMERCIAL_RATING_SUGGESTION_VERSION =
  "m2-realdata-dev-revenue-model-rating-v2.0";

export const M2_RATING_ORDER = Object.freeze(["S+", "S", "A", "B", "C", "D", "E"]);

export const DEFAULT_BUYOUT_AMORTIZATION_YEARS = 3;

export const BUYOUT_MONTHLY_EQUIVALENT_BOUNDARY = Object.freeze({
  ratingContextOnly: true,
  historicalValueOnly: true,
  notCashForecast: true,
  notIncludedInFutureCashRevenue: true
});

const RATING_RANK = Object.freeze({
  "S+": 0,
  S: 1,
  A: 2,
  B: 3,
  C: 4,
  D: 5,
  E: 6
});

const REVENUE_SCORE = Object.freeze({
  top: 62,
  high: 58,
  medium: 46,
  mid: 46,
  low: 30,
  long_tail: 24,
  near_zero: 18,
  zero: 12
});

const LIFECYCLE_SCORE = Object.freeze({
  growth: 10,
  rebound: 8,
  stable: 8,
  declining: -6,
  inactive: -14,
  long_tail: -16,
  insufficient_history: -10
});

const FORECASTABILITY_SCORE = Object.freeze({
  numeric_forecast_eligible: 8,
  conservative_numeric_forecast: 3,
  observe_only_no_numeric_forecast: -10,
  true_forecast_blocked: -14
});

const CONFIDENCE_SCORE = Object.freeze({
  high: 6,
  medium: 2,
  low: -4,
  blocked_for_business_use: -10
});

const REVENUE_MODEL_SCORE = Object.freeze({
  pure_sales_share: 4,
  buyout_plus_sales: 5,
  pure_buyout: 0,
  unknown_revenue_model: -2
});

export const SALES_PERFORMANCE_THRESHOLDS = Object.freeze({
  "S+": { min: 100000, label: "100000 以上" },
  S: { min: 10000, max: 100000, label: "10000 - 100000" },
  A: { min: 5000, max: 10000, label: "5000 - 10000" },
  B: { min: 1000, max: 5000, label: "1000 - 5000" },
  C: { min: 500, max: 1000, label: "500 - 1000" },
  D: { min: 100, max: 500, label: "100 - 500" },
  E: { max: 100, label: "100 以内" }
});

export const BUYOUT_HISTORY_VALUE_THRESHOLDS = Object.freeze({
  "S+": { min: 100000, label: "月均实销等价值 100000 以上" },
  S: { min: 10000, max: 100000, label: "月均实销等价值 10000 - 100000" },
  A: { min: 5000, max: 10000, label: "月均实销等价值 5000 - 10000" },
  B: { min: 1000, max: 5000, label: "月均实销等价值 1000 - 5000" },
  C: { min: 500, max: 1000, label: "月均实销等价值 500 - 1000" },
  D: { min: 100, max: 500, label: "月均实销等价值 100 - 500" },
  E: { max: 100, label: "月均实销等价值 100 以内" }
});

export const RATING_STANDARD_DEFINITIONS = Object.freeze({
  "S+": "历史收入或预测价值处于顶级，收入模式可信且权利可运营或有明确续约价值；必须人工确认。",
  S: "高历史价值或高预测价值，收入模式可信，预测置信度中高，无严重数据阻断。",
  A: "明显有业务价值，稳定收入、增长或买断后仍有实销尾部，可作为重点复核对象。",
  B: "中等价值，可维持运营或观察，历史或预测至少有一项支撑。",
  C: "低至中等价值，建议保守处理，需要结合权利、收入模式和风险判断。",
  D: "低价值或明显衰退，但不等于必须下架，可降低投入或仅观察。",
  E: "历史和预测均极低、长期无收入、且无买断保留价值或续约价值；不得仅因版权到期触发。"
});

export function calibrateRating(input = {}) {
  const normalized = normalizeRatingInput(input);
  const sales = buildSalesPerformanceRating(normalized);
  const buyout = buildBuyoutHistoricalValueRating(normalized);
  const baselineHistorical = buildHistoricalPerformanceRating(normalized);
  const historical = buildCombinedHistoricalPerformanceRating(normalized, baselineHistorical, sales, buyout);
  const rights = buildRightsAndReadinessStatus(normalized);
  const forecast = buildForecastValueRating(normalized);
  const operational = buildOperationalDecisionRating(normalized, historical, rights, forecast);
  const front = buildFrontRatingDisplay(normalized, { historical, sales, buyout, forecast, rights, operational });
  const display = {
    displayRatingCode: front.rating,
    displayScore: front.ratingScore,
    displayRating: front.ratingExplanation,
    explanationCn: front.ratingExplanation
  };

  const oldRating = normalized.oldRating;
  const rating = display.displayRatingCode;
  const changed = Boolean(oldRating) && oldRating !== rating;
  const warnings = [];
  if (rights.currentRightsStatus === "expired") {
    warnings.push("版权到期影响当前权利状态和运营动作，不直接清空历史表现评级。");
  }
  if (normalized.readinessCodes.includes("missing_copyright_end")) {
    warnings.push("缺版权到期：作为权利/数据复核 warning，不自动下调历史价值评级。");
  }
  if (normalized.revenueModel === "unknown_revenue_model") {
    warnings.push("收入模式未知会降低自动运营决策强度，但不抹掉历史收入价值。");
  }

  return {
    candidateVersion: M2_COMMERCIAL_RATING_SUGGESTION_VERSION,
    previousCandidateVersion: M2_RATING_SUGGESTION_CALIBRATED_VERSION,
    rating,
    oldRating,
    changed,
    score: display.displayScore,
    rationaleCn: [
      ...historical.rationaleCn,
      ...forecast.rationaleCn,
      ...rights.rationaleCn,
      ...operational.rationaleCn,
      changed ? `旧评级 ${oldRating || "空"} 调整为 ${rating}` : `展示评级保持 ${rating}`
    ],
    warnings,
    historicalPerformanceRating: historical.rating,
    historicalPerformanceScore: historical.score,
    historicalPerformanceRationaleCn: historical.rationaleCn,
    salesPerformanceRating: sales.rating,
    salesPerformanceAmount: sales.amount,
    salesPerformanceAmountSource: sales.amountSource,
    salesPerformanceRationaleCn: sales.rationaleCn,
    buyoutHistoricalValueRating: buyout.rating,
    buyoutHistoricalValueAmount: buyout.amount,
    buyoutAmortizationYears: buyout.amortizationYears,
    buyoutAmortizationMonths: buyout.amortizationMonths,
    buyoutEquivalentMonthlySales: buyout.equivalentMonthlySales,
    buyoutMonthlyEquivalent: buyout.equivalentMonthlySales,
    buyoutEquivalentAnnualValue: buyout.equivalentAnnualValue,
    previousBuyoutMonthlySalesEquivalent: buyout.previousBuyoutMonthlySalesEquivalent,
    buyoutMonthlyEquivalentBoundary: { ...BUYOUT_MONTHLY_EQUIVALENT_BOUNDARY },
    ratingIncludesBuyout: front.ratingIncludesBuyout,
    nextCycleForecastPolicy: front.nextCycleForecastPolicy,
    buyoutHistoricalValueRationaleCn: buyout.rationaleCn,
    forecastValueRating: forecast.rating,
    forecastValueScore: forecast.score,
    forecastValueRationaleCn: forecast.rationaleCn,
    currentRightsStatus: rights.currentRightsStatus,
    currentRightsStatusChinese: rights.currentRightsStatusChinese,
    rightsAndReadinessStatus: rights.rightsAndReadinessStatus,
    rightsAndReadinessStatusChinese: rights.rightsAndReadinessStatusChinese,
    currentRightsStatusRationaleCn: rights.rationaleCn,
    operationalDecisionRating: operational.rating,
    operationalDecisionRatingChinese: operational.ratingChinese,
    operationalDecisionRationaleCn: operational.rationaleCn,
    displayRating: display.displayRating,
    displayRatingCode: display.displayRatingCode,
    displayRatingExplanationCn: display.explanationCn,
    frontRating: front,
    ratingBasis: front.ratingBasis,
    shelfStatusDisplay: front.shelfStatus,
    ratingExplanation: front.ratingExplanation,
    frontDisplayFields: {
      rating: front.rating,
      ratingBasis: front.ratingBasis,
      shelfStatus: front.shelfStatus,
      ratingExplanation: front.ratingExplanation
    },
    blockedForDirectOperation: operational.blockedForDirectOperation,
    expiredButRevenuePresent: rights.expiredButRevenuePresent,
    requiresRightsAudit: rights.requiresRightsAudit,
    shelfStatus: normalized.shelfStatus,
    shelfStatusChinese: normalized.shelfStatusChinese,
    manualConfirmationRequired: operational.manualConfirmationRequired || ["S+", "S"].includes(historical.rating),
    manualConfirmationReasons: operational.manualConfirmationReasons,
    ratingStandardDefinitions: RATING_STANDARD_DEFINITIONS
  };
}

export function buildFrontRatingDisplay(input = {}, parts = {}) {
  const normalized = normalizeRatingInput(input);
  const sales = parts.sales ?? buildSalesPerformanceRating(normalized);
  const buyout = parts.buyout ?? buildBuyoutHistoricalValueRating(normalized);
  const historical = parts.historical ?? buildCombinedHistoricalPerformanceRating(
    normalized,
    buildHistoricalPerformanceRating(normalized),
    sales,
    buyout
  );
  const rights = parts.rights ?? buildRightsAndReadinessStatus(normalized);
  const forecast = parts.forecast ?? buildForecastValueRating(normalized);

  return buildFrontRatingDisplayV4(normalized, { historical, sales, buyout, forecast, rights });
}

function buildFrontRatingDisplayV4(normalized, parts) {
  const { historical, sales, buyout, forecast, rights } = parts;
  const revenueModel = clean(normalized.revenueModel);
  const shelfStatus = clean(normalized.shelfStatus);
  const activeShelf = !shelfStatus || isActiveOrInferredShelfStatus(shelfStatus);
  const activeRights = ["active", "perpetual"].includes(rights.currentRightsStatus);
  const offShelfOrExpired = !activeShelf || rights.currentRightsStatus === "expired";
  let rating = historical.rating;
  let ratingBasis = "historical";
  let ratingIncludesBuyout = false;
  let nextCycleForecastPolicy = "sales_share_cash_forecast_separate_from_rating";
  const reasons = [];

  if (revenueModel === "pure_buyout") {
    rating = buyout.rating && buyout.rating !== "not_applicable" ? buyout.rating : historical.rating;
    ratingBasis = "buyout_monthly_sales_equivalent";
    ratingIncludesBuyout = true;
    nextCycleForecastPolicy = "pure_buyout_outside_m2_forecast_scope";
    reasons.push("\u8be5\u4f5c\u54c1\u4e3a\u7eaf\u4e70\u65ad\uff1b\u8bc4\u7ea7\u6309\u4e70\u65ad\u91d1\u989d\u5728\u4e1a\u52a1\u5468\u671f\u5185\u6298\u7b97\u7684\u6708\u5747\u5b9e\u9500\u7b49\u4ef7\u8ba1\u7b97");
    reasons.push(`buyoutEquivalentMonthlySales=${round(buyout.equivalentMonthlySales ?? 0, 2)}, amortizationYears=${buyout.amortizationYears}`);
    if (buyout.previousBuyoutMonthlySalesEquivalent != null) {
      reasons.push(`previousBuyoutMonthlySalesEquivalent=${round(buyout.previousBuyoutMonthlySalesEquivalent, 2)}\uff0c\u4ec5\u7528\u4e8e\u5386\u53f2\u4ef7\u503c\u548c\u8bc4\u7ea7\u6bd4\u8f83\uff0c\u4e0d\u7528\u4e8e\u672a\u6765\u73b0\u91d1\u9884\u6d4b`);
    }
    reasons.push("\u7eaf\u4e70\u65ad\u5df2\u79fb\u51fa M2 \u9884\u6d4b\u8303\u56f4\uff1b\u65e0\u8bba\u662f\u5426\u5df2\u7b7e\u7f72\u6216\u786e\u8ba4\uff0c\u90fd\u53ea\u8fdb\u5165\u6a21\u578b\u5916\u8d26\u5355/\u5ba1\u8ba1\u5c42\uff0c\u9884\u6d4b\u4fdd\u6301 null");
    if (offShelfOrExpired) reasons.push("\u5f53\u524d\u8fd0\u8425\u4ecd\u53d6\u51b3\u4e8e\u7248\u6743/\u4e0a\u67b6\u72b6\u6001");
  } else if (revenueModel === "buyout_plus_sales") {
    const mixed = buildMixedSalesWithBuyoutRating(sales, buyout, historical.rating);
    rating = mixed.rating;
    ratingBasis = "current_sales_with_buyout_allocation";
    ratingIncludesBuyout = mixed.includesBuyout;
    nextCycleForecastPolicy = "mixed_forecast_sales_share_cash_only";
    reasons.push(
      `\u4e70\u65ad+\u5b9e\u9500\u524d\u53f0\u8bc4\u7ea7\u4f7f\u7528\u5f53\u524d\u5b9e\u9500\u6708\u5747=${round(sales.monthlyAmount ?? 0, 2)}`
        + `\uff0c\u53e0\u52a0\u4e70\u65ad\u6298\u7b97\u6708\u5747=${round(buyout.equivalentMonthlySales ?? 0, 2)}`
        + `\uff0c\u5408\u8ba1\u6708\u5747=${round(mixed.combinedMonthlySalesEquivalent ?? 0, 2)}`
    );
    reasons.push("\u6b63\u5f0f\u9884\u6d4b\u53ea\u5305\u542b\u5206\u6210\u6536\u5165\uff1b\u5168\u90e8\u4e70\u65ad\u53ca\u5176\u5df2\u786e\u8ba4\u5e94\u6536\u90fd\u5728\u6a21\u578b\u5916\u8d26\u5355/\u5ba1\u8ba1\u5c42");
  } else if (!offShelfOrExpired && activeRights && sales.rating && sales.rating !== "not_applicable") {
    rating = sales.rating;
    ratingBasis = "current_sales";
    reasons.push("\u5728\u67b6/\u53ef\u8fd0\u8425\u4f5c\u54c1\u6309\u7528\u6237\u6708\u5747\u5b9e\u9500\u6863\u4f4d\u8bc4\u7ea7\uff0c\u4fdd\u6301\u7eaf\u5b9e\u9500\u89c4\u5219\u4e0d\u53d8");
  } else {
    rating = historical.rating;
    ratingBasis = "historical";
    reasons.push("\u5230\u671f/\u4e0b\u67b6/\u72b6\u6001\u4e0d\u660e\u4f5c\u54c1\u5c55\u793a\u5386\u53f2\u8bc4\u7ea7\uff0c\u4e0d\u7528\u72b6\u6001\u76f4\u63a5\u6539\u5199\u4e3a E");
  }

  if (forecast.rating && forecast.rating !== "not_applicable") {
    reasons.push(`\u9884\u6d4b\u8bc4\u7ea7=${forecast.rating} \u4ec5\u4f5c\u8f85\u52a9\uff0c\u4e0d\u8986\u76d6\u771f\u5b9e\u8d26\u5355\u5b9e\u9500\u6863\u4f4d`);
  } else {
    reasons.push("\u9884\u6d4b\u4e0d\u4f5c\u4e3a\u4e3b\u8bc4\u7ea7\u8def\u5f84");
  }

  const shelfStatusDisplay = normalized.shelfStatusChinese || normalized.shelfStatus || rights.currentRightsStatusChinese;
  return {
    rating,
    ratingBasis,
    shelfStatus: shelfStatusDisplay,
    ratingScore: ratingToScore(rating, historical.score),
    ratingExplanation: [
      `\u8bc4\u7ea7=${rating}`,
      `\u72b6\u6001=${shelfStatusDisplay}`,
      `\u5f53\u524d\u6743\u5229=${rights.currentRightsStatusChinese}`,
      `\u4e0b\u67b6\u72b6\u6001\uff1a${shelfStatusDisplay}`,
      `\u5386\u53f2\u8868\u73b0 ${historical.rating}`,
      `\u5b9e\u9500\u8bc4\u7ea7\uff1a${sales.rating}`,
      `\u4e70\u65ad\u6708\u5747\u5b9e\u9500\u7b49\u4ef7\uff1a${buyout.rating}`,
      `\u8bc4\u7ea7\u662f\u5426\u542b\u4e70\u65ad\uff1a${ratingIncludesBuyout ? "\u662f" : "\u5426"}`,
      `\u5546\u4e1a\u6a21\u5f0f/\u6536\u5165\u6a21\u5f0f=${normalized.revenueModelChinese || normalized.revenueModel || "\u672a\u77e5"}`,
      ...reasons
    ].join("\uff1b"),
    ratingIncludesBuyout,
    nextCycleForecastPolicy,
    buyoutMonthlyEquivalent: buyout.equivalentMonthlySales,
    buyoutMonthlyEquivalentBoundary: { ...BUYOUT_MONTHLY_EQUIVALENT_BOUNDARY },
    hiddenAuxiliaryRatings: {
      historicalPerformanceRating: historical.rating,
      salesPerformanceRating: sales.rating,
      buyoutHistoricalValueRating: buyout.rating,
      forecastValueRating: forecast.rating
    }
  };
}

export function buildSalesPerformanceRating(input = {}) {
  const monthly = numberOrNull(input.salesRevenueMonthly ?? input.monthlySalesRevenue);
  const amount12m = numberOrNull(input.salesRevenue12m);
  const annualized = numberOrNull(input.salesRevenueAnnualized);
  const monthlyAmount = monthly != null ? monthly : amount12m != null ? amount12m / 12 : annualized != null ? annualized / 12 : null;
  const amountSource =
    monthly != null ? "salesRevenueMonthly" : amount12m != null ? "salesRevenue12m/12" : annualized != null ? "salesRevenueAnnualized/12" : "missing";
  const rating = monthlyAmount == null ? "not_applicable" : ratingFromMonthlySalesAmount(monthlyAmount);
  return {
    rating,
    amount: monthlyAmount,
    monthlyAmount,
    amountSource,
    rationaleCn: [
      "实销评级基于剔除买断后的月均实销收入",
      amountSource === "salesRevenueMonthly"
        ? "优先采用已提供的月均实销"
        : amountSource === "salesRevenue12m/12"
          ? "最近 12 个完整月实销收入折算为月均实销"
          : amountSource === "salesRevenueAnnualized/12"
            ? "年化实销 run-rate 折算为月均实销"
            : "缺少实销收入口径",
      monthlyAmount == null ? "缺少实销收入口径，实销评级暂不适用" : `月均实销=${round(monthlyAmount, 2)}，评级=${rating}`
    ]
  };
}

export function buildBuyoutHistoricalValueRating(input = {}) {
  return buildBuyoutHistoricalValueRatingV4(input);
}

function buildBuyoutHistoricalValueRatingV4(input = {}) {
  const amount = numberOrNull(input.latestBuyoutAmount ?? input.currentBuyoutAmount ?? input.buyoutEstimatedAmount);
  const revenueModel = clean(input.revenueModel);
  const applies = ["pure_buyout", "buyout_plus_sales"].includes(revenueModel) || (amount != null && amount > 0);
  const amortizationYears = resolveBuyoutAmortizationYears(input);
  const amortizationMonths = round(amortizationYears * 12, 2);
  const equivalentMonthlySales = applies && amount != null && amortizationMonths > 0 ? amount / amortizationMonths : null;
  const equivalentAnnualValue = equivalentMonthlySales != null ? equivalentMonthlySales * 12 : null;
  const rating = applies && equivalentMonthlySales != null ? ratingFromMonthlySalesAmount(equivalentMonthlySales) : "not_applicable";
  const previousBuyoutAmount = numberOrNull(input.previousBuyoutAmount ?? input.priorBuyoutAmount ?? input.lastCycleBuyoutAmount);
  const monthsBetweenBuyouts = numberOrNull(input.monthsBetweenBuyouts ?? input.buyoutCycleMonths ?? input.previousBuyoutCycleMonths);
  const previousBuyoutMonthlySalesEquivalent =
    previousBuyoutAmount != null && monthsBetweenBuyouts != null && monthsBetweenBuyouts > 0
      ? previousBuyoutAmount / monthsBetweenBuyouts
      : null;

  return {
    rating,
    amount: applies ? amount ?? 0 : null,
    amortizationYears,
    amortizationMonths,
    equivalentMonthlySales,
    equivalentAnnualValue,
    previousBuyoutMonthlySalesEquivalent,
    rationaleCn: [
      "\u4e70\u65ad\u8bc4\u7ea7\u6309\u6708\u5747\u5b9e\u9500\u7b49\u4ef7\u8ba1\u7b97\uff1a\u6700\u65b0\u4e70\u65ad\u91d1\u989d\u9664\u4ee5\u9ed8\u8ba4 3 \u5e74\uff0c\u5982\u5269\u4f59\u7248\u6743\u671f\u66f4\u77ed\u5219\u6309\u5269\u4f59\u671f\u9650\uff0c\u6700\u4f4e 1 \u5e74",
      applies
        ? `buyoutAmount=${round(amount ?? 0, 2)}, amortizationYears=${amortizationYears}, buyoutEquivalentMonthlySales=${round(equivalentMonthlySales ?? 0, 2)}, buyoutMonthlySalesRating=${rating}`
        : "\u975e\u4e70\u65ad\u6216\u65e0\u4e70\u65ad\u4f30\u8ba1\u91d1\u989d\uff0c\u4e70\u65ad\u5386\u53f2\u4ef7\u503c\u4e0d\u9002\u7528"
    ]
  };
}

function buildCombinedHistoricalPerformanceRating(input, baselineHistorical, sales, buyout) {
  return buildCombinedHistoricalPerformanceRatingV4(input, baselineHistorical, sales, buyout);
}

function buildCombinedHistoricalPerformanceRatingV4(input, baselineHistorical, sales, buyout) {
  if (!hasRatingStandardV2Inputs(input)) return baselineHistorical;
  const revenueModel = clean(input.revenueModel);
  let rating = baselineHistorical.rating;
  const rationale = [];

  if (revenueModel === "pure_buyout") {
    rating = buyout.rating && buyout.rating !== "not_applicable" ? buyout.rating : baselineHistorical.rating;
    rationale.push("\u7eaf\u4e70\u65ad\u5386\u53f2\u8868\u73b0\u4f7f\u7528\u4e70\u65ad\u6708\u5747\u5b9e\u9500\u7b49\u4ef7\uff0c\u4e0d\u76f4\u63a5\u4f7f\u7528\u4e70\u65ad\u603b\u989d");
  } else if (revenueModel === "buyout_plus_sales") {
    const mixed = buildMixedSalesWithBuyoutRating(sales, buyout, baselineHistorical.rating);
    rating = mixed.rating;
    rationale.push("\u4e70\u65ad+\u5b9e\u9500\u7efc\u5408\u8bc4\u7ea7\u5c06\u4e70\u65ad\u91d1\u989d\u6309\u5bf9\u5e94\u5468\u671f\u6298\u6210\u6708\u5747\u5b9e\u9500\uff0c\u4e0e\u5f53\u671f\u539f\u5b9e\u9500\u6708\u5747\u76f8\u52a0");
  } else {
    const candidates = [sales.rating, baselineHistorical.rating].filter((item) => RATING_RANK[item] != null);
    rating = candidates.length ? bestRating(candidates) : baselineHistorical.rating;
    rationale.push("\u7eaf\u5b9e\u9500/\u5206\u6210\u4fdd\u6301\u7528\u6237\u5b9e\u9500\u6863\u4f4d\u89c4\u5219\u4e0d\u53d8");
  }

  return {
    rating,
    score: ratingToScore(rating, baselineHistorical.score),
    rationaleCn: [
      ...rationale,
      `salesPerformanceRating=${sales.rating}`,
      `buyoutHistoricalValueRating=${buyout.rating}`,
      buyout.equivalentMonthlySales != null ? `buyoutEquivalentMonthlySales=${round(buyout.equivalentMonthlySales, 2)}` : "buyoutEquivalentMonthlySales=not_applicable",
      "\u7248\u6743\u5230\u671f\u548c\u4e0b\u67b6\u72b6\u6001\u53ea\u5f71\u54cd\u5f53\u524d\u8fd0\u8425\uff0c\u4e0d\u76f4\u63a5\u628a\u5386\u53f2\u8bc4\u7ea7\u6539\u5199\u4e3a E"
    ]
  };
}

export function buildHistoricalPerformanceRating(input = {}) {
  const revenueBucket = clean(input.revenueBucket ?? input.revenueScale);
  const lifecycle = clean(input.lifecycle);
  const revenueModel = clean(input.revenueModel);
  const activeMonths = numberOrNull(input.activeMonthCount);
  const totalRevenue = numberOrNull(input.totalHistoricalRevenue);
  const continuityScore = numberOrNull(input.salesContinuityScore);

  let score = REVENUE_SCORE[revenueBucket] ?? 42;
  score += LIFECYCLE_SCORE[lifecycle] ?? 0;
  score += REVENUE_MODEL_SCORE[revenueModel] ?? 0;

  if (activeMonths != null) {
    if (activeMonths >= 24) score += 5;
    else if (activeMonths >= 12) score += 2;
    else if (activeMonths <= 3) score -= 6;
  }
  if (continuityScore != null && continuityScore >= 0.65) score += 3;
  if (totalRevenue != null && totalRevenue > 0 && ["zero", "near_zero"].includes(revenueBucket)) score += 4;
  if (revenueModel === "pure_buyout" && !["top", "high"].includes(revenueBucket)) score = Math.min(score, 50);

  const rating = ratingFromScore(score);
  return {
    rating,
    score: round(score, 2),
    rationaleCn: [
      `历史表现评级基于历史收入层级=${revenueBucket || "未知"}`,
      lifecycle ? `生命周期=${lifecycle} 参与历史价值调整` : "生命周期未知，历史评级保持保守",
      revenueModel ? `收入模式=${revenueModel} 参与历史价值解释` : "收入模式缺失，历史评级不因模式缺失清零",
      activeMonths != null ? `活跃月份数=${activeMonths}` : "活跃月份数缺失",
      "版权到期不会直接把历史表现评级置为 E"
    ]
  };
}

export function buildForecastValueRating(input = {}) {
  const forecastabilityStatus = clean(input.forecastabilityStatus);
  const forecastConfidence = clean(input.forecastConfidence ?? input.confidence);
  const remainingMonths = numberOrNull(input.remainingCopyrightMonths);
  const revenueBucket = clean(input.revenueBucket ?? input.revenueScale);

  if (forecastabilityStatus === "true_forecast_blocked" || forecastabilityStatus === "observe_only_no_numeric_forecast") {
    return {
      rating: "not_applicable",
      score: null,
      rationaleCn: ["预测价值评级不适用：当前样本不输出业务可用数值预测。"]
    };
  }

  let score = REVENUE_SCORE[revenueBucket] ?? 42;
  score += CONFIDENCE_SCORE[forecastConfidence] ?? 0;
  score += FORECASTABILITY_SCORE[forecastabilityStatus] ?? 0;
  if (remainingMonths != null) {
    if (remainingMonths >= 36) score += 5;
    else if (remainingMonths <= 6) score -= 8;
    else if (remainingMonths <= 12) score -= 4;
  }
  return {
    rating: ratingFromScore(score),
    score: round(score, 2),
    rationaleCn: [
      `预测价值评级基于预测状态=${forecastabilityStatus || "未知"}`,
      `预测置信度=${forecastConfidence || "未知"}`,
      remainingMonths != null ? `剩余版权月数=${remainingMonths}` : "缺少剩余版权月数，预测价值保守"
    ]
  };
}

export function buildRightsAndReadinessStatus(input = {}) {
  const explicit = clean(input.currentRightsStatus ?? input.rightsStatus);
  const remainingMonths = numberOrNull(input.remainingCopyrightMonths);
  const copyrightEndDate = clean(input.copyrightEndDate);
  const readinessCodes = asArray(input.readinessCodes ?? input.riskCodes);
  const revenueBucket = clean(input.revenueBucket ?? input.revenueScale);

  let status = explicit || "unknown";
  if (!explicit) {
    if (readinessCodes.includes("copyright_conflict") || readinessCodes.includes("copyright_date_conflict")) status = "pending_review";
    else if (remainingMonths != null && remainingMonths < 0) status = "expired";
    else if (remainingMonths != null && remainingMonths >= 0) status = "active";
    else if (/无限期|perpetual/i.test(copyrightEndDate)) status = "perpetual";
    else if (readinessCodes.includes("missing_copyright_end") || !copyrightEndDate) status = "unknown";
  }

  const label = {
    active: "版权有效",
    expired: "版权已到期",
    perpetual: "无限期或长期有效",
    unknown: "版权状态未知",
    pending_review: "版权状态待复核"
  }[status] ?? "版权状态未知";

  const expiredButRevenuePresent = status === "expired" && ["top", "high", "medium", "mid"].includes(revenueBucket);
  const requiresRightsAudit = ["expired", "unknown", "pending_review"].includes(status) || expiredButRevenuePresent;
  const readinessStatus = status === "active" || status === "perpetual" ? "ready_or_observable" : "rights_or_data_review_required";

  return {
    currentRightsStatus: status,
    currentRightsStatusChinese: label,
    rightsAndReadinessStatus: readinessStatus,
    rightsAndReadinessStatusChinese: readinessStatus === "ready_or_observable" ? "可观察或可运营" : "需权利或数据复核",
    expiredButRevenuePresent,
    requiresRightsAudit,
    rationaleCn: [
      `当前权利状态=${label}`,
      expiredButRevenuePresent ? "版权到期但历史收入仍有价值，标记 expired_but_revenue_present" : "权利状态影响当前动作，不改写历史评级"
    ]
  };
}

export function buildCurrentRightsStatus(input = {}) {
  return buildRightsAndReadinessStatus(input);
}

export function buildOperationalDecisionRating(input, historical, rights, forecast) {
  const forecastabilityStatus = clean(input.forecastabilityStatus);
  const businessActionStatus = clean(input.businessActionStatus);
  const revenueModel = clean(input.revenueModel);
  const shelfStatus = clean(input.shelfStatus);
  const manualReasons = [];
  let rating = "operable";
  let label = "可运营";
  let blocked = false;

  if (rights.currentRightsStatus === "expired") {
    rating = "renewal_review_required";
    label = "需先做续约/权利复核";
    blocked = true;
    manualReasons.push("版权已到期，不能直接执行运营动作");
  } else if (rights.currentRightsStatus === "unknown" || rights.currentRightsStatus === "pending_review") {
    rating = "rights_review_required";
    label = "需先做权利核查";
    blocked = true;
    manualReasons.push("版权状态未知或待复核");
  } else if (shelfStatus === "off_shelf_but_tail_revenue") {
    rating = "rights_audit_required";
    label = "需权利/下架尾部收入核查";
    blocked = true;
    manualReasons.push("已下架但仍有尾部收入，需核查权利和收入来源");
  } else if (shelfStatus === "rights_expired_likely_off_shelf" || shelfStatus === "likely_off_shelf") {
    rating = "shelf_review_required";
    label = "需下架状态复核";
    blocked = true;
    manualReasons.push("下架状态影响当前运营动作，但不改写历史评级");
  } else if (businessActionStatus === "action_blocked" || forecastabilityStatus === "true_forecast_blocked") {
    rating = "manual_review_required";
    label = "需人工复核";
    blocked = true;
    manualReasons.push("业务动作或预测可用性仍处于阻断状态");
  }

  if (revenueModel === "unknown_revenue_model") {
    manualReasons.push("收入模式未知，不能输出强运营动作");
    if (!blocked) {
      rating = "revenue_model_review_required";
      label = "需收入模式复核";
    }
  }

  if (revenueModel === "pure_buyout" && ["S+", "S", "A"].includes(historical.rating)) {
    manualReasons.push("买断型高价值作品需要确认是否存在后续实销或权利保留价值");
  }

  return {
    rating,
    ratingChinese: label,
    blockedForDirectOperation: blocked,
    manualConfirmationRequired: manualReasons.length > 0,
    manualConfirmationReasons: manualReasons,
    rationaleCn: [
      `运营决策级别=${label}`,
      `历史表现=${historical.rating}`,
      `预测价值=${forecast.rating}`,
      revenueModel ? `收入模式=${revenueModel}` : "收入模式未提供"
    ]
  };
}

function buildDisplayRating(historical, rights, forecast, operational, input = {}, sales = {}, buyout = {}) {
  const displayRatingCode = historical.rating;
  const forecastPart = forecast.rating === "not_applicable" ? "预测价值暂不适用" : `预测价值 ${forecast.rating}`;
  const revenueModel = clean(input.revenueModelChinese ?? input.revenueModel) || "未知";
  const shelfPart = clean(input.shelfStatusChinese ?? input.shelfStatus) || "未判断";
  const salesPart = sales.rating
    ? `实销评级：${sales.rating}${sales.amount != null ? `（${round(sales.amount, 2)}）` : ""}`
    : "实销评级：未提供";
  const buyoutPart = buyout.rating
    ? `买断历史价值：${buyout.rating}${buyout.amount != null ? `（${round(buyout.amount, 2)}）` : ""}`
    : "买断历史价值：不适用";
  const explanationCn = `历史表现 ${historical.rating}；${salesPart}；${buyoutPart}；当前权利：${rights.currentRightsStatusChinese}；下架状态：${shelfPart}；${forecastPart}；收入模式/商业模式：${revenueModel}；当前运营限制：${operational.ratingChinese}`;
  return {
    displayRatingCode,
    displayScore: historical.score,
    displayRating: explanationCn,
    explanationCn
  };
}

function normalizeRatingInput(input) {
  const revenueModel = clean(input.revenueModel ?? input.revenueModelClassification?.revenueModel);
  return {
    ...input,
    revenueBucket: clean(input.revenueBucket ?? input.revenueScale),
    lifecycle: clean(input.lifecycle),
    forecastabilityStatus: clean(input.forecastabilityStatus),
    forecastConfidence: clean(input.forecastConfidence ?? input.confidence),
    businessActionStatus: clean(input.businessActionStatus),
    revenueModel,
    revenueModelChinese: clean(input.revenueModelChinese ?? input.revenueModelClassification?.revenueModelChinese),
    salesContinuityScore: numberOrNull(input.salesContinuityScore ?? input.revenueModelClassification?.salesContinuityScore),
    salesRevenueMonthly: numberOrNull(input.salesRevenueMonthly ?? input.monthlySalesRevenue),
    salesRevenue12m: numberOrNull(input.salesRevenue12m),
    salesRevenueAnnualized: numberOrNull(input.salesRevenueAnnualized),
    buyoutEstimatedAmount: numberOrNull(input.latestBuyoutAmount ?? input.currentBuyoutAmount ?? input.buyoutEstimatedAmount ?? input.revenueModelClassification?.buyoutEstimatedAmount),
    previousBuyoutAmount: numberOrNull(input.previousBuyoutAmount ?? input.priorBuyoutAmount ?? input.lastCycleBuyoutAmount),
    monthsBetweenBuyouts: numberOrNull(input.monthsBetweenBuyouts ?? input.buyoutCycleMonths ?? input.previousBuyoutCycleMonths),
    buyoutAmortizationYears: numberOrNull(input.buyoutAmortizationYears ?? input.amortizationYears),
    shelfStatus: clean(input.shelfStatus ?? input.shelfStatusInference?.shelfStatus),
    shelfStatusChinese: clean(input.shelfStatusChinese ?? input.shelfStatusInference?.shelfStatusChinese),
    remainingCopyrightMonths: numberOrNull(input.remainingCopyrightMonths),
    oldRating: clean(input.currentRating ?? input.rating),
    readinessCodes: asArray(input.readinessCodes ?? input.riskCodes)
  };
}

export function ratingFromScore(score) {
  if (score >= 96) return "S+";
  if (score >= 88) return "S";
  if (score >= 70) return "A";
  if (score >= 52) return "B";
  if (score >= 38) return "C";
  if (score >= 24) return "D";
  return "E";
}

export function ratingFromSalesAmount(amount) {
  const value = Number(amount) || 0;
  if (value > 100000) return "S+";
  if (value >= 10000) return "S";
  if (value >= 5000) return "A";
  if (value >= 1000) return "B";
  if (value >= 500) return "C";
  if (value >= 100) return "D";
  return "E";
}

export function ratingFromMonthlySalesAmount(amount) {
  return ratingFromSalesAmount(amount);
}

export function ratingFromBuyoutAnnualValue(amount) {
  return ratingFromSalesAmount(amount);
}

function resolveBuyoutAmortizationYears(input = {}) {
  const configured = numberOrNull(input.buyoutAmortizationYears ?? input.amortizationYears);
  let years = configured != null && configured > 0 ? configured : DEFAULT_BUYOUT_AMORTIZATION_YEARS;
  const remainingMonths = numberOrNull(input.remainingCopyrightMonths);
  if (remainingMonths != null) {
    years = Math.min(years, Math.max(1, remainingMonths / 12));
  }
  return round(years, 2);
}

function buildMixedSalesWithBuyoutRating(sales = {}, buyout = {}, fallbackRating = "E") {
  const salesMonthly = numberOrNull(sales.monthlyAmount ?? sales.amount) ?? 0;
  const buyoutMonthly = numberOrNull(buyout.equivalentMonthlySales) ?? 0;
  const combinedMonthlySalesEquivalent = salesMonthly + buyoutMonthly;
  const rating = combinedMonthlySalesEquivalent > 0
    ? ratingFromMonthlySalesAmount(combinedMonthlySalesEquivalent)
    : RATING_RANK[fallbackRating] != null
      ? fallbackRating
      : "E";
  return {
    rating,
    combinedMonthlySalesEquivalent,
    includesBuyout: buyoutMonthly > 0
  };
}

function improveRating(rating, steps = 1) {
  const index = RATING_RANK[rating];
  if (index == null) return rating;
  return M2_RATING_ORDER[Math.max(0, index - steps)];
}

function isActiveOrInferredShelfStatus(status) {
  return ["active_on_shelf", "active_on_shelf_confident", "active_or_available_inferred"].includes(status);
}

function hasRatingStandardV2Inputs(input) {
  return (
    numberOrNull(input.salesRevenue12m) != null ||
    numberOrNull(input.salesRevenueAnnualized) != null ||
    numberOrNull(input.buyoutEstimatedAmount) != null ||
    clean(input.shelfStatus) !== ""
  );
}

function bestRating(ratings) {
  return ratings.reduce((best, rating) => ((RATING_RANK[rating] ?? 99) < (RATING_RANK[best] ?? 99) ? rating : best), ratings[0]);
}

function ratingToScore(rating, fallback = 0) {
  return {
    "S+": 100,
    S: 90,
    A: 74,
    B: 56,
    C: 42,
    D: 28,
    E: 12
  }[rating] ?? fallback;
}

export function minRating(rating, cap) {
  return (RATING_RANK[rating] ?? 99) <= (RATING_RANK[cap] ?? 99) ? cap : rating;
}

export function maxRating(rating, floor) {
  return (RATING_RANK[rating] ?? 99) >= (RATING_RANK[floor] ?? 99) ? floor : rating;
}

function asArray(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  if (!value) return [];
  return [clean(value)].filter(Boolean);
}

function clean(value) {
  return value == null ? "" : String(value).trim();
}

function numberOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}
