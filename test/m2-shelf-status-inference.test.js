import assert from "node:assert/strict";
import test from "node:test";

import { inferShelfStatus } from "../src/domain/oldProductEvaluation/shelfStatusInference.js";

test("expired rights with tail revenue infers off shelf but tail revenue", () => {
  const result = inferShelfStatus({
    currentRightsStatus: "expired",
    salesRevenue12m: 320,
    salesRevenueLast3m: 12
  });

  assert.equal(result.shelfStatus, "off_shelf_but_tail_revenue");
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

test("active rights with continuing sales infers active on shelf", () => {
  const result = inferShelfStatus({
    currentRightsStatus: "active",
    salesRevenueLast6m: 1800,
    recentPositiveMonthCount: 4,
    remainingCopyrightMonths: 24
  });

  assert.equal(result.shelfStatus, "active_on_shelf");
});

test("buyout without ongoing sales is not treated as off shelf by itself", () => {
  const result = inferShelfStatus({
    currentRightsStatus: "active",
    revenueModel: "pure_buyout",
    salesRevenue12m: 0
  });

  assert.equal(result.shelfStatus, "unknown_shelf_status");
});
