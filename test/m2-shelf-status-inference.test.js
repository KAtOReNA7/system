import assert from "node:assert/strict";
import test from "node:test";

import { calibrateRating } from "../src/domain/oldProductEvaluation/ratingCalibration.js";
import { classifyRevenueModel } from "../src/domain/oldProductEvaluation/revenueModelClassifier.js";
import {
  inferShelfStatus,
  SHELF_REVIEW_PROMPTS
} from "../src/domain/oldProductEvaluation/shelfStatusInference.js";

test("expired rights with tail revenue follows trusted copyright ledger status", () => {
  const result = inferShelfStatus({
    currentRightsStatus: "expired",
    salesRevenue12m: 320,
    salesRevenueLast3m: 12
  });

  assert.equal(result.shelfStatus, "rights_expired_likely_off_shelf");
  assert.equal(result.shelfStatusConfidence, "high");
  assert.deepEqual(result.shelfStatusReviewPrompts, [SHELF_REVIEW_PROMPTS.EXPIRED_WITH_TAIL_REVENUE]);
  assert.equal(result.requiresShelfStatusReview, true);
  assert.equal(result.doesNotRewriteHistoricalRating, true);
  assert.ok(result.shelfStatusReasonChinese.some((item) => item.includes("尾部收入")));
});

test("active rights with sparse or stale revenue enters review bucket instead of unknown", () => {
  const result = inferShelfStatus({
    currentRightsStatus: "active",
    salesRevenue12m: 860,
    salesRevenueLast6m: 0,
    recentPositiveMonthCount: 1,
    monthsSinceLatestIncome: 9,
    remainingCopyrightMonths: 18
  });

  assert.equal(result.shelfStatus, "active_rights_sparse_revenue_review");
  assert.equal(result.shelfStatusConfidence, "medium");
  assert.deepEqual(result.shelfStatusReviewPrompts, [SHELF_REVIEW_PROMPTS.ACTIVE_RIGHTS_SPARSE_REVENUE]);
  assert.equal(result.requiresShelfStatusReview, true);
  assert.equal(result.doesNotRewriteHistoricalRating, true);
});

test("zero revenue alone does not infer off shelf", () => {
  const result = inferShelfStatus({
    currentRightsStatus: "unknown",
    salesRevenue12m: 0,
    monthsSinceLatestIncome: 2
  });

  assert.equal(result.shelfStatus, "unknown_shelf_status");
});

test("no explicit shelf or work status does not fabricate confident on-shelf status", () => {
  const result = inferShelfStatus({
    currentRightsStatus: "active",
    salesRevenue12m: 0,
    remainingCopyrightMonths: 30
  });

  assert.equal(result.shelfStatus, "active_or_available_inferred");
  assert.notEqual(result.shelfStatus, "active_on_shelf_confident");
  assert.equal(result.shelfStatusConfidence, "medium");
});

test("active rights with continuing sales infers active on shelf", () => {
  const result = inferShelfStatus({
    currentRightsStatus: "active",
    salesRevenueLast6m: 1800,
    recentPositiveMonthCount: 4,
    remainingCopyrightMonths: 24
  });

  assert.equal(result.shelfStatus, "active_or_available_inferred");
  assert.equal(result.shelfStatusConfidence, "medium");
});

test("buyout without ongoing sales is not treated as off shelf when rights are active", () => {
  const result = inferShelfStatus({
    currentRightsStatus: "active",
    revenueModel: "pure_buyout",
    salesRevenue12m: 0
  });

  assert.equal(result.shelfStatus, "active_or_available_inferred");
  assert.equal(result.shelfStatusConfidence, "medium");
});

test("expired rights without tail revenue follows trusted copyright ledger status", () => {
  const result = inferShelfStatus({
    currentRightsStatus: "expired",
    salesRevenue12m: 0,
    salesRevenueLast3m: 0
  });

  assert.equal(result.shelfStatus, "rights_expired_likely_off_shelf");
  assert.equal(result.shelfStatusConfidence, "high");
});

test("explicit on shelf with active rights is high confidence", () => {
  const result = inferShelfStatus({
    currentRightsStatus: "active",
    explicitShelfStatus: "active_on_shelf",
    salesRevenue12m: 0
  });

  assert.equal(result.shelfStatus, "active_on_shelf_confident");
  assert.equal(result.shelfStatusConfidence, "high");
});

test("shelf review bucket does not change revenue classifier or rating modules", () => {
  const revenue = classifyRevenueModel({
    monthlyAmounts: [120, 140, 135, 160, 150, 170],
    observableMonthCount: 6
  });

  assert.equal(revenue.revenueModel, "pure_sales_share");

  const rating = calibrateRating({
    currentRightsStatus: "active",
    revenueModel: "pure_sales_share",
    shelfStatus: "active_rights_sparse_revenue_review",
    salesRevenue12m: 12000,
    revenueBucket: "medium",
    lifecycle: "stable",
    forecastabilityStatus: "conservative_numeric_forecast",
    forecastConfidence: "medium"
  });

  assert.ok(["S+", "S", "A", "B", "C", "D", "E"].includes(rating.rating));
  assert.equal(rating.doesNotRewriteHistoricalRating, undefined);
  assert.equal(rating.currentRightsStatus, "active");
});
