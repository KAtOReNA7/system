import assert from "node:assert/strict";
import test from "node:test";
import { evaluateBusinessActionGate, BUSINESS_ACTION_STATUSES } from "../src/domain/oldProductEvaluation/businessActionGate.js";
import {
  classifyFormalReadiness,
  FORMAL_READINESS_STATUSES
} from "../src/domain/oldProductEvaluation/formalReadinessClassification.js";
import { evaluateForecastability, FORECASTABILITY_STATUSES } from "../src/domain/oldProductEvaluation/forecastabilityGate.js";

test("three gates disentangle forecastability from formal readiness", () => {
  const forecastability = evaluateForecastability({
    riskCodes: ["missing_copyright_end"],
    lifecycle: "stable",
    rating: "S",
    revenueScale: "top",
    activeMonthCount: 30,
    zeroRevenueMonthCount: 1,
    totalHistoricalRevenue: 300000,
    recentRevenue: 25000,
    volatility: 0.45,
    forecastFallbackUsed: true,
    materialityBucket: "top_5_percent"
  });
  const formal = classifyFormalReadiness({
    riskCodes: ["missing_copyright_end"],
    forecastFallbackUsed: true
  });

  assert.equal(forecastability.forecastabilityStatus, FORECASTABILITY_STATUSES.NUMERIC_FORECAST_ELIGIBLE);
  assert.equal(formal.formalReadinessStatus, FORMAL_READINESS_STATUSES.WAIVER_REQUIRED);
  assert.equal(formal.formalReadinessBlocksLocalForecast, false);
});

test("business action manual confirmation does not block numeric forecast", () => {
  const forecastability = evaluateForecastability({
    lifecycle: "growth",
    rating: "A",
    revenueScale: "high",
    activeMonthCount: 24,
    zeroRevenueMonthCount: 0,
    totalHistoricalRevenue: 50000,
    recentRevenue: 9000,
    volatility: 0.6,
    materialityBucket: "middle_40_percent"
  });
  const action = evaluateBusinessActionGate({
    forecastabilityStatus: forecastability.forecastabilityStatus,
    suggestionCodes: ["promote"]
  });

  assert.equal(forecastability.canUseNumericForecast, true);
  assert.equal(action.businessActionStatus, BUSINESS_ACTION_STATUSES.MANUAL_CONFIRMATION_REQUIRED);
  assert.equal(action.businessActionBlocksForecast, false);
});

test("true forecast blockers also block business actions", () => {
  const forecastability = evaluateForecastability({
    lifecycle: "insufficient_history",
    activeMonthCount: 2,
    totalHistoricalRevenue: 1000
  });
  const action = evaluateBusinessActionGate({
    forecastabilityStatus: forecastability.forecastabilityStatus,
    suggestionCodes: ["renewal_review"]
  });

  assert.equal(forecastability.forecastabilityStatus, FORECASTABILITY_STATUSES.TRUE_FORECAST_BLOCKED);
  assert.equal(action.businessActionStatus, BUSINESS_ACTION_STATUSES.ACTION_BLOCKED);
});

test("formal readiness mapping blockers are release-only for local validation", () => {
  const formal = classifyFormalReadiness({
    riskCodes: ["mapping_not_active"]
  });

  assert.equal(formal.formalReadinessStatus, FORMAL_READINESS_STATUSES.MAPPING_ACTIVATION_REQUIRED);
  assert.equal(formal.formalReadinessBlocksRelease, true);
  assert.equal(formal.formalReadinessBlocksLocalForecast, false);
});
