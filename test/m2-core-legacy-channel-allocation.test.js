import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  allocateM2CoreLegacyChannelShares,
  buildM2CoreLegacyObservedChannelAllocation
} from "../src/domain/m2Current/coreLegacyChannelAllocation.js";

const config = JSON.parse(readFileSync(
  "config/m2-current-core-legacy-horizon-router.v0.1.json",
  "utf8"
));

test("fixed trailing windows allocate exact minor units without selection", () => {
  const channels = [
    channel("CHANNEL_A", [9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    channel("CHANNEL_B", [1, 10, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0])
  ];
  const trailing3 = allocateM2CoreLegacyChannelShares({
    channels,
    totalPointEstimate: 10.01,
    arm: config.channelAllocation.arms.find(
      (arm) => arm.armId === "C1_TRAILING_3"
    ),
    config
  });
  const trailing6 = allocateM2CoreLegacyChannelShares({
    channels,
    totalPointEstimate: 10.01,
    arm: config.channelAllocation.arms.find(
      (arm) => arm.armId === "C2_TRAILING_6"
    ),
    config
  });
  assert.equal(trailing3.status, "ALLOCATED");
  assert.equal(
    trailing3.allocations.reduce(
      (sum, row) => sum + row.pointEstimateMinor,
      0
    ),
    1001
  );
  assert.notDeepEqual(
    trailing3.allocations.map((row) => row.predictedShare),
    trailing6.allocations.map((row) => row.predictedShare)
  );
  assert.equal(config.channelAllocation.resultBasedWindowSelectionAllowed, false);
});

test("zero denominator uses the latest nonzero month then abstains", () => {
  const fallbackChannels = [
    channel("CHANNEL_A", [0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    channel("CHANNEL_B", [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  ];
  const arm = config.channelAllocation.arms.find(
    (item) => item.armId === "C1_TRAILING_3"
  );
  const fallback = allocateM2CoreLegacyChannelShares({
    channels: fallbackChannels,
    totalPointEstimate: 9,
    arm: {...arm, windowMonths: 1},
    config
  });
  assert.equal(fallback.status, "ALLOCATED");
  assert.equal(fallback.fallbackUsed, true);
  assert.equal(fallback.fallbackLag, 2);
  assert.deepEqual(
    fallback.allocations.map((row) => row.pointEstimateMinor),
    [600, 300]
  );

  const abstain = allocateM2CoreLegacyChannelShares({
    channels: [
      channel("CHANNEL_A", Array(12).fill(0)),
      channel("CHANNEL_B", Array(12).fill(0))
    ],
    totalPointEstimate: 9,
    arm,
    config
  });
  assert.equal(abstain.status, "ABSTAIN_CHANNEL_ALLOCATION");
  assert.equal(abstain.reason, "ABSTAIN_CHANNEL_ALLOCATION");
  assert.deepEqual(abstain.allocations, []);
});

test("LG01 implied shares clip negatives and never use an equal split", () => {
  const channels = [
    channel("CHANNEL_A", Array(12).fill(1), {
      "M2-WORK-LG01": -10
    }),
    channel("CHANNEL_B", Array(12).fill(1), {
      "M2-WORK-LG01": 30
    })
  ];
  const allocated = allocateM2CoreLegacyChannelShares({
    channels,
    totalPointEstimate: 12.34,
    arm: config.channelAllocation.arms.find(
      (arm) => arm.armId === "C4_LG01_IMPLIED"
    ),
    config
  });
  assert.equal(allocated.status, "ALLOCATED");
  assert.deepEqual(
    allocated.allocations.map((row) => row.pointEstimateMinor),
    [0, 1234]
  );
  assert.deepEqual(
    allocated.allocations.map((row) => row.predictedShare),
    [0, 1]
  );
});

test("direct channel forecasts retain raw values and reconcile cents exactly", () => {
  const channels = [
    channel("CHANNEL_A", Array(12).fill(1), {
      "M2-WORK-LG01": 3.335
    }),
    channel("CHANNEL_B", Array(12).fill(1), {
      "M2-WORK-LG01": 6.665
    })
  ];
  const allocated = allocateM2CoreLegacyChannelShares({
    channels,
    totalPointEstimate: 10,
    arm: {
      armId: "C0_DIRECT",
      kind: "DIRECT_CHANNEL_MODEL",
      sourceModelId: "M2-WORK-LG01"
    },
    config
  });
  assert.equal(allocated.status, "ALLOCATED");
  assert.equal(
    allocated.allocations.reduce(
      (sum, row) => sum + row.pointEstimateMinor,
      0
    ),
    1000
  );
  assert.deepEqual(
    allocated.allocations.map(
      (row) => row.rawDirectChannelPointEstimate
    ),
    [3.335, 6.665]
  );
  assert.equal(
    allocated.allocations.reduce(
      (sum, row) => sum + row.directCentAdjustmentMinor,
      0
    ),
    -1
  );
});

test("K3 preserves every raw arm, total metrics and public privacy", () => {
  const origins = ["2021-03", "2021-06", "2021-09", "2021-12"];
  const cases = origins.map((origin, index) => ({
    evaluationFamily: "PRIMARY_ROLLING",
    populationId: "CORE80",
    origin,
    horizonMonths: 3,
    standardWorkId: `PRIVATE_WORK_${index + 1}`,
    actualTotal: 100,
    totalPredictions: [
      total("M2-WORK-OA03", 100),
      total("M2-WORK-LG01", 100),
      total("M2-WORK-CRMR01", 100),
      total("M2-WORK-HR01", 100)
    ],
    channels: [
      channel(
        `PRIVATE_CHANNEL_A_${index + 1}`,
        Array(12).fill(2),
        {
          "M2-WORK-LG01": 100,
          "M2-WORK-CRMR01": 100
        },
        20
      ),
      channel(
        `PRIVATE_CHANNEL_B_${index + 1}`,
        Array(12).fill(8),
        {
          "M2-WORK-LG01": 0,
          "M2-WORK-CRMR01": 0
        },
        80
      )
    ]
  }));
  cases.push({
    evaluationFamily: "PRIMARY_ROLLING",
    populationId: "CORE80",
    origin: "2022-03",
    horizonMonths: 3,
    standardWorkId: "PRIVATE_WORK_ABSTAIN",
    actualTotal: 100,
    totalPredictions: [total("M2-WORK-OA03", 100)],
    channels: [
      channel(
        "PRIVATE_CHANNEL_ABSTAIN_A",
        Array(12).fill(0),
        {},
        20
      ),
      channel(
        "PRIVATE_CHANNEL_ABSTAIN_B",
        Array(12).fill(0),
        {},
        80
      )
    ]
  });
  const result = buildM2CoreLegacyObservedChannelAllocation(
    cases,
    config,
    {
      evaluationHead: "synthetic-evaluation-head",
      routerExecutionHead: "synthetic-router-head",
      allocationExecutionHead: "synthetic-allocation-head",
      exactHeadCiRunId: 1,
      sameCaseEvidenceStatus: "SYNTHETIC_SAME_CASE_COMPLETE",
      horizonRouterStatus: "SYNTHETIC_ROUTER_COMPLETE"
    }
  );
  assert.equal(result.publicResult.evaluationSets.length, 320);
  assert.deepEqual(
    [...new Set(result.publicResult.evaluationSets.map(
      (row) => row.armId
    ))].sort(),
    [
      "C0_DIRECT",
      "C1_TRAILING_3",
      "C2_TRAILING_6",
      "C3_TRAILING_12",
      "C4_LG01_IMPLIED"
    ]
  );
  assert.equal(
    result.publicResult.summaries.maximumWorkTotalPointDifference,
    0
  );
  assert.equal(
    result.publicResult.summaries.maximumConservationDifferenceMinor,
    0
  );
  assert.equal(
    result.publicResult.summaries.abstainAttemptCount > 0,
    true
  );
  assert.equal(
    result.publicResult.boundaries.resultBasedWindowSelectionPerformed,
    false
  );
  assert.equal(
    result.publicResult.boundaries.selectedWindowArmId,
    null
  );
  const h3 = result.publicResult.horizonDecisions.find(
    (row) => row.horizonMonths === 3
  );
  assert.equal(h3.status, "CHANNEL_ALLOCATION_CONFIRMED");
  assert.equal(
    h3.requiredWindowArms.every(
      (row) => row.status === "CHANNEL_ALLOCATION_CONFIRMED"
    ),
    true
  );
  assert.doesNotMatch(
    JSON.stringify(result.publicResult),
    /PRIVATE_WORK|PRIVATE_CHANNEL|"standardWorkId":|"channelUid":|"origin":/u
  );
});

function channel(
  channelUid,
  historyNonnegativeByLag,
  directForecasts = {},
  actual = 0
) {
  return {
    channelUid,
    actual,
    historyNonnegativeByLag,
    directForecasts
  };
}

function total(sourceModelId, pointEstimate) {
  return {sourceModelId, pointEstimate};
}
