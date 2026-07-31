import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  classifyHpsr02IndependentEvidence,
  HPSR02_ARM_IDS,
  HPSR02_EXPERIMENT_ID,
  HPSR02_MODEL_ID,
  HPSR02_PREREGISTERED_STATUS,
  HPSR02_WORKFLOW_STATUS,
  planHpsr02IndependentCheckpoint,
  runHeadProtectedTailBandCorrection,
  validateHeadProtectedTailBandCorrectionContract
} from "../src/domain/m2Current/headProtectedTailBandCorrection.js";
import {
  runHpsr02SyntheticFixture
} from "../scripts/m2-current/run_m2_head_protected_tail_band_correction_synthetic.mjs";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const config = await readJson(
  "config/m2-current-head-protected-tail-band-correction.v0.2.json"
);
const preregistration = await readText(
  config.publicOutputs.preregistrationReport
);
const interpretation = await readJson(
  config.publicOutputs.hpsr01InterpretationJson
);
const attributionReport = await readText(
  config.publicOutputs.cashBandAttributionReport
);
const synthetic = await runHpsr02SyntheticFixture();

test("HPSR02 stable identity and preregistration contract validate", () => {
  const validation = validateHeadProtectedTailBandCorrectionContract(
    config
  );
  assert.equal(validation.valid, true, validation.errors.join("\n"));
  assert.equal(config.model.stableModelId, HPSR02_MODEL_ID);
  assert.equal(
    config.experiment.stableExperimentId,
    HPSR02_EXPERIMENT_ID
  );
  assert.deepEqual(
    config.experiment.arms.map((arm) => arm.armId),
    HPSR02_ARM_IDS
  );
  assert.equal(config.status, HPSR02_PREREGISTERED_STATUS);
  assert.equal(config.workflowStatus, HPSR02_WORKFLOW_STATUS);
  assert.equal(
    config.inspiration.classification,
    "POST_HOC_INSPIRED_PROSPECTIVELY_PREREGISTERED"
  );
  assert.equal(config.inspiration.postHocArithmeticIsModelEvidence, false);
  assert.equal(config.experiment.primaryCandidateArmId, "R2");
  assert.equal(config.experiment.independentK2Executed, false);
});

test("HPSR01 mechanical result stays frozen while interpretation is inconclusive", () => {
  assert.equal(
    interpretation.originalContractDecision.status,
    "M2_HPSR01_RETROSPECTIVE_DEVELOPMENT_UNSUPPORTED_STOP_BEFORE_K2"
  );
  assert.equal(
    interpretation.interpretationStatus,
    "M2_HPSR01_CONTRACT_UNSUPPORTED_SCIENTIFICALLY_INCONCLUSIVE"
  );
  assert.equal(
    interpretation.originalContractDecision.decisionPreserved,
    true
  );
  assert.equal(
    interpretation.scientificInterpretation.wholeDirectionProvenFailed,
    false
  );
});

test("HPSR02 sole primary arm protects H50 and M30 rowwise", () => {
  const { result, summary } = synthetic;
  assert.equal(result.modelId, HPSR02_MODEL_ID);
  assert.equal(result.experimentId, HPSR02_EXPERIMENT_ID);
  assert.equal(summary.H50M30RowwiseExactLg01, true);
  assert.equal(summary.protectedH50M30RowCount, 8);
  const baselineByWork = new Map(result.r0Rows.map((row) => [
    row.standardWorkId,
    row
  ]));
  const protectedRows = result.r2Rows.filter(
    (row) => row.cashBandId !== "L20"
  );
  assert.equal(protectedRows.length, 8);
  for (const row of protectedRows) {
    assert.equal(
      row.pointEstimate,
      baselineByWork.get(row.standardWorkId).pointEstimate
    );
    assert.equal(row.correctionApplied, false);
    assert.equal(row.alpha, null);
  }
});

test("only L20 receives the frozen bounded correction", () => {
  const { result, summary } = synthetic;
  const l20Rows = result.r2Rows.filter(
    (row) => row.cashBandId === "L20"
  );
  assert.equal(l20Rows.length, 2);
  assert.equal(summary.correctedL20RowCount, 1);
  assert.equal(summary.numericFallbackL20RowCount, 1);
  assert.equal(summary.boundTriggeredL20RowCount, 1);
  assert.equal(summary.finiteExtremeL20RowCount, 1);
  assert.equal(summary.nonfiniteRawL20RowCount, 1);
  assert.equal(summary.finiteExtremeClipIsFinite, true);
  assert.equal(summary.nonfiniteL20FallbackToLg01, true);
  assert.equal(summary.L20Alpha, 1);
  assert.equal(
    l20Rows.every((row) => Number.isFinite(row.pointEstimate)),
    true
  );
});

test("synthetic contract has no global alpha or cross-band dependency", () => {
  const { result, summary } = synthetic;
  assert.equal(summary.globalAlphaFieldCount, 0);
  assert.equal(summary.globalAlphaDependency, false);
  assert.equal(summary.crossBandDependency, false);
  assert.equal(result.invariants.alphaSearchExecuted, false);
  assert.equal(result.invariants.residualBoundsReestimated, false);
  assert.equal(result.invariants.workLevelSelectionExecuted, false);
  assert.equal(result.invariants.outcomeFieldsConsumed, false);
  assert.equal(result.invariants.privateDataAccessed, false);
  assert.equal(result.invariants.scoreComputed, false);
  assert.equal(result.invariants.bootstrapExecuted, false);
});

test("actual fields and private paths fail closed before synthetic routing", () => {
  const predictionRows = synthetic.fixture.works.map((work) => ({
    standardWorkId: work.standardWorkId,
    origin: synthetic.fixture.origin,
    horizonMonths: 3,
    lg01Prediction: work.lg01Prediction,
    cham01B3Prediction: work.cham01B3Prediction,
    cham01Diagnostics: work.cham01Diagnostics
  }));
  const workCashRows = synthetic.fixture.works.map((work) => ({
    standardWorkId: work.standardWorkId,
    trailing12Cash: work.monthlySalesShareCash * 12
  }));
  assert.throws(
    () => runHeadProtectedTailBandCorrection({
      origin: synthetic.fixture.origin,
      originVisibleWorkCashRows: workCashRows,
      predictionRows: predictionRows.map((row, index) => (
        index === 0 ? { ...row, actual: 100 } : row
      )),
      residualBoundState: synthetic.fixture.residualBoundState
    }),
    /hpsr02_prediction_field_forbidden_actual/u
  );
  assert.throws(
    () => runHeadProtectedTailBandCorrection({
      origin: synthetic.fixture.origin,
      originVisibleWorkCashRows: workCashRows.map((row, index) => (
        index === 0
          ? { ...row, sourcePath: "C:\\private\\actual.json" }
          : row
      )),
      predictionRows,
      residualBoundState: synthetic.fixture.residualBoundState
    }),
    /hpsr02_private_or_absolute_path_forbidden/u
  );
});

test("independent checkpoint dates are dynamic current estimates only", () => {
  const boundary = planHpsr02IndependentCheckpoint({
    maxActualValueOpenedOrigin: "2026-02",
    completeAuthoritativeBillMonthThrough: "2026-04"
  });
  assert.equal(boundary.firstIndependentLaterOrigin, "2026-03");
  assert.equal(
    boundary.firstIndependentRequiredCompleteThrough,
    "2026-06"
  );
  assert.deepEqual(
    boundary.missingOrIncompleteBillMonths,
    ["2026-05", "2026-06"]
  );
  assert.equal(boundary.independentCheckpointReady, false);
  assert.equal(boundary.prospectiveFinalHoldoutOrigin, "2026-06");
  assert.equal(
    boundary.prospectiveFinalHoldoutRequiredCompleteThrough,
    "2026-09"
  );
  assert.equal(boundary.prospectiveFinalHoldoutOpened, false);
  assert.equal(
    config.independentDataBoundary.runtimeRecomputeRequired,
    true
  );
  assert.equal(
    config.independentDataBoundary.currentEstimateOnly,
    true
  );
});

test("three-state decision policy handles support, mixed, threshold, and structural failure", () => {
  const common = {
    H50M30EqualityPass: true,
    allFinite: true,
    caseKeyPass: true,
    originVisibilityPass: true,
    dataValidityPass: true,
    catastrophicSingleWorkDominance: false
  };
  const supported = classifyHpsr02IndependentEvidence({
    ...common,
    pairedFva: 0.02,
    bootstrapLower: 0.005,
    absoluteBiasWorsening: 0.005
  });
  assert.equal(supported.classification, "SUPPORTED");
  assert.equal(supported.thresholdSensitive, false);
  assert.equal(supported.approvedForAutomation, false);
  assert.equal(supported.productionReady, false);

  const thresholdMixed = classifyHpsr02IndependentEvidence({
    ...common,
    pairedFva: 0.00847712522619727,
    bootstrapLower: -0.18,
    absoluteBiasWorsening: 0.020358292834892863
  });
  assert.equal(thresholdMixed.classification, "MIXED");
  assert.equal(thresholdMixed.thresholdSensitive, true);
  assert.equal(
    thresholdMixed.thresholdSensitiveStatus,
    "THRESHOLD_SENSITIVE"
  );

  const unsupported = classifyHpsr02IndependentEvidence({
    ...common,
    pairedFva: -0.02,
    bootstrapLower: -0.1,
    absoluteBiasWorsening: 0
  });
  assert.equal(unsupported.classification, "UNSUPPORTED");
  assert.ok(
    unsupported.unsupportedReasons.includes(
      "WAPE_FVA_DEGRADED_AT_LEAST_ONE_PERCENT"
    )
  );

  const structuralFailure = classifyHpsr02IndependentEvidence({
    ...common,
    H50M30EqualityPass: false,
    pairedFva: 0.01,
    bootstrapLower: 0,
    absoluteBiasWorsening: 0.01
  });
  assert.equal(structuralFailure.classification, "UNSUPPORTED");
  assert.ok(
    structuralFailure.structuralFailures.includes(
      "H50_M30_EQUALITY_FAILED"
    )
  );
});

test("authorization, final holdout, automation, and production remain closed", () => {
  assert.equal(
    config.authorization.independentK2EvaluationAuthorizedNow,
    false
  );
  assert.equal(
    config.authorization.newPrivateActualReadAuthorizedNow,
    false
  );
  assert.equal(config.authorization.modelTrainingAuthorizedNow, false);
  assert.equal(config.authorization.modelFittingAuthorizedNow, false);
  assert.equal(config.authorization.alphaSearchAuthorizedNow, false);
  assert.equal(
    config.authorization.residualBoundReestimationAuthorizedNow,
    false
  );
  assert.equal(
    config.authorization.prospectiveFinalHoldoutOpenAuthorizedNow,
    false
  );
  assert.equal(config.authorization.productionAuthorized, false);
  assert.equal(config.authorization.mergeAuthorized, false);
  assert.equal(config.governance.activeCandidate, null);
  assert.equal(config.governance.approvedForAutomation, null);
  assert.equal(config.governance.productionReady, false);
  assert.equal(config.governance.finalHoldoutOpened, false);
  assert.equal(config.auditBoundary.hpsr01Rerun, false);
  assert.equal(config.auditBoundary.newActualRead, false);
  assert.equal(config.auditBoundary.realModelEvaluationExecuted, false);
});

test("production loader route and API do not import HPSR02", async () => {
  assert.equal(config.implementation.productionSurfaceChangeCount, 0);
  for (const repositoryPath of [
    "src/domain/m2Current/loader.js",
    "src/domain/m2Current/route.js",
    "src/http/app.js"
  ]) {
    const source = await readText(repositoryPath);
    assert.doesNotMatch(
      source,
      /headProtectedTailBandCorrection|M2-WORK-HPSR02/u
    );
  }
});

test("public reports explain post-hoc inspiration without private leakage", () => {
  for (const content of [
    preregistration,
    attributionReport,
    JSON.stringify(config)
  ]) {
    assert.doesNotMatch(content, /data[\\/]+private-(?:input|output)/iu);
    assert.doesNotMatch(content, /[A-Z]:[\\/]/u);
  }
  assert.match(
    preregistration,
    /POST_HOC_INSPIRED_PROSPECTIVELY_PREREGISTERED/u
  );
  assert.match(
    attributionReport,
    /POST_HOC_AGGREGATE_ARITHMETIC_NOT_MODEL_EVIDENCE/u
  );
});

async function readJson(repositoryRelativePath) {
  return JSON.parse(await readText(repositoryRelativePath));
}

async function readText(repositoryRelativePath) {
  return (await readFile(
    path.join(root, repositoryRelativePath),
    "utf8"
  )).replaceAll("\r\n", "\n");
}
