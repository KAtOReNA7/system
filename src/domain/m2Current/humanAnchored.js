import {
  scoreM2CurrentPointRows,
  scoreM2CurrentProbabilisticRows,
  scoreM2CurrentSlices
} from "./metrics.js";

const DEFAULT_QUANTILES = Object.freeze([0.05, 0.2, 0.5, 0.8, 0.95]);
const EXPERT_IDS = Object.freeze([
  "ordinary_membership",
  "platform_dominant",
  "single_purchase",
  "intermittent_or_dormant"
]);

export function forecastM2HumanAnchoredBase(
  row,
  parameters,
  { faithful = false } = {}
) {
  const horizonMonths = positiveInteger(row?.horizonMonths, "horizon");
  const primaryHorizon = positiveInteger(
    parameters?.horizonMonths,
    "primary_horizon"
  );
  const recentMonths = positiveInteger(
    parameters?.recentMonths,
    "recent_months"
  );
  const channels = requireChannels(row?.canonicalChannels);
  const ranked = channels.map((channel) => {
    const summary = channelSummary(channel, recentMonths);
    return {
      channel,
      ...summary
    };
  }).sort((left, right) => (
    right.trailingAnnual - left.trailingAnnual
    || String(left.channel.channelUid)
      .localeCompare(String(right.channel.channelUid))
  ));
  const mainMaximum = positiveInteger(
    parameters?.mainChannelMaximum,
    "main_channel_maximum"
  );
  const threshold = fractionInclusiveZero(
    parameters?.latestToAverageFloor,
    "latest_to_average_floor"
  );
  const edgeShare = fractionInclusiveZero(
    parameters?.edgeHistoricalShare,
    "edge_historical_share"
  );
  const q = lifecycleContributionShare(
    Number(row?.observedSalesAgeMonths),
    parameters
  );
  const recentBlend = fractionInclusiveZero(
    parameters?.recentLevelBlend ?? 0,
    "recent_level_blend"
  );
  const declineTemperature = positiveFinite(
    parameters?.declineTemperature ?? 0.1,
    "decline_temperature"
  );
  let mainForecast36 = 0;
  let edgeForecast36 = 0;
  let trailingAnnual = 0;
  let cumulativePositive = 0;
  let peerTrendNumerator = 0;
  let peerTrendDenominator = 0;
  const channelComponents = [];
  for (const [index, item] of ranked.entries()) {
    const latest = item.latestMonthPositive;
    const average = item.trailingAnnual / recentMonths;
    const ratio = average > 0 ? latest / average : 0;
    const recent3Annual = item.recent3Annual;
    const latestAnnual = latest * 12;
    const stableWeight = faithful
      ? Number(ratio >= threshold)
      : sigmoid((ratio - threshold) / declineTemperature);
    const decliningLevel = faithful
      ? latestAnnual
      : (
        recentBlend * recent3Annual
        + (1 - recentBlend) * latestAnnual
      );
    const annualLevel = (
      stableWeight * item.trailingAnnual
      + (1 - stableWeight) * decliningLevel
    );
    const isMain = index < mainMaximum;
    const channelCumulative = item.cumulativePositive;
    const forecast36 = isMain
      ? (item.trailingAnnual > 0 ? annualLevel / q : 0)
      : edgeShare * channelCumulative;
    if (isMain) mainForecast36 += forecast36;
    else edgeForecast36 += forecast36;
    trailingAnnual += item.trailingAnnual;
    cumulativePositive += channelCumulative;
    const peerWeight = forecast36 > 0 ? forecast36 : channelCumulative;
    peerTrendNumerator += peerWeight * item.peerTrendRatio;
    peerTrendDenominator += peerWeight;
    channelComponents.push({
      channelUid: String(item.channel.channelUid),
      revenueMode: String(item.channel.revenueMode),
      role: isMain ? "main" : "edge",
      trailingAnnual: item.trailingAnnual,
      latestMonth: latest,
      latestToAverageRatio: ratio,
      stableWeight,
      cumulativePositive: channelCumulative,
      forecast36
    });
  }
  const horizonScale = horizonMonths / primaryHorizon;
  const modeShares = revenueModeShares(ranked);
  const concentration = trailingConcentration(ranked);
  return Object.freeze({
    positivePointEstimate:
      Math.max(0, mainForecast36 + edgeForecast36)
      * horizonScale,
    mainForecast36,
    edgeForecast36,
    horizonScale,
    lifecycleContributionShare: q,
    trailingAnnual,
    cumulativePositive,
    top1TrailingRevenueShare: concentration.top1,
    top2TrailingRevenueShare: concentration.top2,
    singlePurchaseTrailingShare:
      modeShares.single_purchase_or_on_demand ?? 0,
    membershipLikeTrailingShare: (
      (modeShares.membership_subscription ?? 0)
      + (modeShares.advertising_or_free_share ?? 0)
    ),
    peerTrendRatio: peerTrendDenominator > 0
      ? peerTrendNumerator / peerTrendDenominator
      : 1,
    channelComponents
  });
}

export function learnM2HumanAnchoredParameters(rows, config) {
  const learning = requireObject(config?.learning, "learning");
  const prior = normalizeParameters(config?.humanPrior);
  const grids = requireObject(learning.parameterGrids, "parameter_grids");
  const positiveRows = rows.filter(
    (row) => finite(row?.actualPositive, "actual_positive") > 0
  );
  if (positiveRows.length === 0) {
    throw new Error("m2_human_anchored_positive_training_rows_required");
  }
  let selected = { ...prior };
  let selectedScore = parameterObjective(
    positiveRows,
    selected,
    prior,
    grids,
    learning
  );
  const path = [];
  const names = [
    "latestToAverageFloor",
    "edgeHistoricalShare",
    "lifecycleYear3Share",
    "lifecycleYear5Share",
    "mainChannelMaximum",
    "recentLevelBlend"
  ];
  const passes = positiveInteger(
    learning.coordinatePasses,
    "coordinate_passes"
  );
  for (let pass = 0; pass < passes; pass += 1) {
    for (const name of names) {
      const values = Array.isArray(grids[name])
        ? grids[name].map(Number)
        : [];
      if (values.length === 0 || values.some((value) => !Number.isFinite(value))) {
        throw new Error(`m2_human_anchored_parameter_grid_${name}_invalid`);
      }
      const candidates = values.map((value) => {
        const parameters = constrainedParameters({
          ...selected,
          [name]: value
        });
        return {
          value: parameters[name],
          parameters,
          score: parameterObjective(
            positiveRows,
            parameters,
            prior,
            grids,
            learning
          )
        };
      }).sort(compareObjective);
      const winner = candidates[0];
      selected = winner.parameters;
      selectedScore = winner.score;
      path.push({
        pass: pass + 1,
        parameter: name,
        selectedValue: winner.value,
        objective: winner.score.objective
      });
    }
  }
  return Object.freeze({
    parameters: Object.freeze(selected),
    objective: Object.freeze(selectedScore),
    trainingPositiveRowCount: positiveRows.length,
    path: Object.freeze(path)
  });
}

export function fitM2HumanAnchoredModel(rows, config) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("m2_human_anchored_training_rows_required");
  }
  const parameterFit = learnM2HumanAnchoredParameters(rows, config);
  const parameters = parameterFit.parameters;
  const prepared = rows.map((row) => {
    const base = forecastM2HumanAnchoredBase(row, parameters);
    const weights = expertWeights(row, base, parameters);
    return {
      row,
      base,
      weights,
      expertPoints: expertConditionalPoints(
        row,
        base,
        parameters
      )
    };
  });
  const positivePrepared = prepared.filter(
    ({ row }) => Number(row.actualPositive) > 0
  );
  const split = internalWorkSelectionSplit(prepared);
  const splitPositiveFit = split.fit.filter(
    ({ row }) => Number(row.actualPositive) > 0
  );
  const splitPositiveValidation = split.validation.filter(
    ({ row }) => Number(row.actualPositive) > 0
  );
  const selectionMultipliers = fitExpertMultipliers(
    splitPositiveFit,
    Number(config.learning.hierarchicalPriorStrength)
  );
  const hierarchyAccepted = nestedPositiveLayerAccepted(
    splitPositiveValidation,
    selectionMultipliers
  );
  const expertMultipliers = fitExpertMultipliers(
    positivePrepared,
    Number(config.learning.hierarchicalPriorStrength)
  );
  const selectionOccurrence = fitOccurrence(
    split.fit,
    Number(config.learning.occurrencePriorStrength)
  );
  const selectionReversal = fitReversal(
    split.fit,
    Number(config.learning.reversalPriorStrength),
    Number(config.learning.reversalRateMaximum)
  );
  const occurrence = fitOccurrence(
    prepared,
    Number(config.learning.occurrencePriorStrength)
  );
  const reversal = fitReversal(
    prepared,
    Number(config.learning.reversalPriorStrength),
    Number(config.learning.reversalRateMaximum)
  );
  const selectionHierarchyRows = split.validation.map((item) => {
    const hierarchyPoint = selectedHierarchyPoint(
      item,
      selectionMultipliers,
      hierarchyAccepted
    );
    return {
      ...item.row,
      pointEstimate: hierarchyPoint
    };
  });
  const selectionOccurrenceRows = split.validation.map((item) => {
    const hierarchyPoint = selectedHierarchyPoint(
      item,
      selectionMultipliers,
      hierarchyAccepted
    );
    const probability = occurrenceProbability(
      item.row,
      selectionOccurrence
    );
    const reversalRate = reversalRateFor(item.row, selectionReversal);
    return {
      ...item.row,
      pointEstimate: hierarchyPoint * probability * (1 - reversalRate)
    };
  });
  const occurrenceAccepted = nestedNetLayerAccepted(
    selectionHierarchyRows,
    selectionOccurrenceRows
  );
  const hierarchyTrainingRows = prepared.map((item) => ({
    ...item.row,
    pointEstimate: selectedHierarchyPoint(
      item,
      expertMultipliers,
      hierarchyAccepted
    )
  }));
  const occurrenceTrainingRows = prepared.map((item) => {
    const hierarchyPoint = selectedHierarchyPoint(
      item,
      expertMultipliers,
      hierarchyAccepted
    );
    return {
      ...item.row,
      pointEstimate: (
        hierarchyPoint
        * occurrenceProbability(item.row, occurrence)
        * (1 - reversalRateFor(item.row, reversal))
      )
    };
  });
  const residualRows = occurrenceAccepted
    ? occurrenceTrainingRows
    : hierarchyTrainingRows;
  const residuals = buildResidualPools(residualRows);
  return Object.freeze({
    schema: "m2.current.human_anchored_model_state.v0.1",
    parameters,
    parameterFit,
    expertMultipliers: Object.freeze(expertMultipliers),
    hierarchyAccepted,
    occurrence,
    reversal,
    occurrenceReversalAccepted: occurrenceAccepted,
    residuals,
    trainingRowCount: rows.length,
    trainingWorkCount: new Set(
      rows.map((row) => String(row.standardWorkId))
    ).size,
    maximumLabelAvailableAsOf:
      rows.map((row) => String(row.labelAvailableAsOf)).sort().at(-1)
  });
}

export function predictM2HumanAnchored(row, state, config) {
  const manualParameters = normalizeParameters(config?.humanPrior);
  const manual = forecastM2HumanAnchoredBase(
    row,
    manualParameters,
    { faithful: true }
  );
  const learned = forecastM2HumanAnchoredBase(row, state.parameters);
  const weights = expertWeights(row, learned, state.parameters);
  const expertPoints = expertConditionalPoints(
    row,
    learned,
    state.parameters
  );
  const hierarchyPoint = state.hierarchyAccepted
    ? weightedExpertPoint(
      weights,
      expertPoints,
      state.expertMultipliers
    )
    : learned.positivePointEstimate;
  const probability = occurrenceProbability(row, state.occurrence);
  const reversalRate = reversalRateFor(row, state.reversal);
  const occurrencePoint = hierarchyPoint * probability * (1 - reversalRate);
  const pointEstimate = state.occurrenceReversalAccepted
    ? occurrencePoint
    : hierarchyPoint;
  const quantiles = calibratedQuantiles(
    pointEstimate,
    row,
    state.residuals,
    config.learning.quantileProbabilities ?? DEFAULT_QUANTILES
  );
  return Object.freeze({
    manualPointEstimate: manual.positivePointEstimate,
    learnedGlobalPointEstimate: learned.positivePointEstimate,
    hierarchicalPointEstimate: hierarchyPoint,
    occurrenceReversalPointEstimate: occurrencePoint,
    pointEstimate,
    positivePointEstimate: hierarchyPoint * probability,
    reversalPointEstimate: hierarchyPoint * probability * reversalRate,
    occurrenceProbability: probability,
    reversalRate,
    expertWeights: weights,
    quantiles,
    selectedPointLayer: state.occurrenceReversalAccepted
      ? "occurrence_and_reversal"
      : "hierarchical_positive_fallback",
    learnedBase: learned
  });
}

export function crossFitM2HumanAnchored(rows, config) {
  const foldCount = positiveInteger(
    config?.learning?.crossWorkFoldCount,
    "cross_work_fold_count"
  );
  const folds = [];
  const output = [];
  for (let fold = 0; fold < foldCount; fold += 1) {
    const training = rows.filter(
      (row) => deterministicWorkFold(row.standardWorkId, foldCount) !== fold
    );
    const validation = rows.filter(
      (row) => deterministicWorkFold(row.standardWorkId, foldCount) === fold
    );
    if (training.length === 0 || validation.length === 0) {
      throw new Error("m2_human_anchored_cross_work_fold_empty");
    }
    const state = fitM2HumanAnchoredModel(training, config);
    for (const row of validation) {
      output.push({
        ...row,
        ...predictM2HumanAnchored(row, state, config),
        evaluationFold: fold,
        trainingReadOwnWork: false
      });
    }
    folds.push({
      fold,
      trainingRowCount: training.length,
      trainingWorkCount: state.trainingWorkCount,
      validationRowCount: validation.length,
      validationWorkCount: new Set(
        validation.map((row) => String(row.standardWorkId))
      ).size,
      parameters: state.parameters,
      hierarchyAccepted: state.hierarchyAccepted,
      occurrenceReversalAccepted: state.occurrenceReversalAccepted
    });
  }
  output.sort(compareCaseRows);
  const selected = selectCrossFitLayers(output, config);
  return Object.freeze({
    schema: "m2.current.human_anchored_cross_work.v0.1",
    rows: Object.freeze(selected.rows),
    folds: Object.freeze(folds),
    developmentLayerSelection: selected.selection,
    metrics: scoreM2HumanAnchoredLayers(selected.rows, config)
  });
}

export function strictRollingM2HumanAnchored(rows, config) {
  const start = requireMonth(
    config?.dataContract?.strictAuxiliaryEvaluationStartsAt,
    "strict_auxiliary_start"
  );
  const origins = [...new Set(
    rows.map((row) => requireMonth(row.origin, "origin"))
  )].sort().filter((origin) => origin >= start);
  const output = [];
  const selections = [];
  for (const outerOrigin of origins) {
    const training = rows.filter((row) => (
      row.origin < outerOrigin
      && row.labelAvailableAsOf <= outerOrigin
    ));
    const validation = rows.filter((row) => row.origin === outerOrigin);
    if (
      training.length
      < Number(config.learning.minimumStrictAsOfTrainingRows)
    ) {
      selections.push({
        outerOrigin,
        status: "insufficient_mature_earlier_rows",
        trainingRowCount: training.length,
        validationRowCount: validation.length
      });
      continue;
    }
    const state = fitM2HumanAnchoredModel(training, config);
    for (const row of validation) {
      output.push({
        ...row,
        ...predictM2HumanAnchored(row, state, config),
        outerOrigin,
        sameOrLaterOuterTruthRead: false,
        maximumTrainingLabelAvailableAsOf: state.maximumLabelAvailableAsOf
      });
    }
    selections.push({
      outerOrigin,
      status: "evaluated",
      trainingRowCount: training.length,
      trainingWorkCount: state.trainingWorkCount,
      validationRowCount: validation.length,
      maximumTrainingLabelAvailableAsOf: state.maximumLabelAvailableAsOf,
      parameters: state.parameters,
      hierarchyAccepted: state.hierarchyAccepted,
      occurrenceReversalAccepted: state.occurrenceReversalAccepted,
      sameOrLaterOuterTruthRead: false
    });
  }
  if (output.length === 0) {
    throw new Error("m2_human_anchored_strict_rolling_output_empty");
  }
  output.sort(compareCaseRows);
  return Object.freeze({
    schema: "m2.current.human_anchored_strict_rolling.v0.1",
    rows: Object.freeze(output),
    selections: Object.freeze(selections),
    metrics: scoreM2HumanAnchoredLayers(output, config)
  });
}

export function scoreM2HumanAnchoredLayers(rows, config) {
  const levels = config?.learning?.quantileProbabilities ?? DEFAULT_QUANTILES;
  const pointFields = {
    manualFaithful: "manualPointEstimate",
    learnedGlobal: "learnedGlobalPointEstimate",
    hierarchicalPositive: "hierarchicalPointEstimate",
    occurrenceAndReversal: "pointEstimate"
  };
  const point = Object.fromEntries(Object.entries(pointFields).map(
    ([id, field]) => [
      id,
      scoreM2CurrentPointRows(rows.map((row) => ({
        actual: row.actual,
        pointEstimate: row[field]
      })))
    ]
  ));
  const layerOrder = Object.keys(pointFields);
  const fva = layerOrder.slice(1).map((id, index) => {
    const previous = layerOrder[index];
    return {
      from: previous,
      to: id,
      absoluteWapeChange: point[id].wape - point[previous].wape,
      relativeWapeChange: point[id].wape / point[previous].wape - 1,
      valueAdded: point[previous].wape - point[id].wape
    };
  });
  const probabilistic = scoreM2CurrentProbabilisticRows(rows, levels);
  return Object.freeze({
    point,
    fva,
    probabilistic,
    byOrigin: scoreM2CurrentSlices(rows, "origin"),
    byHorizon: scoreM2CurrentSlices(rows, "horizonMonths"),
    bySegment: scoreM2CurrentSlices(rows, "segment"),
    byRevenueMode: scoreM2CurrentSlices(rows, "dominantRevenueMode"),
    bySecondLevelCategory: scoreM2CurrentSlices(
      rows,
      "secondLevelCategoryReportingOnly"
    )
  });
}

export function workClusterBootstrap(
  rows,
  {
    iterations,
    seed,
    candidateField = "pointEstimate",
    comparatorField = "manualPointEstimate"
  }
) {
  const count = positiveInteger(iterations, "bootstrap_iterations");
  const workIds = [...new Set(
    rows.map((row) => String(row.standardWorkId))
  )].sort();
  if (workIds.length < 2) {
    throw new Error("m2_human_anchored_bootstrap_work_count_insufficient");
  }
  const byWork = new Map(workIds.map((id) => [id, []]));
  for (const row of rows) byWork.get(String(row.standardWorkId)).push(row);
  const random = mulberry32(positiveInteger(seed, "bootstrap_seed"));
  const candidateWapes = [];
  const candidateBiases = [];
  const relativeToManual = [];
  for (let iteration = 0; iteration < count; iteration += 1) {
    const sampled = [];
    for (let draw = 0; draw < workIds.length; draw += 1) {
      const selected = workIds[Math.floor(random() * workIds.length)];
      sampled.push(...byWork.get(selected));
    }
    const candidate = scoreM2CurrentPointRows(sampled.map((row) => ({
      actual: row.actual,
      pointEstimate: row[candidateField]
    })));
    const comparator = scoreM2CurrentPointRows(sampled.map((row) => ({
      actual: row.actual,
      pointEstimate: row[comparatorField]
    })));
    candidateWapes.push(candidate.wape);
    candidateBiases.push(candidate.signedBias);
    relativeToManual.push(candidate.wape / comparator.wape - 1);
  }
  return Object.freeze({
    schema: "m2.current.work_cluster_bootstrap.v0.1",
    method: "resample_independent_works_with_all_repeated_cases",
    iterations: count,
    seed,
    independentWorkCount: workIds.length,
    wape95: interval(candidateWapes),
    bias95: interval(candidateBiases),
    relativeWapeToManual95: interval(relativeToManual)
  });
}

export function deterministicWorkFold(workId, foldCount) {
  const value = String(workId);
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % positiveInteger(foldCount, "fold_count");
}

function normalizeParameters(value) {
  const prior = requireObject(value, "human_prior");
  return constrainedParameters({
    horizonMonths: positiveInteger(prior.horizonMonths, "horizon"),
    recentMonths: positiveInteger(prior.recentMonths, "recent_months"),
    mainChannelMaximum: positiveInteger(
      prior.mainChannelMaximum,
      "main_channel_maximum"
    ),
    latestToAverageFloor: fractionInclusiveZero(
      prior.latestToAverageFloor,
      "latest_to_average_floor"
    ),
    edgeHistoricalShare: fractionInclusiveZero(
      prior.edgeHistoricalShare,
      "edge_historical_share"
    ),
    lifecycleYear3Share: fraction(
      prior.lifecycleYear3Share,
      "lifecycle_year3_share"
    ),
    lifecycleYear5Share: fraction(
      prior.lifecycleYear5Share,
      "lifecycle_year5_share"
    ),
    recentLevelBlend: fractionInclusiveZero(
      prior.recentLevelBlend,
      "recent_level_blend"
    ),
    declineTemperature: positiveFinite(
      prior.declineTemperature,
      "decline_temperature"
    ),
    mainBoundaryTemperature: positiveFinite(
      prior.mainBoundaryTemperature,
      "main_boundary_temperature"
    ),
    dominantTopTwoBoundary: fractionInclusiveZero(
      prior.dominantTopTwoBoundary,
      "dominant_top_two_boundary"
    ),
    platformTrendWeight: fractionInclusiveZero(
      prior.platformTrendWeight,
      "platform_trend_weight"
    ),
    dormantHistoricalShare: fractionInclusiveZero(
      prior.dormantHistoricalShare,
      "dormant_historical_share"
    ),
    dormantAnnualDecay: nonnegativeFinite(
      prior.dormantAnnualDecay,
      "dormant_annual_decay"
    )
  });
}

function constrainedParameters(parameters) {
  const result = { ...parameters };
  if (result.lifecycleYear5Share > result.lifecycleYear3Share) {
    result.lifecycleYear5Share = result.lifecycleYear3Share;
  }
  return result;
}

function parameterObjective(rows, parameters, prior, grids, learning) {
  let absoluteError = 0;
  let signedError = 0;
  let denominator = 0;
  for (const row of rows) {
    const actual = finite(row.actualPositive, "actual_positive");
    const base = forecastM2HumanAnchoredBase(
      row,
      parameters
    );
    const point = base.positivePointEstimate;
    absoluteError += Math.abs(point - actual);
    signedError += point - actual;
    denominator += actual;
  }
  if (denominator <= 0) {
    throw new Error("m2_human_anchored_parameter_denominator_zero");
  }
  const wape = absoluteError / denominator;
  const signedBias = signedError / denominator;
  const priorDistance = Object.keys(grids).reduce((total, name) => {
    const values = grids[name].map(Number);
    const range = Math.max(...values) - Math.min(...values);
    if (!(range > 0)) return total;
    return total + ((parameters[name] - prior[name]) / range) ** 2;
  }, 0);
  return {
    objective: (
      wape
      + Number(learning.biasPenalty) * Math.abs(signedBias)
      + Number(learning.priorPenalty) * priorDistance
    ),
    wape,
    signedBias,
    priorDistance
  };
}

function fitExpertMultipliers(prepared, priorStrength) {
  const meanBase = mean(prepared.map(
    (item) => rawExpertPoint(
      item.row,
      item.base,
      null,
      item.weights,
      item.expertPoints
    )
  ));
  const strength = nonnegativeFinite(priorStrength, "hierarchical_prior");
  return Object.fromEntries(EXPERT_IDS.map((id) => {
    let numerator = strength * meanBase;
    let denominator = strength * meanBase;
    for (const item of prepared) {
      const weight = item.weights[id];
      numerator += weight * Number(item.row.actualPositive);
      denominator += weight * item.expertPoints[id];
    }
    const ratio = denominator > 0 ? numerator / denominator : 1;
    return [id, clamp(ratio, 0.25, 4)];
  }));
}

function fitOccurrence(prepared, priorStrength) {
  const strength = nonnegativeFinite(priorStrength, "occurrence_prior");
  const global = mean(prepared.map(
    ({ row }) => Number(Number(row.actualPositive) > 0)
  ));
  const groups = new Map();
  for (const { row } of prepared) {
    const key = occurrenceKey(row);
    const value = groups.get(key) ?? { count: 0, positive: 0 };
    value.count += 1;
    value.positive += Number(Number(row.actualPositive) > 0);
    groups.set(key, value);
  }
  return Object.freeze({
    global,
    bySegmentHorizon: Object.freeze(Object.fromEntries(
      [...groups].map(([key, value]) => [
        key,
        (value.positive + strength * global) / (value.count + strength)
      ])
    ))
  });
}

function fitReversal(prepared, priorStrength, maximumRate) {
  const strength = nonnegativeFinite(priorStrength, "reversal_prior");
  const maximum = positiveFinite(maximumRate, "reversal_rate_maximum");
  const totalPositive = sum(prepared.map(
    ({ row }) => Number(row.actualPositive)
  ));
  const totalReversal = sum(prepared.map(
    ({ row }) => Number(row.actualReversal)
  ));
  const global = totalPositive > 0 ? totalReversal / totalPositive : 0;
  const meanPositive = mean(prepared.map(
    ({ row }) => Number(row.actualPositive)
  ));
  const groups = new Map();
  for (const { row } of prepared) {
    const key = occurrenceKey(row);
    const value = groups.get(key) ?? { positive: 0, reversal: 0, count: 0 };
    value.positive += Number(row.actualPositive);
    value.reversal += Number(row.actualReversal);
    value.count += 1;
    groups.set(key, value);
  }
  return Object.freeze({
    global,
    bySegmentHorizon: Object.freeze(Object.fromEntries(
      [...groups].map(([key, value]) => {
        const pseudoPositive = strength * meanPositive;
        return [
          key,
          clamp(
            (value.reversal + pseudoPositive * global)
              / Math.max(Number.EPSILON, value.positive + pseudoPositive),
            0,
            maximum
          )
        ];
      })
    ))
  });
}

function nestedPositiveLayerAccepted(prepared, multipliers) {
  if (prepared.length === 0) return false;
  const baseRows = prepared.map((item) => ({
    actual: item.row.actualPositive,
    pointEstimate: item.base.positivePointEstimate
  }));
  const hierarchyRows = prepared.map((item) => ({
    actual: item.row.actualPositive,
    pointEstimate: hierarchicalPoint(item, multipliers)
  }));
  return (
    scoreM2CurrentPointRows(hierarchyRows).wape
    <= scoreM2CurrentPointRows(baseRows).wape
  );
}

function nestedNetLayerAccepted(hierarchyRows, occurrenceRows) {
  return (
    scoreM2CurrentPointRows(occurrenceRows).wape
    <= scoreM2CurrentPointRows(hierarchyRows).wape
  );
}

function hierarchicalPoint(item, multipliers) {
  return weightedExpertPoint(
    item.weights,
    item.expertPoints,
    multipliers
  );
}

function selectedHierarchyPoint(item, multipliers, accepted) {
  return accepted
    ? hierarchicalPoint(item, multipliers)
    : item.base.positivePointEstimate;
}

function weightedExpertPoint(weights, points, multipliers) {
  return EXPERT_IDS.reduce(
    (total, id) => (
      total
      + weights[id] * Number(points[id]) * Number(multipliers[id])
    ),
    0
  );
}

function expertWeights(row, base, parameters) {
  const intermittent = (
    row.segment === "intermittent" || row.segment === "dormant"
  ) ? 1 : 0;
  const singlePurchase = clamp(base.singlePurchaseTrailingShare, 0, 1);
  const dominant = sigmoid(
    (
      base.top2TrailingRevenueShare
      - parameters.dominantTopTwoBoundary
    ) / parameters.mainBoundaryTemperature
  );
  const raw = {
    intermittent_or_dormant: 1.5 * intermittent,
    single_purchase: 1.25 * singlePurchase,
    platform_dominant: dominant,
    ordinary_membership: Math.max(
      0.05,
      base.membershipLikeTrailingShare * (1 - dominant) * (1 - intermittent)
    )
  };
  const total = sum(Object.values(raw));
  return Object.freeze(Object.fromEntries(
    EXPERT_IDS.map((id) => [id, raw[id] / total])
  ));
}

function expertConditionalPoints(row, base, parameters) {
  const trendFactor = Math.exp(
    Number(parameters.platformTrendWeight)
    * Math.log(clamp(base.peerTrendRatio, 0.5, 2))
  );
  const monthsSinceLastPositive = Math.max(
    0,
    Number(row?.monthsSinceLastPositive) || 0
  );
  const dormantPoint = (
    base.cumulativePositive
    * Number(parameters.dormantHistoricalShare)
    * Math.exp(
      -Number(parameters.dormantAnnualDecay)
      * monthsSinceLastPositive / 12
    )
    * base.horizonScale
  );
  return Object.freeze({
    ordinary_membership: base.positivePointEstimate,
    platform_dominant: base.positivePointEstimate * trendFactor,
    single_purchase: Math.max(
      base.positivePointEstimate * trendFactor,
      dormantPoint
    ),
    intermittent_or_dormant: Math.max(
      base.positivePointEstimate,
      dormantPoint
    )
  });
}

function rawExpertPoint(
  row,
  base,
  parameters,
  suppliedWeights = null,
  suppliedPoints = null
) {
  const weights = suppliedWeights ?? expertWeights(row, base, parameters);
  const points = suppliedPoints
    ?? expertConditionalPoints(row, base, parameters);
  return EXPERT_IDS.reduce(
    (total, id) => total + weights[id] * points[id],
    0
  );
}

function selectCrossFitLayers(rows, config) {
  const learned = scoreM2CurrentPointRows(rows.map((row) => ({
    actual: row.actual,
    pointEstimate: row.learnedGlobalPointEstimate
  })));
  const hierarchyRaw = scoreM2CurrentPointRows(rows.map((row) => ({
    actual: row.actual,
    pointEstimate: row.hierarchicalPointEstimate
  })));
  const hierarchyAccepted = (
    hierarchyRaw.wape <= learned.wape
    && Math.abs(hierarchyRaw.signedBias)
      <= Math.max(0.1, Math.abs(learned.signedBias))
  );
  const hierarchyRows = rows.map((row) => {
    const selectedHierarchy = hierarchyAccepted
      ? row.hierarchicalPointEstimate
      : row.learnedGlobalPointEstimate;
    return {
      ...row,
      rawHierarchicalPointEstimate: row.hierarchicalPointEstimate,
      hierarchicalPointEstimate: selectedHierarchy,
      rawOccurrenceReversalPointEstimate:
        row.occurrenceReversalPointEstimate,
      occurrenceReversalPointEstimate: (
        selectedHierarchy
        * row.occurrenceProbability
        * (1 - row.reversalRate)
      )
    };
  });
  const hierarchy = scoreM2CurrentPointRows(hierarchyRows.map((row) => ({
    actual: row.actual,
    pointEstimate: row.hierarchicalPointEstimate
  })));
  const occurrenceRaw = scoreM2CurrentPointRows(hierarchyRows.map((row) => ({
    actual: row.actual,
    pointEstimate: row.occurrenceReversalPointEstimate
  })));
  const occurrenceAccepted = (
    occurrenceRaw.wape <= hierarchy.wape
    && Math.abs(occurrenceRaw.signedBias)
      <= Math.max(0.1, Math.abs(hierarchy.signedBias))
  );
  const selectedRows = hierarchyRows.map((row) => ({
    ...row,
    pointEstimate: occurrenceAccepted
      ? row.occurrenceReversalPointEstimate
      : row.hierarchicalPointEstimate,
    selectedPointLayer: occurrenceAccepted
      ? "occurrence_and_reversal"
      : hierarchyAccepted
        ? "hierarchical_positive"
        : "learned_global_fallback"
  }));
  attachCrossFoldQuantiles(
    selectedRows,
    config.learning.quantileProbabilities
  );
  return {
    rows: selectedRows,
    selection: Object.freeze({
      scope: "development_cross_work_only_requires_later_origin_validation",
      hierarchyAccepted,
      occurrenceReversalAccepted: occurrenceAccepted,
      learnedGlobalMetrics: learned,
      rawHierarchyMetrics: hierarchyRaw,
      selectedHierarchyMetrics: hierarchy,
      rawOccurrenceReversalMetrics: occurrenceRaw
    })
  };
}

function attachCrossFoldQuantiles(rows, probabilities) {
  const levels = probabilities.map(Number).sort((a, b) => a - b);
  const folds = [...new Set(rows.map((row) => row.evaluationFold))];
  const poolsByFold = new Map(folds.map((fold) => {
    const calibration = rows.filter(
      (candidate) => candidate.evaluationFold !== fold
    );
    const bySegmentHorizon = new Map();
    const byHorizon = new Map();
    const global = [];
    for (const candidate of calibration) {
      const residual = candidate.actual - candidate.pointEstimate;
      global.push(residual);
      const segmentKey = occurrenceKey(candidate);
      const segmentValues = bySegmentHorizon.get(segmentKey) ?? [];
      segmentValues.push(residual);
      bySegmentHorizon.set(segmentKey, segmentValues);
      const horizonKey = String(candidate.horizonMonths);
      const horizonValues = byHorizon.get(horizonKey) ?? [];
      horizonValues.push(residual);
      byHorizon.set(horizonKey, horizonValues);
    }
    global.sort((left, right) => left - right);
    for (const values of bySegmentHorizon.values()) {
      values.sort((left, right) => left - right);
    }
    for (const values of byHorizon.values()) {
      values.sort((left, right) => left - right);
    }
    return [fold, { bySegmentHorizon, byHorizon, global }];
  }));
  for (const row of rows) {
    const pools = poolsByFold.get(row.evaluationFold);
    const segmentHorizon = pools.bySegmentHorizon.get(
      occurrenceKey(row)
    ) ?? [];
    const horizon = pools.byHorizon.get(String(row.horizonMonths)) ?? [];
    const residuals = segmentHorizon.length >= 30
      ? segmentHorizon
      : horizon.length >= 30
        ? horizon
        : pools.global;
    let previous = -Infinity;
    row.quantiles = Object.fromEntries(levels.map((level) => {
      const value = Math.max(
        previous,
        row.pointEstimate + empiricalQuantile(residuals, level)
      );
      previous = value;
      return [String(level), value];
    }));
    row.quantileCalibrationExcludedOwnFold = true;
    row.quantileCalibrationFoldCount = folds.length - 1;
  }
}

function internalWorkSelectionSplit(prepared) {
  const workCount = new Set(
    prepared.map(({ row }) => String(row.standardWorkId))
  ).size;
  if (workCount < 10) {
    const midpoint = Math.max(1, Math.floor(prepared.length * 0.8));
    return {
      fit: prepared.slice(0, midpoint),
      validation: prepared.slice(midpoint)
    };
  }
  const validation = prepared.filter(
    ({ row }) => deterministicWorkFold(
      `inner:${row.standardWorkId}`,
      5
    ) === 0
  );
  const fit = prepared.filter(
    ({ row }) => deterministicWorkFold(
      `inner:${row.standardWorkId}`,
      5
    ) !== 0
  );
  if (fit.length === 0 || validation.length === 0) {
    throw new Error("m2_human_anchored_internal_selection_split_empty");
  }
  return { fit, validation };
}

function occurrenceProbability(row, occurrence) {
  return Number(
    occurrence.bySegmentHorizon[occurrenceKey(row)] ?? occurrence.global
  );
}

function reversalRateFor(row, reversal) {
  return Number(
    reversal.bySegmentHorizon[occurrenceKey(row)] ?? reversal.global
  );
}

function occurrenceKey(row) {
  return `${String(row.segment)}|${Number(row.horizonMonths)}`;
}

function buildResidualPools(rows) {
  const global = [];
  const horizon = {};
  const segmentHorizon = {};
  for (const row of rows) {
    const residual = Number(row.actual) - Number(row.pointEstimate);
    global.push(residual);
    const horizonKey = String(row.horizonMonths);
    const segmentKey = occurrenceKey(row);
    (horizon[horizonKey] ??= []).push(residual);
    (segmentHorizon[segmentKey] ??= []).push(residual);
  }
  global.sort((a, b) => a - b);
  for (const values of Object.values(horizon)) values.sort((a, b) => a - b);
  for (const values of Object.values(segmentHorizon)) {
    values.sort((a, b) => a - b);
  }
  return Object.freeze({
    global: Object.freeze(global),
    horizon: Object.freeze(horizon),
    segmentHorizon: Object.freeze(segmentHorizon)
  });
}

function calibratedQuantiles(point, row, pools, probabilities) {
  const levels = probabilities.map(Number).sort((a, b) => a - b);
  const candidates = [
    pools.segmentHorizon[occurrenceKey(row)] ?? [],
    pools.horizon[String(row.horizonMonths)] ?? [],
    pools.global
  ];
  const residuals = candidates.find((values) => values.length >= 30)
    ?? pools.global;
  let previous = -Infinity;
  return Object.fromEntries(levels.map((level) => {
    const raw = point + empiricalQuantile(residuals, level);
    const value = Math.max(previous, raw);
    previous = value;
    return [String(level), value];
  }));
}

function lifecycleContributionShare(ageMonths, parameters) {
  const age = Number.isFinite(ageMonths) && ageMonths > 0 ? ageMonths : 36;
  const q36 = fraction(
    parameters.lifecycleYear3Share,
    "lifecycle_year3_share"
  );
  const q60 = fraction(
    parameters.lifecycleYear5Share,
    "lifecycle_year5_share"
  );
  if (q60 > q36) {
    throw new Error("m2_human_anchored_lifecycle_order_invalid");
  }
  if (age <= 36) return q36;
  if (age >= 60) return q60;
  return q36 + (age - 36) / 24 * (q60 - q36);
}

function revenueModeShares(ranked) {
  const amounts = {};
  let total = 0;
  for (const item of ranked) {
    const mode = String(item.channel.revenueMode);
    amounts[mode] = (amounts[mode] ?? 0) + item.trailingAnnual;
    total += item.trailingAnnual;
  }
  return Object.fromEntries(Object.entries(amounts).map(
    ([mode, amount]) => [mode, total > 0 ? amount / total : 0]
  ));
}

function trailingConcentration(ranked) {
  const values = ranked.map((item) => Math.max(0, item.trailingAnnual));
  const total = sum(values);
  return {
    top1: total > 0 ? sum(values.slice(0, 1)) / total : 0,
    top2: total > 0 ? sum(values.slice(0, 2)) / total : 0
  };
}

function compareObjective(left, right) {
  return (
    left.score.objective - right.score.objective
    || Math.abs(left.score.signedBias) - Math.abs(right.score.signedBias)
    || left.value - right.value
  );
}

function compareCaseRows(left, right) {
  return (
    String(left.origin).localeCompare(String(right.origin))
    || Number(left.horizonMonths) - Number(right.horizonMonths)
    || String(left.standardWorkId).localeCompare(String(right.standardWorkId))
  );
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

function interval(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return Object.freeze({
    lower: empiricalQuantile(sorted, 0.025),
    median: empiricalQuantile(sorted, 0.5),
    upper: empiricalQuantile(sorted, 0.975)
  });
}

function requireChannels(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("m2_human_anchored_channels_required");
  }
  return value;
}

function finiteSeries(value) {
  if (!Array.isArray(value)) {
    throw new Error("m2_human_anchored_series_required");
  }
  return value.map((item) => finite(item, "series_value"));
}

function channelSummary(channel, recentMonths) {
  if (Array.isArray(channel?.positiveSeries)) {
    const positive = finiteSeries(channel.positiveSeries);
    const trailing = positive.slice(-recentMonths);
    return {
      positive,
      trailing,
      trailingAnnual: sum(trailing),
      latestMonthPositive: trailing.at(-1) ?? 0,
      recent3Annual: mean(trailing.slice(-3)) * 12,
      cumulativePositive: sum(positive),
      peerTrendRatio: 1
    };
  }
  const trailingAnnual = nonnegativeFinite(
    channel?.trailingAnnualPositive,
    "channel_trailing_annual_positive"
  );
  const latestMonthPositive = nonnegativeFinite(
    channel?.latestMonthPositive,
    "channel_latest_month_positive"
  );
  const recent3Annual = nonnegativeFinite(
    channel?.recent3AnnualPositive,
    "channel_recent3_annual_positive"
  );
  const cumulativePositive = nonnegativeFinite(
    channel?.cumulativePositive,
    "channel_cumulative_positive"
  );
  const peerTrendRatio = nonnegativeFinite(
    channel?.peerTrendRatio ?? 1,
    "channel_peer_trend_ratio"
  );
  return {
    positive: [],
    trailing: [],
    trailingAnnual,
    latestMonthPositive,
    recent3Annual,
    cumulativePositive,
    peerTrendRatio
  };
}

function requireObject(value, name) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`m2_human_anchored_${name}_invalid`);
  }
  return value;
}

function requireMonth(value, name) {
  if (
    typeof value !== "string"
    || !/^\d{4}-(?:0[1-9]|1[0-2])$/u.test(value)
  ) {
    throw new Error(`m2_human_anchored_${name}_invalid`);
  }
  return value;
}

function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`m2_human_anchored_${name}_invalid`);
  }
  return number;
}

function positiveFinite(value, name) {
  const number = finite(value, name);
  if (!(number > 0)) {
    throw new Error(`m2_human_anchored_${name}_invalid`);
  }
  return number;
}

function nonnegativeFinite(value, name) {
  const number = finite(value, name);
  if (number < 0) {
    throw new Error(`m2_human_anchored_${name}_invalid`);
  }
  return number;
}

function fraction(value, name) {
  const number = finite(value, name);
  if (!(number > 0 && number <= 1)) {
    throw new Error(`m2_human_anchored_${name}_invalid`);
  }
  return number;
}

function fractionInclusiveZero(value, name) {
  const number = finite(value, name);
  if (number < 0 || number > 1) {
    throw new Error(`m2_human_anchored_${name}_invalid`);
  }
  return number;
}

function finite(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`m2_human_anchored_${name}_invalid`);
  }
  return number;
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value), 0);
}

function mean(values) {
  return values.length > 0 ? sum(values) / values.length : 0;
}

function sigmoid(value) {
  if (value >= 0) return 1 / (1 + Math.exp(-value));
  const exponential = Math.exp(value);
  return exponential / (1 + exponential);
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
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
