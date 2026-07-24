import assert from "node:assert/strict";
import test from "node:test";

import { buildFrontRatingDisplay } from "../src/domain/oldProductEvaluation/ratingCalibration.js";

test("front display exposes one rating plus status and explanation", () => {
  const result = buildFrontRatingDisplay({
    revenueModel: "pure_sales_share",
    salesRevenue12m: 120000,
    shelfStatus: "active_on_shelf",
    shelfStatusChinese: "仍在架或可运营",
    currentRightsStatus: "active",
    forecastValueRating: "S"
  });

  assert.equal(result.rating, "S");
  assert.equal(result.ratingBasis, "current_sales");
  assert.equal(result.shelfStatus, "仍在架或可运营");
  assert.ok(result.ratingExplanation.includes("评级=S"));
  assert.deepEqual(Object.keys(result.hiddenAuxiliaryRatings).sort(), [
    "buyoutHistoricalValueRating",
    "forecastValueRating",
    "historicalPerformanceRating",
    "salesPerformanceRating"
  ].sort());
});

test("expired high historical value is not displayed as E", () => {
  const result = buildFrontRatingDisplay({
    revenueBucket: "top",
    lifecycle: "stable",
    revenueModel: "pure_sales_share",
    salesRevenue12m: 20000,
    shelfStatus: "rights_expired_likely_off_shelf",
    shelfStatusChinese: "版权到期，大概率下架",
    currentRightsStatus: "expired"
  });

  assert.notEqual(result.rating, "E");
  assert.equal(result.ratingBasis, "historical");
});

test("pure buyout uses buyout amount even when recent sales are zero", () => {
  const result = buildFrontRatingDisplay({
    revenueModel: "pure_buyout",
    salesRevenue12m: 0,
    buyoutEstimatedAmount: 80000,
    shelfStatus: "unknown_shelf_status",
    currentRightsStatus: "active"
  });

  assert.equal(result.rating, "B");
  assert.equal(result.ratingBasis, "buyout_monthly_sales_equivalent");
  assert.ok(result.ratingExplanation.includes("buyoutEquivalentMonthlySales="));
  assert.ok(result.ratingExplanation.includes("评级是否含买断：是"));
});

test("buyout plus sales shows one combined front rating", () => {
  const result = buildFrontRatingDisplay({
    revenueModel: "buyout_plus_sales",
    salesRevenue12m: 1200,
    buyoutEstimatedAmount: 600000,
    shelfStatus: "active_on_shelf",
    currentRightsStatus: "active"
  });

  assert.equal(result.rating, "S");
  assert.equal(result.ratingBasis, "current_sales_with_buyout_allocation");
  assert.equal(result.ratingIncludesBuyout, true);
});

test("buyout plus sales current rating adds current cycle buyout allocation", () => {
  const result = buildFrontRatingDisplay({
    revenueModel: "buyout_plus_sales",
    salesRevenue12m: 12000,
    buyoutEstimatedAmount: 90000,
    shelfStatus: "active_on_shelf",
    currentRightsStatus: "active"
  });

  assert.equal(result.rating, "B");
  assert.equal(result.ratingBasis, "current_sales_with_buyout_allocation");
  assert.equal(
    result.nextCycleForecastPolicy,
    "mixed_forecast_sales_share_cash_only",
  );
  assert.equal(result.buyoutMonthlyEquivalent, 2500);
  assert.deepEqual(result.buyoutMonthlyEquivalentBoundary, {
    ratingContextOnly: true,
    historicalValueOnly: true,
    notCashForecast: true,
    notIncludedInFutureCashRevenue: true,
  });
  for (const boundaryField of Object.keys(result.buyoutMonthlyEquivalentBoundary)) {
    assert.equal(boundaryField in result, false);
  }
});

test("forecast does not override current sales rating", () => {
  const result = buildFrontRatingDisplay({
    revenueModel: "pure_sales_share",
    salesRevenue12m: 600,
    shelfStatus: "active_on_shelf",
    currentRightsStatus: "active",
    forecastabilityStatus: "numeric_forecast_eligible",
    revenueBucket: "top"
  });

  assert.equal(result.rating, "E");
  assert.equal(result.ratingBasis, "current_sales");
});
