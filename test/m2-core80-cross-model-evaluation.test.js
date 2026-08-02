import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  allocateCmx01Trailing12Channels,
  assertCmx01ActualParity,
  assertCmx01CaseUniverse,
  assertCmx01ChannelConservation,
  assertCmx01PublicSafe,
  buildCmx01CaseId,
  buildCmx01Checkpoint,
  buildCmx01OriginGrid,
  pairedCmx01Bootstrap,
  scoreCmx01Rows,
  sha256Canonical,
  validateCmx01Checkpoint,
  validateCmx01Preregistration
} from "../src/domain/m2Current/core80CrossModelEvaluation.js";
import {
  selectOriginSafeCoreLegacyPopulations
} from "../src/domain/m2Current/coreLegacyPopulation.js";

const contract = JSON.parse(readFileSync(
  "config/m2-core80-cross-model-evaluation.v0.1.json",
  "utf8"
));
const registry = JSON.parse(readFileSync(
  "config/m2-model-registry.v1.json",
  "utf8"
));
const fixture = JSON.parse(readFileSync(
  "test/fixtures/m2-core80-cross-model.synthetic.v0.1.json",
  "utf8"
));

test("CMX01 contract covers every registry entry before outcomes", () => {
  const result = validateCmx01Preregistration({
    preregistration: contract,
    registry
  });
  assert.equal(result.valid, true);
  assert.equal(result.registryModelCount, 37);
  assert.equal(result.originHorizonCellCount, 235);
  assert.equal(contract.execution.tuning, false);
  assert.equal(contract.execution.finalHoldout, false);
  assert.equal(contract.execution.production, false);
});

test("CMX01 grid uses every mature monthly origin without subsampling", () => {
  const grid = buildCmx01OriginGrid(contract.evaluationWindow);
  assert.deepEqual(grid.countsByHorizon, {
    "3": 70,
    "6": 67,
    "12": 61,
    "36": 37
  });
  assert.deepEqual(grid.annualH12Origins, [
    "2019-12",
    "2020-12",
    "2021-12",
    "2022-12",
    "2023-12",
    "2024-12"
  ]);
  assert.equal(grid.cells.every((cell) => cell.targetEnd <= "2025-12"), true);
});

test("case universe rejects duplicate model cases and future information", () => {
  assert.equal(assertCmx01CaseUniverse(fixture.rows), true);
  assert.throws(
    () => assertCmx01CaseUniverse([...fixture.rows, fixture.rows[0]]),
    /m2_cmx01_duplicate_model_case/u
  );
  assert.throws(
    () => assertCmx01CaseUniverse([{
      ...fixture.rows[0],
      featureCutoff: "2021-01"
    }]),
    /m2_cmx01_future_feature_read/u
  );
  assert.throws(
    () => assertCmx01CaseUniverse([{
      ...fixture.rows[0],
      trainingMaximumLabelAvailableAsOf: "2021-01"
    }]),
    /m2_cmx01_future_training_label_read/u
  );
});

test("actual truth must be identical across models", () => {
  assert.equal(assertCmx01ActualParity(fixture.rows), true);
  const changed = fixture.rows.map((row, index) => index === 1
    ? { ...row, actualCash: 101 }
    : row);
  assert.throws(
    () => assertCmx01ActualParity(changed),
    /m2_cmx01_cross_model_actual_mismatch/u
  );
});

test("dynamic Core80 ignores cash after the forecast origin", () => {
  const rows = [
    {standardWorkId: "W1", channelUid: "C", month: "2020-10", cash: 60},
    {standardWorkId: "W2", channelUid: "C", month: "2020-10", cash: 40}
  ];
  const base = selectOriginSafeCoreLegacyPopulations({
    origin: "2020-12",
    eligibleMonthlyRows: rows,
    thresholds: { core80: 0.8, core90: 0.9 },
    topCounts: [1]
  });
  const future = selectOriginSafeCoreLegacyPopulations({
    origin: "2020-12",
    eligibleMonthlyRows: [
      ...rows,
      {standardWorkId: "W3", channelUid: "C", month: "2021-01", cash: 999}
    ],
    thresholds: { core80: 0.8, core90: 0.9 },
    topCounts: [1]
  });
  assert.deepEqual(future.core80WorkIds, base.core80WorkIds);
});

test("metric formulas reproduce the frozen synthetic values", () => {
  const metrics = scoreCmx01Rows(fixture.rows.filter(
    (row) => row.modelId === "SYNTHETIC_A"
  ));
  assert.equal(metrics.wape, 20 / 150);
  assert.equal(metrics.signedBias, -20 / 150);
  assert.equal(metrics.predictedActualRatio, 130 / 150);
  assert.equal(metrics.mae, 10);
  assert.equal(metrics.rmse, 10);
  assert.ok(Math.abs(metrics.medianApeNonzeroActual - 0.15) < 1e-12);
  const digest = createHash("sha256").update(
    JSON.stringify({
      wape: metrics.wape,
      signedBias: metrics.signedBias,
      predictedActualRatio: metrics.predictedActualRatio,
      mae: metrics.mae,
      rmse: metrics.rmse,
      medianApeNonzeroActual: metrics.medianApeNonzeroActual
    }),
    "utf8"
  ).digest("hex");
  assert.equal(digest, fixture.frozenExpectedSha256);
});

test("paired work-origin bootstrap is reproducible", () => {
  const options = {
    candidateModelId: "SYNTHETIC_A",
    baselineModelId: "SYNTHETIC_B",
    iterations: 5000,
    seed: 20260802
  };
  const first = pairedCmx01Bootstrap(fixture.rows, options);
  const second = pairedCmx01Bootstrap([...fixture.rows].reverse(), options);
  assert.deepEqual(second, first);
  assert.equal(first.iterations, 5000);
  assert.equal(first.blockCount, 2);
});

test("common allocator conserves work cash and does not invent channels", () => {
  const allocation = allocateCmx01Trailing12Channels({
    workPrediction: 100,
    observedMatureChannels: [
      {channelUid: "C1", trailing12Cash: 30},
      {channelUid: "C2", trailing12Cash: 70}
    ]
  });
  assert.equal(allocation.status, "ALLOCATED");
  assert.equal(allocation.allocatedPrediction, 100);
  const work = {
    ...fixture.rows[0],
    caseId: buildCmx01CaseId(fixture.rows[0]),
    predictedCash: 100
  };
  const channels = allocation.rows.map((row) => ({
    ...work,
    channelUid: row.channelUid,
    predictedCash: row.predictedCash
  }));
  assert.equal(assertCmx01ChannelConservation([work], channels), true);
});

test("checkpoint resume binds contract and source snapshot digests", () => {
  const contractSha256 = sha256Canonical(contract);
  const sourceSnapshotSha256 = sha256Canonical(contract.sourceSnapshot);
  const checkpoint = buildCmx01Checkpoint({
    contractSha256,
    sourceSnapshotSha256,
    completedPartitions: ["H3-2020", "H3-2020"],
    outputDigests: { "H3-2020": "abc" }
  });
  assert.equal(validateCmx01Checkpoint(checkpoint, {
    contractSha256,
    sourceSnapshotSha256
  }), true);
  assert.throws(() => validateCmx01Checkpoint(checkpoint, {
    contractSha256: "0".repeat(64),
    sourceSnapshotSha256
  }), /m2_cmx01_checkpoint_authority_mismatch/u);
});

test("private output path is ignored and public scanner rejects leaks", () => {
  const privatePath = [
    "data",
    "private-output",
    "m2-core80-cross-model-real-business-evaluation-v0.1",
    "probe.json"
  ].join("/");
  const ignored = execFileSync(
    "git",
    ["check-ignore", "-q", privatePath],
    { stdio: "ignore" }
  );
  assert.equal(ignored, null);
  assert.equal(assertCmx01PublicSafe({
    modelId: "M2-WORK-LG01",
    aggregateWape: 0.3,
    caseCount: 100
  }), true);
  assert.throws(
    () => assertCmx01PublicSafe({workTitle: "PRIVATE_TITLE"}),
    /m2_cmx01_public_artifact_contains_private_content/u
  );
  assert.throws(
    () => assertCmx01PublicSafe("C:\\Users\\person\\private.json"),
    /m2_cmx01_public_artifact_contains_private_content/u
  );
});

test("completed CMX01 public result is frozen and mapped without role promotion", () => {
  const report = JSON.parse(readFileSync(
    "docs/analysis/m2-current/"
      + "M2-core80-cross-model-real-business-evaluation-v0.1.json",
    "utf8"
  ));
  const experiment = registry.experiments.find(
    (item) => (
      item.experimentId
        === "M2-EXP-CORE80-CROSS-MODEL-REAL-BUSINESS-EVALUATION-01"
    )
  );
  const stateIndex = readFileSync(
    "docs/analysis/m2-v2/M2-v2-current-state-index-v0.62.md",
    "utf8"
  );

  assert.equal(
    report.status,
    "M2_CMX01_HISTORICAL_CROSS_EVALUATION_COMPLETE_DECISION_PENDING"
  );
  assert.equal(
    report.historicalChampionStatus,
    "NO_UNIFIED_HISTORICAL_CHAMPION_IDENTIFIED"
  );
  assert.equal(report.universe.originHorizonCells, 235);
  assert.equal(report.universe.origins, 70);
  assert.equal(report.universe.works, 2615);
  assert.equal(report.universe.channels, 38);
  assert.equal(report.variants.length, 21);
  assert.equal(new Set(report.variants.map((item) => item.modelId)).size, 14);
  assert.equal(
    report.conclusions.globalAllVariantCommonCaseCount,
    0
  );
  assert.equal(
    report.conclusions.decision,
    "DIFFERENT_MODELS_FIT_DIFFERENT_BUSINESS_SLICES"
  );
  assert.equal(report.boundaries.productionAuthorized, false);
  assert.equal(report.boundaries.automationAuthorized, false);
  assert.equal(report.boundaries.finalHoldoutOpened, false);
  assert.equal(experiment.modelRolesChanged, false);
  assert.equal(experiment.aggregateResults.length, 13);
  assert.equal(registry.currentRoles.activeCandidate, null);
  assert.equal(registry.currentRoles.approvedForAutomation, null);
  assert.match(
    stateIndex,
    /M2_CMX01_HISTORICAL_CROSS_EVALUATION_COMPLETE_DECISION_PENDING/u
  );
  assert.equal(assertCmx01PublicSafe(report), true);
});
