import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateWorkRevenueModel,
  classifyChannelRevenueModel,
  classifyRevenueModel
} from "../src/domain/oldProductEvaluation/revenueModelClassifier.js";

test("continuous naturally varying income classifies as pure sales share", () => {
  const result = classifyRevenueModel({
    monthlyAmounts: [120, 135, 98, 160, 142, 151, 130, 175, 155, 149, 168, 172],
    observableMonthCount: 12
  });

  assert.equal(result.revenueModel, "pure_sales_share");
  assert.ok(result.salesContinuityScore > result.buyoutSignalScore);
});

test("few-month round concentrated income classifies as pure buyout", () => {
  const result = classifyRevenueModel({
    monthlyAmounts: [0, 0, 50000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    observableMonthCount: 18
  });

  assert.equal(result.revenueModel, "pure_buyout");
  assert.ok(result.buyoutSignalScore >= 0.7);
  assert.ok(result.features.postLargePaymentNoSalesSignal);
});

test("launch spike followed by continuous revenue is treated as sales share", () => {
  const result = classifyRevenueModel({
    monthlyAmounts: [0, 80000, 0, 600, 720, 680, 700, 650, 690, 710, 640, 700],
    observableMonthCount: 12
  });

  assert.equal(result.revenueModel, "pure_sales_share");
  assert.equal(result.buyoutEstimatedAmount, 0);
  assert.ok(result.features.postLargePaymentPositiveMonthCount > 0);
});

test("same-month same-amount sibling signal contributes to buyout classification", () => {
  const result = classifyRevenueModel({
    monthlyAmounts: [0, 0, 3333.33, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    observableMonthCount: 18,
    sameAmountSiblingWorks: 4,
    repeatedAmountClusterCount: 1
  });

  assert.equal(result.revenueModel, "pure_buyout");
  assert.ok(result.equalSplitSignalScore > 0);
  assert.ok(result.features.postLargePaymentNoSalesSignal);
});

test("single valid non-buyout income is retained as sales share", () => {
  const result = classifyRevenueModel({
    monthlyAmounts: [0, 43912.12, 0, 0, 0, 0],
    observableMonthCount: 6
  });

  assert.equal(result.revenueModel, "pure_sales_share");
  assert.equal(result.buyoutEstimatedAmount, 0);
  assert.equal(result.salesTailEstimatedAmount, 43912.12);
  assert.equal(result.manualReviewRequired, false);
});

test("per-channel continuous non-standard amounts classify as sales share channel", () => {
  const result = classifyChannelRevenueModel({
    monthlyAmounts: [101.23, 98.72, 112.44, 95.81, 121.32, 118.93],
    observableMonthCount: 6
  });

  assert.equal(result.channelRevenueModel, "sales_share_channel");
  assert.ok(result.salesSignalScore > result.buyoutSignalScore);
});

test("per-channel single large round amount classifies as buyout channel", () => {
  const result = classifyChannelRevenueModel({
    monthlyAmounts: [0, 0, 50000, 0, 0, 0],
    observableMonthCount: 6
  });

  assert.equal(result.channelRevenueModel, "buyout_channel");
  assert.ok(result.buyoutSignalScore > 0);
  assert.equal(result.features.postLargePaymentNoSalesSignal, false);
});

test("per-channel single valid non-buyout amount classifies as sales share sample", () => {
  const result = classifyChannelRevenueModel({
    monthlyAmounts: [0, 0, 43912.12, 0, 0, 0],
    observableMonthCount: 6
  });

  assert.equal(result.channelRevenueModel, "sales_share_channel");
  assert.equal(result.features.positiveIncomeTotal, 43912.12);
});

test("same-batch same-amount signal alone is enough to classify buyout", () => {
  const result = classifyChannelRevenueModel({
    monthlyAmounts: [80000, 8000, 7500, 9000, 8500, 8200],
    observableMonthCount: 6,
    sameMonthSameAmountClusterSize: 4,
    adjacentRowsSameAmountSignal: true
  });

  assert.equal(result.channelRevenueModel, "buyout_channel");
  assert.ok(result.features.naturalSalesSequenceSignal);
});

test("work with one buyout channel and one sales channel aggregates to buyout plus sales", () => {
  const buyout = classifyChannelRevenueModel({
    monthlyAmounts: [0, 50000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    observableMonthCount: 18,
    sameMonthSameAmountClusterSize: 4
  });
  const sales = classifyChannelRevenueModel({
    monthlyAmounts: [80.12, 91.34, 88.42, 94.21, 87.11, 96.5],
    observableMonthCount: 6
  });
  const result = aggregateWorkRevenueModel([
    { ...buyout, positiveIncomeTotal: 50000, largestMonthIncome: 50000 },
    { ...sales, positiveIncomeTotal: 537.7, largestMonthIncome: 96.5 }
  ]);

  assert.equal(result.revenueModel, "buyout_plus_sales");
  assert.equal(result.channelModelSummary.buyout_channel, 1);
  assert.equal(result.channelModelSummary.sales_share_channel, 1);
  assert.ok(result.buyoutEstimatedAmount > 0);
  assert.ok(result.salesTailEstimatedAmount > 0);
});
