import assert from "node:assert/strict";
import test from "node:test";

import { inferShelfStatus } from "../src/domain/oldProductEvaluation/shelfStatusInference.js";

test("expired rights with tail revenue follows trusted copyright ledger status", () => {
  const result = inferShelfStatus({
    currentRightsStatus: "expired",
    salesRevenue12m: 320,
    salesRevenueLast3m: 12
  });

  assert.equal(result.shelfStatus, "rights_expired_likely_off_shelf");
  assert.equal(result.shelfStatusConfidence, "high");
  assert.equal(result.doesNotRewriteHistoricalRating, true);
  assert.ok(result.shelfStatusReasonChinese.some((item) => item.includes("尾部收入")));
});

test("zero revenue alone does not infer off shelf", () => {
  const result = inferShelfStatus({
    currentRightsStatus: "unknown",
    salesRevenue12m: 0,
    monthsSinceLatestIncome: 2
  });

  assert.equal(result.shelfStatus, "unknown_shelf_status");
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
