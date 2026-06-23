import assert from "node:assert/strict";
import test from "node:test";
import { calibrateForecastScenario } from "../src/domain/oldProductEvaluation/forecastScenarioCalibration.js";

test("high-confidence stable forecasts keep the optimistic/pessimistic ratio bounded", () => {
  const result = calibrateForecastScenario({
    forecastBase: 10000,
    last12MonthRevenue: 18000,
    last6MonthRevenue: 9000,
    activeMonthCount: 18,
    last6CoefficientOfVariation: 0.2,
    backtestWape: 0.35,
    lifecycle: "stable",
    rating: "S",
    revenueScale: "high",
    riskCodes: []
  });

  assert.equal(result.confidence, "high");
  assert.ok(result.optimisticPessimisticRatio <= 1.5);
  assert.ok(result.scenarioSpread <= 0.5);
});

test("inactive low-value forecasts are capped and not treated as high confidence", () => {
  const result = calibrateForecastScenario({
    forecastBase: 2500,
    last12MonthRevenue: 2,
    last6MonthRevenue: 0,
    activeMonthCount: 1,
    last6CoefficientOfVariation: 1.8,
    lifecycle: "inactive",
    rating: "E",
    revenueScale: "low",
    riskCodes: ["inactive_tail"]
  });

  assert.ok(result.baseForecast <= 2);
  assert.notEqual(result.confidence, "high");
  assert.ok(result.intervalReason.some((reason) => reason.includes("inactive")));
});

test("fallback readiness risk blocks ordinary business use for weak evidence rows", () => {
  const result = calibrateForecastScenario({
    forecastBase: 500,
    last12MonthRevenue: 200,
    last6MonthRevenue: 60,
    activeMonthCount: 5,
    last6CoefficientOfVariation: 1.1,
    lifecycle: "insufficient_history",
    rating: "C",
    revenueScale: "mid",
    forecastFallbackUsed: true,
    riskCodes: ["missing_copyright_end", "insufficient_history"]
  });

  assert.equal(result.confidence, "blocked_for_business_use");
  assert.ok(result.optimisticPessimisticRatio <= 3.2);
});

test("long-tail long-horizon forecasts are damped by v0.3 base caps", () => {
  const result = calibrateForecastScenario({
    forecastBase: 1200,
    last12MonthRevenue: 40,
    last6MonthRevenue: 2,
    activeMonthCount: 4,
    remainingMonthsForForecast: 36,
    last6CoefficientOfVariation: 1.6,
    lifecycle: "long_tail",
    rating: "D",
    revenueScale: "long_tail",
    riskCodes: ["inactive_tail"]
  });

  assert.ok(result.baseForecast <= 14);
  assert.notEqual(result.confidence, "high");
  assert.ok(result.intervalReason.some((reason) => reason.includes("long-tail")));
});
