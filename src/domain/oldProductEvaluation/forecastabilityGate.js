export const FORECASTABILITY_STATUSES = Object.freeze({
  NUMERIC_FORECAST_ELIGIBLE: "numeric_forecast_eligible",
  CONSERVATIVE_NUMERIC_FORECAST: "conservative_numeric_forecast",
  OBSERVE_ONLY_NO_NUMERIC_FORECAST: "observe_only_no_numeric_forecast",
  TRUE_FORECAST_BLOCKED: "true_forecast_blocked"
});

const SPIKE_RISKS = new Set(["abnormal_spike", "buyout_or_oneoff_income"]);

function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function hasAny(values = [], targets) {
  return values.some((value) => targets.has(value));
}

export function materialityBucketForAmount(amount = 0, rankPercent = null) {
  const value = numberValue(amount);
  const rank = rankPercent == null ? null : numberValue(rankPercent, null);
  if (rank != null && rank <= 0.01) return "top_1_percent";
  if (rank != null && rank <= 0.05) return "top_5_percent";
  if (rank != null && rank <= 0.1) return "top_10_percent";
  if (value <= 10) return "near_zero";
  if (rank != null && rank > 0.5) return "bottom_50_percent";
  return "middle_40_percent";
}

export function evaluateForecastability(features = {}) {
  const risks = Array.isArray(features.riskCodes) ? features.riskCodes : [];
  const lifecycle = String(features.lifecycle ?? "");
  const rating = String(features.rating ?? "");
  const revenueScale = String(features.revenueScale ?? "");
  const activeMonthCount = numberValue(features.activeMonthCount);
  const zeroRevenueMonthCount = numberValue(features.zeroRevenueMonthCount);
  const totalRevenue = numberValue(features.totalHistoricalRevenue);
  const recentRevenue = numberValue(features.recentRevenue ?? features.last12MonthRevenue);
  const volatility = numberValue(features.volatility ?? features.last6CoefficientOfVariation);
  const peakShare = numberValue(features.peakShare ?? features.peakMonthShare);
  const remainingMonths = numberValue(features.remainingMonthsForForecast, 12);
  const materialityBucket =
    features.materialityBucket ?? materialityBucketForAmount(totalRevenue, features.materialityRankPercent);

  if (activeMonthCount <= 0 || totalRevenue <= 0) {
    return buildGateResult(
      FORECASTABILITY_STATUSES.TRUE_FORECAST_BLOCKED,
      ["no_backtestable_revenue_history"],
      "blocked_for_business_use",
      materialityBucket,
      "exclude_from_numeric_forecast_baseline"
    );
  }

  if (activeMonthCount < 6 || lifecycle === "insufficient_history") {
    return buildGateResult(
      FORECASTABILITY_STATUSES.TRUE_FORECAST_BLOCKED,
      ["insufficient_revenue_time_series"],
      "blocked_for_business_use",
      materialityBucket,
      "collect_more_revenue_history_before_numeric_forecast"
    );
  }

  const spikeRisk = hasAny(risks, SPIKE_RISKS);
  const spikeDampedBacktestPassed =
    Boolean(features.spikeDampedBacktestPassed) ||
    (!spikeRisk && peakShare < 0.9) ||
    (spikeRisk && activeMonthCount >= 12 && recentRevenue > 100 && peakShare < 0.85);
  if (spikeRisk && !spikeDampedBacktestPassed) {
    return buildGateResult(
      FORECASTABILITY_STATUSES.TRUE_FORECAST_BLOCKED,
      ["unresolved_spike_or_oneoff_income"],
      "blocked_for_business_use",
      materialityBucket,
      "manual_review_or_spike_damped_backtest_required"
    );
  }

  const zeroHeavy = zeroRevenueMonthCount >= Math.max(12, activeMonthCount * 2);
  const nearZero = materialityBucket === "near_zero" || recentRevenue <= 10;
  const lowMateriality =
    materialityBucket === "bottom_50_percent" ||
    ["D", "E"].includes(rating) ||
    ["low", "long_tail"].includes(revenueScale);
  const tailPattern = ["inactive", "long_tail"].includes(lifecycle) || zeroHeavy || nearZero || lowMateriality;
  const material = ["top_1_percent", "top_5_percent", "top_10_percent", "middle_40_percent"].includes(
    materialityBucket
  );

  if (tailPattern) {
    if (material && totalRevenue > 1000 && activeMonthCount >= 12 && recentRevenue > 10) {
      return buildGateResult(
        FORECASTABILITY_STATUSES.CONSERVATIVE_NUMERIC_FORECAST,
        ["material_tail_or_zero_heavy_but_backtestable"],
        "low",
        materialityBucket,
        "conservative_numeric_forecast_only"
      );
    }
    return buildGateResult(
      FORECASTABILITY_STATUSES.OBSERVE_ONLY_NO_NUMERIC_FORECAST,
      ["low_materiality_or_zero_heavy_pattern"],
      "low",
      materialityBucket,
      "observe_only_no_business_numeric_forecast"
    );
  }

  if (
    material &&
    activeMonthCount >= 12 &&
    recentRevenue > 100 &&
    volatility <= 1.2 &&
    remainingMonths <= 120 &&
    ["growth", "stable", "rebound"].includes(lifecycle)
  ) {
    return buildGateResult(
      FORECASTABILITY_STATUSES.NUMERIC_FORECAST_ELIGIBLE,
      ["material_stable_history"],
      "high",
      materialityBucket,
      "numeric_forecast_and_business_review_allowed"
    );
  }

  return buildGateResult(
    FORECASTABILITY_STATUSES.CONSERVATIVE_NUMERIC_FORECAST,
    ["bounded_but_forecastable_with_conservative_interval"],
    spikeRisk ? "low" : "medium",
    materialityBucket,
    "conservative_numeric_forecast_only"
  );
}

function buildGateResult(status, reasonCodes, confidence, materialityBucket, requiredAction) {
  const canUseNumericForecast = [
    FORECASTABILITY_STATUSES.NUMERIC_FORECAST_ELIGIBLE,
    FORECASTABILITY_STATUSES.CONSERVATIVE_NUMERIC_FORECAST
  ].includes(status);
  return {
    forecastabilityStatus: status,
    reasonCodes,
    confidence,
    materialityBucket,
    canUseNumericForecast,
    canUseForBusinessReview: status === FORECASTABILITY_STATUSES.NUMERIC_FORECAST_ELIGIBLE,
    requiredAction
  };
}

export function summarizeForecastability(items = []) {
  return items.reduce((summary, item) => {
    const status = item.forecastabilityStatus ?? "unknown";
    summary[status] = (summary[status] ?? 0) + 1;
    return summary;
  }, {});
}
