export function scorePointRowsV2(rows) {
  requireRows(rows);
  const errors = [];
  let absoluteError = 0;
  let signedError = 0;
  let denominator = 0;
  for (const row of rows) {
    const actual = finite(row.actual, "actual");
    const prediction = finite(row.pointEstimate, "point_estimate");
    const error = prediction - actual;
    const absolute = Math.abs(error);
    errors.push(absolute);
    absoluteError += absolute;
    signedError += error;
    denominator += Math.abs(actual);
  }
  if (denominator === 0) throw new Error("m2_evaluation_v2_actual_denominator_zero");
  errors.sort((a, b) => a - b);
  return {
    caseCount: rows.length,
    actualAbsoluteTotal: denominator,
    absoluteErrorTotal: absoluteError,
    signedErrorTotal: signedError,
    wape: absoluteError / denominator,
    signedBias: signedError / denominator,
    absoluteBias: Math.abs(signedError / denominator),
    mae: absoluteError / rows.length,
    medianAbsoluteError: quantileType7(errors, 0.5),
    absoluteErrorQuantiles: {
      p50: quantileType7(errors, 0.5),
      p75: quantileType7(errors, 0.75),
      p90: quantileType7(errors, 0.9),
      p95: quantileType7(errors, 0.95),
      p99: quantileType7(errors, 0.99)
    }
  };
}

export function scorePairedPointRowsV2(candidateRows, fallbackRows) {
  requireRows(candidateRows);
  requireRows(fallbackRows);
  const fallbackByKey = new Map(fallbackRows.map((row) => [row.caseKey, row]));
  const differences = [];
  const candidate = [];
  const fallback = [];
  for (const row of candidateRows) {
    const other = fallbackByKey.get(row.caseKey);
    if (!other || finite(other.actual, "actual") !== finite(row.actual, "actual")) {
      throw new Error("m2_evaluation_v2_pair_mismatch");
    }
    const actual = finite(row.actual, "actual");
    differences.push(
      Math.abs(finite(other.pointEstimate, "fallback") - actual)
      - Math.abs(finite(row.pointEstimate, "candidate") - actual)
    );
    candidate.push(row);
    fallback.push(other);
  }
  if (candidate.length !== fallbackRows.length) {
    throw new Error("m2_evaluation_v2_pair_mismatch");
  }
  const candidateScore = scorePointRowsV2(candidate);
  const fallbackScore = scorePointRowsV2(fallback);
  return {
    caseCount: candidate.length,
    meanPairedAbsoluteErrorImprovement:
      differences.reduce((sum, value) => sum + value, 0) / differences.length,
    medianPairedAbsoluteErrorImprovement:
      quantileType7([...differences].sort((a, b) => a - b), 0.5),
    absoluteWapeFva: fallbackScore.wape - candidateScore.wape,
    relativeWapeFva: 1 - candidateScore.wape / fallbackScore.wape
  };
}

export function scoreOccurrenceRowsV2(rows, options = {}) {
  requireRows(rows);
  const epsilon = options.epsilon ?? 1e-12;
  const thresholds = options.thresholds ?? [0.25, 0.5, 0.75];
  let positives = 0;
  let brier = 0;
  let logLoss = 0;
  const pairs = [];
  for (const row of rows) {
    const occurrenceActual = row.occurrenceActual ?? row.actual;
    const actual = finite(occurrenceActual, "occurrence_actual") > 0 ? 1 : 0;
    const raw = finite(row.occurrenceProbability, "occurrence_probability");
    if (raw < 0 || raw > 1) throw new Error("m2_evaluation_v2_probability_range");
    const probability = Math.min(1 - epsilon, Math.max(epsilon, raw));
    positives += actual;
    brier += (probability - actual) ** 2;
    logLoss -= actual * Math.log(probability) + (1 - actual) * Math.log(1 - probability);
    pairs.push({ actual, probability });
  }
  return {
    caseCount: rows.length,
    baseRate: positives / rows.length,
    brier: brier / rows.length,
    logLoss: logLoss / rows.length,
    prAuc: aucByThreshold(pairs, "pr"),
    rocAucAuxiliary: aucByThreshold(pairs, "roc"),
    reliability10EqualWidthBins: reliabilityBins(pairs, 10),
    confusionMatrices: Object.fromEntries(
      thresholds.map((threshold) => [String(threshold), confusion(pairs, threshold)])
    )
  };
}

export function scoreConditionalAmountRowsV2(rows) {
  requireRows(rows);
  const eligible = rows.filter((row) =>
    finite(row.conditionalActual ?? row.actual, "conditional_actual") > 0
  );
  if (eligible.length === 0) throw new Error("m2_evaluation_v2_no_positive_actual");
  let absoluteError = 0;
  let signedError = 0;
  let denominator = 0;
  let logAbsoluteError = 0;
  for (const row of eligible) {
    if (row.reversalPointEstimate === undefined) {
      throw new Error("m2_evaluation_v2_independent_reversal_required");
    }
    const actual = finite(
      row.conditionalActual ?? row.actual,
      "conditional_actual"
    );
    const prediction = finite(row.conditionalAmountPrediction, "conditional_amount");
    absoluteError += Math.abs(prediction - actual);
    signedError += prediction - actual;
    denominator += Math.abs(actual);
    logAbsoluteError += Math.abs(Math.log1p(Math.max(0, prediction)) - Math.log1p(actual));
  }
  return {
    caseCount: eligible.length,
    wape: absoluteError / denominator,
    signedBias: signedError / denominator,
    mae: absoluteError / eligible.length,
    logMae: logAbsoluteError / eligible.length
  };
}

export function groupScorePointRowsV2(rows, field) {
  const groups = new Map();
  for (const row of rows) {
    const value = String(row[field] ?? "");
    if (!value) throw new Error(`m2_evaluation_v2_group_${field}_missing`);
    const bucket = groups.get(value) ?? [];
    bucket.push(row);
    groups.set(value, bucket);
  }
  return Object.fromEntries(
    [...groups].sort(([a], [b]) => a.localeCompare(b))
      .map(([key, values]) => [key, scorePointRowsV2(values)])
  );
}

export function quantileType7(sortedValues, probability) {
  if (!Array.isArray(sortedValues) || sortedValues.length === 0) {
    throw new Error("m2_evaluation_v2_quantile_values_required");
  }
  if (probability < 0 || probability > 1) {
    throw new Error("m2_evaluation_v2_quantile_probability_invalid");
  }
  if (sortedValues.length === 1) return sortedValues[0];
  const index = (sortedValues.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

const V21_IDENTITY_FIELDS = [
  "metricDefinitionId",
  "metricDefinitionVersion",
  "stableModelId",
  "displayNameZh",
  "displayNameEn",
  "variant",
  "comparabilityGroupId",
  "target",
  "cashAuthority",
  "actualDefinition",
  "asOfContract",
  "grain",
  "populationId",
  "horizonContract",
  "evaluationFamily",
  "caseKeyFields",
  "artifactId",
  "artifactSha256"
];

export function validateEvaluationIdentityV21(identity) {
  if (identity === null || typeof identity !== "object" || Array.isArray(identity)) {
    throw new Error("m2_evaluation_v2_1_identity_required");
  }
  for (const field of V21_IDENTITY_FIELDS) {
    if (identity[field] === null || identity[field] === undefined || identity[field] === "") {
      throw new Error(`m2_evaluation_v2_1_identity_${field}_required`);
    }
  }
  for (const field of ["experimentId", "armId"]) {
    if (!Object.hasOwn(identity, field)) {
      throw new Error(`m2_evaluation_v2_1_identity_${field}_required`);
    }
  }
  if (!Array.isArray(identity.caseKeyFields) || identity.caseKeyFields.length === 0) {
    throw new Error("m2_evaluation_v2_1_identity_case_key_fields_invalid");
  }
  if (!/^[a-f0-9]{64}$/.test(identity.artifactSha256)) {
    throw new Error("m2_evaluation_v2_1_identity_artifact_sha256_invalid");
  }
  return { ...identity };
}

export function compareEvaluationIdentitiesV21(left, right) {
  const validatedLeft = validateEvaluationIdentityV21(left);
  const validatedRight = validateEvaluationIdentityV21(right);
  const comparisonFields = [
    "target",
    "cashAuthority",
    "actualDefinition",
    "asOfContract",
    "grain",
    "populationId",
    "horizonContract",
    "evaluationFamily"
  ];
  const differences = comparisonFields
    .filter((field) => JSON.stringify(validatedLeft[field]) !== JSON.stringify(validatedRight[field]))
    .map((field) => ({
      field,
      left: validatedLeft[field],
      right: validatedRight[field]
    }));
  return {
    status: differences.length === 0
      ? "SAME_CASE_COMPARABLE"
      : "NOT_COMPARABLE_IDENTITY_MISMATCH",
    differences
  };
}

export function scorePointRowsV21(rows) {
  requireRows(rows);
  const workCount = new Set(rows.map((row) => row.standardWorkId).filter(Boolean)).size;
  try {
    return {
      status: "DEFINED",
      workCount,
      ...scorePointRowsV2(rows)
    };
  } catch (error) {
    if (error.message !== "m2_evaluation_v2_actual_denominator_zero") throw error;
    return {
      status: "UNDEFINED_ZERO_ACTUAL_DENOMINATOR",
      caseCount: rows.length,
      workCount,
      actualAbsoluteTotal: 0,
      absoluteErrorTotal: rows.reduce(
        (sum, row) => sum + Math.abs(finite(row.pointEstimate, "point_estimate")),
        0
      ),
      signedErrorTotal: rows.reduce(
        (sum, row) => sum + finite(row.pointEstimate, "point_estimate"),
        0
      ),
      wape: null,
      signedBias: null,
      absoluteBias: null,
      mae: rows.reduce(
        (sum, row) => sum + Math.abs(finite(row.pointEstimate, "point_estimate")),
        0
      ) / rows.length,
      medianAbsoluteError: quantileType7(
        rows.map((row) => Math.abs(finite(row.pointEstimate, "point_estimate")))
          .sort((a, b) => a - b),
        0.5
      ),
      absoluteErrorQuantiles: null
    };
  }
}

export function scoreOccurrenceRowsV21(rows, options = {}) {
  requireRows(rows);
  const normalized = rows.map((row) => {
    if (row.actualPositive === null || row.actualPositive === undefined) {
      throw new Error("m2_evaluation_v2_1_actual_positive_binary_required");
    }
    const value = finite(row.actualPositive, "actual_positive");
    if (value < 0) throw new Error("m2_evaluation_v2_1_actual_positive_invalid");
    return {
      ...row,
      actualPositive: value > 0 ? 1 : 0
    };
  });
  const mapped = normalized.map((row) => ({
    occurrenceActual: row.actualPositive,
    occurrenceProbability: row.occurrenceProbability
  }));
  const candidate = scoreOccurrenceRowsV2(mapped, {
    epsilon: options.epsilon ?? 1e-12,
    thresholds: [options.diagnosticThreshold ?? 0.5]
  });
  const prevalence = candidate.baseRate;
  const oracleRows = normalized.map(() => ({
    occurrenceActual: 0,
    occurrenceProbability: prevalence
  }));
  normalized.forEach((row, index) => {
    oracleRows[index].occurrenceActual = row.actualPositive;
  });
  const oracle = scoreOccurrenceRowsV2(oracleRows, {
    epsilon: options.epsilon ?? 1e-12,
    thresholds: [options.diagnosticThreshold ?? 0.5]
  });
  const frozenRate = options.frozenTrainingBaseRate;
  let frozenBaseline = {
    status: "NOT_COMPUTABLE_FROZEN_TRAINING_BASE_RATE_MISSING",
    trainingBaseRate: null,
    brier: null,
    logLoss: null,
    brierSkill: null,
    logLossImprovement: null
  };
  if (frozenRate !== null && frozenRate !== undefined) {
    const rate = finite(frozenRate, "frozen_training_base_rate");
    if (rate < 0 || rate > 1) {
      throw new Error("m2_evaluation_v2_1_frozen_training_base_rate_invalid");
    }
    const baseline = scoreOccurrenceRowsV2(normalized.map((row) => ({
      occurrenceActual: row.actualPositive,
      occurrenceProbability: rate
    })), {
      epsilon: options.epsilon ?? 1e-12,
      thresholds: [options.diagnosticThreshold ?? 0.5]
    });
    frozenBaseline = {
      status: "COMPUTABLE",
      trainingBaseRate: rate,
      brier: baseline.brier,
      logLoss: baseline.logLoss,
      brierSkill: baseline.brier === 0 ? null : 1 - candidate.brier / baseline.brier,
      logLossImprovement: baseline.logLoss - candidate.logLoss
    };
  }
  return {
    caseCount: candidate.caseCount,
    prevalence,
    brier: candidate.brier,
    logLoss: candidate.logLoss,
    prAuc: candidate.prAuc,
    rocAucAuxiliary: candidate.rocAucAuxiliary,
    reliability10EqualWidthBins: candidate.reliability10EqualWidthBins,
    threshold05DiagnosticOnly: candidate.confusionMatrices[
      String(options.diagnosticThreshold ?? 0.5)
    ],
    evaluationPrevalenceOracleDescriptiveOnly: {
      probability: prevalence,
      brier: oracle.brier,
      logLoss: oracle.logLoss
    },
    frozenTrainingPrevalenceBaseline: frozenBaseline
  };
}

export function scoreConditionalAmountRowsV21(rows) {
  requireRows(rows);
  for (const row of rows) {
    if (row.actualPositiveAmount === undefined) {
      throw new Error("m2_evaluation_v2_1_actual_positive_amount_required");
    }
    if (row.conditionalAmountPrediction === undefined) {
      throw new Error("m2_evaluation_v2_1_conditional_amount_output_required");
    }
    if (row.reversalPointEstimate === undefined) {
      throw new Error("m2_evaluation_v2_1_independent_reversal_required");
    }
  }
  return scoreConditionalAmountRowsV2(rows.map((row) => ({
    conditionalActual: row.actualPositiveAmount,
    conditionalAmountPrediction: row.conditionalAmountPrediction,
    reversalPointEstimate: row.reversalPointEstimate
  })));
}

export function assignMaximalAdjacentOriginBlocksV21(rows) {
  requireRows(rows);
  const origins = [...new Set(rows.map((row) => String(row.origin ?? "")))].sort();
  if (origins.some((origin) => !/^\d{4}-\d{2}$/.test(origin))) {
    throw new Error("m2_evaluation_v2_1_origin_month_required");
  }
  const result = new Map();
  let start = origins[0];
  let previous = origins[0];
  let index = 1;
  for (const origin of origins) {
    if (origin !== origins[0] && monthDistanceV21(previous, origin) !== 1) {
      index += 1;
      start = origin;
    }
    result.set(origin, { index, start, end: origin });
    previous = origin;
  }
  const ends = new Map();
  for (const origin of origins) ends.set(result.get(origin).index, origin);
  return rows.map((row) => {
    const block = result.get(String(row.origin));
    return {
      ...row,
      timeBlock: `B${block.index}:${block.start}..${ends.get(block.index)}`
    };
  });
}

export function scoreIntervalRowsV21(rows, options = {}) {
  requireRows(rows);
  const grid = options.quantileGrid ?? [0.05, 0.1, 0.2, 0.5, 0.8, 0.9, 0.95];
  const required = [0.05, 0.1, 0.2, 0.5, 0.8, 0.9, 0.95];
  if (JSON.stringify(grid) !== JSON.stringify(required)) {
    throw new Error("m2_evaluation_v2_1_native_quantile_grid_required");
  }
  const score = intervalCoreV21(rows, grid);
  const byHorizon = groupedPrivateScoreV21(
    rows,
    (row) => String(row.horizonMonths),
    (values) => intervalCoreV21(values, grid),
    options
  );
  const byTimeBlock = groupedPrivateScoreV21(
    assignMaximalAdjacentOriginBlocksV21(rows),
    (row) => row.timeBlock,
    (values) => intervalCoreV21(values, grid),
    options
  );
  let reference = {
    status: "NO_FROZEN_INTERVAL_REFERENCE",
    interpretationStatus: "PROMISING_DEVELOPMENT_INTERVAL_EVIDENCE",
    wisImprovement: null,
    crpsImprovement: null
  };
  if (options.referenceRows) {
    ensureExactPairsV21(rows, options.referenceRows);
    const referenceScore = intervalCoreV21(options.referenceRows, grid);
    reference = {
      status: "COMPARABLE_FROZEN_REFERENCE",
      interpretationStatus: "PAIRED_INTERVAL_REFERENCE_AVAILABLE",
      modelId: options.referenceModelId ?? null,
      wis: referenceScore.wis,
      crpsApproximation: referenceScore.crpsApproximation,
      wisImprovement: referenceScore.wis - score.wis,
      crpsImprovement: referenceScore.crpsApproximation - score.crpsApproximation
    };
  }
  return {
    ...score,
    quantileGrid: grid,
    byHorizon,
    byTimeBlock,
    reference
  };
}

export function scoreRankingRowsV21(candidateRows, fallbackRows, options = {}) {
  requireRows(candidateRows);
  requireRows(fallbackRows);
  ensureExactPairsV21(candidateRows, fallbackRows);
  const privacy = privacyStatusV21(candidateRows, options);
  if (privacy.status !== "PUBLIC") return privacy;
  const fractions = options.topFractions ?? [0.01, 0.05, 0.1];
  const candidate = rankingCoreV21(candidateRows, fractions);
  const fallback = rankingCoreV21(fallbackRows, fractions);
  const differences = rankingDifferencesV21(candidate, fallback, fractions);
  const iterations = options.bootstrapIterations ?? 1000;
  const seed = options.seed ?? 20260728;
  const workInterval = rankingBootstrapV21(
    candidateRows,
    fallbackRows,
    "standardWorkId",
    seed,
    iterations
  );
  const originInterval = rankingBootstrapV21(
    candidateRows,
    fallbackRows,
    "origin",
    seed + 1,
    iterations
  );
  const confirmed = workInterval
    && originInterval
    && workInterval.meanSpearmanDifferenceLower95 > 0
    && originInterval.meanSpearmanDifferenceLower95 > 0;
  return {
    status: confirmed
      ? "PAIRED_RANKING_SIGNAL_ESTIMATED"
      : "UNCONFIRMED_RANKING_SIGNAL",
    caseCount: candidateRows.length,
    workCount: new Set(candidateRows.map((row) => row.standardWorkId)).size,
    groupCount: candidate.groupCount,
    weighting: "equal_origin_horizon_cell_weight",
    candidate,
    fallback,
    pairedDifferences: differences,
    clusterIntervals: {
      work: workInterval,
      originTime: originInterval
    }
  };
}

export function scorePortfolioPairedV21(candidateRows, fallbackRows, options = {}) {
  requireRows(candidateRows);
  requireRows(fallbackRows);
  ensureExactPairsV21(candidateRows, fallbackRows);
  const horizons = [...new Set(candidateRows.map((row) => Number(row.horizonMonths)))]
    .sort((a, b) => a - b);
  const byHorizon = {};
  for (const horizon of horizons) {
    const candidate = candidateRows.filter((row) => Number(row.horizonMonths) === horizon);
    const fallback = fallbackRows.filter((row) => Number(row.horizonMonths) === horizon);
    const originCount = new Set(candidate.map((row) => row.origin)).size;
    if (originCount < (options.minimumOriginCount ?? 5)) {
      byHorizon[String(horizon)] = {
        status: "SUPPRESSED_MINIMUM_ORIGIN_COUNT",
        originCount
      };
      continue;
    }
    const paired = scorePairedPointRowsV2(candidate, fallback);
    byHorizon[String(horizon)] = {
      status: "DEFINED_SMALL_SAMPLE_DEVELOPMENT_ONLY",
      originCount,
      ...paired,
      originClusterInterval: pointFvaBootstrapV21(
        candidate,
        fallback,
        "origin",
        (options.seed ?? 20260728) + horizon,
        options.bootstrapIterations ?? 1000
      )
    };
  }
  return {
    status: "PORTFOLIO_PAIRED_DEVELOPMENT_EVIDENCE",
    smallSampleWarning: true,
    caseCount: candidateRows.length,
    originCount: new Set(candidateRows.map((row) => row.origin)).size,
    byHorizon
  };
}

export function scoreTopRevenueAttributionV21(rows, options = {}) {
  requireRows(rows);
  const fractions = options.topFractions ?? [0.01, 0.05, 0.1];
  const caseCells = groupMapV21(
    rows,
    (row) => `${row.origin}|${row.horizonMonths}`
  );
  const withinCell = {};
  for (const [key, values] of [...caseCells].sort(([a], [b]) => a.localeCompare(b))) {
    const privacy = privacyStatusV21(values, options);
    withinCell[key] = privacy.status === "PUBLIC"
      ? revenueSharesV21(values, fractions)
      : privacy;
  }
  const works = new Map();
  for (const row of rows) {
    const value = works.get(row.standardWorkId) ?? {
      actual: 0,
      absoluteError: 0
    };
    value.actual += Math.abs(finite(row.actual, "actual"));
    value.absoluteError += Math.abs(
      finite(row.pointEstimate, "point_estimate") - finite(row.actual, "actual")
    );
    works.set(row.standardWorkId, value);
  }
  return {
    status: "POSTHOC_FUTURE_ACTUAL_ATTRIBUTION_ONLY",
    futureActualUsed: true,
    allowedForSelectionOrGate: false,
    caseLevelWithinOriginHorizon: withinCell,
    workLevelGlobal: works.size < (options.minimumWorkCount ?? 20)
      ? {
        status: "SUPPRESSED_PRIVACY_THRESHOLD",
        workCount: works.size,
        minimumWorkCount: options.minimumWorkCount ?? 20
      }
      : revenueSharesV21(
        [...works].map(([standardWorkId, value]) => ({ standardWorkId, ...value })),
        fractions,
        true
      )
  };
}

export function scoreOccurrenceRowsV22(rows, options = {}) {
  requireRows(rows);
  const epsilon = options.epsilon ?? 1e-12;
  const diagnosticThreshold = options.diagnosticThreshold ?? 0.5;
  const pairs = rows.map((row) => {
    if (row.actualPositive === null || row.actualPositive === undefined) {
      throw new Error("m2_evaluation_v2_2_actual_positive_required");
    }
    const actualValue = finite(row.actualPositive, "actual_positive");
    const probability = finite(
      row.occurrenceProbability,
      "occurrence_probability"
    );
    if (probability < 0 || probability > 1) {
      throw new Error("m2_evaluation_v2_probability_range");
    }
    return {
      actual: actualValue > 0 ? 1 : 0,
      probability: Math.min(1 - epsilon, Math.max(epsilon, probability))
    };
  });
  const positives = pairs.reduce((sum, row) => sum + row.actual, 0);
  let brier = 0;
  let logLoss = 0;
  for (const row of pairs) {
    brier += (row.probability - row.actual) ** 2;
    logLoss -= row.actual * Math.log(row.probability)
      + (1 - row.actual) * Math.log(1 - row.probability);
  }
  return {
    status: "DEFINED",
    caseCount: rows.length,
    prevalence: positives / rows.length,
    brier: brier / rows.length,
    logLoss: logLoss / rows.length,
    prAucTrapezoidal: aucByThreshold(pairs, "pr"),
    averagePrecision: averagePrecisionV22(pairs),
    rocAucAuxiliary: aucByThreshold(pairs, "roc"),
    reliability10EqualWidthBins: reliabilityBins(pairs, 10),
    threshold05DiagnosticOnly: confusion(pairs, diagnosticThreshold)
  };
}

export function scoreConditionalAmountRowsV22(rows) {
  requireRows(rows);
  if (rows.some((row) =>
    row.actualPositiveAmount === null
    || row.actualPositiveAmount === undefined
  )) {
    return {
      status: "NOT_COMPUTABLE_CONDITIONAL_AMOUNT_ACTUAL_MISSING",
      caseCount: rows.length
    };
  }
  if (rows.some((row) =>
    row.conditionalAmountPrediction === null
    || row.conditionalAmountPrediction === undefined
  )) {
    return {
      status: "NOT_COMPUTABLE_CONDITIONAL_AMOUNT_PREDICTION_MISSING",
      caseCount: rows.length
    };
  }
  const eligible = rows.filter(
    (row) => finite(row.actualPositiveAmount, "actual_positive_amount") > 0
  );
  if (eligible.length === 0) {
    return {
      status: "NOT_COMPUTABLE_NO_POSITIVE_ACTUAL",
      caseCount: rows.length,
      positiveCaseCount: 0
    };
  }
  let absoluteError = 0;
  let signedError = 0;
  let denominator = 0;
  let logAbsoluteError = 0;
  for (const row of eligible) {
    const actual = finite(row.actualPositiveAmount, "actual_positive_amount");
    const prediction = finite(
      row.conditionalAmountPrediction,
      "conditional_amount"
    );
    absoluteError += Math.abs(prediction - actual);
    signedError += prediction - actual;
    denominator += actual;
    logAbsoluteError += Math.abs(
      Math.log1p(Math.max(0, prediction)) - Math.log1p(actual)
    );
  }
  return {
    status: "DEFINED",
    caseCount: rows.length,
    positiveCaseCount: eligible.length,
    wape: absoluteError / denominator,
    signedBias: signedError / denominator,
    mae: absoluteError / eligible.length,
    logMae: logAbsoluteError / eligible.length
  };
}

export function scoreReversalRowsV22(rows, options = {}) {
  requireRows(rows);
  if (rows.some((row) =>
    row.postingTimeReversalActual === null
    || row.postingTimeReversalActual === undefined
  )) {
    return {
      status: "NOT_COMPUTABLE_REVERSAL_ACTUAL_MISSING",
      caseCount: rows.length,
      occurrence: null,
      amount: null,
      calibration: null
    };
  }
  if (rows.some((row) =>
    row.reversalPointEstimate === null
    || row.reversalPointEstimate === undefined
  )) {
    return {
      status: "NOT_COMPUTABLE_REVERSAL_PREDICTION_MISSING",
      caseCount: rows.length,
      occurrence: null,
      amount: null,
      calibration: null
    };
  }
  const normalized = rows.map((row) => {
    const actual = finite(
      row.postingTimeReversalActual,
      "posting_time_reversal_actual"
    );
    const prediction = finite(
      row.reversalPointEstimate,
      "reversal_point_estimate"
    );
    if (actual < 0 || prediction < 0) {
      throw new Error("m2_evaluation_v2_2_reversal_magnitude_nonnegative");
    }
    return { ...row, actual, prediction };
  });
  const actualTotal = normalized.reduce((sum, row) => sum + row.actual, 0);
  const absoluteError = normalized.reduce(
    (sum, row) => sum + Math.abs(row.prediction - row.actual),
    0
  );
  const signedError = normalized.reduce(
    (sum, row) => sum + row.prediction - row.actual,
    0
  );
  const occurrence = normalized.every(
    (row) => row.reversalOccurrenceProbability !== undefined
  )
    ? scoreOccurrenceRowsV22(normalized.map((row) => ({
      actualPositive: row.actual > 0 ? 1 : 0,
      occurrenceProbability: row.reversalOccurrenceProbability
    })), options)
    : {
      status: "NOT_COMPUTABLE_REVERSAL_OCCURRENCE_PROBABILITY_MISSING"
    };
  return {
    status: "DEFINED_AVAILABLE_OUTPUTS",
    caseCount: rows.length,
    reversalCaseCount: normalized.filter((row) => row.actual > 0).length,
    occurrence,
    amount: {
      status: actualTotal === 0
        ? "UNDEFINED_ZERO_ACTUAL_DENOMINATOR"
        : "DEFINED",
      wape: actualTotal === 0 ? null : absoluteError / actualTotal,
      signedBias: actualTotal === 0 ? null : signedError / actualTotal,
      mae: absoluteError / normalized.length
    },
    calibration: occurrence.status === "DEFINED"
      ? {
        status: "DEFINED",
        reliability10EqualWidthBins: occurrence.reliability10EqualWidthBins
      }
      : {
        status: "NOT_COMPUTABLE_REVERSAL_OCCURRENCE_PROBABILITY_MISSING"
      }
  };
}

export function scoreRankingRowsV22(candidateRows, fallbackRows, options = {}) {
  requireRows(candidateRows);
  requireRows(fallbackRows);
  ensureExactPairsV21(candidateRows, fallbackRows);
  const privacy = privacyStatusV21(candidateRows, options);
  if (privacy.status !== "PUBLIC") return privacy;
  const fractions = options.topFractions ?? [0.01, 0.05, 0.1];
  const iterations = options.bootstrapIterations ?? 2000;
  if (iterations < 2000) {
    throw new Error("m2_evaluation_v2_2_bootstrap_iterations_minimum");
  }
  const seed = options.seed ?? 20260728;
  const candidate = rankingCoreV21(candidateRows, fractions);
  const fallback = rankingCoreV21(fallbackRows, fractions);
  const pairedDifferences = rankingDifferencesV21(
    candidate,
    fallback,
    fractions
  );
  const workBootstrap = fullRankingWorkBootstrapV22(
    candidateRows,
    fallbackRows,
    fractions,
    seed,
    iterations
  );
  const blocks = new Set(
    assignMaximalAdjacentOriginBlocksV21(candidateRows)
      .map((row) => row.timeBlock)
  );
  const minimumIndependentBlocks = options.minimumIndependentTimeBlocks ?? 2;
  const timeIndependence = blocks.size < minimumIndependentBlocks
    ? {
      status: "NOT_COMPUTABLE_INSUFFICIENT_INDEPENDENT_TIME_BLOCKS",
      independentTimeBlockCount: blocks.size,
      minimumIndependentTimeBlocks: minimumIndependentBlocks,
      interval: null
    }
    : {
      status: "INDEPENDENT_TIME_BLOCKS_AVAILABLE",
      independentTimeBlockCount: blocks.size,
      minimumIndependentTimeBlocks: minimumIndependentBlocks,
      interval: null
    };
  return {
    status: timeIndependence.status
      === "NOT_COMPUTABLE_INSUFFICIENT_INDEPENDENT_TIME_BLOCKS"
      ? "WORK_CLUSTER_RANKING_SIGNAL_TIME_INDEPENDENCE_UNCONFIRMED"
      : "WORK_CLUSTER_RANKING_SIGNAL_WITH_TIME_BLOCKS_AVAILABLE",
    caseCount: candidateRows.length,
    workCount: new Set(candidateRows.map((row) => row.standardWorkId)).size,
    groupCount: candidate.groupCount,
    weighting: "equal_origin_horizon_cell_weight",
    candidate,
    fallback,
    pairedDifferences,
    workClusterBootstrap: workBootstrap,
    timeIndependence,
    byOriginDescriptiveOnly: summarizeRankingByOriginV22(
      pairedDifferences.byOriginHorizon
    )
  };
}

export function scorePortfolioPairedV22(candidateRows, fallbackRows, options = {}) {
  requireRows(candidateRows);
  requireRows(fallbackRows);
  ensureExactPairsV21(candidateRows, fallbackRows);
  const iterations = options.bootstrapIterations ?? 2000;
  if (iterations < 2000) {
    throw new Error("m2_evaluation_v2_2_bootstrap_iterations_minimum");
  }
  const seed = options.seed ?? 20260728;
  const horizons = [...new Set(candidateRows.map(
    (row) => Number(row.horizonMonths)
  ))].sort((left, right) => left - right);
  const byHorizon = {};
  for (const horizon of horizons) {
    const candidate = candidateRows.filter(
      (row) => Number(row.horizonMonths) === horizon
    );
    const fallback = fallbackRows.filter(
      (row) => Number(row.horizonMonths) === horizon
    );
    const origins = [...new Set(candidate.map((row) => row.origin))].sort();
    if (origins.length < (options.minimumOriginCount ?? 5)) {
      byHorizon[String(horizon)] = {
        status: "SUPPRESSED_MINIMUM_ORIGIN_COUNT",
        originCount: origins.length
      };
      continue;
    }
    const blocks = new Set(
      assignMaximalAdjacentOriginBlocksV21(candidate)
        .map((row) => row.timeBlock)
    );
    byHorizon[String(horizon)] = {
      status: "SMALL_SAMPLE_SENSITIVITY_PENDING_LATER_ORIGIN_VALIDATION",
      originCount: origins.length,
      paired: scorePairedPointRowsV2(candidate, fallback),
      originResamplingSensitivity: pointFvaBootstrapV21(
        candidate,
        fallback,
        "origin",
        seed + horizon,
        iterations
      ),
      leaveOneOriginOut: leaveOneOriginOutV22(candidate, fallback),
      contiguousTimeBlockDiagnostic: {
        timeBlockCount: blocks.size,
        status: blocks.size < (options.minimumIndependentTimeBlocks ?? 2)
          ? "NOT_COMPUTABLE_INSUFFICIENT_INDEPENDENT_TIME_BLOCKS"
          : "INDEPENDENT_TIME_BLOCKS_AVAILABLE"
      },
      independentExternalValidation: false,
      routerAuthorized: false
    };
  }
  return {
    status: "PORTFOLIO_SMALL_SAMPLE_SENSITIVITY_ONLY",
    caseCount: candidateRows.length,
    originCount: new Set(candidateRows.map((row) => row.origin)).size,
    separateByHorizon: true,
    byHorizon
  };
}

export function scoreTopRevenueAttributionV22(rows, options = {}) {
  requireRows(rows);
  const fractions = options.topFractions ?? [0.01, 0.05, 0.1];
  const measures = {
    positiveRevenueAttribution: (row) =>
      Math.max(0, finite(row.actual, "actual")),
    absoluteCashMagnitudeAttribution: (row) =>
      Math.abs(finite(row.actual, "actual")),
    reversalMagnitudeAttribution: (row) => row.reversalActualMagnitude === undefined
      ? Math.max(0, -finite(row.actual, "actual"))
      : Math.max(
        0,
        finite(row.reversalActualMagnitude, "reversal_actual_magnitude")
      )
  };
  const output = {};
  for (const [name, measure] of Object.entries(measures)) {
    output[name] = attributionMeasureV22(rows, fractions, measure, options);
  }
  return {
    status: "POSTHOC_FUTURE_ACTUAL_ATTRIBUTION_ONLY",
    futureActualUsed: true,
    allowedForFittingSelectionOrGate: false,
    ...output
  };
}

export function validateActivationBindingV22(expected, observed, ci = {}) {
  const fields = [
    "contractArtifactSha256",
    "evaluatorImplementationSha256",
    "testContractSha256",
    "frozenInputArtifactSetSha256"
  ];
  const digestDifferences = fields.filter(
    (field) => expected?.[field] !== observed?.[field]
  );
  const ciPassed = ci.linux === "SUCCESS" && ci.windows === "SUCCESS";
  return {
    status: digestDifferences.length === 0 && ciPassed
      ? "ACTIVE_FOR_DEVELOPMENT_EVALUATION_ONLY"
      : "DRAFT_V2_2_REVISION_INCOMPLETE",
    bindingMode: "content_digest_and_current_execution_ci",
    exactHeadAuditOnly: true,
    descendantCommitMayInheritWhenDigestsUnchanged: true,
    digestDifferences,
    linuxCi: ci.linux ?? null,
    windowsCi: ci.windows ?? null
  };
}

function reliabilityBins(pairs, count) {
  const result = [];
  for (let index = 0; index < count; index += 1) {
    const lower = index / count;
    const upper = (index + 1) / count;
    const values = pairs.filter(({ probability }) =>
      probability >= lower && (index === count - 1 ? probability <= upper : probability < upper)
    );
    result.push({
      lower,
      upper,
      caseCount: values.length,
      meanProbability: values.length
        ? values.reduce((sum, row) => sum + row.probability, 0) / values.length
        : null,
      observedRate: values.length
        ? values.reduce((sum, row) => sum + row.actual, 0) / values.length
        : null
    });
  }
  return result;
}

function confusion(pairs, threshold) {
  let tp = 0; let fp = 0; let tn = 0; let fn = 0;
  for (const row of pairs) {
    const predicted = row.probability >= threshold ? 1 : 0;
    if (predicted && row.actual) tp += 1;
    else if (predicted) fp += 1;
    else if (row.actual) fn += 1;
    else tn += 1;
  }
  return {
    tp, fp, tn, fn,
    precision: tp + fp ? tp / (tp + fp) : null,
    recall: tp + fn ? tp / (tp + fn) : null,
    specificity: tn + fp ? tn / (tn + fp) : null
  };
}

function aucByThreshold(pairs, kind) {
  const ordered = [...pairs].sort((a, b) =>
    b.probability - a.probability || b.actual - a.actual
  );
  const positive = ordered.reduce((sum, row) => sum + row.actual, 0);
  const negative = ordered.length - positive;
  if (positive === 0 || (kind === "roc" && negative === 0)) return null;
  let tp = 0; let fp = 0;
  let previousX = 0;
  let previousY = kind === "pr" ? 1 : 0;
  let area = 0;
  for (let index = 0; index < ordered.length;) {
    const probability = ordered[index].probability;
    while (index < ordered.length && ordered[index].probability === probability) {
      if (ordered[index].actual) tp += 1; else fp += 1;
      index += 1;
    }
    const x = kind === "pr" ? tp / positive : fp / negative;
    const y = kind === "pr" ? tp / (tp + fp) : tp / positive;
    area += (x - previousX) * (y + previousY) / 2;
    previousX = x;
    previousY = y;
  }
  return area;
}

function intervalCoreV21(rows, grid) {
  const intervals = [
    { id: "central_90", lower: 0.05, upper: 0.95, nominal: 0.9 },
    { id: "central_80", lower: 0.1, upper: 0.9, nominal: 0.8 },
    { id: "central_60", lower: 0.2, upper: 0.8, nominal: 0.6 }
  ];
  const coverage = Object.fromEntries(intervals.map(({ id, nominal }) => [
    id,
    { nominal, hits: 0, widthTotal: 0 }
  ]));
  let quantileLoss = 0;
  let wis = 0;
  for (const row of rows) {
    const actual = finite(row.actual, "actual");
    const quantiles = {};
    let previous = -Infinity;
    for (const probability of grid) {
      const value = finite(row.quantiles?.[String(probability)], "quantile");
      if (value < previous) throw new Error("m2_evaluation_v2_1_quantiles_not_monotone");
      previous = value;
      quantiles[String(probability)] = value;
      const error = actual - value;
      quantileLoss += error >= 0
        ? probability * error
        : (1 - probability) * -error;
    }
    let weighted = 0.5 * Math.abs(actual - quantiles["0.5"]);
    for (const interval of intervals) {
      const lower = quantiles[String(interval.lower)];
      const upper = quantiles[String(interval.upper)];
      const alpha = 1 - interval.nominal;
      const score = upper - lower
        + (actual < lower ? 2 / alpha * (lower - actual) : 0)
        + (actual > upper ? 2 / alpha * (actual - upper) : 0);
      weighted += alpha / 2 * score;
      coverage[interval.id].widthTotal += upper - lower;
      if (actual >= lower && actual <= upper) coverage[interval.id].hits += 1;
    }
    wis += weighted / (intervals.length + 0.5);
  }
  return {
    caseCount: rows.length,
    workCount: new Set(rows.map((row) => row.standardWorkId).filter(Boolean)).size,
    wis: wis / rows.length,
    crpsApproximation: 2 * quantileLoss / (rows.length * grid.length),
    meanQuantileScore: quantileLoss / (rows.length * grid.length),
    intervals: Object.fromEntries(intervals.map(({ id, nominal }) => [id, {
      nominal,
      observedCoverage: coverage[id].hits / rows.length,
      absoluteCalibrationError: Math.abs(coverage[id].hits / rows.length - nominal),
      meanWidth: coverage[id].widthTotal / rows.length
    }]))
  };
}

function groupedPrivateScoreV21(rows, keyOf, scorer, options) {
  const result = {};
  for (const [key, values] of [...groupMapV21(rows, keyOf)]
    .sort(([a], [b]) => a.localeCompare(b))) {
    const privacy = privacyStatusV21(values, options);
    result[key] = privacy.status === "PUBLIC" ? scorer(values) : privacy;
  }
  return result;
}

function privacyStatusV21(rows, options = {}) {
  const caseCount = rows.length;
  const workCount = new Set(
    rows.map((row) => row.standardWorkId).filter((value) =>
      value && value !== "__PORTFOLIO__"
    )
  ).size;
  const minimumCaseCount = options.minimumCaseCount ?? 30;
  const minimumWorkCount = options.minimumWorkCount ?? 20;
  if (caseCount < minimumCaseCount || workCount < minimumWorkCount) {
    return {
      status: "SUPPRESSED_PRIVACY_THRESHOLD",
      caseCount,
      workCount,
      minimumCaseCount,
      minimumWorkCount
    };
  }
  return { status: "PUBLIC", caseCount, workCount };
}

function ensureExactPairsV21(candidateRows, fallbackRows) {
  if (candidateRows.length !== fallbackRows.length) {
    throw new Error("m2_evaluation_v2_1_pair_mismatch");
  }
  const fallback = new Map(fallbackRows.map((row) => [row.caseKey, row]));
  for (const row of candidateRows) {
    const other = fallback.get(row.caseKey);
    if (!other || finite(other.actual, "actual") !== finite(row.actual, "actual")) {
      throw new Error("m2_evaluation_v2_1_pair_mismatch");
    }
  }
}

function rankingCoreV21(rows, fractions) {
  const cells = groupMapV21(rows, (row) => `${row.origin}|${row.horizonMonths}`);
  const cellScores = [];
  for (const [key, values] of cells) {
    if (values.length < 2) continue;
    const actualRanks = ranksV21(values.map((row) => finite(row.actual, "actual")));
    const predictedRanks = ranksV21(values.map((row) =>
      finite(row.pointEstimate, "point_estimate")
    ));
    const captures = Object.fromEntries(fractions.map((fraction) => [
      String(fraction),
      topCaptureV21(values, fraction)
    ]));
    cellScores.push({
      key,
      spearman: correlationV21(actualRanks, predictedRanks),
      kendallTauB: kendallTauBV21(values),
      captures
    });
  }
  return {
    groupCount: cellScores.length,
    meanSpearman: averageV21(cellScores.map((row) => row.spearman)),
    meanKendallTauB: averageV21(cellScores.map((row) => row.kendallTauB)),
    meanTopRevenueCapture: Object.fromEntries(fractions.map((fraction) => [
      String(fraction),
      averageV21(cellScores.map((row) => row.captures[String(fraction)]))
    ])),
    byOriginHorizon: Object.fromEntries(cellScores.map((row) => [row.key, {
      caseCount: cells.get(row.key).length,
      spearman: row.spearman,
      kendallTauB: row.kendallTauB,
      topRevenueCapture: row.captures
    }]))
  };
}

function rankingDifferencesV21(candidate, fallback, fractions) {
  const keys = Object.keys(candidate.byOriginHorizon).sort();
  const byOriginHorizon = Object.fromEntries(keys.map((key) => {
    const candidateCell = candidate.byOriginHorizon[key];
    const fallbackCell = fallback.byOriginHorizon[key];
    return [key, {
      caseCount: candidateCell.caseCount,
      spearman: candidateCell.spearman - fallbackCell.spearman,
      kendallTauB: candidateCell.kendallTauB - fallbackCell.kendallTauB,
      topRevenueCapture: Object.fromEntries(fractions.map((fraction) => [
        String(fraction),
        candidateCell.topRevenueCapture[String(fraction)]
          - fallbackCell.topRevenueCapture[String(fraction)]
      ]))
    }];
  }));
  return {
    meanSpearman: candidate.meanSpearman - fallback.meanSpearman,
    meanKendallTauB: candidate.meanKendallTauB - fallback.meanKendallTauB,
    meanTopRevenueCapture: Object.fromEntries(fractions.map((fraction) => [
      String(fraction),
      candidate.meanTopRevenueCapture[String(fraction)]
        - fallback.meanTopRevenueCapture[String(fraction)]
    ])),
    winRates: {
      spearman: keys.filter((key) => byOriginHorizon[key].spearman > 0).length / keys.length,
      kendallTauB:
        keys.filter((key) => byOriginHorizon[key].kendallTauB > 0).length / keys.length,
      topRevenueCapture: Object.fromEntries(fractions.map((fraction) => [
        String(fraction),
        keys.filter((key) =>
          byOriginHorizon[key].topRevenueCapture[String(fraction)] > 0
        ).length / keys.length
      ]))
    },
    byOriginHorizon
  };
}

function rankingBootstrapV21(
  candidateRows,
  fallbackRows,
  clusterField,
  seed,
  iterations
) {
  const fallbackByKey = new Map(fallbackRows.map((row) => [row.caseKey, row]));
  const cells = groupMapV21(candidateRows, (row) => `${row.origin}|${row.horizonMonths}`);
  const contributions = new Map();
  for (const values of cells.values()) {
    if (values.length < 2) continue;
    const actualRanks = ranksV21(values.map((row) => finite(row.actual, "actual")));
    const candidateRanks = ranksV21(values.map((row) =>
      finite(row.pointEstimate, "point_estimate")
    ));
    const fallbackRanks = ranksV21(values.map((row) =>
      finite(fallbackByKey.get(row.caseKey).pointEstimate, "fallback")
    ));
    const actualMean = averageV21(actualRanks);
    const candidateMean = averageV21(candidateRanks);
    const fallbackMean = averageV21(fallbackRanks);
    const actualSquare = actualRanks.reduce(
      (sum, value) => sum + (value - actualMean) ** 2,
      0
    );
    const candidateSquare = candidateRanks.reduce(
      (sum, value) => sum + (value - candidateMean) ** 2,
      0
    );
    const fallbackSquare = fallbackRanks.reduce(
      (sum, value) => sum + (value - fallbackMean) ** 2,
      0
    );
    for (let index = 0; index < values.length; index += 1) {
      const row = values[index];
      const key = String(row[clusterField]);
      const candidateContribution = actualSquare && candidateSquare
        ? (actualRanks[index] - actualMean) * (candidateRanks[index] - candidateMean)
          / Math.sqrt(actualSquare * candidateSquare)
        : 0;
      const fallbackContribution = actualSquare && fallbackSquare
        ? (actualRanks[index] - actualMean) * (fallbackRanks[index] - fallbackMean)
          / Math.sqrt(actualSquare * fallbackSquare)
        : 0;
      contributions.set(
        key,
        (contributions.get(key) ?? 0)
          + (candidateContribution - fallbackContribution) / cells.size
      );
    }
  }
  const keys = [...contributions.keys()].sort();
  if (keys.length < 2) return null;
  const random = mulberry32V21(seed);
  const estimates = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let estimate = 0;
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[Math.floor(random() * keys.length)];
      estimate += contributions.get(key);
    }
    estimates.push(estimate);
  }
  estimates.sort((a, b) => a - b);
  return {
    unit: clusterField === "origin" ? "origin_time_cluster" : "standard_work_cluster",
    clusterCount: keys.length,
    iterations,
    seed,
    meanSpearmanDifferenceLower95: quantileType7(estimates, 0.025),
    meanSpearmanDifferenceUpper95: quantileType7(estimates, 0.975)
  };
}

function pointFvaBootstrapV21(candidateRows, fallbackRows, field, seed, iterations) {
  const fallback = new Map(fallbackRows.map((row) => [row.caseKey, row]));
  const clusters = new Map();
  for (const row of candidateRows) {
    const value = clusters.get(row[field]) ?? {
      candidateError: 0,
      fallbackError: 0,
      denominator: 0
    };
    value.candidateError += Math.abs(
      finite(row.pointEstimate, "point_estimate") - finite(row.actual, "actual")
    );
    value.fallbackError += Math.abs(
      finite(fallback.get(row.caseKey).pointEstimate, "fallback") - finite(row.actual, "actual")
    );
    value.denominator += Math.abs(finite(row.actual, "actual"));
    clusters.set(row[field], value);
  }
  const values = [...clusters.values()];
  const random = mulberry32V21(seed);
  const estimates = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let candidateError = 0;
    let fallbackError = 0;
    let denominator = 0;
    for (let index = 0; index < values.length; index += 1) {
      const value = values[Math.floor(random() * values.length)];
      candidateError += value.candidateError;
      fallbackError += value.fallbackError;
      denominator += value.denominator;
    }
    estimates.push(denominator === 0 ? 0 : (fallbackError - candidateError) / denominator);
  }
  estimates.sort((a, b) => a - b);
  return {
    unit: field,
    clusterCount: values.length,
    iterations,
    seed,
    absoluteWapeFvaLower95: quantileType7(estimates, 0.025),
    absoluteWapeFvaUpper95: quantileType7(estimates, 0.975)
  };
}

function revenueSharesV21(rows, fractions, aggregated = false) {
  const ordered = [...rows].sort((left, right) => {
    const leftActual = aggregated ? left.actual : Math.abs(finite(left.actual, "actual"));
    const rightActual = aggregated ? right.actual : Math.abs(finite(right.actual, "actual"));
    return rightActual - leftActual;
  });
  const actualOf = (row) => aggregated ? row.actual : Math.abs(finite(row.actual, "actual"));
  const errorOf = (row) => aggregated
    ? row.absoluteError
    : Math.abs(finite(row.pointEstimate, "point_estimate") - finite(row.actual, "actual"));
  const actualTotal = ordered.reduce((sum, row) => sum + actualOf(row), 0);
  const errorTotal = ordered.reduce((sum, row) => sum + errorOf(row), 0);
  return Object.fromEntries(fractions.map((fraction) => {
    const count = Math.max(1, Math.ceil(ordered.length * fraction));
    const top = ordered.slice(0, count);
    const topActual = top.reduce((sum, row) => sum + actualOf(row), 0);
    const topError = top.reduce((sum, row) => sum + errorOf(row), 0);
    return [String(fraction), {
      itemCount: count,
      actualCashShare: actualTotal === 0 ? null : topActual / actualTotal,
      absoluteErrorShare: errorTotal === 0 ? null : topError / errorTotal,
      outsideTopWape: actualTotal - topActual === 0
        ? null
        : (errorTotal - topError) / (actualTotal - topActual),
      denominatorStatus: actualTotal === 0
        ? "UNDEFINED_ZERO_ACTUAL_DENOMINATOR"
        : "DEFINED"
    }];
  }));
}

function topCaptureV21(rows, fraction) {
  const count = Math.max(1, Math.ceil(rows.length * fraction));
  const ordered = [...rows].sort((left, right) =>
    finite(right.pointEstimate, "point_estimate")
      - finite(left.pointEstimate, "point_estimate")
  );
  const total = rows.reduce((sum, row) => sum + Math.max(0, finite(row.actual, "actual")), 0);
  if (total === 0) return 0;
  return ordered.slice(0, count).reduce(
    (sum, row) => sum + Math.max(0, finite(row.actual, "actual")),
    0
  ) / total;
}

function kendallTauBV21(rows) {
  const pairs = rows.map((row) => ({
    x: finite(row.actual, "actual"),
    y: finite(row.pointEstimate, "point_estimate")
  })).sort((left, right) => left.x - right.x || left.y - right.y);
  const totalPairs = pairs.length * (pairs.length - 1) / 2;
  const xTies = tiePairCountV21(pairs.map((row) => row.x));
  const yTies = tiePairCountV21(pairs.map((row) => row.y).sort((a, b) => a - b));
  let bothTies = 0;
  for (let start = 0; start < pairs.length;) {
    let end = start + 1;
    while (
      end < pairs.length
      && pairs[end].x === pairs[start].x
      && pairs[end].y === pairs[start].y
    ) end += 1;
    bothTies += (end - start) * (end - start - 1) / 2;
    start = end;
  }
  const yValues = [...new Set(pairs.map((row) => row.y))].sort((a, b) => a - b);
  const yIndex = new Map(yValues.map((value, index) => [value, index + 1]));
  const tree = Array(yValues.length + 1).fill(0);
  let processed = 0;
  let discordant = 0;
  for (let start = 0; start < pairs.length;) {
    let end = start + 1;
    while (end < pairs.length && pairs[end].x === pairs[start].x) end += 1;
    for (let index = start; index < end; index += 1) {
      const rank = yIndex.get(pairs[index].y);
      discordant += processed - fenwickSumV21(tree, rank);
    }
    for (let index = start; index < end; index += 1) {
      fenwickAddV21(tree, yIndex.get(pairs[index].y), 1);
      processed += 1;
    }
    start = end;
  }
  const comparablePairs = totalPairs - xTies - yTies + bothTies;
  const concordant = comparablePairs - discordant;
  const denominator = Math.sqrt((totalPairs - xTies) * (totalPairs - yTies));
  return denominator === 0 ? 0 : (concordant - discordant) / denominator;
}

function tiePairCountV21(sortedValues) {
  let count = 0;
  for (let start = 0; start < sortedValues.length;) {
    let end = start + 1;
    while (end < sortedValues.length && sortedValues[end] === sortedValues[start]) end += 1;
    count += (end - start) * (end - start - 1) / 2;
    start = end;
  }
  return count;
}

function fenwickAddV21(tree, index, value) {
  for (let cursor = index; cursor < tree.length; cursor += cursor & -cursor) {
    tree[cursor] += value;
  }
}

function fenwickSumV21(tree, index) {
  let result = 0;
  for (let cursor = index; cursor > 0; cursor -= cursor & -cursor) {
    result += tree[cursor];
  }
  return result;
}

function ranksV21(values) {
  const ordered = values.map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value || a.index - b.index);
  const result = Array(values.length);
  for (let start = 0; start < ordered.length;) {
    let end = start + 1;
    while (end < ordered.length && ordered[end].value === ordered[start].value) end += 1;
    const rank = (start + end - 1) / 2;
    for (let index = start; index < end; index += 1) result[ordered[index].index] = rank;
    start = end;
  }
  return result;
}

function correlationV21(left, right) {
  const leftMean = averageV21(left);
  const rightMean = averageV21(right);
  let numerator = 0;
  let leftSquare = 0;
  let rightSquare = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] - leftMean;
    const rightValue = right[index] - rightMean;
    numerator += leftValue * rightValue;
    leftSquare += leftValue ** 2;
    rightSquare += rightValue ** 2;
  }
  return leftSquare && rightSquare
    ? numerator / Math.sqrt(leftSquare * rightSquare)
    : 0;
}

function averageV21(values) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function groupMapV21(rows, keyOf) {
  const groups = new Map();
  for (const row of rows) {
    const key = String(keyOf(row) ?? "");
    if (!key) throw new Error("m2_evaluation_v2_1_group_key_required");
    const values = groups.get(key) ?? [];
    values.push(row);
    groups.set(key, values);
  }
  return groups;
}

function monthDistanceV21(left, right) {
  const [leftYear, leftMonth] = left.split("-").map(Number);
  const [rightYear, rightMonth] = right.split("-").map(Number);
  return (rightYear - leftYear) * 12 + rightMonth - leftMonth;
}

function mulberry32V21(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function averagePrecisionV22(pairs) {
  const ordered = [...pairs].sort((left, right) =>
    right.probability - left.probability
    || right.actual - left.actual
  );
  const positive = ordered.reduce((sum, row) => sum + row.actual, 0);
  if (positive === 0) return null;
  let truePositive = 0;
  let falsePositive = 0;
  let previousRecall = 0;
  let area = 0;
  for (let index = 0; index < ordered.length;) {
    const probability = ordered[index].probability;
    while (
      index < ordered.length
      && ordered[index].probability === probability
    ) {
      if (ordered[index].actual) truePositive += 1;
      else falsePositive += 1;
      index += 1;
    }
    const recall = truePositive / positive;
    const precision = truePositive / (truePositive + falsePositive);
    area += (recall - previousRecall) * precision;
    previousRecall = recall;
  }
  return area;
}

function fullRankingWorkBootstrapV22(
  candidateRows,
  fallbackRows,
  fractions,
  seed,
  iterations
) {
  const fallbackByKey = new Map(
    fallbackRows.map((row) => [row.caseKey, row])
  );
  const workIds = [...new Set(
    candidateRows.map((row) => String(row.standardWorkId))
  )].sort();
  const workIndex = new Map(workIds.map((value, index) => [value, index]));
  const cells = [...groupMapV21(
    candidateRows,
    (row) => `${row.origin}|${row.horizonMonths}`
  ).entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, values]) => prepareWeightedRankingCellV22(
      key,
      [...values].sort((left, right) =>
        String(left.caseKey).localeCompare(String(right.caseKey))
      ),
      fallbackByKey,
      workIndex
    ));
  const random = mulberry32V21(seed);
  const estimates = {
    spearman: [],
    kendallTauB: [],
    topCapture: Object.fromEntries(
      fractions.map((fraction) => [String(fraction), []])
    )
  };
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const clusterWeights = new Uint32Array(workIds.length);
    for (let index = 0; index < workIds.length; index += 1) {
      clusterWeights[Math.floor(random() * workIds.length)] += 1;
    }
    const cellDifferences = [];
    for (const cell of cells) {
      const pair = weightedRankingCellPairV22(
        cell,
        clusterWeights,
        fractions
      );
      if (pair === null) continue;
      const { candidate, fallback } = pair;
      cellDifferences.push({
        spearman: candidate.spearman - fallback.spearman,
        kendallTauB: candidate.kendallTauB - fallback.kendallTauB,
        topCapture: Object.fromEntries(fractions.map((fraction) => [
          String(fraction),
          candidate.topCapture[String(fraction)]
            - fallback.topCapture[String(fraction)]
        ]))
      });
    }
    estimates.spearman.push(averageV21(
      cellDifferences.map((row) => row.spearman)
    ) ?? 0);
    estimates.kendallTauB.push(averageV21(
      cellDifferences.map((row) => row.kendallTauB)
    ) ?? 0);
    for (const fraction of fractions) {
      estimates.topCapture[String(fraction)].push(averageV21(
        cellDifferences.map((row) => row.topCapture[String(fraction)])
      ) ?? 0);
    }
  }
  const interval = (values) => {
    values.sort((left, right) => left - right);
    return {
      lower95: quantileType7(values, 0.025),
      upper95: quantileType7(values, 0.975)
    };
  };
  return {
    method:
      "full_standard_work_cluster_resample_recompute_within_cell_ranks",
    approximationFromFixedRankContributions: false,
    clusterUnit: "standardWorkId",
    clusterCount: workIds.length,
    iterations,
    seed,
    meanSpearmanDifference95: interval(estimates.spearman),
    meanKendallTauBDifference95: interval(estimates.kendallTauB),
    meanTopRevenueCaptureDifference95: Object.fromEntries(
      fractions.map((fraction) => [
        String(fraction),
        interval(estimates.topCapture[String(fraction)])
      ])
    )
  };
}

function prepareWeightedRankingCellV22(
  key,
  candidateRows,
  fallbackByKey,
  workIndex
) {
  const items = candidateRows.map((row) => ({
    caseKey: String(row.caseKey),
    workIndex: workIndex.get(String(row.standardWorkId)),
    actual: finite(row.actual, "actual"),
    candidate: finite(row.pointEstimate, "point_estimate"),
    fallback: finite(
      fallbackByKey.get(row.caseKey).pointEstimate,
      "fallback"
    )
  }));
  const order = (field, descending = false) =>
    items.map((_, index) => index).sort((left, right) => {
      const difference = items[left][field] - items[right][field];
      return (descending ? -difference : difference)
        || items[left].caseKey.localeCompare(items[right].caseKey);
    });
  return {
    key,
    items,
    actualRankGroups: rankGroupsV22(items, order("actual"), "actual"),
    candidateRankGroups: rankGroupsV22(
      items,
      order("candidate"),
      "candidate"
    ),
    fallbackRankGroups: rankGroupsV22(
      items,
      order("fallback"),
      "fallback"
    ),
    candidateKendall: prepareWeightedKendallV22(items, "candidate"),
    fallbackKendall: prepareWeightedKendallV22(items, "fallback"),
    candidateDescending: order("candidate", true),
    fallbackDescending: order("fallback", true)
  };
}

function weightedRankingCellPairV22(
  cell,
  clusterWeights,
  fractions
) {
  const weights = cell.items.map(
    (item) => clusterWeights[item.workIndex]
  );
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  if (totalWeight < 2) return null;
  const actualRanks = weightedRanksV22(
    cell.items.length,
    weights,
    cell.actualRankGroups
  );
  const score = (rankGroups, kendall, descendingOrder) => {
    const predictionRanks = weightedRanksV22(
      cell.items.length,
      weights,
      rankGroups
    );
    return {
      spearman: weightedCorrelationV22(
        actualRanks,
        predictionRanks,
        weights
      ),
      kendallTauB: weightedKendallTauPreparedV22(kendall, weights),
      topCapture: Object.fromEntries(fractions.map((fraction) => [
        String(fraction),
        weightedTopCaptureV22(
          cell.items,
          weights,
          descendingOrder,
          fraction
        )
      ]))
    };
  };
  return {
    candidate: score(
      cell.candidateRankGroups,
      cell.candidateKendall,
      cell.candidateDescending
    ),
    fallback: score(
      cell.fallbackRankGroups,
      cell.fallbackKendall,
      cell.fallbackDescending
    )
  };
}

function rankGroupsV22(items, order, field) {
  const groups = [];
  for (let start = 0; start < order.length;) {
    let end = start + 1;
    while (
      end < order.length
      && items[order[end]][field] === items[order[start]][field]
    ) end += 1;
    groups.push(order.slice(start, end));
    start = end;
  }
  return groups;
}

function weightedRanksV22(itemCount, weights, groups) {
  const ranks = Array(itemCount).fill(0);
  let offset = 0;
  for (const group of groups) {
    let groupWeight = 0;
    for (const index of group) groupWeight += weights[index];
    const rank = offset + (groupWeight - 1) / 2;
    for (const index of group) ranks[index] = rank;
    offset += groupWeight;
  }
  return ranks;
}

function prepareWeightedKendallV22(items, predictionField) {
  const ordered = items.map((_, index) => index).sort((left, right) =>
    items[left].actual - items[right].actual
    || items[left][predictionField] - items[right][predictionField]
    || items[left].caseKey.localeCompare(items[right].caseKey)
  );
  const groupAdjacent = (order, same) => {
    const groups = [];
    for (let start = 0; start < order.length;) {
      let end = start + 1;
      while (end < order.length && same(order[start], order[end])) end += 1;
      groups.push(order.slice(start, end));
      start = end;
    }
    return groups;
  };
  const yOrder = items.map((_, index) => index).sort((left, right) =>
    items[left][predictionField] - items[right][predictionField]
    || items[left].caseKey.localeCompare(items[right].caseKey)
  );
  const xGroups = groupAdjacent(
    ordered,
    (left, right) => items[left].actual === items[right].actual
  );
  const yGroups = groupAdjacent(
    yOrder,
    (left, right) =>
      items[left][predictionField] === items[right][predictionField]
  );
  const bothGroups = groupAdjacent(
    ordered,
    (left, right) =>
      items[left].actual === items[right].actual
      && items[left][predictionField] === items[right][predictionField]
  );
  const yValues = [...new Set(
    items.map((item) => item[predictionField])
  )].sort((left, right) => left - right);
  const yValueRanks = new Map(
    yValues.map((value, index) => [value, index + 1])
  );
  return {
    ordered,
    xGroups,
    yGroups,
    bothGroups,
    yRanks: items.map((item) => yValueRanks.get(item[predictionField])),
    yValueCount: yValues.length
  };
}

function weightedKendallTauPreparedV22(prepared, weights) {
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  const totalPairs = totalWeight * (totalWeight - 1) / 2;
  const tiePairs = (groups) => groups.reduce((sum, group) => {
    const weight = group.reduce(
      (groupSum, index) => groupSum + weights[index],
      0
    );
    return sum + weight * (weight - 1) / 2;
  }, 0);
  const xTies = tiePairs(prepared.xGroups);
  const yTies = tiePairs(prepared.yGroups);
  const bothTies = tiePairs(prepared.bothGroups);
  const tree = new Float64Array(prepared.yValueCount + 1);
  let processed = 0;
  let discordant = 0;
  for (const group of prepared.xGroups) {
    for (const index of group) {
      const weight = weights[index];
      if (weight === 0) continue;
      discordant += weight * (
        processed - fenwickSumV21(tree, prepared.yRanks[index])
      );
    }
    for (const index of group) {
      const weight = weights[index];
      if (weight === 0) continue;
      fenwickAddV21(tree, prepared.yRanks[index], weight);
      processed += weight;
    }
  }
  const comparablePairs = totalPairs - xTies - yTies + bothTies;
  const concordant = comparablePairs - discordant;
  const denominator = Math.sqrt(
    (totalPairs - xTies) * (totalPairs - yTies)
  );
  return denominator === 0 ? 0 : (concordant - discordant) / denominator;
}

/*
 * Top capture still walks the precomputed prediction order because bootstrap
 * weights change the effective number of copies selected at the cutoff.
 */
function weightedTopCaptureV22(items, weights, order, fraction) {
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  const count = Math.max(1, Math.ceil(totalWeight * fraction));
  const actualTotal = items.reduce(
    (sum, item, index) =>
      sum + weights[index] * Math.max(0, item.actual),
    0
  );
  if (actualTotal === 0) return 0;
  let remaining = count;
  let captured = 0;
  for (const index of order) {
    const copies = Math.min(remaining, weights[index]);
    captured += copies * Math.max(0, items[index].actual);
    remaining -= copies;
    if (remaining === 0) break;
  }
  return captured / actualTotal;
}

function weightedCorrelationV22(left, right, weights) {
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  if (weightTotal === 0) return 0;
  const leftMean = left.reduce(
    (sum, value, index) => sum + value * weights[index],
    0
  ) / weightTotal;
  const rightMean = right.reduce(
    (sum, value, index) => sum + value * weights[index],
    0
  ) / weightTotal;
  let numerator = 0;
  let leftSquare = 0;
  let rightSquare = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] - leftMean;
    const rightValue = right[index] - rightMean;
    numerator += weights[index] * leftValue * rightValue;
    leftSquare += weights[index] * leftValue ** 2;
    rightSquare += weights[index] * rightValue ** 2;
  }
  return leftSquare && rightSquare
    ? numerator / Math.sqrt(leftSquare * rightSquare)
    : 0;
}

function summarizeRankingByOriginV22(byOriginHorizon) {
  const origins = new Map();
  for (const [key, value] of Object.entries(byOriginHorizon)) {
    const origin = key.split("|")[0];
    const rows = origins.get(origin) ?? [];
    rows.push(value);
    origins.set(origin, rows);
  }
  return Object.fromEntries([...origins.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([origin, values]) => [origin, {
      status: "DESCRIPTIVE_ONLY_NOT_INDEPENDENT_INTERVAL",
      cellCount: values.length,
      meanSpearmanDifference: averageV21(
        values.map((row) => row.spearman)
      ),
      meanKendallTauBDifference: averageV21(
        values.map((row) => row.kendallTauB)
      )
    }]));
}

function leaveOneOriginOutV22(candidateRows, fallbackRows) {
  const origins = [...new Set(candidateRows.map((row) => row.origin))].sort();
  if (origins.length < 2) {
    return {
      status: "NOT_COMPUTABLE_INSUFFICIENT_ORIGINS",
      originCount: origins.length,
      estimates: []
    };
  }
  return {
    status: "DESCRIPTIVE_SENSITIVITY_ONLY",
    originCount: origins.length,
    estimates: origins.map((omittedOrigin) => {
      const candidate = candidateRows.filter(
        (row) => row.origin !== omittedOrigin
      );
      const fallback = fallbackRows.filter(
        (row) => row.origin !== omittedOrigin
      );
      return {
        omittedOrigin,
        absoluteWapeFva: scorePairedPointRowsV2(
          candidate,
          fallback
        ).absoluteWapeFva
      };
    })
  };
}

function attributionMeasureV22(rows, fractions, measure, options) {
  const withinCells = {};
  for (const [key, values] of [...groupMapV21(
    rows,
    (row) => `${row.origin}|${row.horizonMonths}`
  )].sort(([left], [right]) => left.localeCompare(right))) {
    const privacy = privacyStatusV21(values, options);
    withinCells[key] = privacy.status === "PUBLIC"
      ? measureSharesV22(values.map((row) => ({
        magnitude: measure(row),
        absoluteError: Math.abs(
          finite(row.pointEstimate, "point_estimate")
            - finite(row.actual, "actual")
        ),
        stableKey: String(row.caseKey)
      })), fractions)
      : privacy;
  }
  const works = new Map();
  for (const row of rows) {
    const key = String(row.standardWorkId);
    const value = works.get(key) ?? { magnitude: 0, absoluteError: 0 };
    value.magnitude += measure(row);
    value.absoluteError += Math.abs(
      finite(row.pointEstimate, "point_estimate")
        - finite(row.actual, "actual")
    );
    works.set(key, value);
  }
  return {
    caseLevelWithinOriginHorizon: withinCells,
    workLevelGlobal: works.size < (options.minimumWorkCount ?? 20)
      ? {
        status: "SUPPRESSED_PRIVACY_THRESHOLD",
        workCount: works.size,
        minimumWorkCount: options.minimumWorkCount ?? 20
      }
      : measureSharesV22([...works].map(([stableKey, value]) => ({
        stableKey,
        ...value
      })), fractions)
  };
}

function measureSharesV22(rows, fractions) {
  const ordered = [...rows].sort((left, right) =>
    right.magnitude - left.magnitude
    || left.stableKey.localeCompare(right.stableKey)
  );
  const magnitudeTotal = ordered.reduce(
    (sum, row) => sum + row.magnitude,
    0
  );
  const errorTotal = ordered.reduce(
    (sum, row) => sum + row.absoluteError,
    0
  );
  return Object.fromEntries(fractions.map((fraction) => {
    const count = Math.max(1, Math.ceil(ordered.length * fraction));
    const top = ordered.slice(0, count);
    const topMagnitude = top.reduce(
      (sum, row) => sum + row.magnitude,
      0
    );
    const topError = top.reduce(
      (sum, row) => sum + row.absoluteError,
      0
    );
    return [String(fraction), {
      itemCount: count,
      magnitudeShare: magnitudeTotal === 0
        ? null
        : topMagnitude / magnitudeTotal,
      absoluteErrorShare: errorTotal === 0 ? null : topError / errorTotal,
      denominatorStatus: magnitudeTotal === 0
        ? "UNDEFINED_ZERO_ACTUAL_DENOMINATOR"
        : "DEFINED"
    }];
  }));
}

function requireRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("m2_evaluation_v2_rows_required");
  }
}

function finite(value, name) {
  const number = Number(value);
  if (value === null || value === undefined || value === "" || !Number.isFinite(number)) {
    throw new Error(`m2_evaluation_v2_${name}_invalid`);
  }
  return number;
}
