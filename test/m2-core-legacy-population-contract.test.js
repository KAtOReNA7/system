import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildCoreLegacyOriginPopulation,
  buildCoreLegacySyntheticDiagnostic,
  buildCoreLegacyWorkCases,
  scoreCoreLegacyPairedBootstrap,
  scoreCoreLegacyPointRows,
  selectOriginSafeCoreLegacyPopulations,
  validateM2CoreLegacyPopulationConfig
} from "../src/domain/m2Current/coreLegacyPopulation.js";

const config = JSON.parse(readFileSync(
  "config/m2-current-core-legacy-population.v0.1.json",
  "utf8"
));
const fixture = JSON.parse(readFileSync(
  "test/fixtures/m2-core-legacy-population.synthetic.v0.1.json",
  "utf8"
));
const frozenRescore = JSON.parse(readFileSync(
  "docs/analysis/m2-current/M2-core-legacy-frozen-rescore-v0.1.json",
  "utf8"
));

test("core legacy contract freezes the corrected current M2 scope", () => {
  assert.equal(validateM2CoreLegacyPopulationConfig(config), true);
  assert.equal(
    config.experiment.stableExperimentId,
    "M2-EXP-CORE-LEGACY-POPULATION-01"
  );
  assert.equal(
    config.target.actualDefinitionId,
    "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01"
  );
  assert.equal(config.eligibility.minimumCompleteMonths, 3);
  assert.equal(config.coreSelection.recomputedAtEveryOrigin, true);
  assert.equal(config.coreSelection.tailPoolAllowed, false);
  assert.deepEqual(config.evaluation.horizonsMonths, [3, 6, 12, 36]);
  assert.equal(config.evaluation.bootstrap.iterations, 2000);
  assert.equal(
    config.trainingAblation.arms[3].statusBeforeExecution,
    "NOT_EXECUTED_REQUIRES_MODEL_CHANGE"
  );
});

test("synthetic diagnostic proves reference windows, ties and maturity", () => {
  const result = buildCoreLegacySyntheticDiagnostic(fixture, config);
  assert.equal(result.status, "SYNTHETIC_DIAGNOSTIC_PASS");
  assert.equal(result.boundaries.modelTrainingPerformed, false);
  assert.equal(result.boundaries.tailPoolCreated, false);
  for (const expected of fixture.selectionCases) {
    const actual = result.selections.find(
      (item) => item.id === expected.id
    );
    assert.deepEqual(actual.core80, expected.expectedCore80);
    assert.deepEqual(actual.core90, expected.expectedCore90);
    assert.equal(
      actual.core80TieCount,
      expected.expectedCore80TieCount
    );
  }
  const maturity = result.eligibility[0];
  assert.deepEqual(
    maturity.eligiblePairs,
    fixture.eligibilityCases[0].expectedEligiblePairs
  );
});

test("core selection is input-order deterministic and origin safe", () => {
  const item = fixture.selectionCases[0];
  const forward = selectOriginSafeCoreLegacyPopulations({
    origin: item.origin,
    eligibleMonthlyRows: item.eligibleMonthlyRows,
    thresholds: config.coreSelection.thresholds,
    topCounts: config.coreSelection.topDiagnostics
  });
  const reverse = selectOriginSafeCoreLegacyPopulations({
    origin: item.origin,
    eligibleMonthlyRows: [...item.eligibleMonthlyRows].reverse(),
    thresholds: config.coreSelection.thresholds,
    topCounts: config.coreSelection.topDiagnostics
  });
  assert.deepEqual(reverse, forward);
  const future = selectOriginSafeCoreLegacyPopulations({
    origin: item.origin,
    eligibleMonthlyRows: [
      ...item.eligibleMonthlyRows,
      {
        standardWorkId: "FUTURE",
        channelUid: "C1",
        month: "2024-04",
        cash: 1_000_000
      }
    ],
    thresholds: config.coreSelection.thresholds,
    topCounts: config.coreSelection.topDiagnostics
  });
  assert.deepEqual(future, forward);
});

test("maturity excludes rather than zero-imputes immature pairs", () => {
  const item = fixture.eligibilityCases[0];
  const result = buildCoreLegacyOriginPopulation({
    origin: item.origin,
    monthlyRows: item.monthlyRows,
    minimumCompleteMonths: config.eligibility.minimumCompleteMonths,
    thresholds: config.coreSelection.thresholds,
    topCounts: config.coreSelection.topDiagnostics
  });
  assert.deepEqual(
    result.eligiblePairs.map(
      (row) => `${row.standardWorkId}|${row.channelUid}`
    ),
    item.expectedEligiblePairs
  );
  assert.equal(
    result.immatureObservedPairs.length,
    item.expectedImmaturePairCount
  );
});

test("coverage rows preserve immature future actual outside candidate error", () => {
  const item = fixture.eligibilityCases[0];
  const finalMonthlyRows = [
    ...item.monthlyRows,
    {
      standardWorkId: "W1",
      channelUid: "MATURE",
      month: "2024-04",
      cash: 7
    },
    {
      standardWorkId: "W1",
      channelUid: "IMMATURE",
      month: "2024-04",
      cash: 11
    }
  ];
  const result = buildCoreLegacyWorkCases({
    origins: [item.origin],
    horizons: [3],
    finalMonthlyRows,
    featureMonthlyRowsForOrigin: () => item.monthlyRows,
    config
  });
  assert.equal(result.channelCases.length, 1);
  assert.equal(result.channelCases[0].actual, 7);
  assert.equal(result.immatureChannelCases.length, 2);
  assert.equal(
    result.immatureChannelCases.find(
      (row) => row.channelUid === "IMMATURE"
    ).actual,
    11
  );
  assert.equal(
    result.immatureChannelCases.every(
      (row) => row.eligibilityStatus === "ABSTAIN_IMMATURE_AT_ORIGIN"
    ),
    true
  );
});

test("point metrics keep false positives and misses explicit", () => {
  const result = scoreCoreLegacyPointRows([
    {standardWorkId: "W1", actual: 0, pointEstimate: 5},
    {standardWorkId: "W2", actual: 10, pointEstimate: 0},
    {standardWorkId: "W3", actual: 10, pointEstimate: 8}
  ]);
  assert.equal(result.status, "COMPUTED");
  assert.equal(result.wape, 17 / 20);
  assert.equal(result.zeroActualFalsePositiveError, 5);
  assert.equal(result.zeroPredictionPositiveActualMissError, 10);
  assert.equal(result.medianAbsoluteError, 5);
});

test("paired bootstrap is deterministic at the work cluster", () => {
  const rows = [
    {
      standardWorkId: "W1",
      actual: 10,
      candidatePointEstimate: 9,
      baselinePointEstimate: 5
    },
    {
      standardWorkId: "W2",
      actual: 20,
      candidatePointEstimate: 18,
      baselinePointEstimate: 10
    }
  ];
  const first = scoreCoreLegacyPairedBootstrap(rows, {
    iterations: 2000,
    seed: 20260729
  });
  const second = scoreCoreLegacyPairedBootstrap(rows, {
    iterations: 2000,
    seed: 20260729
  });
  assert.deepEqual(first, second);
  assert.equal(first.status, "COMPUTED");
  assert.ok(first.improvement95.lower > 0);
});

test("frozen rescore publishes a complete explicit comparability matrix", () => {
  assert.equal(
    frozenRescore.status,
    "K1_FROZEN_MODEL_CORRECT_POPULATION_RESCORE_COMPLETE"
  );
  assert.equal(frozenRescore.metrics.length, 192);
  assert.equal(
    frozenRescore.rebuildAudit.learnedGlobal
      .maximumAbsoluteReconstructionDifference,
    0
  );
  assert.equal(
    frozenRescore.metrics.some((row) => (
      row.modelId === "M2-WORK-OA03"
      && row.grain === "WORK_CHANNEL"
      && row.status
        === "NOT_COMPARABLE_FROZEN_CHANNEL_DECOMPOSITION_UNAVAILABLE"
    )),
    true
  );
  assert.equal(
    frozenRescore.coverage.every((row) => (
      row.companyFutureRevenueDenominatorUsed === false
      && row.immaturePolicy === "ABSTAIN_NOT_ZERO"
    )),
    true
  );
  const serialized = JSON.stringify(frozenRescore);
  for (const forbiddenKey of [
    "\"standardWorkId\":",
    "\"channelUid\":",
    "\"caseKey\":",
    "data/private-output",
    "data/private-input"
  ]) {
    assert.equal(serialized.includes(forbiddenKey), false);
  }
});
