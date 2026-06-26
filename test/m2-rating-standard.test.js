import assert from "node:assert/strict";
import test from "node:test";

import {
  calibrateRating,
  ratingFromSalesAmount,
  RATING_STANDARD_DEFINITIONS
} from "../src/domain/oldProductEvaluation/ratingCalibration.js";

test("expired rights do not directly trigger historical E", () => {
  const result = calibrateRating({
    currentRating: "E",
    revenueBucket: "top",
    lifecycle: "stable",
    activeMonthCount: 30,
    revenueModel: "pure_sales_share",
    forecastabilityStatus: "numeric_forecast_eligible",
    forecastConfidence: "medium",
    remainingCopyrightMonths: -2
  });

  assert.equal(result.currentRightsStatus, "expired");
  assert.notEqual(result.historicalPerformanceRating, "E");
  assert.ok(result.displayRatingExplanationCn.includes("历史表现"));
  assert.ok(result.displayRatingExplanationCn.includes("当前权利"));
});

test("pure buyout is not automatically high rated without amount support", () => {
  const result = calibrateRating({
    revenueBucket: "low",
    lifecycle: "insufficient_history",
    activeMonthCount: 1,
    revenueModel: "pure_buyout",
    forecastabilityStatus: "observe_only_no_numeric_forecast",
    currentRightsStatus: "active"
  });

  assert.ok(["C", "D", "E"].includes(result.historicalPerformanceRating));
});

test("high continuous sales can receive high historical rating", () => {
  const result = calibrateRating({
    revenueBucket: "top",
    lifecycle: "stable",
    activeMonthCount: 36,
    revenueModel: "pure_sales_share",
    salesContinuityScore: 0.8,
    forecastabilityStatus: "numeric_forecast_eligible",
    forecastConfidence: "high",
    currentRightsStatus: "active"
  });

  assert.ok(["S+", "S", "A"].includes(result.historicalPerformanceRating));
});

test("rating standard definitions include all display ratings", () => {
  for (const rating of ["S+", "S", "A", "B", "C", "D", "E"]) {
    assert.equal(typeof RATING_STANDARD_DEFINITIONS[rating], "string");
    assert.ok(RATING_STANDARD_DEFINITIONS[rating].length > 10);
  }
});

test("user sales thresholds map to S plus S A B C D E", () => {
  assert.equal(ratingFromSalesAmount(120000), "S+");
  assert.equal(ratingFromSalesAmount(10000), "S");
  assert.equal(ratingFromSalesAmount(5000), "A");
  assert.equal(ratingFromSalesAmount(1000), "B");
  assert.equal(ratingFromSalesAmount(500), "C");
  assert.equal(ratingFromSalesAmount(100), "D");
  assert.equal(ratingFromSalesAmount(99), "E");
});

test("on-shelf work uses sales revenue rating and display includes shelf status", () => {
  const result = calibrateRating({
    revenueModel: "pure_sales_share",
    revenueModelChinese: "纯实销/纯分成",
    salesRevenue12m: 120000,
    shelfStatus: "active_on_shelf",
    shelfStatusChinese: "仍在架或可运营",
    currentRightsStatus: "active",
    forecastabilityStatus: "numeric_forecast_eligible",
    forecastConfidence: "medium",
    remainingCopyrightMonths: 36
  });

  assert.equal(result.salesPerformanceRating, "S+");
  assert.equal(result.historicalPerformanceRating, "S+");
  assert.ok(result.displayRatingExplanationCn.includes("实销评级：S+"));
  assert.ok(result.displayRatingExplanationCn.includes("下架状态"));
});

test("buyout value is displayed separately from sales rating", () => {
  const result = calibrateRating({
    revenueModel: "pure_buyout",
    revenueModelChinese: "纯买断",
    salesRevenue12m: 0,
    buyoutEstimatedAmount: 80000,
    shelfStatus: "unknown_shelf_status",
    currentRightsStatus: "active"
  });

  assert.equal(result.salesPerformanceRating, "E");
  assert.equal(result.buyoutHistoricalValueRating, "S");
  assert.equal(result.historicalPerformanceRating, "S");
});

test("off shelf does not directly rewrite historical rating to E", () => {
  const result = calibrateRating({
    revenueModel: "pure_sales_share",
    salesRevenue12m: 12000,
    shelfStatus: "likely_off_shelf",
    shelfStatusChinese: "大概率下架",
    currentRightsStatus: "active"
  });

  assert.equal(result.salesPerformanceRating, "S");
  assert.equal(result.historicalPerformanceRating, "S");
  assert.notEqual(result.historicalPerformanceRating, "E");
});
