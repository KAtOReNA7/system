import assert from "node:assert/strict";
import test from "node:test";

import { calibrateSuggestion } from "../src/domain/oldProductEvaluation/suggestionCalibration.js";

test("operating suggestion main output is removed for M2 front display", () => {
  const result = calibrateSuggestion({
    rating: "S",
    salesPerformanceRating: "S",
    lifecycle: "growth",
    revenueModel: "pure_sales_share",
    forecastabilityStatus: "numeric_forecast_eligible",
    forecastConfidence: "high",
    businessActionStatus: "action_allowed",
    currentRightsStatus: "active",
    shelfStatus: "active_on_shelf",
    salesRevenue12m: 20000
  });

  assert.equal(result.operatingSuggestion, null);
  assert.equal(result.automaticSuggestionDeleted, true);
  assert.equal(result.frontSuggestionVisible, false);
  assert.equal(result.hiddenInternalSuggestionType, "promote");
});

test("risk and review prompt is still emitted", () => {
  const result = calibrateSuggestion({
    rating: "A",
    lifecycle: "stable",
    revenueModel: "pure_sales_share",
    forecastabilityStatus: "numeric_forecast_eligible",
    currentRightsStatus: "expired",
    shelfStatus: "rights_expired_likely_off_shelf"
  });

  assert.ok(result.riskAndReviewPrompt);
  assert.ok(result.reviewPrompt);
});

test("no automatic suggestion reason is always emitted", () => {
  const result = calibrateSuggestion({
    rating: "B",
    lifecycle: "stable",
    revenueModel: "pure_sales_share",
    forecastabilityStatus: "numeric_forecast_eligible",
    currentRightsStatus: "active",
    shelfStatus: "active_on_shelf"
  });

  assert.equal(result.operatingSuggestion, null);
  assert.ok(result.noAutomaticSuggestionReason.includes("M2"));
});

test("M4 calibration candidate reason is emitted", () => {
  const result = calibrateSuggestion({
    rating: "A",
    lifecycle: "growth",
    revenueModel: "unknown_revenue_model",
    forecastabilityStatus: "numeric_forecast_eligible",
    currentRightsStatus: "unknown"
  });

  assert.ok(result.m4CalibrationCandidateReason);
  assert.ok(result.m4CalibrationCandidateReason.includes("收入模式"));
});

test("Chinese boundary explanation is emitted", () => {
  const result = calibrateSuggestion({
    rating: "E",
    lifecycle: "inactive",
    revenueModel: "pure_sales_share",
    forecastabilityStatus: "conservative_numeric_forecast",
    currentRightsStatus: "active"
  });

  assert.ok(result.noAutomaticSuggestionReason.length > 10);
  assert.ok(result.riskAndReviewPrompt.length > 0);
});
