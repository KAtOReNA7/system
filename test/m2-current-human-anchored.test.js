import assert from "node:assert/strict";
import test from "node:test";

import {
  crossFitM2HumanAnchored,
  deterministicWorkFold,
  fitM2HumanAnchoredModel,
  forecastM2HumanAnchoredBase,
  predictM2HumanAnchored,
  rawCandidateLayerFvaGate,
  scoreM2HumanAnchoredLayers,
  strictRollingM2HumanAnchored,
  workClusterBootstrap
} from "../src/domain/m2Current/humanAnchored.js";

const config = {
  dataContract: {
    strictAuxiliaryEvaluationStartsAt: "2023-03"
  },
  humanPrior: {
    horizonMonths: 36,
    recentMonths: 12,
    mainChannelMaximum: 1,
    latestToAverageFloor: 0.8,
    edgeHistoricalShare: 0.5,
    lifecycleYear3Share: 0.5,
    lifecycleYear5Share: 0.4,
    recentLevelBlend: 0.5,
    declineTemperature: 0.1,
    mainBoundaryTemperature: 0.5,
    dominantTopTwoBoundary: 0.8,
    platformTrendWeight: 0.5,
    dormantHistoricalShare: 0.5,
    dormantAnnualDecay: 0.5
  },
  learning: {
    crossWorkFoldCount: 2,
    coordinatePasses: 1,
    biasPenalty: 0.25,
    priorPenalty: 0.0025,
    hierarchicalPriorStrength: 5,
    occurrencePriorStrength: 5,
    reversalPriorStrength: 5,
    reversalRateMaximum: 4,
    minimumStrictAsOfTrainingRows: 4,
    bootstrapIterations: 20,
    bootstrapSeed: 20260726,
    quantileProbabilities: [0.05, 0.1, 0.2, 0.5, 0.8, 0.9, 0.95],
    parameterGrids: {
      latestToAverageFloor: [0.7, 0.8],
      edgeHistoricalShare: [0.4, 0.5],
      lifecycleYear3Share: [0.45, 0.5],
      lifecycleYear5Share: [0.4, 0.45],
      mainChannelMaximum: [1, 2],
      recentLevelBlend: [0, 0.5]
    }
  }
};

test("faithful artificial rule keeps main/edge structure and horizon scaling", () => {
  const row = syntheticRow("1", "2022-12", 36, 120, 2);
  const result = forecastM2HumanAnchoredBase(
    row,
    config.humanPrior,
    { faithful: true }
  );
  assert.equal(result.channelComponents[0].role, "main");
  assert.equal(result.channelComponents[1].role, "edge");
  assert.equal(result.lifecycleContributionShare, 0.5);
  assert.ok(result.positivePointEstimate > 0);

  const short = forecastM2HumanAnchoredBase(
    { ...row, horizonMonths: 12 },
    config.humanPrior,
    { faithful: true }
  );
  assert.equal(short.positivePointEstimate, result.positivePointEstimate / 3);
});

test("cross-work fitting never trains on the validation work", () => {
  const rows = [];
  for (let work = 1; work <= 8; work += 1) {
    rows.push(syntheticRow(
      String(work),
      "2022-12",
      36,
      80 + work * 4,
      work % 3
    ));
  }
  const result = crossFitM2HumanAnchored(rows, config);
  assert.equal(result.rows.length, rows.length);
  assert.ok(result.rows.every((row) => row.trainingReadOwnWork === false));
  assert.deepEqual(
    new Set(result.rows.map((row) => row.evaluationFold)),
    new Set([0, 1])
  );
  assert.ok(result.rows.every((row) => (
    row.quantiles["0.05"] <= row.quantiles["0.95"]
  )));
  assert.ok(result.rows.every((row) => (
    Number.isFinite(row.rawHierarchicalPointEstimate)
    && Number.isFinite(row.fullyRawOccurrenceReversalPointEstimate)
    && Number.isFinite(row.candidateOccurrenceReversalPointEstimate)
  )));
});

test("candidate FVA remains negative when selected pipeline safely falls back", () => {
  const rows = [{
    ...syntheticRow("1", "2022-12", 36, 100, 0),
    actual: 100,
    manualPointEstimate: 150,
    learnedGlobalPointEstimate: 110,
    rawHierarchicalPointEstimate: 140,
    hierarchicalPointEstimate: 110,
    fullyRawOccurrenceReversalPointEstimate: 130,
    candidateOccurrenceReversalPointEstimate: 130,
    occurrenceReversalPointEstimate: 130,
    pointEstimate: 110,
    quantiles: {
      "0.05": 80,
      "0.1": 85,
      "0.2": 90,
      "0.5": 110,
      "0.8": 125,
      "0.9": 130,
      "0.95": 135
    }
  }];
  const metrics = scoreM2HumanAnchoredLayers(rows, config);

  assert.ok(Math.abs(metrics.candidateFva[1].valueAdded + 0.3) < 1e-12);
  assert.equal(metrics.selectedPipelineFva[1].valueAdded, 0);
  assert.ok(Math.abs(metrics.candidateFva[2].valueAdded + 0.2) < 1e-12);
  assert.equal(metrics.selectedPipelineFva[2].valueAdded, 0);
  assert.equal(rawCandidateLayerFvaGate(metrics, 0), false);
});

test("raw expert output is retained even when hierarchy is rejected", () => {
  const rows = Array.from({ length: 12 }, (_, index) => syntheticRow(
    String(index + 1),
    "2022-12",
    36,
    80 + index,
    index % 2
  ));
  const fitted = fitM2HumanAnchoredModel(rows, config);
  const state = {
    ...fitted,
    expertMultipliers: {
      ordinary_membership: 2,
      platform_dominant: 2,
      single_purchase: 2,
      intermittent_or_dormant: 2
    },
    hierarchyAccepted: false,
    occurrenceReversalAccepted: false
  };
  const prediction = predictM2HumanAnchored(rows[0], state, config);

  assert.equal(
    prediction.hierarchicalPointEstimate,
    prediction.learnedGlobalPointEstimate
  );
  assert.notEqual(
    prediction.rawHierarchicalPointEstimate,
    prediction.hierarchicalPointEstimate
  );
  assert.equal(
    prediction.fullyRawOccurrenceReversalPointEstimate,
    prediction.rawHierarchicalPointEstimate
      * prediction.occurrenceProbability
      * (1 - prediction.reversalRate)
  );
});

test("strict rolling fitting reads only labels mature by the outer origin", () => {
  const rows = [];
  for (const origin of ["2021-12", "2022-06", "2022-12", "2023-03"]) {
    for (let work = 1; work <= 6; work += 1) {
      rows.push(syntheticRow(
        String(work),
        origin,
        3,
        60 + work,
        work % 2,
        addMonths(origin, 3)
      ));
    }
  }
  const result = strictRollingM2HumanAnchored(rows, config);
  assert.ok(result.rows.length > 0);
  assert.ok(result.rows.every((row) => (
    row.maximumTrainingLabelAvailableAsOf <= row.outerOrigin
    && row.sameOrLaterOuterTruthRead === false
  )));
  assert.equal(
    result.timeBlockAudit.caseCountCannotSubstituteForTimeBlockCount,
    true
  );
});

test("strict rolling counts adjacent origins as one time evidence block", () => {
  const rows = [];
  for (const origin of ["2021-12", "2022-01", "2022-02", "2022-05"]) {
    for (let work = 1; work <= 6; work += 1) {
      rows.push(syntheticRow(
        String(work),
        origin,
        1,
        60 + work,
        work % 2,
        addMonths(origin, 1)
      ));
    }
  }
  const result = strictRollingM2HumanAnchored(rows, {
    ...config,
    dataContract: {
      ...config.dataContract,
      strictAuxiliaryEvaluationStartsAt: "2022-01"
    }
  });

  assert.equal(result.timeBlockAudit.evaluatedOriginCount, 3);
  assert.equal(result.timeBlockAudit.independentTimeBlockCount, 2);
  assert.deepEqual(
    result.timeBlockAudit.blocks.map((block) => block.originCount),
    [2, 1]
  );
});

test("work-cluster bootstrap keeps repeated cases within sampled works", () => {
  const rows = [];
  for (let work = 1; work <= 8; work += 1) {
    for (const origin of ["2022-06", "2022-12"]) {
      rows.push({
        ...syntheticRow(String(work), origin, 36, 50 + work, 0),
        manualPointEstimate: 65,
        pointEstimate: 55,
        quantiles: {
          "0.05": 10,
          "0.2": 30,
          "0.5": 55,
          "0.8": 70,
          "0.95": 90
        }
      });
    }
  }
  const result = workClusterBootstrap(rows, {
    iterations: 20,
    seed: 20260726
  });
  assert.equal(result.independentWorkCount, 8);
  assert.equal(result.method, "resample_independent_works_with_all_repeated_cases");
  assert.ok(result.wape95.lower <= result.wape95.upper);
});

test("work folds are deterministic", () => {
  assert.equal(
    deterministicWorkFold("work-42", 5),
    deterministicWorkFold("work-42", 5)
  );
});

test("reversal layer can represent net-negative sales-share cash", () => {
  const rows = Array.from({ length: 12 }, (_, index) => syntheticRow(
    String(index + 1),
    "2022-12",
    36,
    10,
    20
  ));
  const state = fitM2HumanAnchoredModel(rows, config);
  const prediction = predictM2HumanAnchored(rows[0], state, config);

  assert.equal(prediction.reversalRate, 2);
  assert.ok(prediction.occurrenceReversalPointEstimate < 0);
});

function syntheticRow(
  standardWorkId,
  origin,
  horizonMonths,
  actualPositive,
  actualReversal,
  labelAvailableAsOf = addMonths(origin, horizonMonths)
) {
  const main = Array(12).fill(10);
  const edge = Array(12).fill(1);
  return {
    standardWorkId,
    origin,
    horizonMonths,
    labelAvailableAsOf,
    observedSalesAgeMonths: 24,
    segment: Number(standardWorkId) % 2 ? "active" : "intermittent",
    dominantRevenueMode: "membership_subscription",
    secondLevelCategoryReportingOnly: "fiction",
    actualPositive,
    actualReversal,
    actual: actualPositive - actualReversal,
    canonicalChannels: [
      {
        channelUid: "main",
        revenueMode: "membership_subscription",
        positiveSeries: main
      },
      {
        channelUid: "edge",
        revenueMode: "advertising_or_free_share",
        positiveSeries: edge
      }
    ]
  };
}

function addMonths(month, offset) {
  const [year, number] = month.split("-").map(Number);
  const absolute = year * 12 + number - 1 + offset;
  return `${Math.floor(absolute / 12)}-${String(absolute % 12 + 1).padStart(2, "0")}`;
}
