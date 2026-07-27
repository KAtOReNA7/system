import {
  deterministicWorkFold,
  fitM2HumanAnchoredReversal,
  forecastM2HumanAnchoredBase,
  learnM2HumanAnchoredParameters,
  predictM2HumanAnchoredReversalRate
} from "./humanAnchored.js";
import { scoreM2CurrentPointRows } from "./metrics.js";

export const M2_LIFECYCLE_STATES = Object.freeze([
  "active",
  "stable",
  "decline",
  "dormant",
  "revival"
]);

const FEATURE_NAMES = Object.freeze([
  "logTrailing1",
  "logTrailing3",
  "logTrailing6",
  "logTrailing12",
  "logTrailing24",
  "occurrence3",
  "occurrence6",
  "occurrence12",
  "occurrence24",
  "logMeanPositive",
  "logMedianPositive",
  "logMonthsSincePositive",
  "recentToPriorLogRatio",
  "logTrendSlope12",
  "logHistoryMonths",
  "logHorizon",
  "stateStable",
  "stateDecline",
  "stateDormant",
  "stateRevival",
  "stableHorizonInteraction",
  "declineHorizonInteraction",
  "dormantHorizonInteraction",
  "revivalHorizonInteraction"
]);

export function m2LifecycleAwareFeatureNames() {
  return [...FEATURE_NAMES];
}

export function classifyM2Lifecycle(row, config) {
  const lifecycle = requireObject(config?.lifecycle, "lifecycle_config");
  const history = requireMonthlyHistory(row);
  const positive = history.positiveSeries;
  const recentWindow = positiveInteger(
    lifecycle.recentWindowMonths,
    "recent_window_months"
  );
  const trailingWindow = positiveInteger(
    lifecycle.trailingWindowMonths,
    "trailing_window_months"
  );
  const priorWindow = positiveInteger(
    lifecycle.priorWindowMonths,
    "prior_window_months"
  );
  const trailing = positive.slice(-trailingWindow);
  const recent = trailing.slice(-recentWindow);
  const prior = trailing.slice(
    -Math.min(trailing.length, recentWindow + priorWindow),
    -recentWindow
  );
  const historicalPositiveMonths = positive.filter((value) => value > 0).length;
  const trailingPositiveMonths = trailing.filter((value) => value > 0).length;
  const recentPositiveMonths = recent.filter((value) => value > 0).length;
  const priorPositiveMonths = prior.filter((value) => value > 0).length;
  const monthsSinceLastPositive = monthsSincePositive(positive);
  const recentMean = meanOrZero(recent);
  const priorMean = meanOrZero(prior);
  const levelRatio = priorMean > 0
    ? recentMean / priorMean
    : recentMean > 0 ? Number.POSITIVE_INFINITY : 0;
  const slope = linearSlope(
    trailing.map((value) => Math.log1p(value))
  );

  let state;
  if (
    recentPositiveMonths > 0
    && priorPositiveMonths === 0
    && prior.length >= positiveInteger(
      lifecycle.revivalMinimumPriorZeroMonths,
      "revival_minimum_prior_zero_months"
    )
    && historicalPositiveMonths > recentPositiveMonths
  ) {
    state = "revival";
  } else if (
    trailingPositiveMonths
      <= nonnegativeInteger(
        lifecycle.dormantMaximumTrailingPositiveMonths,
        "dormant_maximum_trailing_positive_months"
      )
    && historicalPositiveMonths > 0
  ) {
    state = "dormant";
  } else if (
    priorMean > 0
    && (
      levelRatio <= nonnegative(
        lifecycle.declineRecentToPriorMaximum,
        "decline_recent_to_prior_maximum"
      )
      || slope <= finite(
        lifecycle.declineLogSlopeMaximum,
        "decline_log_slope_maximum"
      )
    )
  ) {
    state = "decline";
  } else if (
    trailingPositiveMonths >= positiveInteger(
      lifecycle.stableMinimumTrailingPositiveMonths,
      "stable_minimum_trailing_positive_months"
    )
    && levelRatio >= nonnegative(
      lifecycle.stableRecentToPriorMinimum,
      "stable_recent_to_prior_minimum"
    )
    && levelRatio <= nonnegative(
      lifecycle.stableRecentToPriorMaximum,
      "stable_recent_to_prior_maximum"
    )
  ) {
    state = "stable";
  } else {
    state = "active";
  }

  return Object.freeze({
    state,
    historyStartsAt: history.startsAt,
    historyThrough: history.through,
    historyMonthCount: positive.length,
    historicalPositiveMonths,
    trailingPositiveMonths,
    recentPositiveMonths,
    priorPositiveMonths,
    monthsSinceLastPositive,
    recentMean,
    priorMean,
    recentToPriorRatio: Number.isFinite(levelRatio) ? levelRatio : null,
    logTrendSlope12: slope,
    futureLabelRead: false
  });
}

export function buildM2LifecycleFeatures(row, config) {
  const classification = classifyM2Lifecycle(row, config);
  const history = requireMonthlyHistory(row);
  const positive = history.positiveSeries;
  const horizon = positiveInteger(row?.horizonMonths, "horizon_months");
  const recent = positive.slice(-3);
  const prior = positive.slice(-12, -3);
  const positiveValues = positive.filter((value) => value > 0);
  const logHorizon = Math.log1p(horizon);
  const state = classification.state;
  const values = Object.freeze({
    logTrailing1: Math.log1p(sum(positive.slice(-1))),
    logTrailing3: Math.log1p(sum(positive.slice(-3))),
    logTrailing6: Math.log1p(sum(positive.slice(-6))),
    logTrailing12: Math.log1p(sum(positive.slice(-12))),
    logTrailing24: Math.log1p(sum(positive.slice(-24))),
    occurrence3: occurrenceRate(positive.slice(-3)),
    occurrence6: occurrenceRate(positive.slice(-6)),
    occurrence12: occurrenceRate(positive.slice(-12)),
    occurrence24: occurrenceRate(positive.slice(-24)),
    logMeanPositive: Math.log1p(meanOrZero(positiveValues)),
    logMedianPositive: Math.log1p(median(positiveValues)),
    logMonthsSincePositive: Math.log1p(
      classification.monthsSinceLastPositive
    ),
    recentToPriorLogRatio: Math.log(
      (meanOrZero(recent) + 1) / (meanOrZero(prior) + 1)
    ),
    logTrendSlope12: classification.logTrendSlope12,
    logHistoryMonths: Math.log1p(positive.length),
    logHorizon,
    stateStable: Number(state === "stable"),
    stateDecline: Number(state === "decline"),
    stateDormant: Number(state === "dormant"),
    stateRevival: Number(state === "revival"),
    stableHorizonInteraction: Number(state === "stable") * logHorizon,
    declineHorizonInteraction: Number(state === "decline") * logHorizon,
    dormantHorizonInteraction: Number(state === "dormant") * logHorizon,
    revivalHorizonInteraction: Number(state === "revival") * logHorizon
  });
  return Object.freeze({
    featureVersion: String(config?.featureVersion),
    lifecycleState: state,
    lifecycle: classification,
    values
  });
}

export function fitM2LifecycleAwareModel(rows, baseConfig, config) {
  const training = requireRows(rows, "training_rows");
  const modelConfig = requireObject(config?.model, "model_config");
  const minimum = positiveInteger(
    modelConfig.minimumTrainingRows,
    "minimum_training_rows"
  );
  if (training.length < minimum) {
    throw new Error("m2_lifecycle_aware_training_rows_insufficient");
  }
  const baselineFit = learnM2HumanAnchoredParameters(training, baseConfig);
  const prepared = training.map((row) => {
    const feature = buildM2LifecycleFeatures(row, config);
    const baseline = forecastM2HumanAnchoredBase(
      row,
      baselineFit.parameters
    );
    return {
      row,
      feature,
      baselinePositive: baseline.positivePointEstimate,
      actualPositive: nonnegative(row?.actualPositive, "actual_positive"),
      actualReversal: nonnegative(row?.actualReversal, "actual_reversal")
    };
  });
  const featureSpace = fitFeatureSpace(prepared.map(
    (item) => item.feature.values
  ));
  const samples = prepared.map((item) => ({
    ...item,
    x: transformFeatures(item.feature.values, featureSpace)
  }));
  const occurrence = fitLogisticRidge(
    samples.map((item) => ({
      x: item.x,
      y: Number(item.actualPositive > 0)
    })),
    positiveFinite(modelConfig.occurrenceRidge, "occurrence_ridge"),
    positiveInteger(
      modelConfig.occurrenceIterations,
      "occurrence_iterations"
    )
  );
  const occurrenceOffsets = fitOccurrenceOffsets(
    samples,
    occurrence,
    modelConfig
  );
  const occurrenceRates = fitOccurrenceRates(samples, modelConfig);
  const positiveSamples = samples.filter((item) => item.actualPositive > 0);
  if (
    positiveSamples.length
      < positiveInteger(
        modelConfig.minimumPositiveTrainingRows,
        "minimum_positive_training_rows"
      )
  ) {
    throw new Error("m2_lifecycle_aware_positive_training_rows_insufficient");
  }
  const amount = fitAmountModel(positiveSamples, modelConfig);
  const amountScales = fitAmountScales(
    positiveSamples,
    amount,
    modelConfig
  );
  const reversalState = fitM2HumanAnchoredReversal(training, baseConfig);
  return Object.freeze({
    schema: "m2.current.lifecycle_aware_model_state.v0.1",
    candidateId: String(config?.candidateId),
    datasetVersion: String(config?.datasetVersion),
    featureVersion: String(config?.featureVersion),
    featureNames: FEATURE_NAMES,
    featureSpace,
    occurrence,
    occurrenceOffsets,
    occurrenceRates,
    amount,
    amountScales,
    reversalState,
    baselineParameters: baselineFit.parameters,
    trainingRowCount: training.length,
    trainingPositiveRowCount: positiveSamples.length,
    trainingWorkCount: new Set(
      training.map((row) => String(row.standardWorkId))
    ).size,
    maximumLabelAvailableAsOf:
      training.map((row) => String(row.labelAvailableAsOf)).sort().at(-1),
    sameOrLaterTruthRead: false
  });
}

export function predictM2LifecycleAware(row, state, baseConfig, config) {
  const feature = buildM2LifecycleFeatures(row, config);
  const x = transformFeatures(feature.values, state.featureSpace);
  const baseline = forecastM2HumanAnchoredBase(
    row,
    state.baselineParameters
  );
  const baselinePositivePointEstimate = baseline.positivePointEstimate;
  const rawOccurrenceProbability = predictLogistic(state.occurrence, x);
  const occurrenceOffset = Number(
    state.occurrenceOffsets.byLifecycle[feature.lifecycleState]
      ?? state.occurrenceOffsets.global
  );
  const calibratedOccurrenceProbability = sigmoid(
    logit(rawOccurrenceProbability) + occurrenceOffset
  );
  const rateKey = lifecycleHorizonKey(
    feature.lifecycleState,
    row.horizonMonths
  );
  const lifecycleOccurrenceRate = Number(
    state.occurrenceRates.byLifecycleHorizon[rateKey]
      ?? state.occurrenceRates.byLifecycle[feature.lifecycleState]
      ?? state.occurrenceRates.global
  );
  const logisticWeight = fractionInclusiveZero(
    config?.model?.occurrenceLogisticWeight,
    "occurrence_logistic_weight"
  );
  const occurrenceProbability = (
    logisticWeight * calibratedOccurrenceProbability
    + (1 - logisticWeight) * lifecycleOccurrenceRate
  );
  const rawConditionalPositiveAmount = predictAmountModel(
    state.amount,
    x,
    baselinePositivePointEstimate,
    feature.lifecycleState,
    row.horizonMonths
  );
  const amountScale = Number(
    state.amountScales.byLifecycle[feature.lifecycleState]
      ?? state.amountScales.global
  );
  const conditionalPositiveAmount = Math.min(
    state.amount.maximumPrediction,
    Math.max(0, rawConditionalPositiveAmount * amountScale)
  );
  const positivePointEstimate = (
    occurrenceProbability * conditionalPositiveAmount
  );
  const reversalRate = predictM2HumanAnchoredReversalRate(
    row,
    state.reversalState
  );
  const reversalPointEstimate = positivePointEstimate * reversalRate;
  const rawLifecyclePointEstimate = (
    positivePointEstimate - reversalPointEstimate
  );

  const baselineReversalPointEstimate = (
    baselinePositivePointEstimate * reversalRate
  );
  const baselinePointEstimate = (
    baselinePositivePointEstimate - baselineReversalPointEstimate
  );
  const selectedLifecycleStates = Array.isArray(
    config?.model?.selectedLifecycleStates
  ) ? config.model.selectedLifecycleStates.map(String) : M2_LIFECYCLE_STATES;
  if (selectedLifecycleStates.some(
    (value) => !M2_LIFECYCLE_STATES.includes(value)
  )) {
    throw new Error("m2_lifecycle_aware_selected_state_invalid");
  }
  const lifecycleChallengerSelected = selectedLifecycleStates.includes(
    feature.lifecycleState
  );
  const pointEstimate = lifecycleChallengerSelected
    ? rawLifecyclePointEstimate
    : baselinePointEstimate;

  return Object.freeze({
    lifecycleState: feature.lifecycleState,
    lifecycle: feature.lifecycle,
    featureVersion: feature.featureVersion,
    occurrenceProbability,
    rawOccurrenceProbability,
    calibratedOccurrenceProbability,
    lifecycleOccurrenceRate,
    conditionalPositiveAmount,
    rawConditionalPositiveAmount,
    positivePointEstimate,
    reversalPointEstimate,
    reversalRate,
    rawLifecyclePointEstimate,
    pointEstimate,
    baselinePositivePointEstimate,
    baselineReversalPointEstimate,
    baselinePointEstimate,
    lifecycleChallengerSelected,
    selectedPointLayer: lifecycleChallengerSelected
      ? "lifecycle_occurrence_and_log_amount"
      : "frozen_learnedGlobal_common_reversal_fallback",
    trainingReadOwnWork: false
  });
}

export function crossFitM2LifecycleAware(rows, baseConfig, config) {
  const source = requireRows(rows, "cross_fit_rows");
  const foldCount = positiveInteger(
    config?.training?.crossWorkFoldCount,
    "cross_work_fold_count"
  );
  const output = [];
  const folds = [];
  for (let fold = 0; fold < foldCount; fold += 1) {
    const training = source.filter(
      (row) => deterministicWorkFold(row.standardWorkId, foldCount) !== fold
    );
    const validation = source.filter(
      (row) => deterministicWorkFold(row.standardWorkId, foldCount) === fold
    );
    if (training.length === 0 || validation.length === 0) {
      throw new Error("m2_lifecycle_aware_cross_work_fold_empty");
    }
    const state = fitM2LifecycleAwareModel(
      training,
      baseConfig,
      config
    );
    for (const row of validation) {
      output.push(Object.freeze({
        ...row,
        ...predictM2LifecycleAware(row, state, baseConfig, config),
        evaluationFold: fold,
        trainingReadOwnWork: false
      }));
    }
    folds.push(Object.freeze({
      fold,
      trainingRowCount: training.length,
      trainingPositiveRowCount: state.trainingPositiveRowCount,
      trainingWorkCount: state.trainingWorkCount,
      validationRowCount: validation.length,
      validationWorkCount: new Set(
        validation.map((row) => String(row.standardWorkId))
      ).size,
      maximumLabelAvailableAsOf: state.maximumLabelAvailableAsOf,
      modelConfigChangedByOuterMetrics: false
    }));
  }
  output.sort(compareCaseRows);
  return Object.freeze({
    schema: "m2.current.lifecycle_aware_cross_work.v0.1",
    candidateId: String(config?.candidateId),
    datasetVersion: String(config?.datasetVersion),
    featureVersion: String(config?.featureVersion),
    rows: Object.freeze(output),
    folds: Object.freeze(folds),
    metrics: scoreM2LifecycleAwareRows(output, config),
    independentLaterOrigin: false
  });
}

export function strictRollingM2LifecycleAware(rows, baseConfig, config) {
  const source = requireRows(rows, "strict_rolling_rows");
  const start = requireMonth(
    config?.training?.strictRollingStartsAt,
    "strict_rolling_starts_at"
  );
  const minimum = positiveInteger(
    config?.training?.minimumStrictTrainingRows,
    "minimum_strict_training_rows"
  );
  const origins = [...new Set(source.map(
    (row) => requireMonth(row.origin, "origin")
  ))].sort().filter((origin) => origin >= start);
  const output = [];
  const originsEvaluated = [];
  for (const outerOrigin of origins) {
    const training = source.filter((row) => (
      row.origin < outerOrigin
      && row.labelAvailableAsOf <= outerOrigin
    ));
    const validation = source.filter((row) => row.origin === outerOrigin);
    if (training.length < minimum || validation.length === 0) {
      originsEvaluated.push(Object.freeze({
        outerOrigin,
        status: "insufficient_mature_earlier_rows",
        trainingRowCount: training.length,
        validationRowCount: validation.length
      }));
      continue;
    }
    const state = fitM2LifecycleAwareModel(
      training,
      baseConfig,
      config
    );
    for (const row of validation) {
      output.push(Object.freeze({
        ...row,
        ...predictM2LifecycleAware(row, state, baseConfig, config),
        outerOrigin,
        maximumTrainingLabelAvailableAsOf:
          state.maximumLabelAvailableAsOf,
        sameOrLaterOuterTruthRead: false
      }));
    }
    originsEvaluated.push(Object.freeze({
      outerOrigin,
      status: "evaluated",
      trainingRowCount: training.length,
      trainingWorkCount: state.trainingWorkCount,
      validationRowCount: validation.length,
      maximumTrainingLabelAvailableAsOf:
        state.maximumLabelAvailableAsOf,
      sameOrLaterOuterTruthRead: false
    }));
  }
  if (output.length === 0) {
    throw new Error("m2_lifecycle_aware_strict_rolling_output_empty");
  }
  output.sort(compareCaseRows);
  return Object.freeze({
    schema: "m2.current.lifecycle_aware_strict_rolling.v0.1",
    candidateId: String(config?.candidateId),
    rows: Object.freeze(output),
    origins: Object.freeze(originsEvaluated),
    metrics: scoreM2LifecycleAwareRows(output, config),
    independentLaterOrigin: false
  });
}

export function scoreM2LifecycleAwareRows(rows, config) {
  const source = requireRows(rows, "evaluation_rows");
  const candidate = scoreField(source, "pointEstimate");
  const rawCandidate = scoreField(source, "rawLifecyclePointEstimate");
  const baseline = scoreField(source, "baselinePointEstimate");
  const occurrence = scoreOccurrence(source);
  const conditionalAmount = scoreConditionalAmount(source);
  const byLifecycle = Object.fromEntries(
    M2_LIFECYCLE_STATES.map((state) => {
      const selected = source.filter(
        (row) => row.lifecycleState === state
      );
      return [state, scoreEvaluationSlice(selected)];
    })
  );
  const topRevenue = scoreTopRevenue(
    source,
    config?.evaluation?.topRevenueFractions
  );
  const lifecycleCounts = Object.fromEntries(
    M2_LIFECYCLE_STATES.map((state) => [
      state,
      source.filter((row) => row.lifecycleState === state).length
    ])
  );
  return Object.freeze({
    caseCount: source.length,
    workCount: new Set(
      source.map((row) => String(row.standardWorkId))
    ).size,
    candidate,
    rawCandidate,
    baseline,
    relativeWapeToBaseline: candidate.wape / baseline.wape - 1,
    rawRelativeWapeToBaseline:
      rawCandidate.wape / baseline.wape - 1,
    revenueWeightedWape: Object.freeze({
      value: candidate.wape,
      baselineValue: baseline.wape,
      definition: "sum_absolute_error_divided_by_sum_absolute_actual_cash",
      interpretation:
        "canonical_WAPE_is_revenue_weighted_MAE_not_equal_weight_MAPE"
    }),
    occurrence,
    conditionalPositiveAmount: conditionalAmount,
    lifecycleClassification: Object.freeze({
      method: "deterministic_as_of_history_only_without_future_labels",
      mutuallyExclusiveStates: M2_LIFECYCLE_STATES,
      counts: Object.freeze(lifecycleCounts)
    }),
    byLifecycle: Object.freeze(byLifecycle),
    topRevenue
  });
}

export function buildM2LifecycleAwareSyntheticDiagnostic(
  fixture,
  baseConfig,
  config
) {
  const value = requireObject(fixture, "synthetic_fixture");
  if (
    value.schema !== "m2.current.lifecycle_aware_synthetic_fixture.v0.1"
    || !Array.isArray(value.lifecycleTemplates)
  ) {
    throw new Error("m2_lifecycle_aware_synthetic_fixture_invalid");
  }
  const replications = positiveInteger(
    value.replicationsPerState,
    "synthetic_replications_per_state"
  );
  const cases = [];
  for (const template of value.lifecycleTemplates) {
    const expectedState = String(template.expectedLifecycleState);
    if (!M2_LIFECYCLE_STATES.includes(expectedState)) {
      throw new Error("m2_lifecycle_aware_synthetic_state_invalid");
    }
    for (let replicate = 0; replicate < replications; replicate += 1) {
      const scale = 1 + replicate * 0.08;
      const positiveSeries = template.positiveSeries.map(
        (amount) => nonnegative(amount, "synthetic_positive") * scale
      );
      const reversalSeries = template.reversalSeries.map(
        (amount) => nonnegative(amount, "synthetic_reversal") * scale
      );
      const origin = requireMonth(value.origin, "synthetic_origin");
      const horizonMonths = positiveInteger(
        value.horizonMonths,
        "synthetic_horizon"
      );
      cases.push({
        standardWorkId:
          `SYN-LIFECYCLE-${expectedState.toUpperCase()}-${replicate + 1}`,
        origin,
        horizonMonths,
        labelAvailableAsOf: addMonths(origin, horizonMonths),
        segment: String(template.legacySegment),
        dominantRevenueMode: "synthetic_history_only",
        secondLevelCategoryReportingOnly: "synthetic",
        actualPositive:
          nonnegative(template.actualPositive, "synthetic_actual_positive")
          * scale,
        actualReversal:
          nonnegative(template.actualReversal, "synthetic_actual_reversal")
          * scale,
        actual: (
          nonnegative(template.actualPositive, "synthetic_actual_positive")
          - nonnegative(template.actualReversal, "synthetic_actual_reversal")
        ) * scale,
        expectedLifecycleState: expectedState,
        observedSalesAgeMonths: positiveSeries.length,
        canonicalChannels: [
          syntheticChannel(positiveSeries, reversalSeries)
        ],
        salesShareMonthlyHistory: {
          startsAt: addMonths(origin, 1 - positiveSeries.length),
          through: origin,
          positiveSeries,
          reversalSeries,
          observedZeroMonthsIncluded: true,
          unobservedMonthsZeroFilled: false
        }
      });
    }
  }
  const classified = cases.map((row) => ({
    expected: row.expectedLifecycleState,
    actual: classifyM2Lifecycle(row, config).state
  }));
  if (classified.some((row) => row.expected !== row.actual)) {
    throw new Error("m2_lifecycle_aware_synthetic_classification_drift");
  }
  const result = crossFitM2LifecycleAware(cases, baseConfig, config);
  if (
    result.rows.some((row) => (
      row.trainingReadOwnWork !== false
      || row.occurrenceProbability < 0
      || row.occurrenceProbability > 1
      || row.conditionalPositiveAmount < 0
      || !Number.isFinite(row.pointEstimate)
    ))
  ) {
    throw new Error("m2_lifecycle_aware_synthetic_prediction_invalid");
  }
  return Object.freeze({
    schema: "m2.current.lifecycle_aware_public_diagnostic.v0.1",
    candidateId: String(config?.candidateId),
    datasetVersion: String(config?.datasetVersion),
    featureVersion: String(config?.featureVersion),
    fixtureSchema: value.schema,
    caseCount: cases.length,
    workCount: cases.length,
    lifecycleCounts: result.metrics.lifecycleClassification.counts,
    featureNames: FEATURE_NAMES,
    model: Object.freeze({
      occurrence:
        "regularized_logistic_with_lifecycle_probability_calibration",
      amount: String(config?.model?.amountFamily),
      reversal: "existing_separate_common_reversal_layer"
    }),
    evaluation: result.metrics,
    boundaries: Object.freeze({
      publicSyntheticOnly: true,
      privateArtifactRead: false,
      exactV03Modified: false,
      productionRouteModified: false,
      buyoutCashUsed: false,
      finalHoldoutUsed: false,
      releaseAuthorized: false
    })
  });
}

function fitFeatureSpace(features) {
  const vectors = features.map(featureVector);
  const means = FEATURE_NAMES.map((_, index) => mean(
    vectors.map((vector) => vector[index])
  ));
  const scales = FEATURE_NAMES.map((_, index) => {
    const variance = mean(vectors.map(
      (vector) => (vector[index] - means[index]) ** 2
    ));
    return Math.sqrt(variance) || 1;
  });
  return Object.freeze({
    means: Object.freeze(means),
    scales: Object.freeze(scales)
  });
}

function transformFeatures(features, featureSpace) {
  const values = featureVector(features);
  return [
    1,
    ...values.map(
      (value, index) => (
        value - featureSpace.means[index]
      ) / featureSpace.scales[index]
    )
  ];
}

function featureVector(features) {
  return FEATURE_NAMES.map(
    (name) => finite(features?.[name], `feature_${name}`)
  );
}

function fitLogisticRidge(samples, ridge, iterations) {
  const width = samples[0].x.length;
  const observedRate = (
    samples.reduce((total, sample) => total + sample.y, 0) + 0.5
  ) / (samples.length + 1);
  let coefficients = Array(width).fill(0);
  coefficients[0] = logit(observedRate);
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const weighted = samples.map((sample) => {
      const eta = dot(coefficients, sample.x);
      const probability = clamp(sigmoid(eta), 1e-6, 1 - 1e-6);
      const weight = Math.max(
        1e-5,
        probability * (1 - probability)
      );
      return {
        x: sample.x,
        y: eta + (sample.y - probability) / weight,
        weight
      };
    });
    const next = fitWeightedRidge(weighted, ridge);
    const delta = Math.max(...next.map(
      (value, index) => Math.abs(value - coefficients[index])
    ));
    coefficients = next;
    if (delta < 1e-7) break;
  }
  return Object.freeze({ coefficients: Object.freeze(coefficients) });
}

function fitOccurrenceOffsets(samples, model, config) {
  const strength = nonnegative(
    config.occurrenceLifecyclePriorStrength,
    "occurrence_lifecycle_prior_strength"
  );
  const globalObserved = (
    samples.reduce((total, sample) => (
      total + Number(sample.actualPositive > 0)
    ), 0) + 0.5
  ) / (samples.length + 1);
  const globalPredicted = mean(samples.map(
    (sample) => predictLogistic(model, sample.x)
  ));
  const global = logit(globalObserved) - logit(globalPredicted);
  const byLifecycle = {};
  for (const state of M2_LIFECYCLE_STATES) {
    const group = samples.filter(
      (sample) => sample.feature.lifecycleState === state
    );
    if (group.length === 0) continue;
    const observed = (
      group.reduce((total, sample) => (
        total + Number(sample.actualPositive > 0)
      ), 0) + strength * globalObserved
    ) / (group.length + strength);
    const predicted = mean(group.map(
      (sample) => predictLogistic(model, sample.x)
    ));
    const rawOffset = logit(observed) - logit(predicted);
    const shrinkage = group.length / (group.length + strength);
    byLifecycle[state] = global + shrinkage * (rawOffset - global);
  }
  return Object.freeze({
    global,
    byLifecycle: Object.freeze(byLifecycle)
  });
}

function fitOccurrenceRates(samples, config) {
  const strength = nonnegative(
    config.occurrenceLifecyclePriorStrength,
    "occurrence_lifecycle_prior_strength"
  );
  const global = (
    samples.reduce((total, sample) => (
      total + Number(sample.actualPositive > 0)
    ), 0) + 0.5
  ) / (samples.length + 1);
  const byLifecycle = {};
  const byLifecycleHorizon = {};
  for (const state of M2_LIFECYCLE_STATES) {
    const group = samples.filter(
      (sample) => sample.feature.lifecycleState === state
    );
    if (group.length === 0) continue;
    const rate = (
      group.reduce((total, sample) => (
        total + Number(sample.actualPositive > 0)
      ), 0) + strength * global
    ) / (group.length + strength);
    byLifecycle[state] = rate;
    const horizons = [...new Set(group.map(
      (sample) => Number(sample.row.horizonMonths)
    ))];
    for (const horizon of horizons) {
      const cells = group.filter(
        (sample) => Number(sample.row.horizonMonths) === horizon
      );
      byLifecycleHorizon[lifecycleHorizonKey(state, horizon)] = (
        cells.reduce((total, sample) => (
          total + Number(sample.actualPositive > 0)
        ), 0) + strength * rate
      ) / (cells.length + strength);
    }
  }
  return Object.freeze({
    global,
    byLifecycle: Object.freeze(byLifecycle),
    byLifecycleHorizon: Object.freeze(byLifecycleHorizon)
  });
}

function fitHuberLogAmount(samples, config) {
  const ridge = positiveFinite(config.amountRidge, "amount_ridge");
  const iterations = positiveInteger(
    config.amountIterations,
    "amount_iterations"
  );
  const delta = positiveFinite(config.huberDelta, "huber_delta");
  const exponent = nonnegative(
    config.revenueWeightExponent,
    "revenue_weight_exponent"
  );
  const maximumWeight = positiveFinite(
    config.maximumRevenueWeight,
    "maximum_revenue_weight"
  );
  const medianAmount = Math.max(
    Number.EPSILON,
    median(samples.map((sample) => sample.actualPositive))
  );
  const prepared = samples.map((sample) => ({
    x: sample.x,
    y: amountLogTarget(sample, config),
    baseWeight: clamp(
      (sample.actualPositive / medianAmount) ** exponent,
      1,
      maximumWeight
    )
  }));
  let coefficients = fitWeightedRidge(
    prepared.map((sample) => ({
      ...sample,
      weight: sample.baseWeight
    })),
    ridge
  );
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const residuals = prepared.map(
      (sample) => sample.y - dot(coefficients, sample.x)
    );
    const scale = Math.max(
      1e-6,
      median(residuals.map((value) => Math.abs(value))) * 1.4826
    );
    const next = fitWeightedRidge(
      prepared.map((sample, index) => {
        const standardized = Math.abs(residuals[index]) / scale;
        const huberWeight = standardized <= delta
          ? 1
          : delta / standardized;
        return {
          ...sample,
          weight: sample.baseWeight * huberWeight
        };
      }),
      ridge
    );
    const difference = Math.max(...next.map(
      (value, index) => Math.abs(value - coefficients[index])
    ));
    coefficients = next;
    if (difference < 1e-7) break;
  }
  const predictionQuantile = fraction(
    config.amountPredictionCapQuantile,
    "amount_prediction_cap_quantile"
  );
  const multiplier = positiveFinite(
    config.amountPredictionCapMultiplier,
    "amount_prediction_cap_multiplier"
  );
  const maximumPrediction = (
    empiricalQuantile(
      samples.map((sample) => sample.actualPositive).sort((a, b) => a - b),
      predictionQuantile
    ) * multiplier
  );
  return Object.freeze({
    family: "revenue_weighted_huber_log1p",
    coefficients: Object.freeze(coefficients),
    maximumPrediction,
    logOffset: String(config.amountLogOffset)
  });
}

function fitAmountModel(samples, config) {
  if (config.amountEstimator === "revenue_weighted_huber_log1p") {
    return fitHuberLogAmount(samples, config);
  }
  if (config.amountEstimator === "lifecycle_shrunk_log_revenue_ratio") {
    return fitLifecycleLogRatioAmount(samples, config);
  }
  throw new Error("m2_lifecycle_aware_amount_estimator_invalid");
}

function fitLifecycleLogRatioAmount(samples, config) {
  const minimum = positiveFinite(
    config.minimumAmountScale,
    "minimum_amount_scale"
  );
  const maximum = positiveFinite(
    config.maximumAmountScale,
    "maximum_amount_scale"
  );
  const strength = nonnegative(
    config.amountLifecyclePriorStrength,
    "amount_lifecycle_prior_strength"
  );
  const positiveBaseline = samples.filter(
    (sample) => sample.baselinePositive > 0
  );
  const globalRatio = positiveBaseline.length > 0
    ? clamp(
      sum(positiveBaseline.map((sample) => sample.actualPositive))
        / sum(positiveBaseline.map((sample) => sample.baselinePositive)),
      minimum,
      maximum
    )
    : 1;
  const meanBaseline = positiveBaseline.length > 0
    ? mean(positiveBaseline.map((sample) => sample.baselinePositive))
    : 1;
  const fallbackAmount = median(
    samples.map((sample) => sample.actualPositive)
  );
  const byLifecycle = {};
  const byLifecycleHorizon = {};
  const fallbackByLifecycle = {};
  for (const state of M2_LIFECYCLE_STATES) {
    const group = samples.filter(
      (sample) => sample.feature.lifecycleState === state
    );
    if (group.length === 0) continue;
    const groupBaseline = sum(
      group.map((sample) => sample.baselinePositive)
    );
    const groupActual = sum(
      group.map((sample) => sample.actualPositive)
    );
    const pseudoBaseline = strength * meanBaseline;
    const ratio = clamp(
      (groupActual + pseudoBaseline * globalRatio)
        / Math.max(Number.EPSILON, groupBaseline + pseudoBaseline),
      minimum,
      maximum
    );
    byLifecycle[state] = Math.log(ratio);
    fallbackByLifecycle[state] = median(
      group.map((sample) => sample.actualPositive)
    );
    const horizons = [...new Set(group.map(
      (sample) => Number(sample.row.horizonMonths)
    ))];
    for (const horizon of horizons) {
      const cells = group.filter(
        (sample) => Number(sample.row.horizonMonths) === horizon
      );
      const cellBaseline = sum(
        cells.map((sample) => sample.baselinePositive)
      );
      const cellActual = sum(
        cells.map((sample) => sample.actualPositive)
      );
      const cellPseudoBaseline = strength * (
        groupBaseline > 0 ? groupBaseline / group.length : meanBaseline
      );
      const cellRatio = clamp(
        (cellActual + cellPseudoBaseline * ratio)
          / Math.max(
            Number.EPSILON,
            cellBaseline + cellPseudoBaseline
          ),
        minimum,
        maximum
      );
      byLifecycleHorizon[lifecycleHorizonKey(state, horizon)] = (
        Math.log(cellRatio)
      );
    }
  }
  const predictionQuantile = fraction(
    config.amountPredictionCapQuantile,
    "amount_prediction_cap_quantile"
  );
  const multiplier = positiveFinite(
    config.amountPredictionCapMultiplier,
    "amount_prediction_cap_multiplier"
  );
  return Object.freeze({
    family: "lifecycle_shrunk_log_revenue_ratio",
    globalLogRatio: Math.log(globalRatio),
    byLifecycle: Object.freeze(byLifecycle),
    byLifecycleHorizon: Object.freeze(byLifecycleHorizon),
    fallbackAmount,
    fallbackByLifecycle: Object.freeze(fallbackByLifecycle),
    maximumPrediction: config.baselineAnchoredPredictionCap === false
      ? Number.MAX_VALUE
      : (
        empiricalQuantile(
          samples.map((sample) => sample.actualPositive).sort((a, b) => a - b),
          predictionQuantile
        ) * multiplier
      )
  });
}

function fitAmountScales(samples, amountModel, config) {
  if (amountModel.family === "lifecycle_shrunk_log_revenue_ratio") {
    return Object.freeze({
      global: 1,
      byLifecycle: Object.freeze({})
    });
  }
  const minimum = positiveFinite(
    config.minimumAmountScale,
    "minimum_amount_scale"
  );
  const maximum = positiveFinite(
    config.maximumAmountScale,
    "maximum_amount_scale"
  );
  const strength = nonnegative(
    config.amountLifecyclePriorStrength,
    "amount_lifecycle_prior_strength"
  );
  const ratioFor = (values) => {
    const actual = sum(values.map((sample) => sample.actualPositive));
    const predicted = sum(values.map(
      (sample) => predictAmountModel(
        amountModel,
        sample.x,
        sample.baselinePositive,
        sample.feature.lifecycleState,
        sample.row.horizonMonths
      )
    ));
    return predicted > 0 ? actual / predicted : 1;
  };
  const global = clamp(ratioFor(samples), minimum, maximum);
  const byLifecycle = {};
  for (const state of M2_LIFECYCLE_STATES) {
    const group = samples.filter(
      (sample) => sample.feature.lifecycleState === state
    );
    if (group.length === 0) continue;
    const groupRatio = clamp(ratioFor(group), minimum, maximum);
    byLifecycle[state] = (
      group.length * groupRatio + strength * global
    ) / (group.length + strength);
  }
  return Object.freeze({
    global,
    byLifecycle: Object.freeze(byLifecycle)
  });
}

function fitWeightedRidge(samples, ridge) {
  const width = samples[0].x.length;
  const matrix = zeroMatrix(width, width);
  const vector = Array(width).fill(0);
  for (const sample of samples) {
    const weight = positiveFinite(sample.weight, "sample_weight");
    for (let row = 0; row < width; row += 1) {
      vector[row] += weight * sample.x[row] * sample.y;
      for (let column = 0; column < width; column += 1) {
        matrix[row][column] += (
          weight * sample.x[row] * sample.x[column]
        );
      }
    }
  }
  for (let index = 1; index < width; index += 1) {
    matrix[index][index] += ridge;
  }
  matrix[0][0] += 1e-8;
  return solveLinearSystem(matrix, vector);
}

function predictLogistic(model, x) {
  return clamp(sigmoid(dot(model.coefficients, x)), 1e-9, 1 - 1e-9);
}

function amountLogTarget(sample, config) {
  const target = Math.log1p(sample.actualPositive);
  if (config.amountLogOffset === "frozen_learnedGlobal_positive") {
    return target - Math.log1p(sample.baselinePositive);
  }
  if (config.amountLogOffset === "none") return target;
  throw new Error("m2_lifecycle_aware_amount_log_offset_invalid");
}

function predictAmountModel(
  model,
  x,
  baselinePositive,
  lifecycleState,
  horizonMonths
) {
  if (model.family === "lifecycle_shrunk_log_revenue_ratio") {
    const key = lifecycleHorizonKey(lifecycleState, horizonMonths);
    const logRatio = Number(
      model.byLifecycleHorizon[key]
        ?? model.byLifecycle[lifecycleState]
        ?? model.globalLogRatio
    );
    const base = nonnegative(baselinePositive, "baseline_positive");
    if (base > 0) return base * Math.exp(logRatio);
    return Number(
      model.fallbackByLifecycle[lifecycleState]
        ?? model.fallbackAmount
    );
  }
  const offset = model.logOffset === "frozen_learnedGlobal_positive"
    ? Math.log1p(nonnegative(baselinePositive, "baseline_positive"))
    : 0;
  return Math.max(0, Math.expm1(clamp(
    offset + dot(model.coefficients, x),
    -20,
    30
  )));
}

function scoreField(rows, field) {
  return scoreM2CurrentPointRows(rows.map((row) => ({
    actual: row.actual,
    pointEstimate: finite(row?.[field], field)
  })));
}

function scoreEvaluationSlice(rows) {
  if (rows.length === 0) {
    return Object.freeze({
      caseCount: 0,
      candidate: null,
      rawCandidate: null,
      baseline: null,
      relativeWapeToBaseline: null,
      rawRelativeWapeToBaseline: null,
      occurrence: null,
      conditionalPositiveAmount: null
    });
  }
  const candidate = safePointScore(rows, "pointEstimate");
  const rawCandidate = safePointScore(
    rows,
    "rawLifecyclePointEstimate"
  );
  const baseline = safePointScore(rows, "baselinePointEstimate");
  return Object.freeze({
    caseCount: rows.length,
    candidate,
    rawCandidate,
    baseline,
    relativeWapeToBaseline: (
      candidate?.wape !== null
      && baseline?.wape !== null
      && baseline.wape > 0
    ) ? candidate.wape / baseline.wape - 1 : null,
    rawRelativeWapeToBaseline: (
      rawCandidate?.wape !== null
      && baseline?.wape !== null
      && baseline.wape > 0
    ) ? rawCandidate.wape / baseline.wape - 1 : null,
    occurrence: scoreOccurrence(rows),
    conditionalPositiveAmount: scoreConditionalAmount(rows)
  });
}

function safePointScore(rows, field) {
  let absoluteError = 0;
  let signedError = 0;
  let denominator = 0;
  for (const row of rows) {
    const actual = finite(row.actual, "slice_actual");
    const point = finite(row?.[field], `slice_${field}`);
    absoluteError += Math.abs(point - actual);
    signedError += point - actual;
    denominator += Math.abs(actual);
  }
  return Object.freeze({
    caseCount: rows.length,
    wape: denominator > 0 ? absoluteError / denominator : null,
    signedBias: denominator > 0 ? signedError / denominator : null,
    absoluteError,
    actualDenominator: denominator
  });
}

function scoreOccurrence(rows) {
  let brier = 0;
  let logLoss = 0;
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  let observedPositive = 0;
  for (const row of rows) {
    const actual = Number(Number(row.actualPositive) > 0);
    const probability = clamp(
      finite(row.occurrenceProbability, "occurrence_probability"),
      1e-12,
      1 - 1e-12
    );
    const predicted = Number(probability >= 0.5);
    observedPositive += actual;
    truePositive += Number(actual === 1 && predicted === 1);
    falsePositive += Number(actual === 0 && predicted === 1);
    falseNegative += Number(actual === 1 && predicted === 0);
    brier += (probability - actual) ** 2;
    logLoss -= (
      actual * Math.log(probability)
      + (1 - actual) * Math.log(1 - probability)
    );
  }
  return Object.freeze({
    caseCount: rows.length,
    observedPositiveCaseCount: observedPositive,
    observedRate: observedPositive / rows.length,
    brier: brier / rows.length,
    logLoss: logLoss / rows.length,
    threshold: 0.5,
    precision: truePositive + falsePositive > 0
      ? truePositive / (truePositive + falsePositive)
      : null,
    recall: truePositive + falseNegative > 0
      ? truePositive / (truePositive + falseNegative)
      : null
  });
}

function scoreConditionalAmount(rows) {
  const positive = rows.filter((row) => Number(row.actualPositive) > 0);
  if (positive.length === 0) {
    return Object.freeze({
      caseCount: 0,
      wape: null,
      signedBias: null,
      logMae: null
    });
  }
  let absoluteError = 0;
  let signedError = 0;
  let denominator = 0;
  let logError = 0;
  for (const row of positive) {
    const actual = finite(row.actualPositive, "conditional_actual");
    const point = finite(
      row.conditionalPositiveAmount,
      "conditional_point"
    );
    absoluteError += Math.abs(point - actual);
    signedError += point - actual;
    denominator += actual;
    logError += Math.abs(Math.log1p(point) - Math.log1p(actual));
  }
  return Object.freeze({
    caseCount: positive.length,
    wape: absoluteError / denominator,
    signedBias: signedError / denominator,
    logMae: logError / positive.length
  });
}

function scoreTopRevenue(rows, fractions) {
  const levels = Array.isArray(fractions)
    ? fractions.map((value) => fraction(value, "top_revenue_fraction"))
    : [0.01, 0.05, 0.1];
  const byWork = new Map();
  for (const row of rows) {
    const id = String(row.standardWorkId);
    const value = byWork.get(id) ?? {
      standardWorkId: id,
      actualPositive: 0,
      candidateAbsoluteError: 0,
      baselineAbsoluteError: 0,
      rows: []
    };
    value.actualPositive += Number(row.actualPositive);
    value.candidateAbsoluteError += Math.abs(
      Number(row.pointEstimate) - Number(row.actual)
    );
    value.baselineAbsoluteError += Math.abs(
      Number(row.baselinePointEstimate) - Number(row.actual)
    );
    value.rows.push(row);
    byWork.set(id, value);
  }
  const ranked = [...byWork.values()].sort((left, right) => (
    right.actualPositive - left.actualPositive
    || left.standardWorkId.localeCompare(right.standardWorkId)
  ));
  const totalPositive = sum(ranked.map((value) => value.actualPositive));
  const totalCandidateError = sum(
    ranked.map((value) => value.candidateAbsoluteError)
  );
  const totalBaselineError = sum(
    ranked.map((value) => value.baselineAbsoluteError)
  );
  const cumulative = Object.fromEntries(levels.map((fractionValue) => {
    const count = Math.max(1, Math.ceil(ranked.length * fractionValue));
    const selected = ranked.slice(0, count);
    const selectedRows = selected.flatMap((value) => value.rows);
    const candidate = safePointScore(selectedRows, "pointEstimate");
    const baseline = safePointScore(selectedRows, "baselinePointEstimate");
    return [
      String(fractionValue),
      Object.freeze({
        fraction: fractionValue,
        workCount: count,
        caseCount: selectedRows.length,
        positiveRevenueShare: totalPositive > 0
          ? sum(selected.map((value) => value.actualPositive)) / totalPositive
          : null,
        candidateAbsoluteErrorShare: totalCandidateError > 0
          ? sum(selected.map(
            (value) => value.candidateAbsoluteError
          )) / totalCandidateError
          : null,
        baselineAbsoluteErrorShare: totalBaselineError > 0
          ? sum(selected.map(
            (value) => value.baselineAbsoluteError
          )) / totalBaselineError
          : null,
        candidate,
        baseline,
        relativeWapeToBaseline: (
          candidate.wape !== null
          && baseline.wape !== null
          && baseline.wape > 0
        ) ? candidate.wape / baseline.wape - 1 : null
      })
    ];
  }));
  return Object.freeze({
    rankingBasis: "sum_actual_positive_sales_share_cash_by_work",
    publicDetail: "aggregate_only_no_work_identifier",
    cumulative: Object.freeze(cumulative)
  });
}

function requireMonthlyHistory(row) {
  const history = requireObject(
    row?.salesShareMonthlyHistory,
    "sales_share_monthly_history"
  );
  const positiveSeries = finiteSeries(
    history.positiveSeries,
    "positive_series"
  );
  const reversalSeries = finiteSeries(
    history.reversalSeries,
    "reversal_series"
  );
  if (
    positiveSeries.length === 0
    || positiveSeries.length !== reversalSeries.length
    || positiveSeries.some((value) => value < 0)
    || reversalSeries.some((value) => value < 0)
  ) {
    throw new Error("m2_lifecycle_aware_monthly_history_invalid");
  }
  const startsAt = requireMonth(history.startsAt, "history_starts_at");
  const through = requireMonth(history.through, "history_through");
  if (
    through !== requireMonth(row?.origin, "row_origin")
    || monthOrdinal(through) - monthOrdinal(startsAt) + 1
      !== positiveSeries.length
    || history.observedZeroMonthsIncluded !== true
    || history.unobservedMonthsZeroFilled !== false
  ) {
    throw new Error("m2_lifecycle_aware_history_boundary_invalid");
  }
  return Object.freeze({
    startsAt,
    through,
    positiveSeries,
    reversalSeries
  });
}

function syntheticChannel(positive, reversal) {
  const trailing = positive.slice(-12);
  return Object.freeze({
    channelUid: "synthetic_lifecycle_channel",
    channelRole: "synthetic",
    revenueMode: "synthetic_history_only",
    trailingAnnualPositive: sum(trailing),
    latestMonthPositive: trailing.at(-1) ?? 0,
    recent3AnnualPositive: meanOrZero(trailing.slice(-3)) * 12,
    cumulativePositive: sum(positive),
    cumulativeReversal: sum(reversal),
    cumulativeNet: sum(positive) - sum(reversal),
    monthsSinceLastPositive: monthsSincePositive(positive),
    peerRecent6Positive: 0,
    peerPrevious6Positive: 0,
    peerTrendRatio: 1
  });
}

function solveLinearSystem(matrix, vector) {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let pivot = 0; pivot < size; pivot += 1) {
    let selected = pivot;
    for (let row = pivot + 1; row < size; row += 1) {
      if (
        Math.abs(augmented[row][pivot])
          > Math.abs(augmented[selected][pivot])
      ) {
        selected = row;
      }
    }
    [augmented[pivot], augmented[selected]] = [
      augmented[selected],
      augmented[pivot]
    ];
    if (Math.abs(augmented[pivot][pivot]) < 1e-10) {
      augmented[pivot][pivot] = 1e-10;
    }
    const divisor = augmented[pivot][pivot];
    for (let column = pivot; column <= size; column += 1) {
      augmented[pivot][column] /= divisor;
    }
    for (let row = 0; row < size; row += 1) {
      if (row === pivot) continue;
      const factor = augmented[row][pivot];
      for (let column = pivot; column <= size; column += 1) {
        augmented[row][column] -= factor * augmented[pivot][column];
      }
    }
  }
  return augmented.map((row) => row[size]);
}

function zeroMatrix(rows, columns) {
  return Array.from({ length: rows }, () => Array(columns).fill(0));
}

function compareCaseRows(left, right) {
  return (
    String(left.origin).localeCompare(String(right.origin))
    || Number(left.horizonMonths) - Number(right.horizonMonths)
    || String(left.standardWorkId).localeCompare(String(right.standardWorkId))
  );
}

function lifecycleHorizonKey(state, horizon) {
  return `${String(state)}|${positiveInteger(horizon, "horizon_key")}`;
}

function requireRows(value, name) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`m2_lifecycle_aware_${name}_required`);
  }
  return value;
}

function requireObject(value, name) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`m2_lifecycle_aware_${name}_invalid`);
  }
  return value;
}

function finiteSeries(value, name) {
  if (!Array.isArray(value)) {
    throw new Error(`m2_lifecycle_aware_${name}_invalid`);
  }
  return value.map((item) => finite(item, name));
}

function requireMonth(value, name) {
  if (
    typeof value !== "string"
    || !/^\d{4}-(?:0[1-9]|1[0-2])$/u.test(value)
  ) {
    throw new Error(`m2_lifecycle_aware_${name}_invalid`);
  }
  return value;
}

function monthOrdinal(value) {
  const [year, month] = requireMonth(value, "month_ordinal")
    .split("-").map(Number);
  return year * 12 + month - 1;
}

function addMonths(value, count) {
  const ordinal = monthOrdinal(value) + Number(count);
  const year = Math.floor(ordinal / 12);
  const month = ordinal % 12 + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthsSincePositive(values) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index] > 0) return values.length - 1 - index;
  }
  return values.length;
}

function occurrenceRate(values) {
  return values.length > 0
    ? values.filter((value) => value > 0).length / values.length
    : 0;
}

function linearSlope(values) {
  if (values.length < 2) return 0;
  const center = (values.length - 1) / 2;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < values.length; index += 1) {
    numerator += (index - center) * values[index];
    denominator += (index - center) ** 2;
  }
  return denominator > 0 ? numerator / denominator : 0;
}

function empiricalQuantile(sorted, probability) {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function median(values) {
  if (values.length === 0) return 0;
  return empiricalQuantile([...values].sort((a, b) => a - b), 0.5);
}

function mean(values) {
  return sum(values) / values.length;
}

function meanOrZero(values) {
  return values.length > 0 ? mean(values) : 0;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function dot(left, right) {
  return left.reduce(
    (total, value, index) => total + value * right[index],
    0
  );
}

function sigmoid(value) {
  if (value >= 0) return 1 / (1 + Math.exp(-value));
  const exponential = Math.exp(value);
  return exponential / (1 + exponential);
}

function logit(value) {
  const probability = clamp(Number(value), 1e-9, 1 - 1e-9);
  return Math.log(probability / (1 - probability));
}

function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`m2_lifecycle_aware_${name}_invalid`);
  }
  return number;
}

function nonnegativeInteger(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`m2_lifecycle_aware_${name}_invalid`);
  }
  return number;
}

function positiveFinite(value, name) {
  const number = finite(value, name);
  if (number <= 0) {
    throw new Error(`m2_lifecycle_aware_${name}_invalid`);
  }
  return number;
}

function nonnegative(value, name) {
  const number = finite(value, name);
  if (number < 0) {
    throw new Error(`m2_lifecycle_aware_${name}_invalid`);
  }
  return number;
}

function fraction(value, name) {
  const number = finite(value, name);
  if (number <= 0 || number >= 1) {
    throw new Error(`m2_lifecycle_aware_${name}_invalid`);
  }
  return number;
}

function fractionInclusiveZero(value, name) {
  const number = finite(value, name);
  if (number < 0 || number > 1) {
    throw new Error(`m2_lifecycle_aware_${name}_invalid`);
  }
  return number;
}

function finite(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`m2_lifecycle_aware_${name}_invalid`);
  }
  return number;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
