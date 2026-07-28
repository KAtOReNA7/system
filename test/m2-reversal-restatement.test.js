import test from "node:test";
import assert from "node:assert/strict";
import {
  buildReversalScopeKeyV1,
  buildReversalTimeViewsV1,
  restateSalesShareReversalsV1
} from "../src/domain/m2Current/reversalRestatement.js";

function scope(overrides = {}) {
  return buildReversalScopeKeyV1({
    cashCategory: "sales_share",
    standardWorkId: "WORK-1",
    channelMemberId: "CHANNEL-1",
    currencyScope: "AUTHORITY-CURRENCY-1",
    ...overrides
  });
}

function positive(recordId, postingMonth, amountMinor, overrides = {}) {
  return {
    recordId,
    reversalScopeKey: scope(),
    postingMonth,
    recordedAt: `${postingMonth}-15`,
    eventType: "positive_sales_share",
    amountMinor: String(amountMinor),
    ...overrides
  };
}

function reversal(recordId, postingMonth, amountMinor, overrides = {}) {
  return {
    recordId,
    reversalScopeKey: scope(),
    postingMonth,
    recordedAt: `${postingMonth}-20`,
    eventType: "reversal",
    amountMinor: String(-Math.abs(amountMinor)),
    ...overrides
  };
}

function balance(result, month, scopeIndex = 0) {
  return result.scopes[scopeIndex].restatedBalances.find(
    (row) => row.month === month
  )?.amountMinor ?? "0";
}

test("reversal restatement absorbs same-month reversals with integer conservation", () => {
  const result = restateSalesShareReversalsV1([
    positive("P1", "2024-03", 100),
    reversal("R1", "2024-03", 30)
  ]);
  assert.equal(result.status, "COMPLETE");
  assert.equal(balance(result, "2024-03"), "70");
  assert.equal(result.tracedOffsetMinor, "30");
  assert.equal(result.unresolvedReversalResidualMinor, "0");
  assert.equal(result.conservationDifferenceMinor, "0");
  assert.deepEqual(result.traceDepthDistribution, {
    "0": 1,
    "1": 0,
    "2": 0,
    "3": 0,
    more: 0
  });
});

test("reversal restatement implements the four backward-allocation examples", () => {
  const base = [
    positive("P1", "2024-01", 100),
    positive("P2", "2024-02", 80),
    positive("P3", "2024-03", 50)
  ];
  const example1 = restateSalesShareReversalsV1([
    ...base,
    reversal("R1", "2024-03", 120)
  ]);
  assert.deepEqual(
    ["2024-01", "2024-02", "2024-03"].map((month) =>
      balance(example1, month)
    ),
    ["100", "10", "0"]
  );
  const example2 = restateSalesShareReversalsV1([
    ...base,
    reversal("R1", "2024-03", 130)
  ]);
  assert.deepEqual(
    ["2024-01", "2024-02", "2024-03"].map((month) =>
      balance(example2, month)
    ),
    ["100", "0", "0"]
  );
  const example3 = restateSalesShareReversalsV1([
    ...base,
    reversal("R1", "2024-03", 170)
  ]);
  assert.deepEqual(
    ["2024-01", "2024-02", "2024-03"].map((month) =>
      balance(example3, month)
    ),
    ["60", "0", "0"]
  );
  const example4 = restateSalesShareReversalsV1([
    positive("P1", "2024-01", 100),
    positive("P3", "2024-03", 20),
    reversal("R1", "2024-03", 150)
  ], { authorityStartMonth: "2024-01" });
  assert.equal(example4.status, "BLOCKED_UNRESOLVED_REVERSAL");
  assert.equal(example4.unresolvedReversalResidualMinor, "-30");
  assert.equal(example4.restatedRevenueMinor, "0");
  assert.equal(example4.conservationDifferenceMinor, "0");
  assert.ok(example4.scopes[0].allocations.some((row) =>
    row.revenueRecognitionMonth === "2024-02"
    && row.consumedAmountMinor === "0"
  ));
});

test("multiple postings and reversals are stable and never reuse consumed balances", () => {
  const rows = [
    positive("P2", "2024-01", 40),
    positive("P1", "2024-01", 60),
    reversal("R2", "2024-03", 50),
    reversal("R1", "2024-02", 80)
  ];
  const first = restateSalesShareReversalsV1(rows, {
    authorityStartMonth: "2024-01"
  });
  const second = restateSalesShareReversalsV1([...rows].reverse(), {
    authorityStartMonth: "2024-01"
  });
  assert.deepEqual(first, second);
  assert.equal(balance(first, "2024-01"), "0");
  assert.equal(first.unresolvedReversalResidualMinor, "-30");
  assert.equal(first.scopes[0].residuals[0].reversalRecordId, "R1");
  assert.equal(first.scopes[0].residuals[1].reversalRecordId, "R2");
  assert.equal(first.conservationDifferenceMinor, "0");
});

test("reversal scopes never cross work, channel, currency, or cash category", () => {
  const work2 = scope({ standardWorkId: "WORK-2" });
  const channel2 = scope({ channelMemberId: "CHANNEL-2" });
  const currency2 = scope({ currencyScope: "AUTHORITY-CURRENCY-2" });
  const result = restateSalesShareReversalsV1([
    positive("P-W1", "2024-01", 100),
    positive("P-W2", "2024-01", 100, { reversalScopeKey: work2 }),
    positive("P-C2", "2024-01", 100, { reversalScopeKey: channel2 }),
    positive("P-U2", "2024-01", 100, { reversalScopeKey: currency2 }),
    reversal("R-W1", "2024-02", 130)
  ], { authorityStartMonth: "2024-01" });
  assert.equal(result.scopeCount, 4);
  assert.equal(result.unresolvedReversalResidualMinor, "-30");
  assert.equal(
    result.scopes.filter((item) => item.standardWorkId === "WORK-2")[0]
      .restatedRevenueMinor,
    "100"
  );
  assert.throws(
    () => buildReversalScopeKeyV1({
      cashCategory: "buyout",
      standardWorkId: "WORK-1",
      channelMemberId: "CHANNEL-1",
      currencyScope: "AUTHORITY-CURRENCY-1"
    }),
    /sales_share_scope_required/
  );
});

test("negative non-reversal events do not enter reversal allocations", () => {
  const result = restateSalesShareReversalsV1([
    positive("P1", "2024-01", 100),
    {
      ...reversal("N1", "2024-02", 20),
      eventType: "negative_non_reversal"
    }
  ]);
  assert.equal(result.status, "BLOCKED_REVERSAL_CLASSIFICATION");
  assert.equal(result.scopes[0].allocations.length, 0);
  assert.equal(result.scopes[0].unclassifiedNegativeCount, 1);
  assert.equal(balance(result, "2024-01"), "100");
});

test("posting, as-of, and final views exclude future reversals from origin history", () => {
  const rows = [
    positive("P1", "2024-01", 100),
    reversal("R1", "2024-03", 80)
  ];
  const views = buildReversalTimeViewsV1(rows, {
    originCutoff: "2024-02",
    labelMaturityCutoff: "2024-03",
    authorityStartMonth: "2024-01"
  });
  assert.equal(views.status, "THREE_VIEWS_COMPLETE");
  assert.equal(
    views.restatedActualAsOf.futureExcludedCount,
    1
  );
  assert.equal(
    balance(views.restatedActualAsOf, "2024-01"),
    "100"
  );
  assert.equal(
    balance(views.finalRestatedActual, "2024-01"),
    "20"
  );
  assert.equal(
    views.futureLeakageCheck.originAfterCutoffRowsUsed,
    0
  );
  const maturityBlocked = buildReversalTimeViewsV1([
    ...rows,
    reversal("R2", "2024-04", 5)
  ], {
    originCutoff: "2024-02",
    labelMaturityCutoff: "2024-03",
    authorityStartMonth: "2024-01"
  });
  assert.equal(
    maturityBlocked.finalRestatedActual.futureExcludedCount,
    1
  );
});

test("recordedAt and integer minor-unit safety fail closed", () => {
  const missingRecordedAt = restateSalesShareReversalsV1([
    { ...positive("P1", "2024-01", 100), recordedAt: null }
  ]);
  assert.equal(missingRecordedAt.status, "BLOCKED_RECORDED_AT_MISSING");
  assert.throws(
    () => restateSalesShareReversalsV1([
      { ...positive("P1", "2024-01", 100), amountMinor: 1.25 }
    ]),
    /minor_unit_integer_required/
  );
});
