import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  scoreConditionalAmountRowsV2,
  scoreOccurrenceRowsV2,
  scorePairedPointRowsV2,
  scorePointRowsV2
} from "../src/domain/m2Current/evaluationV2.js";

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
    { actual: 10, occurrenceProbability: 0.8 },
    { actual: 0, occurrenceProbability: 0.2 },
    { actual: -1, occurrenceProbability: 0.1 },
    { actual: 4, occurrenceProbability: 0.7 }
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
  assert.equal(score.wape, 0.2);
  assert.throws(
    () => scoreConditionalAmountRowsV2([
      { actual: 10, conditionalAmountPrediction: 12 }
    ]),
    /independent_reversal_required/
  );
});
