import assert from "node:assert/strict";
import test from "node:test";

import { calibrateRating } from "../src/domain/oldProductEvaluation/ratingCalibration.js";

test("expired rights do not force historical performance rating to E", () => {
  const result = calibrateRating({
    currentRating: "E",
    revenueBucket: "top",
    lifecycle: "stable",
    forecastabilityStatus: "numeric_forecast_eligible",
    forecastConfidence: "medium",
    businessActionStatus: "action_allowed",
    remainingCopyrightMonths: -3,
    commercialTerms: { commercialModel: "royalty" }
  });

  assert.equal(result.currentRightsStatus, "expired");
  assert.equal(result.historicalPerformanceRating, "A");
  assert.equal(result.operationalDecisionRating, "renewal_review_required");
  assert.notEqual(result.displayRatingCode, "E");
  assert.ok(result.displayRatingExplanationCn.includes("历史表现 A"));
  assert.ok(result.displayRatingExplanationCn.includes("商业模式"));
});

test("expired high historical value requires rights audit instead of low-value display", () => {
  const result = calibrateRating({
    revenueBucket: "high",
    lifecycle: "growth",
    remainingCopyrightMonths: -1,
    forecastabilityStatus: "conservative_numeric_forecast",
    forecastConfidence: "medium",
    commercialTerms: { commercialModel: "buyout" }
  });

  assert.equal(result.currentRightsStatus, "expired");
  assert.equal(result.requiresRightsAudit, true);
  assert.ok(["A", "B", "S"].includes(result.historicalPerformanceRating));
});
