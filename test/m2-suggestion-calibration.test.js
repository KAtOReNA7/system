import assert from "node:assert/strict";
import test from "node:test";

import { calibrateSuggestion } from "../src/domain/oldProductEvaluation/suggestionCalibration.js";

test("downlist does not misfire on high revenue stable works", () => {
  const result = calibrateSuggestion({
    rating: "A",
    lifecycle: "stable",
    revenueBucket: "top",
    forecastabilityStatus: "numeric_forecast_eligible",
    forecastConfidence: "medium",
    businessActionStatus: "action_allowed",
    currentRightsStatus: "active",
    commercialModel: "royalty"
  });

  assert.notEqual(result.suggestion, "downlist_or_suspend");
  assert.equal(result.suggestion, "maintain");
});

test("renewal review requires copyright horizon and revenue value support", () => {
  const supported = calibrateSuggestion({
    rating: "A",
    lifecycle: "stable",
    revenueBucket: "top",
    forecastabilityStatus: "numeric_forecast_eligible",
    forecastConfidence: "medium",
    businessActionStatus: "action_allowed",
    currentRightsStatus: "active",
    commercialModel: "royalty",
    forecastOutputType: "copyright_term_forecast",
    remainingCopyrightMonths: 8
  });
  const unsupported = calibrateSuggestion({
    rating: "A",
    lifecycle: "stable",
    revenueBucket: "top",
    forecastabilityStatus: "numeric_forecast_eligible",
    forecastConfidence: "medium",
    businessActionStatus: "action_allowed",
    currentRightsStatus: "active",
    commercialModel: "royalty",
    forecastOutputType: "operating_window_forecast_pending_expiry"
  });

  assert.equal(supported.suggestion, "renewal_review");
  assert.notEqual(unsupported.suggestion, "renewal_review");
});

test("promote requires growth or rebound, high rating, confidence, rights, and commercial terms", () => {
  const result = calibrateSuggestion({
    rating: "A",
    lifecycle: "growth",
    revenueBucket: "top",
    forecastabilityStatus: "numeric_forecast_eligible",
    forecastConfidence: "medium",
    businessActionStatus: "action_allowed",
    currentRightsStatus: "active",
    commercialModel: "royalty"
  });
  const blocked = calibrateSuggestion({
    rating: "A",
    lifecycle: "growth",
    revenueBucket: "top",
    forecastabilityStatus: "true_forecast_blocked",
    forecastConfidence: "medium",
    businessActionStatus: "action_blocked",
    currentRightsStatus: "active",
    commercialModel: "royalty"
  });

  assert.equal(result.suggestion, "promote");
  assert.equal(blocked.suggestion, "manual_review_required");
});

test("observe-only/manual-review is used for non-predictable or uncertain states", () => {
  const observe = calibrateSuggestion({
    rating: "C",
    lifecycle: "declining",
    revenueBucket: "top",
    forecastabilityStatus: "observe_only_no_numeric_forecast",
    businessActionStatus: "observe_only",
    currentRightsStatus: "active",
    commercialModel: "royalty"
  });
  const blocked = calibrateSuggestion({
    rating: "C",
    lifecycle: "inactive",
    revenueBucket: "top",
    forecastabilityStatus: "true_forecast_blocked",
    businessActionStatus: "action_blocked",
    currentRightsStatus: "active",
    commercialModel: "royalty"
  });

  assert.equal(observe.suggestion, "manual_review_required");
  assert.equal(blocked.suggestion, "manual_review_required");
  assert.ok(blocked.evidenceSignals.some((item) => item.includes("阻断")));
});
