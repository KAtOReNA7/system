import {
  monthToSerial,
  serialToMonth
} from "./coreRevenueManual.js";

export const M2_CORE_HORIZON_AMOUNT_EXPERIMENT_ID =
  "M2-EXP-CORE-HORIZON-AMOUNT-01";
export const M2_CORE_HORIZON_AMOUNT_MODEL_ID = "M2-WORK-CHAM01";
export const M2_CORE_HORIZON_AMOUNT_ACTUAL_ID =
  "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01";

const HORIZONS = Object.freeze([3, 6, 12]);
const RAW_ARMS = Object.freeze(["B1", "B2", "B3"]);
const EPSILON = 1e-12;
const BASE_FEATURES = Object.freeze([
  ["trailing1Cash", "SIGNED_LOG1P", true],
  ["trailing3Cash", "SIGNED_LOG1P", true],
  ["trailing6Cash", "SIGNED_LOG1P", true],
  ["trailing12Cash", "SIGNED_LOG1P", true],
  ["sixMonthSlope", "IDENTITY", true],
  ["sixMonthRelativeSlope", "IDENTITY", true],
  ["trailing6ToPrevious6Ratio", "IDENTITY", true],
  ["trailing12ToPrevious12Ratio", "IDENTITY", true],
  ["currentToHistoricalPeakRatio", "IDENTITY", true],
  ["monthsSinceHistoricalPeak", "IDENTITY", true],
  ["validHistoryMonths", "IDENTITY", false],
  ["matureChannelCount", "IDENTITY", false],
  ["trailing12ZeroShare", "IDENTITY", true],
  ["trailing12CoefficientOfVariation", "IDENTITY", true],
  ["workAgeMonths", "IDENTITY", false],
  ["core80", "BINARY", false],
  ["core90", "BINARY", false]
]);

export class M2CoreHorizonAmountError extends Error {
  constructor(code) {
    super(code);
    this.name = "M2CoreHorizonAmountError";
    this.code = code;
  }
}

export function validateM2CoreLegacyHorizonAmountConfig(config) {
  requireObject(config, "config");
  if (config.schema !== "m2.current.core_legacy_horizon_amount.v0.1") {
    fail("m2_core_horizon_amount_config_schema_invalid");
  }
  if (
    config.experiment?.stableExperimentId
      !== M2_CORE_HORIZON_AMOUNT_EXPERIMENT_ID
    || config.model?.stableModelId !== M2_CORE_HORIZON_AMOUNT_MODEL_ID
    || config.authority?.actualDefinitionId
      !== M2_CORE_HORIZON_AMOUNT_ACTUAL_ID
  ) {
    fail("m2_core_horizon_amount_identity_invalid");
  }
  if (
    JSON.stringify(config.scope?.horizonsMonths) !== "[3,6,12]"
    || config.scope?.primaryPopulationId !== "CORE80"
    || config.scope?.sensitivityPopulationId !== "CORE90"
    || config.scope?.hardCoreOnlyTrainingAllowed !== false
    || config.scope?.workTotalOnly !== true
    || config.scope?.channelAllocationAuthorized !== false
  ) {
    fail("m2_core_horizon_amount_scope_invalid");
  }
  const arms = new Map((config.arms ?? []).map((arm) => [arm.armId, arm]));
  if (
    [...["B0", ...RAW_ARMS]].some((armId) => !arms.has(armId))
    || arms.get("B0")?.modelId !== "M2-WORK-LG01"
    || arms.get("B0")?.refitOrChangeAllowed !== false
    || arms.get("B1")?.trainingWeight !== "ONE_PER_WORK_ORIGIN_HORIZON"
    || arms.get("B2")?.minimumWeight !== 1
    || arms.get("B2")?.maximumWeight !== 4
    || arms.get("B3")?.lg01Input !== true
    || arms.get("B3")?.globalMultiplierOnlyAllowed !== false
  ) {
    fail("m2_core_horizon_amount_arms_invalid");
  }
  if (
    config.training?.targetTransform !== "REVERSIBLE_SIGNED_LOG1P"
    || config.training?.loss !== "HUBER_IN_TRANSFORMED_AMOUNT_SPACE"
    || JSON.stringify(config.training?.grid?.huberDelta) !== "[1,1.5]"
    || JSON.stringify(config.training?.grid?.l2) !== "[0.1,1,10]"
    || config.training?.horizonsFitIndependently !== true
  ) {
    fail("m2_core_horizon_amount_training_contract_invalid");
  }
  if (
    config.evaluation?.bootstrap?.iterations !== 2000
    || config.evaluation?.bootstrap?.clusterUnit !== "standardWorkId"
    || config.decisionPolicy?.minimumRelativeWapeImprovement !== 0.01
    || config.decisionPolicy
      ?.bootstrapRelativeWapeImprovementLowerBoundMustExceed !== 0
    || config.decisionPolicy
      ?.minimumImprovingIndependentTimeBlockShareExclusive !== 0.5
    || config.decisionPolicy?.maximumAbsoluteBiasWorsening !== 0.02
    || config.decisionPolicy?.maximumCandidateAbsoluteBias !== 0.15
    || config.decisionPolicy?.rawCandidateRequired !== true
  ) {
    fail("m2_core_horizon_amount_evaluation_contract_invalid");
  }
  if (
    !Number.isInteger(config.publicPrivacy?.minimumCaseCount)
    || config.publicPrivacy.minimumCaseCount < 1
    || !Number.isInteger(config.publicPrivacy?.minimumWorkCount)
    || config.publicPrivacy.minimumWorkCount < 1
    || config.publicPrivacy?.suppressionStatus
      !== "SUPPRESSED_PRIVACY_THRESHOLD"
  ) {
    fail("m2_core_horizon_amount_public_privacy_invalid");
  }
  if (
    config.execution?.singlePrivateDevelopmentExecution !== true
    || config.execution?.firstCompleteInterpretableRawResultFreezes !== true
    || config.execution?.secondResultAfterCompleteAllowed !== false
    || config.authorization?.production !== false
    || config.authorization?.automation !== false
    || config.authorization?.pullRequestMerge !== false
  ) {
    fail("m2_core_horizon_amount_authorization_invalid");
  }
  const serialized = JSON.stringify(config);
  if (
    /[A-Z]:[\\/]/u.test(serialized)
    || /(?:^|[\\/])Users[\\/]/u.test(serialized)
    || /\b[0-9a-f]{40}\b/iu.test(serialized)
  ) {
    fail("m2_core_horizon_amount_nonportable_contract");
  }
  return Object.freeze({
    valid: true,
    modelId: M2_CORE_HORIZON_AMOUNT_MODEL_ID,
    experimentId: M2_CORE_HORIZON_AMOUNT_EXPERIMENT_ID
  });
}

export function signedLog1p(value) {
  const number = finite(value, "signed_log1p_value");
  return Math.sign(number) * Math.log1p(Math.abs(number));
}

export function signedExpm1(value) {
  const number = finite(value, "signed_expm1_value");
  return Math.sign(number) * Math.expm1(Math.abs(number));
}

export function buildM2CoreHorizonAmountFeatureRow({
  row,
  monthlyHistory,
  lg01PointEstimate = null
}) {
  requireObject(row, "feature_row");
  const origin = requireMonth(row.origin, "feature_origin");
  const horizonMonths = requireHorizon(row.horizonMonths);
  const originSerial = monthToSerial(origin);
  if (!Array.isArray(monthlyHistory)) {
    fail("m2_core_horizon_amount_history_required");
  }
  const visibleBySerial = new Map();
  let futureHistoryRowCount = 0;
  for (const item of monthlyHistory) {
    const month = requireMonth(item?.month, "history_month");
    const serial = monthToSerial(month);
    if (serial > originSerial) {
      futureHistoryRowCount += 1;
      continue;
    }
    visibleBySerial.set(
      serial,
      (visibleBySerial.get(serial) ?? 0) + finite(item.cash, "history_cash")
    );
  }
  const firstVisibleSerial = visibleBySerial.size > 0
    ? Math.min(...visibleBySerial.keys())
    : originSerial;
  const dense = [];
  for (let serial = firstVisibleSerial; serial <= originSerial; serial += 1) {
    dense.push(visibleBySerial.get(serial) ?? 0);
  }
  if (dense.length === 0) dense.push(0);
  const trailing1Cash = completeWindowSum(dense, 1);
  const trailing3Cash = completeWindowSum(dense, 3);
  const trailing6Cash = completeWindowSum(dense, 6);
  const trailing12Cash = completeWindowSum(dense, 12);
  const previous6Cash = completeWindowSum(
    dense.slice(0, Math.max(0, dense.length - 6)),
    6
  );
  const previous12Cash = completeWindowSum(
    dense.slice(0, Math.max(0, dense.length - 12)),
    12
  );
  const recent6 = dense.length >= 6 ? dense.slice(-6) : null;
  const slope = recent6 === null ? null : linearSlope(recent6);
  const slopeScale = recent6 === null
    ? null
    : Math.max(EPSILON, mean(recent6.map(Math.abs)));
  const peak = maximum(dense);
  const peakIndex = latestIndexOf(dense, peak);
  const trailing12 = dense.length >= 12 ? dense.slice(-12) : null;
  const trailing12Mean = trailing12 === null ? null : mean(trailing12);
  const features = Object.freeze({
    trailing1Cash,
    trailing3Cash,
    trailing6Cash,
    trailing12Cash,
    sixMonthSlope: slope,
    sixMonthRelativeSlope: slope === null
      ? null
      : slope / slopeScale,
    trailing6ToPrevious6Ratio: safeRatio(
      trailing6Cash,
      previous6Cash
    ),
    trailing12ToPrevious12Ratio: safeRatio(
      trailing12Cash,
      previous12Cash
    ),
    currentToHistoricalPeakRatio: peak > 0
      ? dense.at(-1) / peak
      : null,
    monthsSinceHistoricalPeak: peak > 0
      ? dense.length - 1 - peakIndex
      : null,
    validHistoryMonths: dense.length,
    matureChannelCount: positiveInteger(
      row.matureChannelCount ?? row.eligibleChannelCount,
      "mature_channel_count"
    ),
    trailing12ZeroShare: trailing12 === null
      ? null
      : trailing12.filter((value) => Math.abs(value) <= EPSILON).length / 12,
    trailing12CoefficientOfVariation: (
      trailing12 === null
      || Math.abs(trailing12Mean) <= EPSILON
    ) ? null : standardDeviation(trailing12) / Math.abs(trailing12Mean),
    workAgeMonths: positiveInteger(
      row.workAgeMonths ?? row.observedSalesAgeMonths,
      "work_age_months"
    ),
    core80: row.core80 === true ? 1 : 0,
    core90: row.core90 === true ? 1 : 0,
    lg01PointEstimate: lg01PointEstimate === null
      ? null
      : finite(lg01PointEstimate, "lg01_point_estimate")
  });
  return Object.freeze({
    schema: "m2.current.core_horizon_amount.feature_row.v0.1",
    experimentId: M2_CORE_HORIZON_AMOUNT_EXPERIMENT_ID,
    actualDefinitionId: M2_CORE_HORIZON_AMOUNT_ACTUAL_ID,
    standardWorkId: nonempty(row.standardWorkId, "standard_work_id"),
    origin,
    horizonMonths,
    labelAvailableAsOf: requireMonth(
      row.labelAvailableAsOf,
      "label_available_as_of"
    ),
    actual: finite(row.actual, "actual"),
    core80: row.core80 === true,
    core90: row.core90 === true,
    referenceRank: nullableFinite(row.referenceRank),
    referenceRevenue: nullableFinite(row.referenceRevenue),
    revenueDecile: nullableFinite(row.revenueDecile),
    features,
    futureHistoryRowCount,
    originVisibleOnly: true,
    caseKey: coreHorizonCaseKey(row)
  });
}

export function attachM2TrainingFoldWeights(rows, armId) {
  requireRawArm(armId);
  if (!Array.isArray(rows) || rows.length === 0) {
    fail("m2_core_horizon_amount_weight_rows_required");
  }
  if (armId === "B1") {
    return Object.freeze(rows.map((row) => Object.freeze({
      ...row,
      trainingWeight: 1,
      trainingWeightPercentile: null,
      trainingWeightSource:
        "ONE_PER_WORK_ORIGIN_HORIZON"
    })));
  }
  const byOrigin = groupBy(rows, (row) => row.origin);
  const weights = new Map();
  for (const values of byOrigin.values()) {
    const available = values.filter(
      (row) => Number.isFinite(row.features.trailing12Cash)
    ).sort((left, right) => (
      left.features.trailing12Cash - right.features.trailing12Cash
      || stableTextCompare(left.standardWorkId, right.standardWorkId)
    ));
    const tied = groupBy(
      available,
      (row) => String(row.features.trailing12Cash)
    );
    let preceding = 0;
    for (const same of tied.values()) {
      const midpoint = preceding + (same.length - 1) / 2;
      const percentile = available.length <= 1
        ? 1
        : midpoint / (available.length - 1);
      for (const row of same) {
        weights.set(row.caseKey, percentile);
      }
      preceding += same.length;
    }
  }
  return Object.freeze(rows.map((row) => {
    const percentile = weights.get(row.caseKey) ?? null;
    const weight = percentile === null
      ? 1
      : 1 + 3 * percentile ** 2;
    return Object.freeze({
      ...row,
      trainingWeight: Math.min(4, Math.max(1, weight)),
      trainingWeightPercentile: percentile,
      trainingWeightSource:
        "TRAIN_FOLD_ORIGIN_VISIBLE_TRAILING12_PERCENTILE"
    });
  }));
}

export function fitM2CoreHorizonAmountModel(rows, {
  armId,
  huberDelta,
  l2,
  config
}) {
  validateM2CoreLegacyHorizonAmountConfig(config);
  requireRawArm(armId);
  const delta = positiveFinite(huberDelta, "huber_delta");
  const regularization = nonnegativeFinite(l2, "l2");
  if (!Array.isArray(rows) || rows.length === 0) {
    fail("m2_core_horizon_amount_training_rows_required");
  }
  const horizons = [...new Set(rows.map(
    (row) => requireHorizon(row.horizonMonths)
  ))];
  if (horizons.length !== 1) {
    fail("m2_core_horizon_amount_joint_horizon_fit_forbidden");
  }
  const weighted = attachM2TrainingFoldWeights(rows, armId);
  const design = fitDesignContract(weighted, armId);
  const x = weighted.map((row) => designVector(row, design));
  const y = weighted.map((row) => signedLog1p(row.actual));
  const sampleWeights = weighted.map((row) => row.trainingWeight);
  let coefficients = solveWeightedRidge(
    x,
    y,
    sampleWeights,
    regularization
  );
  const maximumIterations = positiveInteger(
    config.training.maximumIrlsIterations,
    "maximum_irls_iterations"
  );
  const tolerance = positiveFinite(
    config.training.convergenceTolerance,
    "convergence_tolerance"
  );
  let iterationCount = 0;
  let converged = false;
  for (let iteration = 0; iteration < maximumIterations; iteration += 1) {
    const residuals = x.map(
      (values, index) => y[index] - dot(values, coefficients)
    );
    const robustWeights = residuals.map((residual, index) => (
      sampleWeights[index] * (
        Math.abs(residual) <= delta
          ? 1
          : delta / Math.max(EPSILON, Math.abs(residual))
      )
    ));
    const next = solveWeightedRidge(
      x,
      y,
      robustWeights,
      regularization
    );
    iterationCount = iteration + 1;
    const difference = maximum(next.map(
      (value, index) => Math.abs(value - coefficients[index])
    ));
    coefficients = next;
    if (difference <= tolerance) {
      converged = true;
      break;
    }
  }
  const fitted = x.map((values) => dot(values, coefficients));
  const lossRows = weighted.map((row, index) => Object.freeze({
    origin: row.origin,
    standardWorkId: row.standardWorkId,
    trainingWeight: row.trainingWeight,
    transformedHuberLoss:
      row.trainingWeight * huberLoss(y[index] - fitted[index], delta)
  }));
  return Object.freeze({
    schema: "m2.current.core_horizon_amount.model_state.v0.1",
    experimentId: M2_CORE_HORIZON_AMOUNT_EXPERIMENT_ID,
    modelId: M2_CORE_HORIZON_AMOUNT_MODEL_ID,
    armId,
    horizonMonths: horizons[0],
    huberDelta: delta,
    l2: regularization,
    targetTransform: "REVERSIBLE_SIGNED_LOG1P",
    design,
    coefficients: Object.freeze(coefficients),
    trainingRowCount: weighted.length,
    trainingWorkCount: new Set(weighted.map(
      (row) => row.standardWorkId
    )).size,
    trainingOriginCount: new Set(weighted.map((row) => row.origin)).size,
    maximumTrainingLabelAvailableAsOf: weighted.map(
      (row) => row.labelAvailableAsOf
    ).sort().at(-1),
    trainingWeightMinimum: Math.min(...sampleWeights),
    trainingWeightMaximum: Math.max(...sampleWeights),
    trainingWeightTotal: sum(sampleWeights),
    weightedHuberLossTotal: sum(lossRows.map(
      (row) => row.transformedHuberLoss
    )),
    lossContributionByOrigin: Object.freeze(
      summarizeLossByOrigin(lossRows)
    ),
    iterationCount,
    converged,
    horizonsFitIndependently: true,
    normalizationFitOnCurrentTrainingFoldOnly: true,
    trainingWeightFitOnCurrentTrainingFoldOnly: true,
    futureLabelRead: false
  });
}

export function predictM2CoreHorizonAmount(row, state) {
  requireObject(state, "model_state");
  const horizonMonths = requireHorizon(row.horizonMonths);
  if (horizonMonths !== state.horizonMonths) {
    fail("m2_core_horizon_amount_cross_horizon_state_use");
  }
  const transformedPointEstimate = dot(
    designVector(row, state.design),
    state.coefficients
  );
  return Object.freeze({
    modelId: M2_CORE_HORIZON_AMOUNT_MODEL_ID,
    armId: state.armId,
    standardWorkId: row.standardWorkId,
    origin: row.origin,
    horizonMonths,
    actual: row.actual,
    core80: row.core80,
    core90: row.core90,
    pointEstimate: signedExpm1(transformedPointEstimate),
    transformedPointEstimate,
    nativeAmountPrediction: true,
    selectedFallbackApplied: false,
    rawCandidatePreserved: true,
    trainingMaximumLabelAvailableAsOf:
      state.maximumTrainingLabelAvailableAsOf,
    caseKey: row.caseKey
  });
}

export function selectM2CoreHorizonAmountHyperparameters({
  rows,
  outerOrigin,
  armId,
  config
}) {
  validateM2CoreLegacyHorizonAmountConfig(config);
  requireRawArm(armId);
  const normalizedOuter = requireMonth(outerOrigin, "outer_origin");
  const eligible = rows.filter((row) => (
    row.origin < normalizedOuter
    && row.labelAvailableAsOf <= normalizedOuter
  ));
  const horizons = [...new Set(eligible.map(
    (row) => requireHorizon(row.horizonMonths)
  ))];
  if (horizons.length !== 1) {
    fail("m2_core_horizon_amount_inner_horizon_invalid");
  }
  const origins = [...new Set(eligible.map((row) => row.origin))].sort();
  const innerOrigins = origins.filter((innerOrigin) => {
    const training = eligible.filter((row) => (
      row.origin < innerOrigin
      && row.labelAvailableAsOf <= innerOrigin
    ));
    return trainingSufficient(training, config);
  });
  if (
    innerOrigins.length
      < config.rolling.minimumInnerValidationOrigins
  ) {
    return Object.freeze({
      status: "NOT_SELECTABLE_INSUFFICIENT_INNER_ORIGINS",
      armId,
      horizonMonths: horizons[0] ?? null,
      outerOrigin: normalizedOuter,
      eligibleTrainingRowCount: eligible.length,
      innerOriginCount: innerOrigins.length,
      selected: null,
      candidates: Object.freeze([])
    });
  }
  const candidates = [];
  for (const huberDelta of config.training.grid.huberDelta) {
    for (const l2 of config.training.grid.l2) {
      const losses = [];
      const audits = [];
      for (const innerOrigin of innerOrigins) {
        const training = eligible.filter((row) => (
          row.origin < innerOrigin
          && row.labelAvailableAsOf <= innerOrigin
        ));
        const validation = eligible.filter(
          (row) => row.origin === innerOrigin
        );
        if (!trainingSufficient(training, config) || validation.length === 0) {
          continue;
        }
        const state = fitM2CoreHorizonAmountModel(training, {
          armId,
          huberDelta,
          l2,
          config
        });
        const predictions = validation.map(
          (row) => predictM2CoreHorizonAmount(row, state)
        );
        const loss = mean(predictions.map((prediction, index) => (
          huberLoss(
            signedLog1p(validation[index].actual)
              - prediction.transformedPointEstimate,
            huberDelta
          )
        )));
        losses.push(loss);
        audits.push(Object.freeze({
          innerOrigin,
          trainingRowCount: training.length,
          validationRowCount: validation.length,
          maximumTrainingLabelAvailableAsOf:
            state.maximumTrainingLabelAvailableAsOf,
          meanValidationHuberLoss: loss
        }));
      }
      candidates.push(Object.freeze({
        huberDelta,
        l2,
        meanValidationHuberLoss: losses.length > 0 ? mean(losses) : null,
        validationOriginCount: losses.length,
        audits: Object.freeze(audits)
      }));
    }
  }
  const ranked = candidates.filter(
    (candidate) => candidate.meanValidationHuberLoss !== null
  ).sort((left, right) => (
    left.meanValidationHuberLoss - right.meanValidationHuberLoss
    || left.huberDelta - right.huberDelta
    || left.l2 - right.l2
  ));
  return Object.freeze({
    status: ranked.length > 0
      ? "SELECTED_ON_EARLIER_MATURE_INNER_ORIGINS"
      : "NOT_SELECTABLE_NO_VALID_INNER_SCORE",
    armId,
    horizonMonths: horizons[0],
    outerOrigin: normalizedOuter,
    eligibleTrainingRowCount: eligible.length,
    innerOriginCount: innerOrigins.length,
    selected: ranked[0] ?? null,
    candidates: Object.freeze(candidates),
    outerOutcomeRead: false
  });
}

export function pairM2HorizonAmountSameCaseRows(
  candidateRows,
  baselineRows
) {
  const candidate = uniqueIndex(candidateRows, coreHorizonComparisonKey);
  const baseline = uniqueIndex(baselineRows, coreHorizonComparisonKey);
  const rows = [];
  let actualMismatchCount = 0;
  for (const [key, current] of candidate) {
    const reference = baseline.get(key);
    if (!reference) continue;
    if (Math.abs(current.actual - reference.actual) > 1e-7) {
      actualMismatchCount += 1;
      continue;
    }
    rows.push(Object.freeze({
      actualDefinitionId: M2_CORE_HORIZON_AMOUNT_ACTUAL_ID,
      evaluationFamily: current.evaluationFamily,
      populationId: current.populationId,
      armId: current.armId,
      standardWorkId: current.standardWorkId,
      origin: current.origin,
      horizonMonths: current.horizonMonths,
      actual: current.actual,
      candidatePointEstimate: finite(
        current.pointEstimate,
        "candidate_point_estimate"
      ),
      baselinePointEstimate: finite(
        reference.pointEstimate,
        "baseline_point_estimate"
      ),
      nativeAmountPrediction: current.nativeAmountPrediction === true,
      selectedFallbackApplied:
        current.selectedFallbackApplied === true,
      caseKey: current.caseKey
    }));
  }
  return Object.freeze({
    rows: Object.freeze(rows.sort(compareCaseRows)),
    candidateCaseCount: candidate.size,
    baselineCaseCount: baseline.size,
    sameCaseCount: rows.length,
    actualMismatchCount,
    exactSameCase: (
      rows.length === candidate.size
      && rows.length === baseline.size
      && actualMismatchCount === 0
    )
  });
}

export function scoreM2HorizonAmountPointRows(rows, {
  pointField = "pointEstimate"
} = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return emptyPointMetrics();
  }
  const values = rows.map((row) => {
    const actual = finite(row.actual, "score_actual");
    const prediction = finite(row[pointField], "score_prediction");
    return Object.freeze({
      standardWorkId: nonempty(row.standardWorkId, "score_work_id"),
      origin: requireMonth(row.origin, "score_origin"),
      actual,
      prediction,
      error: prediction - actual,
      absoluteError: Math.abs(prediction - actual)
    });
  });
  const denominator = sum(values.map((row) => Math.abs(row.actual)));
  const actualTotal = sum(values.map((row) => row.actual));
  const predictionTotal = sum(values.map((row) => row.prediction));
  const absoluteErrors = values.map(
    (row) => row.absoluteError
  ).sort((left, right) => left - right);
  const absoluteErrorTotal = sum(absoluteErrors);
  const workErrors = [...groupBy(values, (row) => row.standardWorkId).values()]
    .map((workRows) => sum(workRows.map((row) => row.absoluteError)))
    .sort((left, right) => right - left);
  const topOne = Math.max(1, Math.ceil(workErrors.length * 0.01));
  const topFive = Math.max(1, Math.ceil(workErrors.length * 0.05));
  const topTen = Math.max(1, Math.ceil(workErrors.length * 0.1));
  return Object.freeze({
    status: denominator > 0
      ? "COMPUTED"
      : "NOT_COMPUTABLE_ZERO_DENOMINATOR",
    caseCount: values.length,
    workCount: new Set(values.map((row) => row.standardWorkId)).size,
    originCount: new Set(values.map((row) => row.origin)).size,
    actualDenominator: denominator,
    actualTotal,
    predictionTotal,
    absoluteErrorTotal,
    wape: denominator > 0 ? absoluteErrorTotal / denominator : null,
    signedBias: denominator > 0
      ? (predictionTotal - actualTotal) / denominator
      : null,
    mae: absoluteErrorTotal / values.length,
    medianAbsoluteError: empiricalQuantile(absoluteErrors, 0.5),
    predictionActualRatio: Math.abs(actualTotal) > EPSILON
      ? predictionTotal / actualTotal
      : null,
    underpredictionCash: sum(values.map(
      (row) => Math.max(0, -row.error)
    )),
    overpredictionCash: sum(values.map(
      (row) => Math.max(0, row.error)
    )),
    errorConcentration: Object.freeze({
      maximumWorkShare: absoluteErrorTotal > 0
        ? (workErrors[0] ?? 0) / absoluteErrorTotal
        : 0,
      top1PercentWorkShare: absoluteErrorTotal > 0
        ? sum(workErrors.slice(0, topOne)) / absoluteErrorTotal
        : 0,
      top5PercentWorkShare: absoluteErrorTotal > 0
        ? sum(workErrors.slice(0, topFive)) / absoluteErrorTotal
        : 0,
      top10PercentWorkShare: absoluteErrorTotal > 0
        ? sum(workErrors.slice(0, topTen)) / absoluteErrorTotal
        : 0
    })
  });
}

export function bootstrapM2HorizonAmountSameCase(rows, {
  iterations = 2000,
  seed = 20260730
} = {}) {
  const count = positiveInteger(iterations, "bootstrap_iterations");
  if (!Array.isArray(rows) || rows.length === 0) {
    return Object.freeze({
      status: "NOT_COMPUTABLE_EMPTY",
      iterations: 0,
      seed
    });
  }
  const byWork = groupBy(rows, (row) => row.standardWorkId);
  const workIds = [...byWork.keys()].sort(stableTextCompare);
  if (workIds.length < 2) {
    return Object.freeze({
      status: "NOT_COMPUTABLE_INSUFFICIENT_WORK_CLUSTERS",
      iterations: 0,
      seed,
      workCount: workIds.length
    });
  }
  const random = mulberry32(seed);
  const fva = [];
  for (let iteration = 0; iteration < count; iteration += 1) {
    const sample = [];
    for (let index = 0; index < workIds.length; index += 1) {
      const workId = workIds[Math.floor(random() * workIds.length)];
      sample.push(...byWork.get(workId));
    }
    const candidate = scoreM2HorizonAmountPointRows(
      sample,
      { pointField: "candidatePointEstimate" }
    );
    const baseline = scoreM2HorizonAmountPointRows(
      sample,
      { pointField: "baselinePointEstimate" }
    );
    if (candidate.wape === null || !(baseline.wape > 0)) continue;
    fva.push((baseline.wape - candidate.wape) / baseline.wape);
  }
  fva.sort((left, right) => left - right);
  return Object.freeze({
    status: fva.length === count ? "COMPUTED" : "PARTIAL",
    method: "paired_standardWorkId_cluster_resample",
    iterations: fva.length,
    seed,
    workCount: workIds.length,
    relativeWapeImprovement95: Object.freeze({
      lower: empiricalQuantile(fva, 0.025),
      median: empiricalQuantile(fva, 0.5),
      upper: empiricalQuantile(fva, 0.975)
    })
  });
}

export function scoreM2HorizonAmountIndependentTimeBlocks(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return Object.freeze([]);
  const horizon = requireHorizon(rows[0].horizonMonths);
  if (rows.some((row) => row.horizonMonths !== horizon)) {
    fail("m2_core_horizon_amount_time_block_horizon_mixed");
  }
  const origins = [...new Set(rows.map((row) => row.origin))].sort();
  const selected = [];
  let lastEnd = -Infinity;
  for (const origin of origins) {
    const start = monthToSerial(origin) + 1;
    const end = monthToSerial(origin) + horizon;
    if (start <= lastEnd) continue;
    selected.push({ origin, start, end });
    lastEnd = end;
  }
  return Object.freeze(selected.map((block, index) => {
    const values = rows.filter((row) => row.origin === block.origin);
    const candidate = scoreM2HorizonAmountPointRows(
      values,
      { pointField: "candidatePointEstimate" }
    );
    const baseline = scoreM2HorizonAmountPointRows(
      values,
      { pointField: "baselinePointEstimate" }
    );
    return Object.freeze({
      blockId: `NONOVERLAP_${String(index + 1).padStart(3, "0")}`,
      origin: block.origin,
      forecastStart: serialToMonth(block.start),
      forecastEnd: serialToMonth(block.end),
      caseCount: values.length,
      workCount: new Set(values.map(
        (row) => row.standardWorkId
      )).size,
      candidateWape: candidate.wape,
      baselineWape: baseline.wape,
      relativeWapeImprovement: (
        candidate.wape !== null
        && baseline.wape !== null
        && baseline.wape > 0
      ) ? (baseline.wape - candidate.wape) / baseline.wape : null,
      candidateWins: (
        candidate.wape !== null
        && baseline.wape !== null
        && candidate.wape < baseline.wape
      )
    });
  }));
}

export function assessM2CoreHorizonAmountGate({
  pairedRows,
  core90PairedRows,
  config,
  seedOffset = 0
}) {
  validateM2CoreLegacyHorizonAmountConfig(config);
  if (!Array.isArray(pairedRows) || pairedRows.length === 0) {
    return Object.freeze({
      status: "NOT_EVALUABLE_NO_STRICT_CORE80_SAME_CASE",
      pass: false
    });
  }
  const candidate = scoreM2HorizonAmountPointRows(
    pairedRows,
    { pointField: "candidatePointEstimate" }
  );
  const baseline = scoreM2HorizonAmountPointRows(
    pairedRows,
    { pointField: "baselinePointEstimate" }
  );
  const fva = baseline.wape > 0
    ? (baseline.wape - candidate.wape) / baseline.wape
    : null;
  const bootstrap = bootstrapM2HorizonAmountSameCase(pairedRows, {
    iterations: config.evaluation.bootstrap.iterations,
    seed: config.evaluation.bootstrap.seed + seedOffset
  });
  const blocks = scoreM2HorizonAmountIndependentTimeBlocks(pairedRows);
  const improvingShare = blocks.length > 0
    ? blocks.filter((block) => block.candidateWins).length / blocks.length
    : 0;
  const core90 = scoreSensitivityDirection(core90PairedRows, config);
  const checks = Object.freeze({
    relativeWapeImprovementAtLeastMinimum:
      fva !== null
      && fva >= config.decisionPolicy.minimumRelativeWapeImprovement,
    bootstrapLowerExceedsZero:
      bootstrap.relativeWapeImprovement95?.lower
        > config.decisionPolicy
          .bootstrapRelativeWapeImprovementLowerBoundMustExceed,
    majorityIndependentTimeBlocksImprove:
      blocks.length >= config.rolling.minimumIndependentStrictTimeBlocks
      && improvingShare
        > config.decisionPolicy
          .minimumImprovingIndependentTimeBlockShareExclusive,
    biasWorseningWithinLimit:
      Math.abs(candidate.signedBias) - Math.abs(baseline.signedBias)
        <= config.decisionPolicy.maximumAbsoluteBiasWorsening,
    candidateAbsoluteBiasWithinLimit:
      Math.abs(candidate.signedBias)
        <= config.decisionPolicy.maximumCandidateAbsoluteBias,
    core90NoOppositeMaterialDegradation: core90.noOppositeMaterialDegradation,
    rawCandidateOnly: pairedRows.every(
      (row) => (
        row.selectedFallbackApplied === false
        && row.nativeAmountPrediction === true
      )
    )
  });
  const pass = Object.values(checks).every(Boolean);
  return Object.freeze({
    status: pass
      ? "M2_CORE_HORIZON_AMOUNT_HORIZON_PASS"
      : "M2_CORE_HORIZON_AMOUNT_HORIZON_FAIL",
    pass,
    candidate,
    baseline,
    relativeWapeImprovement: fva,
    bootstrap,
    independentTimeBlocks: blocks,
    improvingIndependentTimeBlockShare: improvingShare,
    core90,
    checks
  });
}

export function summarizeM2CoreHorizonAmountDecision(
  horizonAssessments,
  config
) {
  validateM2CoreLegacyHorizonAmountConfig(config);
  const assessments = HORIZONS.map((horizonMonths) => {
    const assessment = horizonAssessments.find(
      (item) => item.horizonMonths === horizonMonths
    );
    if (!assessment) {
      fail("m2_core_horizon_amount_horizon_assessment_missing");
    }
    return assessment;
  });
  const passed = assessments.filter((item) => item.pass === true);
  return Object.freeze({
    status: passed.length === HORIZONS.length
      ? config.decisionPolicy.allHorizonsPassStatus
      : passed.length > 0
        ? config.decisionPolicy.partialHorizonsPassStatus
        : config.decisionPolicy.noHorizonPassStatus,
    passedHorizons: Object.freeze(passed.map(
      (item) => item.horizonMonths
    )),
    failedHorizons: Object.freeze(assessments.filter(
      (item) => item.pass !== true
    ).map((item) => item.horizonMonths)),
    operationalFallbackChanged: false,
    activeCandidate: null,
    approvedForAutomation: null,
    productionAuthorized: false
  });
}

export function pairM2Oa03Lg01AttributionRows({
  oa03Rows,
  lg01Rows,
  featureRows
}) {
  const oa03 = uniqueIndex(oa03Rows, coreHorizonComparisonKey);
  const lg01 = uniqueIndex(lg01Rows, coreHorizonComparisonKey);
  const features = uniqueIndex(featureRows, coreHorizonComparisonKey);
  const output = [];
  let actualMismatchCount = 0;
  for (const [key, current] of oa03) {
    const reference = lg01.get(key);
    const feature = features.get(key);
    if (!reference || !feature) continue;
    if (Math.abs(current.actual - reference.actual) > 1e-7) {
      actualMismatchCount += 1;
      continue;
    }
    const actual = finite(current.actual, "attribution_actual");
    const oa03PointEstimate = finite(
      current.pointEstimate,
      "attribution_oa03"
    );
    const lg01PointEstimate = finite(
      reference.pointEstimate,
      "attribution_lg01"
    );
    output.push(Object.freeze({
      actualDefinitionId: M2_CORE_HORIZON_AMOUNT_ACTUAL_ID,
      evaluationFamily: current.evaluationFamily,
      populationId: current.populationId,
      standardWorkId: current.standardWorkId,
      origin: current.origin,
      horizonMonths: current.horizonMonths,
      actual,
      oa03PointEstimate,
      lg01PointEstimate,
      oa03Error: oa03PointEstimate - actual,
      lg01Error: lg01PointEstimate - actual,
      oa03AbsoluteError: Math.abs(oa03PointEstimate - actual),
      lg01AbsoluteError: Math.abs(lg01PointEstimate - actual),
      features: feature.features,
      referenceRank: feature.referenceRank,
      caseKey: feature.caseKey,
      futureOutcomeUsedForGrouping: false
    }));
  }
  return Object.freeze({
    rows: Object.freeze(output.sort(compareCaseRows)),
    oa03CaseCount: oa03.size,
    lg01CaseCount: lg01.size,
    featureCaseCount: features.size,
    sameCaseCount: output.length,
    actualMismatchCount
  });
}

export function summarizeM2Oa03Lg01Attribution(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return Object.freeze({
      status: "NOT_EVALUABLE_NO_SAME_CASE_ROWS",
      caseCount: 0,
      dimensions: Object.freeze([])
    });
  }
  const enriched = attachOriginVisibleAttributionBands(rows);
  const totalOa03AbsoluteError = sum(enriched.map(
    (row) => row.oa03AbsoluteError
  ));
  const dimensions = [
    ["trailing12_origin_percentile", (row) => row.bands.trailing12],
    ["core80_origin_rank_band", (row) => row.bands.core80Rank],
    ["trailing1_cash_percentile", (row) => row.bands.trailing1],
    ["trailing3_cash_percentile", (row) => row.bands.trailing3],
    ["trailing6_cash_percentile", (row) => row.bands.trailing6],
    ["trailing12_cash_percentile", (row) => row.bands.trailing12],
    ["six_month_relative_slope", (row) => slopeBand(
      row.features.sixMonthRelativeSlope
    )],
    ["trailing6_to_previous6_ratio", (row) => ratioBand(
      row.features.trailing6ToPrevious6Ratio
    )],
    ["trailing12_to_previous12_ratio", (row) => ratioBand(
      row.features.trailing12ToPrevious12Ratio
    )],
    ["current_to_historical_peak_ratio", (row) => peakRatioBand(
      row.features.currentToHistoricalPeakRatio
    )],
    ["months_since_historical_peak", (row) => monthsSincePeakBand(
      row.features.monthsSinceHistoricalPeak
    )],
    ["valid_history_months", (row) => historyBand(
      row.features.validHistoryMonths
    )],
    ["origin_mature_channel_count", (row) => channelCountBand(
      row.features.matureChannelCount
    )],
    ["trailing12_zero_share", (row) => zeroShareBand(
      row.features.trailing12ZeroShare
    )],
    ["trailing12_coefficient_of_variation", (row) => cvBand(
      row.features.trailing12CoefficientOfVariation
    )],
    ["work_age_months", (row) => historyBand(
      row.features.workAgeMonths
    )]
  ].map(([dimension, bandOf]) => Object.freeze({
    dimension,
    groups: Object.freeze(summarizeAttributionGroups(
      enriched,
      bandOf,
      totalOa03AbsoluteError
    ))
  }));
  const oa03Metrics = scoreM2HorizonAmountPointRows(enriched.map(
    (row) => ({ ...row, pointEstimate: row.oa03PointEstimate })
  ));
  const lg01Metrics = scoreM2HorizonAmountPointRows(enriched.map(
    (row) => ({ ...row, pointEstimate: row.lg01PointEstimate })
  ));
  return Object.freeze({
    status: "COMPUTED_ORIGIN_VISIBLE_SAME_CASE_ATTRIBUTION",
    caseCount: enriched.length,
    workCount: new Set(enriched.map((row) => row.standardWorkId)).size,
    originCount: new Set(enriched.map((row) => row.origin)).size,
    oa03Metrics,
    lg01Metrics,
    relativeWapeImprovementOfOa03: lg01Metrics.wape > 0
      ? (lg01Metrics.wape - oa03Metrics.wape) / lg01Metrics.wape
      : null,
    systematicUnderpredictionShare: enriched.filter(
      (row) => row.oa03Error < 0
    ).length / enriched.length,
    totalUnderpredictionCash: sum(enriched.map(
      (row) => Math.max(0, -row.oa03Error)
    )),
    totalOverpredictionCash: sum(enriched.map(
      (row) => Math.max(0, row.oa03Error)
    )),
    dimensions: Object.freeze(dimensions),
    futureOutcomeUsedForGrouping: false
  });
}

export function assessM2CoreHorizonAmountK2Eligibility({
  featureRows,
  strictLg01Rows,
  strictEvaluationRows,
  config,
  isolationTestsPassed
}) {
  validateM2CoreLegacyHorizonAmountConfig(config);
  const byHorizon = HORIZONS.map((horizonMonths) => {
    const training = featureRows.filter(
      (row) => row.horizonMonths === horizonMonths
    );
    const evaluation = strictEvaluationRows.filter(
      (row) => row.horizonMonths === horizonMonths
    );
    const baseline = strictLg01Rows.filter(
      (row) => row.horizonMonths === horizonMonths
    );
    const paired = pairM2HorizonAmountSameCaseRows(
      evaluation.map((row) => ({
        ...row,
        armId: "ELIGIBILITY",
        nativeAmountPrediction: true,
        selectedFallbackApplied: false
      })),
      baseline
    );
    const syntheticPairs = paired.rows.map((row) => ({
      ...row,
      candidatePointEstimate: row.baselinePointEstimate
    }));
    const blocks = scoreM2HorizonAmountIndependentTimeBlocks(syntheticPairs);
    return Object.freeze({
      horizonMonths,
      legalTrainingPseudoOriginCount:
        new Set(training.map((row) => row.origin)).size,
      legalTrainingRowCount: training.length,
      strictEvaluationCaseCount: evaluation.length,
      strictLg01CaseCount: baseline.length,
      strictSameCaseCount: paired.sameCaseCount,
      strictExactSameCase: paired.exactSameCase,
      independentTimeBlockCount: blocks.length,
      labelMaterializable: training.length > 0
        && training.every((row) => Number.isFinite(row.actual))
    });
  });
  const checks = Object.freeze({
    everyHorizonHasLegalTrainingPseudoOrigins: byHorizon.every(
      (row) => row.legalTrainingPseudoOriginCount > 0
    ),
    everyHorizonHasAtLeastTwoStrictIndependentTimeBlocks: byHorizon.every(
      (row) => (
        row.independentTimeBlockCount
          >= config.rolling.minimumIndependentStrictTimeBlocks
      )
    ),
    lg01ReconstructableForEveryLegalStrictCell: byHorizon.every(
      (row) => row.strictExactSameCase === true
    ),
    allFeaturesOriginSafe: featureRows.every(
      (row) => row.originVisibleOnly === true
    ),
    trainingEvaluationIsolationProven: isolationTestsPassed === true,
    labelsMaterializable: byHorizon.every(
      (row) => row.labelMaterializable === true
    )
  });
  return Object.freeze({
    status: Object.values(checks).every(Boolean)
      ? "K2_ELIGIBLE"
      : "K2_NOT_ELIGIBLE",
    eligible: Object.values(checks).every(Boolean),
    checks,
    byHorizon: Object.freeze(byHorizon)
  });
}

export function assertM2CoreHorizonAmountPublicSafe(value) {
  const serialized = JSON.stringify(value);
  const forbidden = [
    /standardWorkId/iu,
    /channelUid/iu,
    /workTitle/iu,
    /authorName/iu,
    /data[\\/]+private-(?:input|output)/iu,
    /[A-Z]:[\\/]/u,
    /(?:^|[\\/])Users[\\/]/u
  ];
  for (const pattern of forbidden) {
    if (pattern.test(serialized)) {
      fail("m2_core_horizon_amount_public_payload_unsafe");
    }
  }
  return true;
}

export function coreHorizonCaseKey(row) {
  return [
    nonempty(row.standardWorkId, "case_work_id"),
    requireMonth(row.origin, "case_origin"),
    requireHorizon(row.horizonMonths)
  ].join("\u0000");
}

function fitDesignContract(rows, armId) {
  const specifications = [
    ...BASE_FEATURES,
    ...(armId === "B3"
      ? [["lg01PointEstimate", "SIGNED_LOG1P", true]]
      : [])
  ];
  const features = [];
  for (const [field, transform, missingIndicator] of specifications) {
    const values = rows.map((row) => featureValue(
      row.features[field],
      transform
    )).filter(Number.isFinite);
    const binary = transform === "BINARY";
    const center = binary || values.length === 0 ? 0 : mean(values);
    const scale = binary || values.length <= 1
      ? 1
      : Math.max(EPSILON, standardDeviation(values));
    features.push(Object.freeze({
      field,
      transform,
      center,
      scale,
      missingIndicator
    }));
  }
  const columnNames = ["intercept"];
  for (const feature of features) {
    columnNames.push(feature.field);
    if (feature.missingIndicator) {
      columnNames.push(`${feature.field}__missing`);
    }
  }
  return Object.freeze({
    armId,
    fitScope: "CURRENT_TRAINING_FOLD_ONLY",
    features: Object.freeze(features),
    columnNames: Object.freeze(columnNames)
  });
}

function designVector(row, design) {
  const output = [1];
  for (const specification of design.features) {
    const raw = featureValue(
      row.features[specification.field],
      specification.transform
    );
    const missing = !Number.isFinite(raw);
    output.push(missing
      ? 0
      : (raw - specification.center) / specification.scale);
    if (specification.missingIndicator) output.push(missing ? 1 : 0);
  }
  return output;
}

function featureValue(value, transform) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (transform === "SIGNED_LOG1P") return signedLog1p(number);
  if (transform === "BINARY") return number === 0 ? 0 : 1;
  return number;
}

function solveWeightedRidge(x, y, weights, l2) {
  const dimension = x[0].length;
  const matrix = Array.from(
    { length: dimension },
    () => Array(dimension).fill(0)
  );
  const vector = Array(dimension).fill(0);
  for (let rowIndex = 0; rowIndex < x.length; rowIndex += 1) {
    const weight = finite(weights[rowIndex], "linear_weight");
    for (let left = 0; left < dimension; left += 1) {
      vector[left] += weight * x[rowIndex][left] * y[rowIndex];
      for (let right = 0; right < dimension; right += 1) {
        matrix[left][right] += (
          weight * x[rowIndex][left] * x[rowIndex][right]
        );
      }
    }
  }
  for (let index = 1; index < dimension; index += 1) {
    matrix[index][index] += l2;
  }
  matrix[0][0] += 1e-10;
  return gaussianSolve(matrix, vector);
}

function gaussianSolve(inputMatrix, inputVector) {
  const matrix = inputMatrix.map((row) => [...row]);
  const vector = [...inputVector];
  for (let pivot = 0; pivot < matrix.length; pivot += 1) {
    let selected = pivot;
    for (let row = pivot + 1; row < matrix.length; row += 1) {
      if (Math.abs(matrix[row][pivot]) > Math.abs(matrix[selected][pivot])) {
        selected = row;
      }
    }
    if (selected !== pivot) {
      [matrix[pivot], matrix[selected]] = [
        matrix[selected],
        matrix[pivot]
      ];
      [vector[pivot], vector[selected]] = [
        vector[selected],
        vector[pivot]
      ];
    }
    if (Math.abs(matrix[pivot][pivot]) <= EPSILON) {
      matrix[pivot][pivot] = matrix[pivot][pivot] < 0
        ? -EPSILON
        : EPSILON;
    }
    const scale = matrix[pivot][pivot];
    for (let column = pivot; column < matrix.length; column += 1) {
      matrix[pivot][column] /= scale;
    }
    vector[pivot] /= scale;
    for (let row = 0; row < matrix.length; row += 1) {
      if (row === pivot) continue;
      const factor = matrix[row][pivot];
      if (Math.abs(factor) <= EPSILON) continue;
      for (let column = pivot; column < matrix.length; column += 1) {
        matrix[row][column] -= factor * matrix[pivot][column];
      }
      vector[row] -= factor * vector[pivot];
    }
  }
  if (vector.some((value) => !Number.isFinite(value))) {
    fail("m2_core_horizon_amount_linear_solve_failed");
  }
  return vector;
}

function trainingSufficient(rows, config) {
  return (
    rows.length >= config.rolling.minimumTrainingRows
    && new Set(rows.map((row) => row.standardWorkId)).size
      >= config.rolling.minimumTrainingWorks
  );
}

function scoreSensitivityDirection(rows, config) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return Object.freeze({
      status: "NOT_EVALUABLE",
      noOppositeMaterialDegradation: false
    });
  }
  const candidate = scoreM2HorizonAmountPointRows(
    rows,
    { pointField: "candidatePointEstimate" }
  );
  const baseline = scoreM2HorizonAmountPointRows(
    rows,
    { pointField: "baselinePointEstimate" }
  );
  const relativeWapeImprovement = baseline.wape > 0
    ? (baseline.wape - candidate.wape) / baseline.wape
    : null;
  return Object.freeze({
    status: "COMPUTED",
    candidate,
    baseline,
    relativeWapeImprovement,
    noOppositeMaterialDegradation:
      relativeWapeImprovement !== null
      && relativeWapeImprovement
        >= -config.decisionPolicy.minimumRelativeWapeImprovement
  });
}

function attachOriginVisibleAttributionBands(rows) {
  const byOrigin = groupBy(rows, (row) => row.origin);
  const output = [];
  for (const values of byOrigin.values()) {
    const fields = [
      ["trailing1", "trailing1Cash"],
      ["trailing3", "trailing3Cash"],
      ["trailing6", "trailing6Cash"],
      ["trailing12", "trailing12Cash"]
    ];
    const bands = Object.fromEntries(fields.map(([name, field]) => [
      name,
      percentileBands(values, (row) => row.features[field])
    ]));
    const core80Values = values.filter((row) => row.populationId === "CORE80")
      .sort((left, right) => (
        Number(left.referenceRank) - Number(right.referenceRank)
        || stableTextCompare(left.standardWorkId, right.standardWorkId)
      ));
    const core80Rank = new Map(core80Values.map((row, index) => [
      row.caseKey,
      percentileBand(
        core80Values.length <= 1 ? 1 : index / (core80Values.length - 1)
      )
    ]));
    for (const row of values) {
      output.push(Object.freeze({
        ...row,
        bands: Object.freeze({
          trailing1: bands.trailing1.get(row.caseKey) ?? "MISSING",
          trailing3: bands.trailing3.get(row.caseKey) ?? "MISSING",
          trailing6: bands.trailing6.get(row.caseKey) ?? "MISSING",
          trailing12: bands.trailing12.get(row.caseKey) ?? "MISSING",
          core80Rank: core80Rank.get(row.caseKey) ?? "NOT_CORE80"
        })
      }));
    }
  }
  return output.sort(compareCaseRows);
}

function percentileBands(rows, valueOf) {
  const available = rows.filter(
    (row) => Number.isFinite(valueOf(row))
  ).sort((left, right) => (
    valueOf(left) - valueOf(right)
    || stableTextCompare(left.standardWorkId, right.standardWorkId)
  ));
  const output = new Map();
  for (const [index, row] of available.entries()) {
    const percentile = available.length <= 1
      ? 1
      : index / (available.length - 1);
    output.set(row.caseKey, percentileBand(percentile));
  }
  return output;
}

function percentileBand(percentile) {
  if (percentile < 0.2) return "P00_20";
  if (percentile < 0.5) return "P20_50";
  if (percentile < 0.8) return "P50_80";
  return "P80_100";
}

function summarizeAttributionGroups(rows, bandOf, totalAbsoluteError) {
  return [...groupBy(rows, bandOf)].map(([band, values]) => {
    const oa03 = scoreM2HorizonAmountPointRows(values.map(
      (row) => ({ ...row, pointEstimate: row.oa03PointEstimate })
    ));
    const lg01 = scoreM2HorizonAmountPointRows(values.map(
      (row) => ({ ...row, pointEstimate: row.lg01PointEstimate })
    ));
    const absoluteError = sum(values.map((row) => row.oa03AbsoluteError));
    return Object.freeze({
      band,
      caseCount: values.length,
      workCount: new Set(values.map((row) => row.standardWorkId)).size,
      oa03Wape: oa03.wape,
      oa03SignedBias: oa03.signedBias,
      lg01Wape: lg01.wape,
      lg01SignedBias: lg01.signedBias,
      oa03AbsoluteErrorContribution: totalAbsoluteError > 0
        ? absoluteError / totalAbsoluteError
        : 0
    });
  }).sort((left, right) => stableTextCompare(left.band, right.band));
}

function ratioBand(value) {
  if (!Number.isFinite(value)) return "MISSING";
  if (value < 0.5) return "LT_0_5";
  if (value < 0.9) return "0_5_TO_0_9";
  if (value <= 1.1) return "0_9_TO_1_1";
  if (value <= 1.5) return "1_1_TO_1_5";
  return "GT_1_5";
}

function slopeBand(value) {
  if (!Number.isFinite(value)) return "MISSING";
  if (value < -0.1) return "STRONG_DECLINE";
  if (value < -0.02) return "DECLINE";
  if (value <= 0.02) return "FLAT";
  if (value <= 0.1) return "GROWTH";
  return "STRONG_GROWTH";
}

function peakRatioBand(value) {
  if (!Number.isFinite(value)) return "MISSING";
  if (value < 0.25) return "LT_0_25";
  if (value < 0.5) return "0_25_TO_0_5";
  if (value < 0.8) return "0_5_TO_0_8";
  return "GE_0_8";
}

function monthsSincePeakBand(value) {
  if (!Number.isFinite(value)) return "MISSING";
  if (value === 0) return "CURRENT_PEAK";
  if (value <= 3) return "ONE_TO_THREE";
  if (value <= 6) return "FOUR_TO_SIX";
  if (value <= 12) return "SEVEN_TO_TWELVE";
  return "GT_TWELVE";
}

function historyBand(value) {
  if (!Number.isFinite(value)) return "MISSING";
  if (value <= 12) return "THREE_TO_TWELVE";
  if (value <= 24) return "THIRTEEN_TO_TWENTY_FOUR";
  if (value <= 48) return "TWENTY_FIVE_TO_FORTY_EIGHT";
  return "FORTY_NINE_PLUS";
}

function channelCountBand(value) {
  if (!Number.isFinite(value)) return "MISSING";
  if (value === 1) return "ONE";
  if (value === 2) return "TWO";
  if (value <= 5) return "THREE_TO_FIVE";
  return "SIX_PLUS";
}

function zeroShareBand(value) {
  if (!Number.isFinite(value)) return "MISSING";
  if (value === 0) return "ZERO";
  if (value <= 0.25) return "GT_ZERO_TO_0_25";
  if (value <= 0.5) return "GT_0_25_TO_0_5";
  return "GT_0_5";
}

function cvBand(value) {
  if (!Number.isFinite(value)) return "MISSING";
  if (value < 0.5) return "LT_0_5";
  if (value < 1) return "0_5_TO_1";
  if (value < 2) return "1_TO_2";
  return "GE_2";
}

function summarizeLossByOrigin(rows) {
  return [...groupBy(rows, (row) => row.origin)].map(
    ([origin, values]) => Object.freeze({
      origin,
      trainingRowCount: values.length,
      trainingWeightTotal: sum(values.map((row) => row.trainingWeight)),
      weightedHuberLoss: sum(values.map(
        (row) => row.transformedHuberLoss
      ))
    })
  ).sort((left, right) => left.origin.localeCompare(right.origin));
}

function emptyPointMetrics() {
  return Object.freeze({
    status: "NOT_COMPUTABLE_EMPTY",
    caseCount: 0,
    workCount: 0,
    originCount: 0,
    actualDenominator: 0,
    actualTotal: 0,
    predictionTotal: 0,
    absoluteErrorTotal: 0,
    wape: null,
    signedBias: null,
    mae: null,
    medianAbsoluteError: null,
    predictionActualRatio: null,
    underpredictionCash: 0,
    overpredictionCash: 0,
    errorConcentration: null
  });
}

function coreHorizonComparisonKey(row) {
  return [
    row.evaluationFamily ?? "",
    row.populationId ?? "",
    coreHorizonCaseKey(row)
  ].join("\u0000");
}

function completeWindowSum(values, window) {
  return values.length >= window ? sum(values.slice(-window)) : null;
}

function linearSlope(values) {
  const xMean = (values.length - 1) / 2;
  const yMean = mean(values);
  let numerator = 0;
  let denominator = 0;
  for (const [index, value] of values.entries()) {
    numerator += (index - xMean) * (value - yMean);
    denominator += (index - xMean) ** 2;
  }
  return denominator > 0 ? numerator / denominator : 0;
}

function safeRatio(numerator, denominator) {
  return (
    Number.isFinite(numerator)
    && Number.isFinite(denominator)
    && Math.abs(denominator) > EPSILON
  ) ? numerator / denominator : null;
}

function huberLoss(residual, delta) {
  const absolute = Math.abs(residual);
  return absolute <= delta
    ? 0.5 * residual ** 2
    : delta * (absolute - 0.5 * delta);
}

function latestIndexOf(values, target) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (Math.abs(values[index] - target) <= EPSILON) return index;
  }
  return -1;
}

function uniqueIndex(rows, keyOf) {
  const output = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (output.has(key)) {
      fail("m2_core_horizon_amount_duplicate_case_key");
    }
    output.set(key, row);
  }
  return output;
}

function groupBy(values, keyOf) {
  const output = new Map();
  for (const value of values) {
    const key = keyOf(value);
    const rows = output.get(key) ?? [];
    rows.push(value);
    output.set(key, rows);
  }
  return output;
}

function compareCaseRows(left, right) {
  return (
    stableTextCompare(left.evaluationFamily ?? "", right.evaluationFamily ?? "")
    || stableTextCompare(left.populationId ?? "", right.populationId ?? "")
    || left.horizonMonths - right.horizonMonths
    || stableTextCompare(left.origin, right.origin)
    || stableTextCompare(left.standardWorkId, right.standardWorkId)
  );
}

function empiricalQuantile(sorted, probability) {
  if (!Array.isArray(sorted) || sorted.length === 0) return null;
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return (
    sorted[lower] * (upper - index)
    + sorted[upper] * (index - lower)
  );
}

function standardDeviation(values) {
  if (values.length <= 1) return 0;
  const center = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - center) ** 2)));
}

function dot(left, right) {
  return left.reduce(
    (total, value, index) => total + value * right[index],
    0
  );
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function requireRawArm(value) {
  if (!RAW_ARMS.includes(value)) {
    fail("m2_core_horizon_amount_raw_arm_invalid");
  }
  return value;
}

function requireHorizon(value) {
  const number = Number(value);
  if (!HORIZONS.includes(number)) {
    fail("m2_core_horizon_amount_horizon_invalid");
  }
  return number;
}

function requireMonth(value, field) {
  if (
    typeof value !== "string"
    || !/^\d{4}-(?:0[1-9]|1[0-2])$/u.test(value)
  ) {
    fail(`m2_core_horizon_amount_${field}_invalid`);
  }
  return value;
}

function requireObject(value, field) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`m2_core_horizon_amount_${field}_invalid`);
  }
  return value;
}

function positiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    fail(`m2_core_horizon_amount_${field}_invalid`);
  }
  return number;
}

function positiveFinite(value, field) {
  const number = finite(value, field);
  if (!(number > 0)) {
    fail(`m2_core_horizon_amount_${field}_invalid`);
  }
  return number;
}

function nonnegativeFinite(value, field) {
  const number = finite(value, field);
  if (number < 0) {
    fail(`m2_core_horizon_amount_${field}_invalid`);
  }
  return number;
}

function nullableFinite(value) {
  if (value === null || value === undefined) return null;
  return finite(value, "nullable_finite");
}

function finite(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    fail(`m2_core_horizon_amount_${field}_invalid`);
  }
  return number;
}

function nonempty(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    fail(`m2_core_horizon_amount_${field}_invalid`);
  }
  return value;
}

function mean(values) {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function maximum(values) {
  return values.length === 0 ? 0 : Math.max(...values);
}

function stableTextCompare(left, right) {
  return String(left).localeCompare(String(right), "en");
}

function fail(code) {
  throw new M2CoreHorizonAmountError(code);
}
