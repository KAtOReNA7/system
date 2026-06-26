import assert from "node:assert/strict";
import test from "node:test";

import { calibrateSuggestion } from "../src/domain/oldProductEvaluation/suggestionCalibration.js";

test("expired high historical value routes to renewal review and rights audit", () => {
  const result = calibrateSuggestion({
    rating: "A",
    lifecycle: "stable",
    revenueBucket: "top",
    forecastabilityStatus: "numeric_forecast_eligible",
    forecastConfidence: "medium",
    businessActionStatus: "action_allowed",
    currentRightsStatus: "expired",
    commercialModel: "royalty"
  });

  assert.equal(result.suggestionType, "renewal_review");
  assert.equal(result.actionabilityLevel, "需人工确认");
  assert.ok(result.rightsImpact.includes("版权已到期"));
});

test("buyout active stable work can maintain without ordinary renewal template", () => {
  const result = calibrateSuggestion({
    rating: "A",
    lifecycle: "stable",
    revenueBucket: "top",
    forecastabilityStatus: "numeric_forecast_eligible",
    forecastConfidence: "medium",
    businessActionStatus: "action_allowed",
    currentRightsStatus: "active",
    commercialModel: "buyout"
  });

  assert.equal(result.suggestionType, "maintain");
  assert.ok(result.commercialTermsImpact.includes("买断"));
  assert.notEqual(result.suggestionType, "renewal_review");
});

test("unknown commercial terms do not emit strong automatic suggestions", () => {
  const result = calibrateSuggestion({
    rating: "A",
    lifecycle: "growth",
    revenueBucket: "top",
    forecastabilityStatus: "numeric_forecast_eligible",
    forecastConfidence: "medium",
    businessActionStatus: "action_allowed",
    currentRightsStatus: "active",
    commercialModel: "unknown"
  });

  assert.equal(result.suggestionType, "manual_review_required");
  assert.equal(result.actionabilityLevel, "不建议自动动作");
  assert.equal(result.operatingSuggestion, null);
  assert.ok(result.reviewPrompt);
  assert.ok(result.noAutomaticSuggestionReason);
  assert.ok(result.evidenceSignals.length > 0);
});

test("commercial conflict is a review prompt, not an operating suggestion", () => {
  const result = calibrateSuggestion({
    rating: "A",
    lifecycle: "growth",
    revenueBucket: "top",
    forecastabilityStatus: "numeric_forecast_eligible",
    forecastConfidence: "medium",
    businessActionStatus: "action_allowed",
    currentRightsStatus: "active",
    commercialModel: "conflict",
    requiresManualCommercialReview: true
  });

  assert.equal(result.suggestionType, "manual_review_required");
  assert.equal(result.operatingSuggestion, null);
  assert.ok(result.reviewPrompt);
});

test("downlist does not harm high revenue stable buyout works", () => {
  const result = calibrateSuggestion({
    rating: "A",
    lifecycle: "stable",
    revenueBucket: "top",
    forecastabilityStatus: "numeric_forecast_eligible",
    forecastConfidence: "medium",
    businessActionStatus: "action_allowed",
    currentRightsStatus: "active",
    commercialModel: "buyout"
  });

  assert.notEqual(result.suggestionType, "downlist_or_suspend");
  assert.ok(result.evidenceSignals.length > 0);
});
