import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  runHeadProtectedSegmentedRouter
} from "../src/domain/m2Current/headProtectedSegmentedRouter.js";
import {
  classifyHpsr02IndependentEvidence,
  evaluateHpsr02IndependentEvaluation,
  HPSR02_ARM_IDS,
  HPSR02_EXPERIMENT_ID,
  HPSR02_FINAL_STATUSES,
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
const independentEvaluation = await readJson(
  "docs/analysis/m2-current/"
    + "M2-head-protected-tail-band-correction-"
    + "independent-evaluation-v0.2.json"
);
const independentEvaluationReport = await readText(
  "docs/analysis/m2-current/"
    + "M2-head-protected-tail-band-correction-"
    + "independent-evaluation-v0.2.md"
);
const dateAuditSource = await readText(
  "scripts/m2-current/audit_head_protected_segmented_router_dates.py"
);
const privateRunnerSource = await readText(
  "scripts/m2-current/head_protected_segmented_router_private.mjs"
);
const parameterAuthoritySource = await readText(
  "scripts/m2-current/hpsr_frozen_parameter_authority_private.mjs"
);
const coreRevenuePrivateSource = await readText(
  "scripts/m2-current/core_revenue_manual_private.mjs"
);
const controlledSource = await readText(
  "scripts/m2-current/run_m2_head_protected_segmented_router_controlled.mjs"
);

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

test("first independent evaluation preserves prior blocker and current gate", () => {
  const readyStatus =
    "M2_HPSR02_WORK_TOTAL_SOURCE_AUTHORITY_RECONCILED_"
      + "READY_FOR_AUTHORIZED_FIRST_INDEPENDENT_EVALUATION";
  const recoveryStatus =
    "M2_HPSR02_PRE_RESULT_ENGINEERING_FAILURE_RECOVERY_AUTHORIZED";
  const sourceDecisionStatus =
    "M2_HPSR02_BLOCKED_ACTIONABLE_SOURCE_AUTHORITY_DECISION_REQUIRED";
  const parameterPendingStatus =
    "M2_HPSR02_FROZEN_PARAMETER_AUTHORITY_DECIDED_"
      + "PENDING_PRIVATE_INTEGRITY_GATE";
  const missingImmutableParameterStatus =
    "M2_HPSR02_BLOCKED_MISSING_IMMUTABLE_FROZEN_PARAMETER";
  assert.ok([
    readyStatus,
    recoveryStatus,
    sourceDecisionStatus,
    parameterPendingStatus,
    missingImmutableParameterStatus,
    ...Object.values(HPSR02_FINAL_STATUSES)
  ].includes(independentEvaluation.status));
  assert.equal(
    independentEvaluation.model.stableModelId,
    "M2-WORK-HPSR02"
  );
  assert.equal(
    independentEvaluation.experiment.stableExperimentId,
    "M2-EXP-LG01-HEAD-PROTECTED-TAIL-BAND-CORRECTION-02"
  );
  assert.equal(
    independentEvaluation.priorBlockedAttempt.status,
    "M2_HPSR02_BLOCKED_MISSING_SOURCE_AUTHORITY"
  );
  assert.equal(independentEvaluation.priorBlockedAttempt.historyRewritten, false);
  const source = independentEvaluation.sourceAuthorityReconciliation;
  assert.equal(
    source.sourceAuthorityStatus,
    "SOURCE_AUTHORITY_AVAILABLE_FOR_WORK_TOTAL"
  );
  assert.equal(
    source.workTotalCanonicalMappingStatus,
    "WORK_TOTAL_CANONICAL_MAPPING_WARNING_"
      + "WORK_CHANNEL_REMAINS_PARTIAL"
  );
  assert.equal(
    source.metadataDifferenceStatus,
    "OUT_OF_WORK_TOTAL_SCOPE_FACT_DIFFERENCE_WARNING"
  );
  assert.equal(source.workTotalScopeRelevantDifferenceRowCount, 0);
  assert.equal(source.workChannelGateStatus, "PARTIAL_NOT_ACTIVE");
  assert.equal(independentEvaluation.governance.activeCandidate, null);
  assert.equal(independentEvaluation.governance.approvedForAutomation, null);
  assert.equal(independentEvaluation.governance.productionReady, false);
  assert.equal(independentEvaluation.governance.finalHoldoutOpened, false);
  if (independentEvaluation.status === readyStatus) {
    assert.equal(
      independentEvaluation.executionLedger.actualAmountRowsReadForOutcome,
      0
    );
    assert.equal(independentEvaluation.executionLedger.candidateModelRuns, 0);
    assert.equal(independentEvaluation.executionLedger.bootstrapRuns, 0);
  } else if (independentEvaluation.status === recoveryStatus) {
    assert.equal(
      independentEvaluation.preResultEngineeringRecovery.status,
      "INVALIDATED_PRE_RESULT_ENGINEERING_FAILURE_RECOVERY_ALLOWED"
    );
    assert.equal(
      independentEvaluation.preResultEngineeringRecovery
        .completeIndependentResultProduced,
      false
    );
    assert.equal(
      independentEvaluation.preResultEngineeringRecovery.attemptCount,
      3
    );
    assert.deepEqual(
      independentEvaluation.preResultEngineeringRecovery.attempts.map(
        (attempt) => attempt.errorCode
      ),
      [
        "m2_hpsr_rebuilt_work_case_duplicate",
        "hpsr02_residual_bound_rebuild_not_reconciled",
        "m2_core_revenue_manual_command_failed:node.exe"
      ]
    );
    assert.equal(
      independentEvaluation.executionLedger.preResultEngineeringAttempts,
      3
    );
    assert.equal(
      independentEvaluation.executionLedger.candidateModelRuns,
      0
    );
    assert.equal(
      independentEvaluation.executionLedger.bootstrapRuns,
      0
    );
  } else if (independentEvaluation.status === sourceDecisionStatus) {
    assert.equal(
      independentEvaluation.frozenBoundSourceReconciliation.status,
      "FROZEN_HPSR01_BOUND_SOURCE_AUTHORITY_CONFLICT"
    );
    assert.equal(
      independentEvaluation.frozenBoundSourceReconciliation
        .historicalOnlyRowCount,
      732
    );
    assert.equal(
      independentEvaluation.frozenBoundSourceReconciliation
        .currentOnlyRowCount,
      732
    );
    assert.equal(
      independentEvaluation.frozenBoundSourceReconciliation
        .workMonthAmountTotalEqual,
      true
    );
    assert.equal(
      independentEvaluation.preResultEngineeringRecovery.retryAllowed,
      false
    );
    assert.equal(
      independentEvaluation.executionLedger.candidateModelRuns,
      0
    );
    assert.equal(
      independentEvaluation.executionLedger.scientificEvaluationsExecuted,
      0
    );
    assert.equal(independentEvaluation.executionLedger.bootstrapRuns, 0);
    assert.equal(
      independentEvaluation.governance.sourceAuthorityDecisionRequired,
      true
    );
  } else if (independentEvaluation.status === parameterPendingStatus) {
    assert.equal(
      independentEvaluation.frozenParameterAuthorityDecision.artifactClass,
      "IMMUTABLE_FROZEN_MODEL_PARAMETER"
    );
    assert.equal(
      independentEvaluation.frozenParameterAuthorityDecision
        .lineageArtifactClass,
      "PARAMETER_LINEAGE_SNAPSHOT"
    );
    assert.equal(
      independentEvaluation.frozenParameterAuthorityDecision
        .currentBillsMayDeriveFrozenParameters,
      false
    );
    assert.equal(
      independentEvaluation.executionLedger.candidateModelRuns,
      0
    );
    assert.equal(
      independentEvaluation.executionLedger.scientificEvaluationsExecuted,
      0
    );
    assert.equal(independentEvaluation.executionLedger.bootstrapRuns, 0);
    assert.equal(
      independentEvaluation.governance.currentTaskResumeAuthorized,
      true
    );
    assert.equal(
      independentEvaluation.governance.sourceAuthorityDecisionRequired,
      false
    );
  } else if (independentEvaluation.status === missingImmutableParameterStatus) {
    assert.equal(independentEvaluation.executionLedger.candidateModelRuns, 0);
    assert.equal(
      independentEvaluation.executionLedger.scientificEvaluationsExecuted,
      0
    );
    assert.equal(independentEvaluation.executionLedger.bootstrapRuns, 0);
  } else {
    assert.equal(
      independentEvaluation.execution
        .firstIndependentEvaluationActuallyExecuted,
      true
    );
    assert.equal(independentEvaluation.evaluation.bootstrapExecutionCount, 1);
    assert.equal(
      independentEvaluation.evaluation.structure.workChannelStatus,
      "PARTIAL_NOT_ACTIVE"
    );
  }
  assert.match(independentEvaluationReport, /来源权威/u);
  assert.match(
    independentEvaluationReport,
    /M2_HPSR02_BLOCKED_MISSING_SOURCE_AUTHORITY/u
  );
  assert.match(
    independentEvaluationReport,
    /M2_HPSR02_BLOCKED_ACTIONABLE_SOURCE_AUTHORITY_DECISION_REQUIRED/u
  );
  assert.match(
    independentEvaluationReport,
    /IMMUTABLE_FROZEN_MODEL_PARAMETER/u
  );
  assert.match(
    independentEvaluationReport,
    /HISTORICAL_CHANNEL_LINEAGE_DRIFT_WITH_WORK_MONTH_CASH_CONSERVED/u
  );
});

test("source readiness separates WORK_TOTAL from WORK_CHANNEL", () => {
  assert.match(
    dateAuditSource,
    /WORK_TOTAL_CANONICAL_MAPPING_WARNING_/u
  );
  assert.match(dateAuditSource, /WORK_CHANNEL_REMAINS_PARTIAL/u);
  assert.match(dateAuditSource, /PARTIAL_NOT_ACTIVE/u);
  assert.match(
    dateAuditSource,
    /OUT_OF_WORK_TOTAL_SCOPE_FACT_DIFFERENCE_WARNING/u
  );
  assert.match(
    dateAuditSource,
    /SOURCE_AUTHORITY_VALIDITY_EQUALITY_AND_SIGN_ONLY/u
  );
  assert.match(dateAuditSource, /amountValuesPublished/u);
  assert.doesNotMatch(
    dateAuditSource,
    /canonicalMappingGuessedOrBackfilled": True/u
  );
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

test("independent evaluator reports paired WORK_TOTAL evidence once", () => {
  const { result } = synthetic;
  const historicalSynthetic = runHeadProtectedSegmentedRouter({
    origin: synthetic.fixture.origin,
    horizonMonths: 3,
    originVisibleWorkCashRows: synthetic.fixture.works.map((work) => ({
      standardWorkId: work.standardWorkId,
      trailing12Cash: work.monthlySalesShareCash * 12
    })),
    predictionRows: synthetic.fixture.works.map((work) => ({
      standardWorkId: work.standardWorkId,
      origin: synthetic.fixture.origin,
      horizonMonths: 3,
      lg01Prediction: work.lg01Prediction,
      cham01B3Prediction: work.cham01B3Prediction,
      cham01Diagnostics: work.cham01Diagnostics
    })),
    residualBoundState: synthetic.fixture.residualBoundState,
    executionMode: "SYNTHETIC_FIXTURE"
  });
  const r2ByWork = new Map(result.r2Rows.map((row) => [
    row.standardWorkId,
    row
  ]));
  const actualRows = result.r0Rows.map((row) => ({
    standardWorkId: row.standardWorkId,
    origin: "2026-03",
    horizonMonths: 3,
    actual: row.cashBandId === "L20"
      ? r2ByWork.get(row.standardWorkId).pointEstimate
      : row.pointEstimate + 1
  }));
  const evaluation = evaluateHpsr02IndependentEvaluation({
    routerResult: {
      ...result,
      executionMode: "CONTROLLED_LATER_ORIGIN"
    },
    historicalRouterResult: {
      ...historicalSynthetic,
      executionMode: "CONTROLLED_LATER_ORIGIN"
    },
    actualRows,
    eligibleActualRows: actualRows,
    sourceGate: {
      sourceAuthorityStatus:
        "SOURCE_AUTHORITY_AVAILABLE_FOR_WORK_TOTAL",
      workTotalSourceAuthorityChecksPass: true,
      workChannelGateStatus: "PARTIAL_NOT_ACTIVE",
      newFutureActualOutcomeOpened: false
    },
    bootstrap: {
      iterations: 2000,
      seed: 20260801
    }
  });
  assert.ok(Object.values(HPSR02_FINAL_STATUSES).includes(
    evaluation.status
  ));
  assert.equal(evaluation.workCount, 10);
  assert.equal(evaluation.structure.H50M30RowwiseExactLg01, true);
  assert.equal(evaluation.structure.workChannelStatus, "PARTIAL_NOT_ACTIVE");
  assert.equal(evaluation.metrics.bootstrapFva95.iterations, 2000);
  assert.equal(evaluation.metrics.r1BootstrapFva95.iterations, 2000);
  assert.equal(evaluation.bootstrapExecutionCount, 1);
  assert.equal(evaluation.bootstrapComparisonCount, 2);
  assert.equal(evaluation.historicalComparatorEvaluationCount, 1);
  assert.equal(evaluation.structure.historicalR1SameCasePass, true);
  assert.equal(evaluation.rawCandidateEvaluationCount, 1);
  assert.equal(evaluation.privateRows.length, 10);
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
    true
  );
  assert.equal(
    config.authorization.newPrivateActualReadAuthorizedNow,
    true
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
  assert.equal(config.auditBoundary.newActualRead, true);
  assert.equal(config.experiment.completeIndependentResultProduced, false);
  assert.equal(config.experiment.preResultEngineeringAttemptCount, 3);
  assert.deepEqual(config.experiment.preResultEngineeringErrorCodes, [
    "m2_hpsr_rebuilt_work_case_duplicate",
    "hpsr02_residual_bound_rebuild_not_reconciled",
    "m2_core_revenue_manual_command_failed:node.exe"
  ]);
  assert.equal(
    config.experiment.engineeringRecoveryStatus,
    "M2_HPSR02_PRE_RESULT_ENGINEERING_FAILURE_RECOVERY_AUTHORIZED"
  );
  assert.equal(
    config.currentExecutionStatus,
    "M2_HPSR02_FROZEN_PARAMETER_AUTHORITY_DECIDED_"
      + "PENDING_PRIVATE_INTEGRITY_GATE"
  );
  assert.equal(
    config.authorization.executionBlockedBySourceAuthorityDecision,
    false
  );
  assert.equal(config.governance.preResultEngineeringRecoveryAuthorized, true);
  assert.equal(config.governance.sourceAuthorityDecisionRequired, false);
  assert.equal(
    config.authorization.immutableFrozenParameterDirectUseAuthorizedNow,
    true
  );
  assert.equal(
    config.authorization.digestBoundParameterLineageRecoveryAuthorizedNow,
    true
  );
  assert.equal(
    config.authorization.currentBillParameterDerivationAuthorizedNow,
    false
  );
  assert.equal(
    config.independentDataBoundary.currentEstimate.independentCheckpointReady,
    true
  );
  assert.equal(
    config.independentDataBoundary.currentEstimate
      .independentEvaluationExecutionReady,
    false
  );
  assert.equal(
    config.independentDataBoundary.currentEstimate
      .privateParameterIntegrityGatePending,
    true
  );
  assert.equal(config.auditBoundary.realModelEvaluationExecuted, false);
});

test("controlled evaluation loads immutable parameters before current bills", () => {
  const independentStart = privateRunnerSource.indexOf(
    "export async function runHpsr02IndependentPrivate"
  );
  const independentEnd = privateRunnerSource.indexOf(
    "export async function runHpsrRetrospectivePrivate",
    independentStart
  );
  const independentSource = privateRunnerSource.slice(
    independentStart,
    independentEnd
  );
  const parameterGateIndex = independentSource.indexOf(
    "loadOrRecoverHpsrImmutableFrozenParameters"
  );
  const sourceGateIndex = independentSource.indexOf(
    "reconcileHpsr02SourceAuthorityPrivate"
  );
  const currentFeatureIndex = independentSource.indexOf(
    "HPSR02_WORK_TOTAL_SCOPE_AWARE_AUTHORITY"
  );
  assert.ok(parameterGateIndex >= 0);
  assert.ok(sourceGateIndex > parameterGateIndex);
  assert.ok(currentFeatureIndex > sourceGateIndex);
  assert.doesNotMatch(independentSource, /deriveHpsrResidualBounds/u);
  assert.doesNotMatch(privateRunnerSource, /deriveHpsrResidualBounds/u);
  assert.match(parameterAuthoritySource, /deriveHpsrResidualBounds/u);
});

test("parameter recovery uses historical lineage and cannot consume current split or future actual", () => {
  assert.match(
    parameterAuthoritySource,
    /HPSR_FROZEN_PARAMETER_LINEAGE_SNAPSHOT/u
  );
  assert.match(
    parameterAuthoritySource,
    /M2-lg01-head-cash-residual-input-rows-private-v0\.1\.ndjson/u
  );
  assert.match(
    parameterAuthoritySource,
    /EXACT_FROZEN_H3_B3_AGGREGATE_RECONCILIATION/u
  );
  assert.match(
    parameterAuthoritySource,
    /row\?\.evaluationFamily === "STRICT_ROLLING"[\s\S]*row\?\.populationId === "CORE80"[\s\S]*Number\(row\?\.horizonMonths\) === 3/u
  );
  assert.doesNotMatch(
    parameterAuthoritySource,
    /HPSR02_WORK_TOTAL_SCOPE_AWARE_AUTHORITY/u
  );
  assert.match(
    coreRevenuePrivateSource,
    /authorityMode === HPSR_FROZEN_PARAMETER_LINEAGE_MODE[\s\S]*return;/u
  );
  assert.match(
    parameterAuthoritySource,
    /currentBillSourceUsedForParameterDerivation: false/u
  );
  assert.match(
    parameterAuthoritySource,
    /laterOriginOutcomeUsed: false/u
  );
  assert.match(
    parameterAuthoritySource,
    /prospectiveFinalHoldoutOutcomeUsed: false/u
  );
  assert.doesNotMatch(parameterAuthoritySource, /2026-0[3-9]/u);
  assert.match(
    privateRunnerSource,
    /retrospectiveOrigins: \["2026-03"\],[\s\S]*authorityMode: "HPSR02_WORK_TOTAL_SCOPE_AWARE_AUTHORITY"/u
  );
  assert.match(parameterAuthoritySource, /M2_HPSR02_BLOCKED_MISSING_IMMUTABLE_FROZEN_PARAMETER/u);
  assert.match(
    controlledSource,
    /\^hpsr02_\[a-z0-9_\]\+\$/u
  );
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
    independentEvaluationReport,
    JSON.stringify(independentEvaluation),
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
