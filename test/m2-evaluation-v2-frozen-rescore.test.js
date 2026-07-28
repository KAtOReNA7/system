import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  scoreConditionalAmountRowsV2,
  scoreOccurrenceRowsV2,
  scorePairedPointRowsV2,
  scorePointRowsV2
} from "../src/domain/m2Current/evaluationV2.js";
import {
  scoreM2CurrentProbabilisticRows
} from "../src/domain/m2Current/metrics.js";

const preregistrationPath =
  "config/m2-evaluation-v2-rescore-preregistration.v1.json";

test("v2 frozen rescore preregistration is frozen before outcome read", () => {
  const value = JSON.parse(fs.readFileSync(preregistrationPath, "utf8"));
  assert.equal(value.status, "FROZEN_BEFORE_V2_OUTCOME_READ");
  assert.equal(value.outcomeReadBeforeFreeze, false);
  assert.equal(value.prohibitions.modelExecution, true);
  assert.equal(value.prohibitions.predictionReconstruction, true);
  assert.equal(value.numericPolicy.registeredScoreAbsoluteTolerance, 1e-8);
  assert.equal(value.uncertainty.seed, 20260728);
  assert.equal(value.privacy.minimumPublicCasesPerCell, 30);
  assert.equal(value.horizonPolicy.unifiedChampionAllowed, false);
});

test("point metrics and paired FVA use identical cases", () => {
  const fallback = [
    { caseKey: "a", actual: 10, pointEstimate: 8 },
    { caseKey: "b", actual: 20, pointEstimate: 24 }
  ];
  const candidate = [
    { caseKey: "a", actual: 10, pointEstimate: 9 },
    { caseKey: "b", actual: 20, pointEstimate: 22 }
  ];
  const score = scorePointRowsV2(candidate);
  assert.equal(score.wape, 3 / 30);
  assert.equal(score.signedBias, 1 / 30);
  assert.equal(score.absoluteBias, 1 / 30);
  assert.equal(score.mae, 1.5);
  const paired = scorePairedPointRowsV2(candidate, fallback);
  assert.equal(paired.absoluteWapeFva, 3 / 30);
  assert.equal(paired.relativeWapeFva, 0.5);
  assert.throws(
    () => scorePairedPointRowsV2(candidate, fallback.slice(0, 1)),
    /pair_mismatch/
  );
});

test("occurrence metrics require stored probabilities", () => {
  const score = scoreOccurrenceRowsV2([
    { actual: -2, occurrenceActual: 10, occurrenceProbability: 0.8 },
    { actual: 0, occurrenceActual: 0, occurrenceProbability: 0.2 },
    { actual: -1, occurrenceActual: 0, occurrenceProbability: 0.1 },
    { actual: 4, occurrenceActual: 4, occurrenceProbability: 0.7 }
  ]);
  assert.equal(score.baseRate, 0.5);
  assert.ok(score.brier < 0.1);
  assert.equal(score.confusionMatrices["0.5"].tp, 2);
  assert.equal(score.confusionMatrices["0.5"].tn, 2);
  assert.throws(
    () => scoreOccurrenceRowsV2([{ actual: 1 }]),
    /occurrence_probability_invalid/
  );
});

test("conditional amount requires an independent reversal component", () => {
  const score = scoreConditionalAmountRowsV2([
    {
      actual: 10,
      conditionalActual: 11,
      conditionalAmountPrediction: 12,
      reversalPointEstimate: -1
    },
    {
      actual: 0,
      conditionalAmountPrediction: 4,
      reversalPointEstimate: 0
    }
  ]);
  assert.equal(score.caseCount, 1);
  assert.equal(score.wape, 1 / 11);
  assert.throws(
    () => scoreConditionalAmountRowsV2([
      { actual: 10, conditionalAmountPrediction: 12 }
    ]),
    /independent_reversal_required/
  );
});

test("frozen human-anchored quantile grid uses its native 20/80 interval", () => {
  const score = scoreM2CurrentProbabilisticRows([
    {
      actual: 10,
      quantiles: {
        "0.05": 1,
        "0.1": 2,
        "0.2": 4,
        "0.5": 10,
        "0.8": 16,
        "0.9": 18,
        "0.95": 20
      }
    }
  ], [0.05, 0.1, 0.2, 0.5, 0.8, 0.9, 0.95]);
  assert.equal(score.intervalCoverage.central_60.observed, 1);
});

test("public v2 rescore preserves registry roles and exposes aggregates only", () => {
  const report = JSON.parse(fs.readFileSync(
    "docs/analysis/m2-current/M2-evaluation-v2-frozen-rescore-v1.json",
    "utf8"
  ));
  const registry = JSON.parse(fs.readFileSync(
    "config/m2-model-registry.v1.json",
    "utf8"
  ));
  assert.equal(
    report.status,
    "M2_EVALUATION_V2_FROZEN_RESCORE_COMPLETE_NO_MODEL_CHANGE"
  );
  assert.equal(report.comparabilityGroups.length, 5);
  assert.equal(report.modelRolesChanged, false);
  assert.equal(registry.currentRoles.operationalWorkFallback, "M2-WORK-OA03");
  assert.equal(registry.currentRoles.researchWorkBaseline, "M2-WORK-LG01");
  assert.equal(registry.currentRoles.activeCandidate, null);
  assert.equal(registry.currentRoles.approvedForAutomation, null);
  assert.equal(
    registry.currentRoles.latestStateIndex,
    "docs/analysis/m2-v2/M2-v2-current-state-index-v0.30.md"
  );
  const publicText = fs.readFileSync(
    "docs/analysis/m2-current/M2-evaluation-v2-frozen-rescore-v1.md",
    "utf8"
  );
  assert.doesNotMatch(publicText, /data\/private-(input|output)/);
  assert.doesNotMatch(publicText, /standardWorkId|channelUid/);
});

test("v2 evaluator is not imported by production loader route or API", () => {
  for (const file of [
    "src/domain/m2Current/loader.js",
    "src/domain/m2Current/route.js"
  ]) {
    if (!fs.existsSync(file)) continue;
    assert.doesNotMatch(fs.readFileSync(file, "utf8"), /evaluationV2|frozen_rescore/);
  }
});
