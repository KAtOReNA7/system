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
