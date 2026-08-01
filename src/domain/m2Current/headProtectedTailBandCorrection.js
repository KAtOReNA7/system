import {
  bootstrapHpsrFva,
  buildHpsrOriginCashBands,
  buildHpsrOriginCashBandsFromWorkCash,
  computeHpsrFrozenBoundedResidualCorrection,
  pairedFva,
  planHpsrProspectiveReservation,
  scoreHpsrEvaluationRows
} from "./headProtectedSegmentedRouter.js";

export const HPSR02_MODEL_ID = "M2-WORK-HPSR02";
export const HPSR02_EXPERIMENT_ID =
  "M2-EXP-LG01-HEAD-PROTECTED-TAIL-BAND-CORRECTION-02";
export const HPSR02_ARM_IDS = Object.freeze(["R0", "R1", "R2"]);
export const HPSR02_PREREGISTERED_STATUS =
  "M2_HPSR02_POST_HOC_INSPIRED_PROSPECTIVELY_"
    + "PREREGISTERED_AWAITING_INDEPENDENT_DATA";
export const HPSR02_WORKFLOW_STATUS =
  "M2_HPSR01_INTERPRETATION_AMENDED_HPSR02_"
    + "PREREGISTERED_AWAITING_INDEPENDENT_DATA";
export const HPSR02_FINAL_STATUSES = Object.freeze({
  SUPPORTED:
    "M2_HPSR02_FIRST_INDEPENDENT_SUPPORTED_FOR_SECOND_CONFIRMATION",
  UNSUPPORTED:
    "M2_HPSR02_FIRST_INDEPENDENT_NOT_SUPPORTED_"
      + "CASH_ONLY_RESEARCH_ENDED",
  MIXED:
    "M2_HPSR02_FIRST_INDEPENDENT_INCONCLUSIVE_"
      + "CASH_ONLY_RESEARCH_ENDED"
});

const MONTH_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/u;
const CASH_BANDS = Object.freeze(["H50", "M30", "L20"]);
const PREDICTION_ROW_FIELDS = new Set([
  "standardWorkId",
  "origin",
  "horizonMonths",
  "lg01Prediction",
  "cham01B3Prediction",
  "cham01Diagnostics"
]);
const DIAGNOSTIC_FIELDS = new Set([
  "signedExpm1Overflow",
  "supportRangeExtrapolation"
]);

export function runHeadProtectedTailBandCorrection({
  origin,
  horizonMonths = 3,
  originVisibleMonthlyCashRows = null,
  originVisibleWorkCashRows = null,
  predictionRows,
  residualBoundState,
  executionMode = "SYNTHETIC_FIXTURE"
}) {
  const normalizedOrigin = requireMonth(origin, "router_origin");
  if (Number(horizonMonths) !== 3) {
    throw new Error("hpsr02_only_three_month_horizon_allowed");
  }
  if (![
    "SYNTHETIC_FIXTURE",
    "CONTROLLED_LATER_ORIGIN"
  ].includes(executionMode)) {
    throw new Error("hpsr02_execution_mode_invalid");
  }
  if (
    (originVisibleMonthlyCashRows === null)
      === (originVisibleWorkCashRows === null)
  ) {
    throw new Error(
      "hpsr02_exactly_one_origin_visible_cash_input_required"
    );
  }
  if (!Array.isArray(predictionRows) || predictionRows.length === 0) {
    throw new Error("hpsr02_prediction_rows_required");
  }
  assertNoPrivateReference({
    originVisibleMonthlyCashRows,
    originVisibleWorkCashRows,
    predictionRows,
    residualBoundState
  });
  const population = originVisibleWorkCashRows === null
    ? buildHpsrOriginCashBands({
      origin: normalizedOrigin,
      originVisibleMonthlyCashRows
    })
    : buildHpsrOriginCashBandsFromWorkCash({
      origin: normalizedOrigin,
      originVisibleWorkCashRows
    });
  const normalizedPredictions = predictionRows.map((row) => (
    normalizePredictionRow(row, normalizedOrigin)
  ));
  const predictionByWork = new Map();
  for (const row of normalizedPredictions) {
    if (predictionByWork.has(row.standardWorkId)) {
      throw new Error("hpsr02_prediction_case_duplicate");
    }
    predictionByWork.set(row.standardWorkId, row);
  }
  const bandByWork = new Map(population.cashBandRows.map((row) => [
    row.standardWorkId,
    row.bandId
  ]));
  const r0Rows = [];
  const r2Rows = [];
  for (const standardWorkId of population.core80WorkIds) {
    const prediction = predictionByWork.get(standardWorkId);
    if (prediction === undefined) {
      throw new Error("hpsr02_core80_prediction_member_missing");
    }
    const cashBandId = bandByWork.get(standardWorkId);
    if (!CASH_BANDS.includes(cashBandId)) {
      throw new Error("hpsr02_cash_band_member_missing");
    }
    const common = Object.freeze({
      standardWorkId,
      origin: normalizedOrigin,
      horizonMonths: 3,
      cashBandId
    });
    r0Rows.push(Object.freeze({
      ...common,
      armId: "R0",
      modelId: "M2-WORK-LG01",
      pointEstimate: prediction.lg01Prediction,
      architectureStatus: "FROZEN_LG01_BASELINE"
    }));
    if (cashBandId !== "L20") {
      r2Rows.push(Object.freeze({
        ...common,
        armId: "R2",
        modelId: HPSR02_MODEL_ID,
        pointEstimate: prediction.lg01Prediction,
        alpha: null,
        boundedNormalizedResidual: null,
        boundedResidual: null,
        boundTriggered: false,
        correctionApplied: false,
        fallbackToLg01: false,
        fallbackReason: null,
        numericStatus:
          `${cashBandId}_EXACT_LG01_ARCHITECTURE`,
        finalPredictionFinite: true
      }));
      continue;
    }
    const correction = computeHpsrFrozenBoundedResidualCorrection({
      lg01Prediction: prediction.lg01Prediction,
      cham01B3Prediction: prediction.cham01B3Prediction,
      cham01Diagnostics: prediction.cham01Diagnostics,
      residualBoundState,
      executionMode
    });
    r2Rows.push(Object.freeze({
      ...common,
      armId: "R2",
      modelId: HPSR02_MODEL_ID,
      ...correction
    }));
  }
  const r0CaseKeys = r0Rows.map(caseKey);
  const r2CaseKeys = r2Rows.map(caseKey);
  if (JSON.stringify(r0CaseKeys) !== JSON.stringify(r2CaseKeys)) {
    throw new Error("hpsr02_case_key_conservation_failed");
  }
  const protectedRows = r2Rows.filter(
    (row) => row.cashBandId !== "L20"
  );
  const protectedRowsExact = protectedRows.every((row) => {
    const baseline = predictionByWork.get(row.standardWorkId);
    return (
      row.pointEstimate === baseline?.lg01Prediction
      && row.correctionApplied === false
      && row.fallbackToLg01 === false
    );
  });
  if (!protectedRowsExact) {
    throw new Error("hpsr02_h50_m30_exact_lg01_invariant_failed");
  }
  if (!r2Rows.every((row) => Number.isFinite(row.pointEstimate))) {
    throw new Error("hpsr02_final_prediction_nonfinite");
  }
  const l20Rows = r2Rows.filter((row) => row.cashBandId === "L20");
  const outsideDynamicCore80WorkCount = normalizedPredictions.filter(
    (row) => !bandByWork.has(row.standardWorkId)
  ).length;
  const coverage = Object.freeze({
    inputPredictionWorkCount: normalizedPredictions.length,
    dynamicCore80WorkCount: r2Rows.length,
    outsideDynamicCore80AbstainedWorkCount:
      outsideDynamicCore80WorkCount,
    H50RowCount: protectedRows.filter(
      (row) => row.cashBandId === "H50"
    ).length,
    M30RowCount: protectedRows.filter(
      (row) => row.cashBandId === "M30"
    ).length,
    L20RowCount: l20Rows.length,
    protectedH50M30RowCount: protectedRows.length,
    correctedL20RowCount: l20Rows.filter(
      (row) => row.correctionApplied
    ).length,
    numericFallbackL20RowCount: l20Rows.filter(
      (row) => row.fallbackToLg01
    ).length,
    boundTriggeredL20RowCount: l20Rows.filter(
      (row) => row.boundTriggered
    ).length,
    finiteExtremeL20RowCount: l20Rows.filter(
      (row) => row.finiteExtreme
    ).length,
    nonfiniteRawL20RowCount: l20Rows.filter(
      (row) => row.rawPredictionFinite === false
    ).length
  });
  return Object.freeze({
    schema:
      "m2.current.head_protected_tail_band_correction.run.v0.2",
    experimentId: HPSR02_EXPERIMENT_ID,
    modelId: HPSR02_MODEL_ID,
    executionMode,
    origin: normalizedOrigin,
    horizonMonths: 3,
    status: executionMode === "SYNTHETIC_FIXTURE"
      ? "PUBLIC_SYNTHETIC_HPSR02_VALIDATED"
      : "CONTROLLED_HPSR02_PREDICTIONS_COMPUTED_NO_EVALUATION",
    population,
    r0Rows: Object.freeze(r0Rows),
    r2Rows: Object.freeze(r2Rows),
    coverage,
    invariants: Object.freeze({
      dynamicCore80OriginVisibleOnly: true,
      H50M30RowwiseExactLg01: protectedRowsExact,
      L20Alpha: 1,
      globalAlphaDependency: false,
      crossBandDependency: false,
      alphaSearchExecuted: false,
      residualBoundsReestimated: false,
      workLevelSelectionExecuted: false,
      caseKeyConservationPass: true,
      allFinalR2PredictionsFinite: true,
      futureCashUsed: false,
      outcomeFieldsConsumed: false,
      privateDataAccessed: false,
      scoreComputed: false,
      bootstrapExecuted: false,
      productionSurfaceChanged: false
    })
  });
}

export function planHpsr02IndependentCheckpoint({
  maxActualValueOpenedOrigin,
  completeAuthoritativeBillMonthThrough
}) {
  const plan = planHpsrProspectiveReservation({
    maxActualValueOpenedOrigin,
    completeAuthoritativeBillMonthThrough,
    horizonMonths: 3
  });
  return Object.freeze({
    maxActualValueOpenedOrigin,
    firstIndependentLaterOrigin: plan.firstIndependentLaterOrigin,
    firstIndependentRequiredCompleteThrough:
      plan.firstIndependentRequiredCompleteThrough,
    completeAuthoritativeBillMonthThrough,
    missingOrIncompleteBillMonths: Object.freeze(
      plan.firstIndependentFutureBillMonths.filter(
        (month) => month > completeAuthoritativeBillMonthThrough
      )
    ),
    independentCheckpointReady:
      plan.firstIndependentLaterOriginReady,
    prospectiveFinalHoldoutOrigin:
      plan.prospectiveFinalHoldoutOrigin,
    prospectiveFinalHoldoutRequiredCompleteThrough:
      plan.prospectiveFinalHoldoutRequiredCompleteThrough,
    prospectiveFinalHoldoutOpened: false,
    prospectiveFinalHoldoutOutcomeRead: false
  });
}

export function classifyHpsr02IndependentEvidence({
  pairedFva,
  bootstrapLower,
  absoluteBiasWorsening,
  H50M30EqualityPass,
  allFinite,
  caseKeyPass,
  originVisibilityPass,
  dataValidityPass,
  catastrophicSingleWorkDominance
}) {
  for (const [name, value] of Object.entries({
    pairedFva,
    bootstrapLower,
    absoluteBiasWorsening
  })) {
    if (!Number.isFinite(value)) {
      throw new Error(`hpsr02_${name}_must_be_finite`);
    }
  }
  const structuralFailures = Object.freeze([
    H50M30EqualityPass === true
      ? null
      : "H50_M30_EQUALITY_FAILED",
    allFinite === true ? null : "UNISOLATED_NONFINITE",
    caseKeyPass === true ? null : "CASE_KEY_VALIDITY_FAILED",
    originVisibilityPass === true
      ? null
      : "ORIGIN_VISIBILITY_FAILED",
    dataValidityPass === true ? null : "DATA_VALIDITY_FAILED",
    catastrophicSingleWorkDominance === true
      ? "CATASTROPHIC_SINGLE_WORK_ERROR_DOMINANCE"
      : null
  ].filter(Boolean));
  const thresholdDistances = Object.freeze({
    supportedFva: Math.abs(pairedFva - 0.01),
    supportedBootstrapLower: Math.abs(bootstrapLower),
    supportedBias: Math.abs(absoluteBiasWorsening - 0.01),
    unsupportedFva: Math.abs(pairedFva + 0.01),
    unsupportedBias: Math.abs(absoluteBiasWorsening - 0.025)
  });
  const thresholdSensitive = Object.values(thresholdDistances).some(
    (distance) => distance <= 0.0025
  );
  const supported = (
    pairedFva >= 0.01
    && bootstrapLower > 0
    && absoluteBiasWorsening <= 0.01
    && structuralFailures.length === 0
  );
  const unsupportedReasons = Object.freeze([
    pairedFva <= -0.01
      ? "WAPE_FVA_DEGRADED_AT_LEAST_ONE_PERCENT"
      : null,
    (
      absoluteBiasWorsening > 0.025
      && pairedFva < 0.01
    )
      ? "ABSOLUTE_BIAS_WORSENED_OVER_2_5_POINTS_WITHOUT_1_PERCENT_FVA"
      : null,
    ...structuralFailures
  ].filter(Boolean));
  let classification = "MIXED";
  if (structuralFailures.length > 0) {
    classification = "UNSUPPORTED";
  } else if (thresholdSensitive) {
    classification = "MIXED";
  } else if (supported) {
    classification = "SUPPORTED";
  } else if (unsupportedReasons.length > 0) {
    classification = "UNSUPPORTED";
  }
  return Object.freeze({
    classification,
    thresholdSensitive,
    thresholdSensitiveStatus: thresholdSensitive
      ? "THRESHOLD_SENSITIVE"
      : null,
    thresholdDistances,
    structuralFailures,
    unsupportedReasons,
    independentCheckpointOnly: true,
    approvedForAutomation: false,
    productionReady: false,
    prospectiveFinalHoldoutPreserved: true
  });
}

export function evaluateHpsr02IndependentEvaluation({
  routerResult,
  historicalRouterResult,
  actualRows,
  eligibleActualRows,
  sourceGate,
  bootstrap = {}
}) {
  if (
    routerResult?.modelId !== HPSR02_MODEL_ID
    || routerResult?.origin !== "2026-03"
    || routerResult?.horizonMonths !== 3
    || routerResult?.executionMode !== "CONTROLLED_LATER_ORIGIN"
    || routerResult?.invariants?.scoreComputed !== false
    || routerResult?.invariants?.bootstrapExecuted !== false
  ) {
    throw new Error("hpsr02_independent_router_result_invalid");
  }
  if (
    historicalRouterResult?.modelId !== "M2-WORK-HPSR01"
    || historicalRouterResult?.origin !== "2026-03"
    || historicalRouterResult?.horizonMonths !== 3
    || historicalRouterResult?.executionMode !== "CONTROLLED_LATER_ORIGIN"
    || historicalRouterResult?.invariants?.scoreComputed !== false
    || historicalRouterResult?.invariants?.bootstrapExecuted !== false
  ) {
    throw new Error("hpsr02_independent_historical_router_result_invalid");
  }
  if (
    sourceGate?.sourceAuthorityStatus
      !== "SOURCE_AUTHORITY_AVAILABLE_FOR_WORK_TOTAL"
    || sourceGate?.workTotalSourceAuthorityChecksPass !== true
    || sourceGate?.workChannelGateStatus !== "PARTIAL_NOT_ACTIVE"
    || sourceGate?.futureActualOutcomeOpened !== false
  ) {
    throw new Error("hpsr02_independent_source_gate_invalid");
  }
  const normalizedActual = normalizeIndependentActualRows(
    actualRows,
    "2026-03"
  );
  const normalizedEligible = normalizeIndependentActualRows(
    eligibleActualRows,
    "2026-03"
  );
  const actualByWork = new Map(normalizedActual.map((row) => [
    row.standardWorkId,
    row.actual
  ]));
  const r0ByWork = independentWorkIndex(routerResult.r0Rows, "R0");
  const r1ByWork = independentWorkIndex(
    historicalRouterResult.r1RawRouterRows,
    "R1"
  );
  const r2ByWork = independentWorkIndex(routerResult.r2Rows, "R2");
  const core80Ids = [...routerResult.population.core80WorkIds];
  if (
    !sameIndependentValues([...r0ByWork.keys()], core80Ids)
    || !sameIndependentValues([...r1ByWork.keys()], core80Ids)
    || !sameIndependentValues([...r2ByWork.keys()], core80Ids)
    || !sameIndependentValues(
      historicalRouterResult.population.core80WorkIds,
      core80Ids
    )
    || core80Ids.some((workId) => !actualByWork.has(workId))
  ) {
    throw new Error("hpsr02_independent_exact_same_case_failed");
  }
  const privateRows = core80Ids.map((standardWorkId) => {
    const r0 = r0ByWork.get(standardWorkId);
    const r1 = r1ByWork.get(standardWorkId);
    const r2 = r2ByWork.get(standardWorkId);
    if (
      r0.cashBandId !== r1.cashBandId
      || r0.cashBandId !== r2.cashBandId
    ) {
      throw new Error("hpsr02_independent_cash_band_mismatch");
    }
    return Object.freeze({
      schema:
        "m2.current.head_protected_tail_band_correction."
          + "independent_evaluation_row.private.v0.2",
      experimentId: HPSR02_EXPERIMENT_ID,
      modelId: HPSR02_MODEL_ID,
      actualDefinitionId:
        "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01",
      standardWorkId,
      origin: "2026-03",
      horizonMonths: 3,
      cashBandId: r2.cashBandId,
      actual: actualByWork.get(standardWorkId),
      r0PointEstimate: r0.pointEstimate,
      r1PointEstimate: r1.pointEstimate,
      r1BoundTriggered: r1.boundTriggered,
      r1CorrectionApplied: r1.correctionApplied,
      r1FallbackToLg01: r1.fallbackToLg01,
      r1FallbackReason: r1.fallbackReason,
      r1NumericStatus: r1.numericStatus,
      r1RawPredictionFinite: r1.rawPredictionFinite ?? null,
      r2PointEstimate: r2.pointEstimate,
      r2BoundTriggered: r2.boundTriggered,
      r2CorrectionApplied: r2.correctionApplied,
      r2FallbackToLg01: r2.fallbackToLg01,
      r2FallbackReason: r2.fallbackReason,
      r2NumericStatus: r2.numericStatus,
      rawPredictionFinite: r2.rawPredictionFinite ?? null,
      caseKey: [
        "STRICT_ROLLING",
        "CORE80",
        standardWorkId,
        "2026-03",
        "3",
        "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01"
      ].join("\u0000")
    });
  }).sort((left, right) => (
    left.standardWorkId.localeCompare(right.standardWorkId)
  ));
  const caseKeys = privateRows.map((row) => row.caseKey);
  if (new Set(caseKeys).size !== privateRows.length) {
    throw new Error("hpsr02_independent_case_key_duplicate");
  }
  const r0 = scoreHpsrEvaluationRows(
    privateRows,
    "r0PointEstimate"
  );
  const r1 = scoreHpsrEvaluationRows(
    privateRows,
    "r1PointEstimate"
  );
  const r2 = scoreHpsrEvaluationRows(
    privateRows,
    "r2PointEstimate"
  );
  const relativeFva = pairedFva(r2, r0);
  const r1RelativeFva = pairedFva(r1, r0);
  const pairedAbsoluteErrorReduction =
    r0.absoluteErrorTotal - r2.absoluteErrorTotal;
  const r1PairedAbsoluteErrorReduction =
    r0.absoluteErrorTotal - r1.absoluteErrorTotal;
  const pairedAbsoluteErrorReductionOverActualCash =
    r0.absoluteActualTotal > 0
      ? pairedAbsoluteErrorReduction / r0.absoluteActualTotal
      : null;
  const r1PairedAbsoluteErrorReductionOverActualCash =
    r0.absoluteActualTotal > 0
      ? r1PairedAbsoluteErrorReduction / r0.absoluteActualTotal
      : null;
  const iterations = Number(bootstrap.iterations ?? 2000);
  const seed = Number(bootstrap.seed ?? 20260801);
  if (iterations !== 2000 || !Number.isInteger(seed) || seed < 0) {
    throw new Error("hpsr02_independent_bootstrap_contract_invalid");
  }
  const bootstrapResult = bootstrapHpsrFva(privateRows, {
    candidateField: "r2PointEstimate",
    baselineField: "r0PointEstimate",
    iterations,
    seed
  });
  const r1BootstrapResult = bootstrapHpsrFva(privateRows, {
    candidateField: "r1PointEstimate",
    baselineField: "r0PointEstimate",
    iterations,
    seed
  });
  if (
    bootstrapResult.iterations !== 2000
    || bootstrapResult.interval95 === null
    || r1BootstrapResult.iterations !== 2000
    || r1BootstrapResult.interval95 === null
  ) {
    throw new Error("hpsr02_independent_bootstrap_incomplete");
  }
  const cashBands = Object.freeze(Object.fromEntries(CASH_BANDS.map(
    (cashBandId) => {
      const rows = privateRows.filter(
        (row) => row.cashBandId === cashBandId
      );
      const baseline = scoreHpsrEvaluationRows(
        rows,
        "r0PointEstimate",
        "NO_ROWS_IN_CASH_BAND"
      );
      const candidate = scoreHpsrEvaluationRows(
        rows,
        "r2PointEstimate",
        "NO_ROWS_IN_CASH_BAND"
      );
      const historical = scoreHpsrEvaluationRows(
        rows,
        "r1PointEstimate",
        "NO_ROWS_IN_CASH_BAND"
      );
      const errorReduction =
        baseline.absoluteErrorTotal - candidate.absoluteErrorTotal;
      const historicalErrorReduction =
        baseline.absoluteErrorTotal - historical.absoluteErrorTotal;
      return [cashBandId, Object.freeze({
        workCount: rows.length,
        actualCash: candidate.absoluteActualTotal,
        actualCashShare: r2.absoluteActualTotal > 0
          ? candidate.absoluteActualTotal / r2.absoluteActualTotal
          : null,
        r0: baseline,
        r1: historical,
        r2: candidate,
        r1AbsoluteErrorReduction: historicalErrorReduction,
        r1Direction: historicalErrorReduction > 0
          ? "IMPROVED"
          : historicalErrorReduction < 0
            ? "DEGRADED"
            : "TIED",
        absoluteErrorReduction: errorReduction,
        direction: errorReduction > 0
          ? "IMPROVED"
          : errorReduction < 0
            ? "DEGRADED"
            : "TIED"
      })];
    }
  )));
  const H50M30EqualityPass = privateRows.filter(
    (row) => row.cashBandId !== "L20"
  ).every((row) => (
    Object.is(row.r0PointEstimate, row.r2PointEstimate)
    && row.r2CorrectionApplied === false
    && row.r2FallbackToLg01 === false
  ));
  const allFinite = privateRows.every((row) => (
    Number.isFinite(row.actual)
    && Number.isFinite(row.r0PointEstimate)
    && Number.isFinite(row.r1PointEstimate)
    && Number.isFinite(row.r2PointEstimate)
  ));
  const absoluteBiasWorsening =
    r2.absoluteBias - r0.absoluteBias;
  const concentrationWorsening =
    r2.errorConcentration.maximumWorkShare
      - r0.errorConcentration.maximumWorkShare;
  const catastrophicSingleWorkDominance = (
    relativeFva < 0
    && r2.errorConcentration.maximumWorkShare >= 0.35
    && concentrationWorsening >= 0.1
  );
  const evidence = classifyHpsr02IndependentEvidence({
    pairedFva: relativeFva,
    bootstrapLower: bootstrapResult.interval95.lower,
    absoluteBiasWorsening,
    H50M30EqualityPass,
    allFinite,
    caseKeyPass: new Set(caseKeys).size === privateRows.length,
    originVisibilityPass:
      routerResult.population.futureCashUsed === false,
    dataValidityPass: true,
    catastrophicSingleWorkDominance
  });
  const status = HPSR02_FINAL_STATUSES[evidence.classification];
  const eligibleActualCash = normalizedEligible.reduce(
    (total, row) => total + Math.abs(row.actual),
    0
  );
  const l20Rows = privateRows.filter(
    (row) => row.cashBandId === "L20"
  );
  return Object.freeze({
    schema:
      "m2.current.head_protected_tail_band_correction."
        + "independent_evaluation.v0.2",
    experimentId: HPSR02_EXPERIMENT_ID,
    modelId: HPSR02_MODEL_ID,
    status,
    classification: evidence.classification,
    origin: "2026-03",
    horizonMonths: 3,
    actualWindow: Object.freeze([
      "2026-04",
      "2026-05",
      "2026-06"
    ]),
    caseCount: privateRows.length,
    workCount: privateRows.length,
    eligibleWorkCount: normalizedEligible.length,
    core80ActualCashCoverage: eligibleActualCash > 0
      ? r2.absoluteActualTotal / eligibleActualCash
      : null,
    metrics: Object.freeze({
      r0,
      r1,
      r2,
      r1PairedAbsoluteErrorReduction,
      r1PairedAbsoluteErrorReductionOverActualCash,
      r1RelativeFva,
      r1BootstrapFva95: r1BootstrapResult,
      pairedAbsoluteErrorReduction,
      pairedAbsoluteErrorReductionOverActualCash,
      relativeFva,
      absoluteBiasWorsening,
      bootstrapFva95: bootstrapResult
    }),
    cashBands,
    numeric: Object.freeze({
      clipCount: privateRows.filter(
        (row) => row.r2BoundTriggered
      ).length,
      correctionCount: privateRows.filter(
        (row) => row.r2CorrectionApplied
      ).length,
      fallbackCount: privateRows.filter(
        (row) => row.r2FallbackToLg01
      ).length,
      nonfiniteRawL20Count: l20Rows.filter(
        (row) => row.rawPredictionFinite === false
      ).length,
      rawL20Coverage: l20Rows.length > 0
        ? l20Rows.filter(
          (row) => row.rawPredictionFinite === true
        ).length / l20Rows.length
        : null,
      historicalR1: Object.freeze({
        clipCount: privateRows.filter(
          (row) => row.r1BoundTriggered
        ).length,
        correctionCount: privateRows.filter(
          (row) => row.r1CorrectionApplied
        ).length,
        fallbackCount: privateRows.filter(
          (row) => row.r1FallbackToLg01
        ).length,
        nonfiniteRawCount: privateRows.filter(
          (row) => row.r1RawPredictionFinite === false
        ).length,
        rawCoverage: privateRows.length > 0
          ? privateRows.filter(
            (row) => row.r1RawPredictionFinite === true
          ).length / privateRows.length
          : null
      }),
      allFinalPredictionsFinite: allFinite
    }),
    structure: Object.freeze({
      H50M30RowwiseExactLg01: H50M30EqualityPass,
      caseKeyConservationPass: true,
      historicalR1SameCasePass: true,
      originVisibleOnly: true,
      workTotalPrimary: true,
      workChannelStatus: "PARTIAL_NOT_ACTIVE",
      futureActualUsedForPopulationFeaturesOrBands: false
    }),
    decision: evidence,
    bootstrapExecutionCount: 1,
    bootstrapComparisonCount: 2,
    historicalComparatorEvaluationCount: 1,
    rawCandidateEvaluationCount: 1,
    privateRows: Object.freeze(privateRows)
  });
}

export function validateHeadProtectedTailBandCorrectionContract(config) {
  const errors = [];
  let currentBoundary = null;
  try {
    currentBoundary = planHpsr02IndependentCheckpoint({
      maxActualValueOpenedOrigin:
        config?.independentDataBoundary?.currentEstimate
          ?.maxActualValueOpenedOrigin,
      completeAuthoritativeBillMonthThrough:
        config?.independentDataBoundary?.currentEstimate
          ?.completeAuthoritativeBillMonthThrough
    });
  } catch {
    errors.push("hpsr02_current_boundary_inputs_invalid");
  }
  if (
    config?.schema
      !== "m2.current.head_protected_tail_band_correction.v0.2"
    || config?.model?.stableModelId !== HPSR02_MODEL_ID
    || config?.experiment?.stableExperimentId
      !== HPSR02_EXPERIMENT_ID
    || config?.status !== HPSR02_PREREGISTERED_STATUS
    || config?.workflowStatus !== HPSR02_WORKFLOW_STATUS
    || config?.inspiration?.classification
      !== "POST_HOC_INSPIRED_PROSPECTIVELY_PREREGISTERED"
  ) {
    errors.push("hpsr02_identity_or_status_invalid");
  }
  if (
    JSON.stringify(config?.experiment?.arms?.map(
      (arm) => arm.armId
    )) !== JSON.stringify(HPSR02_ARM_IDS)
    || config?.experiment?.primaryCandidateArmId !== "R2"
    || config?.experiment?.historicalComparatorArmId !== "R1"
    || config?.experiment?.baselineArmId !== "R0"
  ) {
    errors.push("hpsr02_arm_contract_invalid");
  }
  if (
    config?.scope?.horizonsMonths?.length !== 1
    || config.scope.horizonsMonths[0] !== 3
    || config?.scope?.population !== "DYNAMIC_CORE80"
    || config?.scope?.originMatureLegacyWorkOnly !== true
    || config?.scope?.originObservedMatureChannelOnly !== true
    || config?.scope?.futureNewWorkAuthorized !== false
    || config?.scope?.futureFirstObservedChannelAuthorized !== false
    || config?.scope?.outsideCore80TailAuthorized !== false
    || config?.scope?.companyFutureRevenueAuthorized !== false
  ) {
    errors.push("hpsr02_scope_invalid");
  }
  if (
    config?.cashBands?.sourceContract
      !== "HPSR01_IDENTICAL_ORIGIN_VISIBLE_DYNAMIC_CORE80_BANDS"
    || config?.cashBands?.cutoffTiePolicy
      !== "WHOLE_WORK_STAYS_IN_HIGHER_CASH_BAND"
    || config?.cashBands?.fixedWorkCountThresholdAllowed !== false
    || config?.frozenStructure?.H50?.prediction !== "FROZEN_LG01"
    || config?.frozenStructure?.M30?.prediction !== "FROZEN_LG01"
    || config?.frozenStructure?.L20?.prediction
      !== "HPSR01_FROZEN_BOUNDED_RESIDUAL_CORRECTION"
    || config?.frozenStructure?.L20?.alpha !== 1
    || config?.frozenStructure?.globalAlphaAllowed !== false
    || config?.frozenStructure?.alphaSearchAllowed !== false
    || config?.frozenStructure?.residualBoundReestimationAllowed
      !== false
    || config?.frozenStructure?.workLevelSelectionAllowed !== false
  ) {
    errors.push("hpsr02_frozen_structure_invalid");
  }
  const policy = config?.independentEvaluation?.decisionPolicy;
  if (
    policy?.supported?.minimumPairedFva !== 0.01
    || policy?.supported?.bootstrapLowerExclusive !== 0
    || policy?.supported?.maximumAbsoluteBiasWorsening !== 0.01
    || policy?.unsupported?.maximumPairedFva !== -0.01
    || policy?.unsupported?.absoluteBiasWorseningExclusive !== 0.025
    || policy?.thresholdSensitive?.distanceInclusive !== 0.0025
    || policy?.thresholdSensitive?.classificationWithoutStructuralFailure
      !== "MIXED"
  ) {
    errors.push("hpsr02_decision_policy_invalid");
  }
  const estimate = config?.independentDataBoundary?.currentEstimate;
  if (currentBoundary !== null) {
    for (const key of [
      "maxActualValueOpenedOrigin",
      "firstIndependentLaterOrigin",
      "firstIndependentRequiredCompleteThrough",
      "completeAuthoritativeBillMonthThrough",
      "prospectiveFinalHoldoutOrigin",
      "prospectiveFinalHoldoutRequiredCompleteThrough"
    ]) {
      if (estimate?.[key] !== currentBoundary[key]) {
        errors.push(`hpsr02_current_boundary_${key}_invalid`);
      }
    }
    if (
      JSON.stringify(estimate?.missingOrIncompleteBillMonths)
        !== JSON.stringify(currentBoundary.missingOrIncompleteBillMonths)
      || estimate?.independentCheckpointReady
        !== currentBoundary.independentCheckpointReady
      || estimate?.prospectiveFinalHoldoutOpened !== false
      || estimate?.workTotalSourceAuthorityStatus
        !== "SOURCE_AUTHORITY_AVAILABLE_FOR_WORK_TOTAL"
      || estimate?.workTotalCanonicalMappingStatus
        !== "WORK_TOTAL_CANONICAL_MAPPING_WARNING_"
          + "WORK_CHANNEL_REMAINS_PARTIAL"
      || estimate?.metadataDifferenceStatus
        !== "OUT_OF_WORK_TOTAL_SCOPE_FACT_DIFFERENCE_WARNING"
      || estimate?.workTotalScopeRelevantDifferenceRowCount !== 0
      || estimate?.workChannelGateStatus !== "PARTIAL_NOT_ACTIVE"
    ) {
      errors.push("hpsr02_current_boundary_readiness_invalid");
    }
  }
  if (
    config?.authorization?.source
      !== "USER_INSTRUCTION_M2_HPSR02_SOURCE_AUTHORITY_"
        + "RECONCILIATION_AND_RESUME_2026_08_01"
    || config?.authorization?.independentK2EvaluationAuthorizedNow
      !== true
    || config?.authorization?.newPrivateActualReadAuthorizedNow
      !== true
    || config?.authorization?.modelTrainingAuthorizedNow !== false
    || config?.authorization?.alphaSearchAuthorizedNow !== false
    || config?.authorization?.residualBoundReestimationAuthorizedNow
      !== false
    || config?.authorization?.prospectiveFinalHoldoutOpenAuthorizedNow
      !== false
    || config?.authorization?.productionAuthorized !== false
    || config?.authorization?.mergeAuthorized !== false
    || config?.governance?.activeCandidate !== null
    || config?.governance?.approvedForAutomation !== null
    || config?.governance?.productionReady !== false
    || config?.governance?.finalHoldoutOpened !== false
    || config?.implementation?.privateRunnerCreated !== true
    || config?.implementation?.realEvaluationEntrypointCreated !== true
  ) {
    errors.push("hpsr02_authorization_or_governance_invalid");
  }
  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors)
  });
}

function normalizeIndependentActualRows(rows, origin) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("hpsr02_independent_actual_rows_required");
  }
  const output = rows.map((row) => {
    if (
      row === null
      || typeof row !== "object"
      || Array.isArray(row)
      || Object.keys(row).some((key) => ![
        "standardWorkId",
        "origin",
        "horizonMonths",
        "actual"
      ].includes(key))
    ) {
      throw new Error("hpsr02_independent_actual_row_invalid");
    }
    if (
      requireMonth(row.origin, "independent_actual_origin") !== origin
      || Number(row.horizonMonths) !== 3
    ) {
      throw new Error("hpsr02_independent_actual_case_mismatch");
    }
    return Object.freeze({
      standardWorkId: nonempty(
        row.standardWorkId,
        "independent_actual_work_id"
      ),
      origin,
      horizonMonths: 3,
      actual: finiteNumber(row.actual, "independent_actual")
    });
  });
  if (
    new Set(output.map((row) => row.standardWorkId)).size
      !== output.length
  ) {
    throw new Error("hpsr02_independent_actual_work_duplicate");
  }
  return output;
}

function independentWorkIndex(rows, expectedArmId) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("hpsr02_independent_prediction_rows_required");
  }
  const output = new Map();
  for (const row of rows) {
    const standardWorkId = nonempty(
      row?.standardWorkId,
      "independent_prediction_work_id"
    );
    if (
      row?.armId !== expectedArmId
      || row?.origin !== "2026-03"
      || Number(row?.horizonMonths) !== 3
      || output.has(standardWorkId)
    ) {
      throw new Error("hpsr02_independent_prediction_identity_invalid");
    }
    output.set(standardWorkId, row);
  }
  return output;
}

function sameIndependentValues(left, right) {
  return JSON.stringify([...left].sort())
    === JSON.stringify([...right].sort());
}

function normalizePredictionRow(row, origin) {
  if (row === null || typeof row !== "object" || Array.isArray(row)) {
    throw new Error("hpsr02_prediction_row_invalid");
  }
  for (const key of Object.keys(row)) {
    if (!PREDICTION_ROW_FIELDS.has(key)) {
      throw new Error(`hpsr02_prediction_field_forbidden_${key}`);
    }
  }
  const standardWorkId = nonempty(
    row.standardWorkId,
    "prediction_standard_work_id"
  );
  if (requireMonth(row.origin, "prediction_origin") !== origin) {
    throw new Error("hpsr02_prediction_origin_mismatch");
  }
  if (Number(row.horizonMonths) !== 3) {
    throw new Error("hpsr02_prediction_horizon_mismatch");
  }
  const lg01Prediction = finiteNumber(
    row.lg01Prediction,
    "prediction_lg01"
  );
  if (
    row.cham01B3Prediction !== null
    && row.cham01B3Prediction !== undefined
    && typeof row.cham01B3Prediction !== "number"
  ) {
    throw new Error("hpsr02_prediction_cham01_type_invalid");
  }
  const diagnostics = row.cham01Diagnostics ?? {};
  for (const key of Object.keys(diagnostics)) {
    if (!DIAGNOSTIC_FIELDS.has(key)) {
      throw new Error(`hpsr02_diagnostic_field_forbidden_${key}`);
    }
    if (typeof diagnostics[key] !== "boolean") {
      throw new Error(`hpsr02_diagnostic_field_type_invalid_${key}`);
    }
  }
  return Object.freeze({
    standardWorkId,
    origin,
    horizonMonths: 3,
    lg01Prediction,
    cham01B3Prediction: row.cham01B3Prediction ?? null,
    cham01Diagnostics: Object.freeze({
      signedExpm1Overflow:
        diagnostics.signedExpm1Overflow === true,
      supportRangeExtrapolation:
        diagnostics.supportRangeExtrapolation === true
    })
  });
}

function assertNoPrivateReference(value) {
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    if (
      /data[\\/]+private-(?:input|output)/iu.test(value)
      || /[A-Z]:[\\/]/u.test(value)
    ) {
      throw new Error("hpsr02_private_or_absolute_path_forbidden");
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertNoPrivateReference(item);
    return;
  }
  if (typeof value === "object") {
    for (const nested of Object.values(value)) {
      assertNoPrivateReference(nested);
    }
  }
}

function caseKey(row) {
  return [
    row.standardWorkId,
    row.origin,
    Number(row.horizonMonths)
  ].join("\u0000");
}

function requireMonth(value, name) {
  if (typeof value !== "string" || !MONTH_PATTERN.test(value)) {
    throw new Error(`hpsr02_${name}_invalid`);
  }
  return value;
}

function finiteNumber(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`hpsr02_${name}_must_be_finite`);
  }
  return value;
}

function nonempty(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`hpsr02_${name}_required`);
  }
  return value.trim();
}
