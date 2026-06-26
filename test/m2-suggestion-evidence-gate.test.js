import assert from "node:assert/strict";
import test from "node:test";

import { calibrateSuggestion } from "../src/domain/oldProductEvaluation/suggestionCalibration.js";

test("no evidence produces no operating suggestion", () => {
  const result = calibrateSuggestion({
    rating: "A",
    lifecycle: "growth",
    revenueModel: "unknown_revenue_model",
    forecastabilityStatus: "numeric_forecast_eligible",
    currentRightsStatus: "active"
  });

  assert.equal(result.operatingSuggestion, null);
  assert.ok(result.reviewPrompt);
  assert.ok(result.noAutomaticSuggestionReason);
});

test("promote requires high value, reliable revenue model, forecast, and rights", () => {
  const result = calibrateSuggestion({
    rating: "A",
    lifecycle: "growth",
    revenueModel: "pure_sales_share",
    revenueModelChinese: "纯实销/纯分成",
    forecastabilityStatus: "numeric_forecast_eligible",
    forecastConfidence: "high",
    businessActionStatus: "action_allowed",
    currentRightsStatus: "active"
  });

  assert.equal(result.suggestionType, "promote");
  assert.equal(result.operatingSuggestion, null);
  assert.equal(result.frontSuggestionVisible, false);
  assert.ok(result.riskAndReviewPrompt);
  assert.ok(result.evidenceSignals.some((item) => item.includes("收入模式")));
});

test("downlist remains review prompt and requires strong evidence", () => {
  const result = calibrateSuggestion({
    rating: "E",
    lifecycle: "inactive",
    revenueModel: "pure_sales_share",
    forecastabilityStatus: "conservative_numeric_forecast",
    forecastConfidence: "low",
    businessActionStatus: "action_allowed",
    currentRightsStatus: "active"
  });

  assert.equal(result.suggestionType, "downlist_or_suspend");
  assert.equal(result.operatingSuggestion, null);
  assert.ok(result.reviewPrompt);
});

test("off shelf with tail revenue routes to rights audit", () => {
  const result = calibrateSuggestion({
    rating: "A",
    salesPerformanceRating: "A",
    lifecycle: "stable",
    revenueModel: "pure_sales_share",
    forecastabilityStatus: "numeric_forecast_eligible",
    forecastConfidence: "medium",
    businessActionStatus: "action_allowed",
    currentRightsStatus: "active",
    shelfStatus: "off_shelf_but_tail_revenue"
  });

  assert.equal(result.suggestionType, "rights_audit");
  assert.equal(result.operatingSuggestion, null);
  assert.ok(result.reviewPrompt);
  assert.ok(result.suggestionEvidenceChinese.length > 0);
});

test("active on shelf S sales performance can promote with evidence", () => {
  const result = calibrateSuggestion({
    rating: "A",
    salesPerformanceRating: "S",
    lifecycle: "growth",
    revenueModel: "buyout_plus_sales",
    forecastabilityStatus: "numeric_forecast_eligible",
    forecastConfidence: "medium",
    businessActionStatus: "action_allowed",
    currentRightsStatus: "active",
    shelfStatus: "active_on_shelf",
    salesRevenue12m: 20000
  });

  assert.equal(result.suggestionType, "promote");
  assert.equal(result.operatingSuggestion, null);
  assert.equal(result.automaticSuggestionDeleted, true);
  assert.ok(result.noAutomaticSuggestionReason);
  assert.ok(result.evidenceSignals.length > 0);
});
