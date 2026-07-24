export function scoreM2CurrentPointRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("m2_current_score_rows_required");
  }
  let absoluteError = 0;
  let signedError = 0;
  let actualDenominator = 0;
  for (const row of rows) {
    const actual = finite(row?.actual, "actual");
    const pointEstimate = finite(row?.pointEstimate, "point_estimate");
    absoluteError += Math.abs(pointEstimate - actual);
    signedError += pointEstimate - actual;
    actualDenominator += Math.abs(actual);
  }
  if (actualDenominator === 0) {
    throw new Error("m2_current_actual_denominator_zero");
  }
  return {
    caseCount: rows.length,
    wape: absoluteError / actualDenominator,
    signedBias: signedError / actualDenominator,
    zeroImputationUsed: false
  };
}

export function scoreM2CurrentEvaluationRows(rows) {
  const point = scoreM2CurrentPointRows(rows);
  let squaredError = 0;
  let absoluteScaledError = 0;
  let squaredScaledError = 0;
  let scaledRowCount = 0;
  let occurrenceBrier = 0;
  let occurrenceRowCount = 0;
  const positiveRows = [];
  for (const row of rows) {
    const actual = finite(row?.actual, "actual");
    const pointEstimate = finite(row?.pointEstimate, "point_estimate");
    const error = pointEstimate - actual;
    squaredError += error ** 2;
    const scaleAbsoluteError = optionalPositive(
      row?.scaleAbsoluteError,
      "scale_absolute_error"
    );
    const scaleSquaredError = optionalPositive(
      row?.scaleSquaredError,
      "scale_squared_error"
    );
    if (scaleAbsoluteError !== null && scaleSquaredError !== null) {
      absoluteScaledError += Math.abs(error) / scaleAbsoluteError;
      squaredScaledError += error ** 2 / scaleSquaredError;
      scaledRowCount += 1;
    }
    if (row?.occurrenceProbability !== undefined) {
      const probability = probabilityValue(row.occurrenceProbability);
      occurrenceBrier += (probability - (actual > 0 ? 1 : 0)) ** 2;
      occurrenceRowCount += 1;
    }
    if (actual > 0) {
      positiveRows.push(row);
    }
  }
  const positive = positiveRows.length > 0
    ? scoreM2CurrentPointRows(positiveRows)
    : null;
  return {
    ...point,
    mae: rows.reduce(
      (sum, row) => sum + Math.abs(Number(row.pointEstimate) - Number(row.actual)),
      0
    ) / rows.length,
    rmse: Math.sqrt(squaredError / rows.length),
    mase: scaledRowCount > 0
      ? absoluteScaledError / scaledRowCount
      : null,
    rmsse: scaledRowCount > 0
      ? Math.sqrt(squaredScaledError / scaledRowCount)
      : null,
    scaledMetricCoverage: scaledRowCount / rows.length,
    cashOccurrence: {
      positiveCaseCount: positiveRows.length,
      zeroOrNegativeCaseCount: rows.length - positiveRows.length,
      observedRate: positiveRows.length / rows.length,
      probabilityCaseCount: occurrenceRowCount,
      brier: occurrenceRowCount > 0
        ? occurrenceBrier / occurrenceRowCount
        : null
    },
    positiveAmount: positive === null
      ? {
        caseCount: 0,
        wape: null,
        signedBias: null
      }
      : {
        caseCount: positive.caseCount,
        wape: positive.wape,
        signedBias: positive.signedBias
      }
  };
}

export function scoreM2CurrentProbabilisticRows(
  rows,
  probabilities = [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95]
) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("m2_current_probabilistic_rows_required");
  }
  const levels = validateProbabilities(probabilities);
  if (!levels.includes(0.5)) {
    throw new Error("m2_current_probabilistic_median_required");
  }
  const intervalAlphas = levels
    .filter((probability) => probability < 0.5)
    .map((probability) => 2 * probability)
    .filter((alpha) => levels.includes(1 - alpha / 2));
  if (intervalAlphas.length === 0) {
    throw new Error("m2_current_probabilistic_interval_required");
  }
  let quantileScoreTotal = 0;
  let wisTotal = 0;
  const intervalCoverage = Object.fromEntries(
    intervalAlphas.map((alpha) => [intervalId(alpha), 0])
  );
  for (const row of rows) {
    const actual = finite(row?.actual, "actual");
    const quantiles = validateQuantiles(row?.quantiles, levels);
    for (const probability of levels) {
      quantileScoreTotal += pinballLoss(
        actual,
        quantiles[String(probability)],
        probability
      );
    }
    let weighted = 0.5 * Math.abs(actual - quantiles["0.5"]);
    for (const alpha of intervalAlphas) {
      const lower = quantiles[String(alpha / 2)];
      const upper = quantiles[String(1 - alpha / 2)];
      weighted += alpha / 2 * intervalScore(actual, lower, upper, alpha);
      if (actual >= lower && actual <= upper) {
        intervalCoverage[intervalId(alpha)] += 1;
      }
    }
    wisTotal += weighted / (intervalAlphas.length + 0.5);
  }
  return {
    caseCount: rows.length,
    wis: wisTotal / rows.length,
    crpsApproximation:
      2 * quantileScoreTotal / (rows.length * levels.length),
    meanQuantileScore:
      quantileScoreTotal / (rows.length * levels.length),
    quantileProbabilities: levels,
    intervalCoverage: Object.fromEntries(
      intervalAlphas.map((alpha) => {
        const key = intervalId(alpha);
        return [key, {
          nominal: 1 - alpha,
          observed: intervalCoverage[key] / rows.length,
          absoluteCalibrationError: Math.abs(
            intervalCoverage[key] / rows.length - (1 - alpha)
          )
        }];
      })
    )
  };
}

export function scoreM2CurrentProbabilisticSlices(
  rows,
  field,
  probabilities
) {
  const groups = groupRows(rows, field);
  return Object.fromEntries(
    [...groups].sort(([a], [b]) => a.localeCompare(b))
      .map(([key, values]) => [
        key,
        scoreM2CurrentProbabilisticRows(values, probabilities)
      ])
  );
}

export function scoreM2CurrentSlices(rows, field) {
  const groups = new Map();
  for (const row of rows) {
    const key = String(row?.[field] ?? "");
    if (key === "") {
      throw new Error(`m2_current_slice_${field}_missing`);
    }
    const values = groups.get(key) ?? [];
    values.push(row);
    groups.set(key, values);
  }
  return Object.fromEntries(
    [...groups].sort(([a], [b]) => a.localeCompare(b))
      .map(([key, values]) => [key, scoreM2CurrentPointRows(values)])
  );
}

export function scoreM2CurrentEvaluationSlices(rows, field) {
  const groups = groupRows(rows, field);
  return Object.fromEntries(
    [...groups].sort(([a], [b]) => a.localeCompare(b))
      .map(([key, values]) => [key, scoreM2CurrentEvaluationRows(values)])
  );
}

function groupRows(rows, field) {
  const groups = new Map();
  for (const row of rows) {
    const key = String(row?.[field] ?? "");
    if (key === "") {
      throw new Error(`m2_current_slice_${field}_missing`);
    }
    const values = groups.get(key) ?? [];
    values.push(row);
    groups.set(key, values);
  }
  return groups;
}

function validateProbabilities(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("m2_current_quantile_probabilities_required");
  }
  const result = values.map((value) => probabilityValue(value))
    .sort((a, b) => a - b);
  if (new Set(result).size !== result.length) {
    throw new Error("m2_current_quantile_probabilities_duplicate");
  }
  return result;
}

function validateQuantiles(value, probabilities) {
  if (value === null || typeof value !== "object") {
    throw new Error("m2_current_quantiles_required");
  }
  const result = {};
  let previous = -Infinity;
  for (const probability of probabilities) {
    const quantile = finite(value[String(probability)], "quantile");
    if (quantile < previous) {
      throw new Error("m2_current_quantiles_not_monotone");
    }
    result[String(probability)] = quantile;
    previous = quantile;
  }
  return result;
}

function pinballLoss(actual, quantile, probability) {
  const error = actual - quantile;
  return error >= 0
    ? probability * error
    : (1 - probability) * -error;
}

function intervalScore(actual, lower, upper, alpha) {
  return upper - lower
    + (actual < lower ? 2 / alpha * (lower - actual) : 0)
    + (actual > upper ? 2 / alpha * (actual - upper) : 0);
}

function intervalId(alpha) {
  return `central_${Math.round((1 - alpha) * 100)}`;
}

function optionalPositive(value, name) {
  if (value === null || value === undefined) {
    return null;
  }
  const number = finite(value, name);
  return number > 0 ? number : null;
}

function probabilityValue(value) {
  const number = finite(value, "occurrence_probability");
  if (number < 0 || number > 1) {
    throw new Error("m2_current_occurrence_probability_invalid");
  }
  return number;
}

function finite(value, name) {
  if (value === null || value === undefined || value === "") {
    throw new Error(`m2_current_${name}_invalid`);
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`m2_current_${name}_invalid`);
  }
  return number;
}
