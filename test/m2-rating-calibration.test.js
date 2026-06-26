import assert from "node:assert/strict";
import test from "node:test";

import { calibrateRating } from "../src/domain/oldProductEvaluation/ratingCalibration.js";

test("low confidence cannot receive S or S+ even for top revenue", () => {
  const result = calibrateRating({
    currentRating: "B",
    revenueBucket: "top",
    lifecycle: "growth",
    forecastabilityStatus: "numeric_forecast_eligible",
    forecastConfidence: "low",
    businessActionStatus: "action_allowed",
    remainingCopyrightMonths: 48
  });

  assert.notEqual(result.rating, "S+");
  assert.notEqual(result.rating, "S");
  assert.ok(result.forecastValueRationaleCn.some((item) => item.includes("预测置信度")));
});

test("true forecast blocked keeps non-high display rating and no forecast value rating", () => {
  const result = calibrateRating({
    currentRating: "E",
    revenueBucket: "top",
    lifecycle: "inactive",
    forecastabilityStatus: "true_forecast_blocked",
    forecastConfidence: "blocked_for_business_use",
    businessActionStatus: "action_blocked"
  });

  assert.equal(result.rating, "C");
  assert.equal(result.forecastValueRating, "not_applicable");
});

test("high revenue stable work can move to high historical rating with rationale", () => {
  const result = calibrateRating({
    currentRating: "B",
    revenueBucket: "top",
    lifecycle: "stable",
    forecastabilityStatus: "numeric_forecast_eligible",
    forecastConfidence: "medium",
    businessActionStatus: "action_allowed",
    remainingCopyrightMonths: 60
  });

  assert.equal(result.rating, "A");
  assert.equal(result.changed, true);
  assert.ok(result.historicalPerformanceRationaleCn.some((item) => item.includes("历史表现评级")));
});

test("missing copyright end is a readiness warning, not an automatic value downgrade", () => {
  const result = calibrateRating({
    currentRating: "B",
    revenueBucket: "top",
    lifecycle: "stable",
    forecastabilityStatus: "conservative_numeric_forecast",
    forecastConfidence: "medium",
    businessActionStatus: "action_allowed",
    riskCodes: ["missing_copyright_end"]
  });

  assert.equal(result.rating, "A");
  assert.ok(result.warnings.some((item) => item.includes("缺版权到期")));
});
