import assert from "node:assert/strict";
import test from "node:test";

import {
  applyM2CurrentChannelMaster,
  buildM2CurrentChannelUid,
  validateM2CurrentChannelMaster
} from "../src/domain/m2Current/channelMaster.js";
import {
  buildM2CurrentCanonicalChannelChallenger,
  forecastM2CurrentCanonicalChannelCase
} from "../src/domain/m2Current/canonicalChannelModel.js";

const masterRows = [
  {
    rawChannelId: "001",
    rawChannelName: "平台甲旧名",
    canonicalChannelName: "平台甲",
    channelRole: "terminal_sales_platform",
    revenueMode: "membership_subscription",
    contentForm: "audio",
    auditStatus: "confirmed"
  },
  {
    rawChannelId: "002",
    rawChannelName: "平台甲新名",
    canonicalChannelName: "平台甲",
    channelRole: "terminal_sales_platform",
    revenueMode: "membership_subscription",
    contentForm: "audio",
    auditStatus: "confirmed"
  }
];

test("channel master generates stable invisible UIDs and conserves facts", () => {
  const master = validateM2CurrentChannelMaster(masterRows);
  assert.equal(master.rawPairCount, 2);
  assert.equal(master.canonicalChannelCount, 1);
  assert.equal(
    master.rows[0].channelUid,
    buildM2CurrentChannelUid("平台甲")
  );
  const applied = applyM2CurrentChannelMaster([
    {
      rawChannelId: "001.0",
      rawChannelName: "平台甲旧名",
      amount: 100
    },
    {
      rawChannelId: "002",
      rawChannelName: "平台甲新名",
      amount: -10
    }
  ], master);
  assert.equal(applied.rows.length, 2);
  assert.equal(applied.rows[0].channelUid, applied.rows[1].channelUid);
  assert.deepEqual(applied.evidence, {
    inputRowCount: 2,
    outputRowCount: 2,
    mappedRowCount: 2,
    unmappedRowCount: 0,
    inputAmount: 90,
    outputAmount: 90,
    rowConserved: true,
    amountConserved: true
  });
});
test("channel master rejects duplicate, incomplete and conflicting mappings", () => {
  assert.throws(
    () => validateM2CurrentChannelMaster([...masterRows, masterRows[0]]),
    /raw_pair_duplicate/u
  );
  assert.throws(
    () => validateM2CurrentChannelMaster([{
      ...masterRows[0],
      revenueMode: "unknown"
    }]),
    /revenue_mode_invalid/u
  );
  assert.throws(
    () => validateM2CurrentChannelMaster([
      masterRows[0],
      {
        ...masterRows[1],
        revenueMode: "single_purchase_or_on_demand"
      }
    ]),
    /canonical_attributes_conflict/u
  );
});

test("canonical channel forecast uses membership cash and blocks unsupported branches", () => {
  const result = forecastM2CurrentCanonicalChannelCase({
    horizonMonths: 3,
    canonicalChannels: [
      {
        channelRole: "terminal_sales_platform",
        revenueMode: "membership_subscription",
        historySeries: Array.from({ length: 18 }, () => 10)
      },
      {
        channelRole: "terminal_sales_platform",
        revenueMode: "single_purchase_or_on_demand",
        historySeries: Array.from({ length: 18 }, () => 20)
      },
      {
        channelRole: "rights_or_agency_partner",
        revenueMode: "rights_or_license_settlement",
        historySeries: Array.from({ length: 18 }, () => 30)
      }
    ]
  });
  assert.equal(result.channelPointEstimate, 30);
  assert.equal(result.supportedChannelCount, 1);
  assert.equal(result.singlePurchaseUnitConversionUsed, false);
  assert.ok(result.blockedModes.includes("single_purchase_unit_economics_missing"));
  assert.ok(result.blockedModes.includes("non_terminal_channel"));
});

test("nested channel challenger falls back until mature prior labels exist", () => {
  const rows = [];
  for (let originIndex = 0; originIndex < 4; originIndex += 1) {
    const origin = `2021-0${originIndex + 1}`;
    for (let workIndex = 0; workIndex < 3; workIndex += 1) {
      rows.push({
        standardWorkId: `work-${workIndex}`,
        origin,
        horizonMonths: 3,
        labelAvailableAsOf: `2021-0${originIndex + 2}`,
        segment: "dense",
        dominantRevenueMode: "membership_subscription",
        basePointEstimate: 60,
        actual: 30,
        canonicalChannels: [{
          channelRole: "terminal_sales_platform",
          revenueMode: "membership_subscription",
          historySeries: Array.from({ length: 18 }, () => 10)
        }]
      });
    }
  }
  const candidate = buildM2CurrentCanonicalChannelChallenger(rows, {
    minimumEarlierRows: 3,
    minimumRelativeWapeImprovement: 0.01,
    maximumTrainingAbsoluteBias: 0.2
  });
  assert.equal(candidate.rows.length, rows.length);
  assert.equal(candidate.rows[0].selectedChannelWeight, 0);
  assert.ok(candidate.rows.some((row) => row.selectedChannelWeight > 0));
  assert.ok(candidate.selections.every(
    (selection) => selection.sameOrLaterOuterTruthRead === false
  ));
});
