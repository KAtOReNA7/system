import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  assignMaximalAdjacentOriginBlocksV21,
  compareEvaluationIdentitiesV21,
  scoreConditionalAmountRowsV21,
  scoreIntervalRowsV21,
  scoreOccurrenceRowsV21,
  scorePointRowsV21,
  scorePortfolioPairedV21,
  scoreRankingRowsV21,
  scoreTopRevenueAttributionV21,
  validateEvaluationIdentityV21
} from "../src/domain/m2Current/evaluationV2.js";

const contractPath = "config/m2-evaluation-contract.v2.1.json";
const runnerPath =
  "scripts/m2-current/run_m2_evaluation_v2_frozen_rescore.mjs";

test("v2.1 contract freezes the requested evaluation semantics without model authority", () => {
  const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
  assert.equal(contract.schema, "m2.evaluation_contract.v2.1");
  assert.equal(contract.status, "ACTIVE_FOR_DEVELOPMENT_EVALUATION_ONLY");
  assert.equal(contract.activationScope, "development_evaluation_only");
  assert.deepEqual(
    contract.intervalMetrics.nativeQuantileGrid,
    [0.05, 0.1, 0.2, 0.5, 0.8, 0.9, 0.95]
  );
  assert.deepEqual(contract.topRevenueAttribution.fractions, [0.01, 0.05, 0.1]);
  assert.equal(
    contract.occurrenceMetrics.frozenTrainingPrevalenceBaseline.missingStatus,
    "NOT_COMPUTABLE_FROZEN_TRAINING_BASE_RATE_MISSING"
  );
  assert.equal(contract.publicPrivacy.minimumCaseCount, 30);
  assert.equal(contract.publicPrivacy.minimumWorkCount, 20);
  assert.ok(contract.explicitlyNotAuthorized.includes("training"));
  assert.ok(contract.explicitlyNotAuthorized.includes("model_selection"));
  assert.ok(contract.explicitlyNotAuthorized.includes("prediction_generation"));
});

test("v2.1 identities gate comparability and bind the frozen artifact digest", () => {
  const identity = {
    metricDefinitionId: "M2-EVAL-V2.1-POINT",
    metricDefinitionVersion: "2.1",
    stableModelId: "M2-WORK-OA03",
    displayNameZh: "作品发生-金额校准模型 v0.3",
    displayNameEn: "Occurrence-Amount Calibration v0.3",
    experimentId: null,
    armId: null,
    variant: "operational_fallback",
    comparabilityGroupId: "CG-WORK-SS-CURRENT-7083",
    target: "future_sales_share_cash",
    cashAuthority: "human",
    actualDefinition: "sales_share_only",
    asOfContract: "frozen",
    grain: "work_origin_horizon",
    populationId: "p",
    horizonContract: [3, 6],
    evaluationFamily: "family",
    caseKeyFields: ["standardWorkId", "origin", "horizonMonths"],
    artifactId: "ART-1",
    artifactSha256: "a".repeat(64)
  };
  assert.deepEqual(validateEvaluationIdentityV21(identity), identity);
  assert.equal(
    compareEvaluationIdentitiesV21(identity, {
      ...identity,
      artifactId: "ART-2",
      artifactSha256: "b".repeat(64)
    }).status,
    "SAME_CASE_COMPARABLE"
  );
  const mismatch = compareEvaluationIdentitiesV21(identity, {
    ...identity,
    populationId: "different"
  });
  assert.equal(mismatch.status, "NOT_COMPARABLE_IDENTITY_MISMATCH");
  assert.deepEqual(mismatch.differences.map((item) => item.field), ["populationId"]);
  assert.throws(
    () => validateEvaluationIdentityV21({ ...identity, artifactSha256: "bad" }),
    /artifact_sha256_invalid/
  );
});

test("v2.1 point scoring keeps zero actual denominators explicit", () => {
  const score = scorePointRowsV21([
    { standardWorkId: "a", actual: 0, pointEstimate: 2 },
    { standardWorkId: "b", actual: 0, pointEstimate: -1 }
  ]);
  assert.equal(score.status, "UNDEFINED_ZERO_ACTUAL_DENOMINATOR");
  assert.equal(score.wape, null);
  assert.equal(score.mae, 1.5);
});

test("v2.1 occurrence uses independent binary actuals and honest baseline gaps", () => {
  const rows = [
    { actualPositive: 1, occurrenceProbability: 0.8 },
    { actualPositive: 0, occurrenceProbability: 0.2 },
    { actualPositive: 1, occurrenceProbability: 0.7 },
    { actualPositive: 0, occurrenceProbability: 0.1 }
  ];
  const missing = scoreOccurrenceRowsV21(rows);
  assert.equal(missing.prevalence, 0.5);
  assert.equal(
    missing.frozenTrainingPrevalenceBaseline.status,
    "NOT_COMPUTABLE_FROZEN_TRAINING_BASE_RATE_MISSING"
  );
  assert.deepEqual(missing.threshold05DiagnosticOnly, {
    tp: 2,
    fp: 0,
    tn: 2,
    fn: 0,
    precision: 1,
    recall: 1,
    specificity: 1
  });
  const computable = scoreOccurrenceRowsV21(rows, {
    frozenTrainingBaseRate: 0.25
  });
  assert.equal(computable.frozenTrainingPrevalenceBaseline.status, "COMPUTABLE");
  assert.throws(
    () => scoreOccurrenceRowsV21([
      { actual: 1, occurrenceProbability: 0.8 }
    ]),
    /actual_positive_binary_required/
  );
});

test("v2.1 conditional amount cannot substitute the final point estimate", () => {
  const score = scoreConditionalAmountRowsV21([
    {
      actualPositiveAmount: 10,
      conditionalAmountPrediction: 12,
      reversalPointEstimate: -1
    },
    {
      actualPositiveAmount: 0,
      conditionalAmountPrediction: 2,
      reversalPointEstimate: 0
    }
  ]);
  assert.equal(score.caseCount, 1);
  assert.equal(score.wape, 0.2);
  assert.throws(
    () => scoreConditionalAmountRowsV21([{
      actualPositiveAmount: 10,
      pointEstimate: 12,
      reversalPointEstimate: -1
    }]),
    /conditional_amount_output_required/
  );
});

test("v2.1 interval scoring reports coverage, width, WIS and public suppression", () => {
  const rows = syntheticRows().map((row) => ({
    ...row,
    quantiles: {
      "0.05": row.pointEstimate - 5,
      "0.1": row.pointEstimate - 4,
      "0.2": row.pointEstimate - 3,
      "0.5": row.pointEstimate,
      "0.8": row.pointEstimate + 3,
      "0.9": row.pointEstimate + 4,
      "0.95": row.pointEstimate + 5
    }
  }));
  const score = scoreIntervalRowsV21(rows);
  assert.equal(score.quantileGrid.length, 7);
  assert.equal(score.intervals.central_90.meanWidth, 10);
  assert.ok(Number.isFinite(score.wis));
  assert.equal(
    score.reference.interpretationStatus,
    "PROMISING_DEVELOPMENT_INTERVAL_EVIDENCE"
  );
  assert.equal(
    score.byHorizon["3"].status,
    "SUPPRESSED_PRIVACY_THRESHOLD"
  );
  assert.throws(
    () => scoreIntervalRowsV21(rows, { quantileGrid: [0.1, 0.5, 0.9] }),
    /native_quantile_grid_required/
  );
});

test("v2.1 ranking is paired to fallback and has deterministic cluster intervals", () => {
  const fallback = syntheticRows();
  const candidate = fallback.map((row, index) => ({
    ...row,
    pointEstimate: row.actual + (index % 3) * 0.05
  }));
  const first = scoreRankingRowsV21(candidate, fallback, {
    bootstrapIterations: 40,
    seed: 17
  });
  const second = scoreRankingRowsV21(candidate, fallback, {
    bootstrapIterations: 40,
    seed: 17
  });
  assert.equal(first.caseCount, 40);
  assert.equal(first.workCount, 20);
  assert.equal(first.weighting, "equal_origin_horizon_cell_weight");
  assert.deepEqual(first, second);
  assert.ok(Object.hasOwn(first.pairedDifferences.meanTopRevenueCapture, "0.1"));
  assert.ok(Number.isFinite(first.pairedDifferences.winRates.spearman));
  assert.equal(
    Object.keys(first.pairedDifferences.byOriginHorizon).length,
    first.groupCount
  );
  assert.throws(
    () => scoreRankingRowsV21(candidate.slice(1), fallback),
    /pair_mismatch/
  );
});

test("v2.1 portfolio and post-hoc top revenue rules stay separate", () => {
  const fallback = Array.from({ length: 15 }, (_, index) => ({
    caseKey: `portfolio-${index}`,
    standardWorkId: "__PORTFOLIO__",
    origin: `2025-${String((index % 5) + 1).padStart(2, "0")}`,
    horizonMonths: [3, 6, 12][Math.floor(index / 5)],
    actual: 100 + index,
    pointEstimate: 90 + index
  }));
  const candidate = fallback.map((row) => ({
    ...row,
    pointEstimate: row.actual - 2
  }));
  const portfolio = scorePortfolioPairedV21(candidate, fallback, {
    bootstrapIterations: 40,
    seed: 5
  });
  assert.equal(portfolio.smallSampleWarning, true);
  assert.equal(portfolio.byHorizon["3"].originCount, 5);
  assert.equal(
    portfolio.byHorizon["3"].status,
    "DEFINED_SMALL_SAMPLE_DEVELOPMENT_ONLY"
  );
  const attribution = scoreTopRevenueAttributionV21(syntheticRows());
  assert.equal(
    attribution.status,
    "POSTHOC_FUTURE_ACTUAL_ATTRIBUTION_ONLY"
  );
  assert.equal(attribution.allowedForSelectionOrGate, false);
});

test("v2.1 time blocks are maximal adjacent origin components", () => {
  const tagged = assignMaximalAdjacentOriginBlocksV21([
    { origin: "2024-01" },
    { origin: "2024-02" },
    { origin: "2024-04" }
  ]);
  assert.deepEqual(tagged.map((row) => row.timeBlock), [
    "B1:2024-01..2024-02",
    "B1:2024-01..2024-02",
    "B2:2024-04..2024-04"
  ]);
});

test("v2.1 extends the frozen runner without production imports", () => {
  const source = fs.readFileSync(runnerPath, "utf8");
  assert.match(source, /--rescore-v2-1/);
  assert.match(source, /uniqueCaseKeysMatchRowCount/);
  assert.match(source, /caseKeyFieldsComplete/);
  assert.doesNotMatch(source, /from .*loader\.js/);
  assert.doesNotMatch(source, /from .*route\.js/);
  assert.doesNotMatch(source, /src\/server/);
});

test("registry advances beyond v2.1 without changing model roles", () => {
  const registry = JSON.parse(fs.readFileSync(
    "config/m2-model-registry.v1.json",
    "utf8"
  ));
  assert.equal(
    registry.currentRoles.latestStateIndex,
    "docs/analysis/m2-v2/M2-v2-current-state-index-v0.43.md"
  );
  assert.equal(registry.currentRoles.operationalWorkFallback, "M2-WORK-OA03");
  assert.equal(registry.currentRoles.researchWorkBaseline, "M2-WORK-LG01");
  assert.equal(registry.currentRoles.portfolioReference, "M2-PORT-ETS01");
  assert.equal(registry.currentRoles.activeCandidate, null);
  assert.equal(registry.currentRoles.approvedForAutomation, null);
  assert.equal(
    registry.currentEvaluationContract.priorActiveDevelopmentContract.status,
    "ACTIVE_FOR_DEVELOPMENT_EVALUATION_ONLY"
  );
  assert.equal(registry.currentEvaluationContract.productionGateActive, false);
  const metricDefinitionIds = registry.metricDefinitions.map(
    (item) => item.metricDefinitionId
  );
  for (const metricDefinitionId of [
      "M2-EVAL-V2.1-POINT",
      "M2-EVAL-V2.1-OCCURRENCE",
      "M2-EVAL-V2.1-CONDITIONAL-AMOUNT",
      "M2-EVAL-V2.1-RANKING",
      "M2-EVAL-V2.1-INTERVAL",
      "M2-EVAL-V2.1-PORTFOLIO"
  ]) {
    assert.ok(metricDefinitionIds.includes(metricDefinitionId));
  }
});

test("v2.1 public diagnostic is aggregate-only and preserves raw failures", () => {
  const publicPath =
    "docs/analysis/m2-current/M2-evaluation-v2.1-diagnostic-recheck.json";
  const value = JSON.parse(fs.readFileSync(publicPath, "utf8"));
  const text = fs.readFileSync(publicPath, "utf8");
  assert.equal(
    value.resultStatus,
    "M2_EVALUATION_CONTRACT_V2_1_ACTIVE_FOR_DEVELOPMENT_ONLY"
  );
  assert.equal(value.authorizationCounters.modelExecutionCount, 0);
  assert.equal(value.authorizationCounters.trainingCount, 0);
  assert.equal(value.authorizationCounters.selectionCount, 0);
  assert.equal(value.authorizationCounters.predictionRowsGenerated, 0);
  assert.equal(value.modelRoles.activeCandidate, null);
  assert.equal(value.modelRoles.approvedForAutomation, null);
  assert.ok(
    value.historicalPointFailurePreservation.tsbPrimaryAbsoluteWapeFva < 0
  );
  assert.equal(value.publicPrivacy.containsRowLevelIdentity, false);
  assert.equal(value.publicPrivacy.containsPrivatePath, false);
  assert.equal(
    value.frozenArtifactInventory.allCaseKeysUniqueWithinArtifact,
    true
  );
  assert.equal(value.v1ScoreReproduction.maximumAbsoluteDifference, 0);
  assert.doesNotMatch(text, /data[\\/]+private-(input|output)/iu);
  assert.doesNotMatch(text, /standardWorkId|channelUid/iu);
  assert.doesNotMatch(text, /privateReceiptPath/iu);
});

function syntheticRows() {
  return Array.from({ length: 40 }, (_, index) => {
    const originMonth = index < 20 ? "2024-01" : "2024-03";
    const horizonMonths = index % 2 === 0 ? 3 : 6;
    const actual = index + 1;
    return {
      caseKey: `work-${index % 20}|${originMonth}|${horizonMonths}|${index}`,
      standardWorkId: `work-${index % 20}`,
      origin: originMonth,
      horizonMonths,
      actual,
      pointEstimate: actual + (index % 5) - 2
    };
  });
}
