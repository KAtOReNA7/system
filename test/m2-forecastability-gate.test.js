import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateForecastability,
  FORECASTABILITY_STATUSES,
  materialityBucketForAmount,
  summarizeForecastability
} from "../src/domain/oldProductEvaluation/forecastabilityGate.js";

test("forecastability gate allows numeric forecasts only for material stable histories", () => {
  const result = evaluateForecastability({
    lifecycle: "stable",
    rating: "S",
    revenueScale: "top",
    activeMonthCount: 30,
    zeroRevenueMonthCount: 1,
    totalHistoricalRevenue: 500000,
    recentRevenue: 60000,
    volatility: 0.4,
    remainingMonthsForForecast: 24,
    materialityBucket: "top_1_percent"
  });

  assert.equal(result.forecastabilityStatus, FORECASTABILITY_STATUSES.NUMERIC_FORECAST_ELIGIBLE);
  assert.equal(result.canUseNumericForecast, true);
  assert.equal(result.canUseForBusinessReview, true);
});

test("forecastability gate does not treat formal readiness gaps as forecast blockers", () => {
  const result = evaluateForecastability({
    riskCodes: ["missing_copyright_end"],
    lifecycle: "stable",
    rating: "S",
    revenueScale: "top",
    activeMonthCount: 24,
    zeroRevenueMonthCount: 2,
    totalHistoricalRevenue: 100000,
    recentRevenue: 12000,
    volatility: 0.5,
    materialityBucket: "top_5_percent",
    forecastFallbackUsed: true
  });

  assert.equal(result.forecastabilityStatus, FORECASTABILITY_STATUSES.NUMERIC_FORECAST_ELIGIBLE);
  assert.equal(result.canUseNumericForecast, true);
});

test("forecastability gate blocks only true time-series blockers", () => {
  for (const features of [
    {
      riskCodes: ["abnormal_spike"],
      activeMonthCount: 24,
      totalHistoricalRevenue: 10000,
      recentRevenue: 2000,
      peakShare: 0.95
    },
    { lifecycle: "insufficient_history", activeMonthCount: 3, totalHistoricalRevenue: 10000 }
  ]) {
    const result = evaluateForecastability(features);
    assert.equal(result.forecastabilityStatus, FORECASTABILITY_STATUSES.TRUE_FORECAST_BLOCKED);
    assert.equal(result.canUseNumericForecast, false);
    assert.equal(result.confidence, "blocked_for_business_use");
  }
});

test("forecastability gate allows spike-damped rows only as conservative forecasts", () => {
  const result = evaluateForecastability({
    riskCodes: ["abnormal_spike"],
    lifecycle: "declining",
    rating: "B",
    revenueScale: "high",
    activeMonthCount: 18,
    zeroRevenueMonthCount: 2,
    totalHistoricalRevenue: 20000,
    recentRevenue: 1600,
    peakShare: 0.82,
    materialityBucket: "middle_40_percent"
  });

  assert.equal(result.forecastabilityStatus, FORECASTABILITY_STATUSES.CONSERVATIVE_NUMERIC_FORECAST);
  assert.equal(result.canUseNumericForecast, true);
  assert.equal(result.confidence, "low");
  assert.equal(result.canUseForBusinessReview, false);
});

test("forecastability gate avoids business numeric forecasts for low materiality tails", () => {
  const result = evaluateForecastability({
    lifecycle: "long_tail",
    rating: "E",
    revenueScale: "long_tail",
    activeMonthCount: 20,
    zeroRevenueMonthCount: 30,
    totalHistoricalRevenue: 4,
    recentRevenue: 1,
    materialityBucket: "near_zero"
  });

  assert.equal(result.forecastabilityStatus, FORECASTABILITY_STATUSES.OBSERVE_ONLY_NO_NUMERIC_FORECAST);
  assert.equal(result.canUseNumericForecast, false);
  assert.equal(result.requiredAction, "observe_only_no_business_numeric_forecast");
});

test("forecastability gate keeps borderline material rows conservative", () => {
  const result = evaluateForecastability({
    lifecycle: "declining",
    rating: "B",
    revenueScale: "high",
    activeMonthCount: 16,
    zeroRevenueMonthCount: 4,
    totalHistoricalRevenue: 8000,
    recentRevenue: 800,
    volatility: 1.4,
    remainingMonthsForForecast: 48,
    materialityBucket: "middle_40_percent"
  });

  assert.equal(result.forecastabilityStatus, FORECASTABILITY_STATUSES.CONSERVATIVE_NUMERIC_FORECAST);
  assert.equal(result.canUseNumericForecast, true);
  assert.equal(result.canUseForBusinessReview, false);
});

test("materiality bucket and summary helpers are deterministic", () => {
  assert.equal(materialityBucketForAmount(100000, 0.005), "top_1_percent");
  assert.equal(materialityBucketForAmount(0, 0.9), "near_zero");
  assert.deepEqual(
    summarizeForecastability([
      { forecastabilityStatus: FORECASTABILITY_STATUSES.NUMERIC_FORECAST_ELIGIBLE },
      { forecastabilityStatus: FORECASTABILITY_STATUSES.NUMERIC_FORECAST_ELIGIBLE },
      { forecastabilityStatus: FORECASTABILITY_STATUSES.TRUE_FORECAST_BLOCKED }
    ]),
    {
      [FORECASTABILITY_STATUSES.NUMERIC_FORECAST_ELIGIBLE]: 2,
      [FORECASTABILITY_STATUSES.TRUE_FORECAST_BLOCKED]: 1
    }
  );
});
