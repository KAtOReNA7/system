import {
  scoreM2CurrentProbabilisticRows,
  scoreM2CurrentProbabilisticSlices
} from "./metrics.js";

export function attachM2CurrentConformalQuantiles(
  rows,
  { probabilities, minimumCalibrationRows }
) {
  const levels = validateProbabilities(probabilities);
  const minimum = positiveInteger(
    minimumCalibrationRows,
    "conformal_minimum_calibration_rows"
  );
  const origins = [...new Set(rows.map((row) => row.origin))].sort();
  const output = [];
  const calibration = [];
  for (const origin of origins) {
    const earlier = rows.filter((row) => (
      row.origin < origin && row.labelAvailableAsOf <= origin
    ));
    const bySegmentHorizon = residualIndex(
      earlier,
      (row) => `${row.segment}|${row.horizonMonths}`
    );
    const bySegment = residualIndex(earlier, (row) => row.segment);
    const globalResiduals = residualValues(earlier);
    for (const row of rows.filter((entry) => entry.origin === origin)) {
      const pools = [
        bySegmentHorizon.get(`${row.segment}|${row.horizonMonths}`) ?? [],
        bySegment.get(row.segment) ?? [],
        globalResiduals
      ];
      const selected = pools.find((pool) => pool.length >= minimum) ?? null;
      const residuals = selected ?? [];
      const quantiles = residuals.length > 0
        ? conformalQuantiles(row.pointEstimate, residuals, levels)
        : coldStartQuantiles(row.pointEstimate, levels);
      output.push({
        ...row,
        quantiles,
        conformalCalibrationRowCount: residuals.length,
        conformalCalibrationScope: selected === pools[0]
          ? "segment_horizon"
          : selected === pools[1]
            ? "segment"
            : selected === pools[2]
              ? "global"
              : "cold_start_uncalibrated"
      });
    }
    calibration.push({
      outerOrigin: origin,
      matureEarlierCaseCount: earlier.length,
      sameOrLaterOuterTruthRead: false
    });
  }
  return {
    rows: output,
    calibration,
    overall: scoreM2CurrentProbabilisticRows(output, levels),
    byHorizon: scoreM2CurrentProbabilisticSlices(
      output,
      "horizonMonths",
      levels
    ),
    bySegment: scoreM2CurrentProbabilisticSlices(
      output,
      "segment",
      levels
    )
  };
}

function residualIndex(rows, selector) {
  const index = new Map();
  for (const row of rows) {
    const key = selector(row);
    const values = index.get(key) ?? [];
    values.push(Number(row.actual) - Number(row.pointEstimate));
    index.set(key, values);
  }
  for (const values of index.values()) {
    values.sort((a, b) => a - b);
  }
  return index;
}

function residualValues(rows) {
  return rows.map(
    (row) => Number(row.actual) - Number(row.pointEstimate)
  ).sort((a, b) => a - b);
}

function conformalQuantiles(pointEstimate, residuals, probabilities) {
  const raw = probabilities.map((probability) => Math.max(
    0,
    Number(pointEstimate) + empiricalQuantile(residuals, probability)
  ));
  return monotoneQuantileObject(raw, probabilities);
}

function coldStartQuantiles(pointEstimate, probabilities) {
  const point = Math.max(0, Number(pointEstimate));
  const raw = probabilities.map((probability) => {
    if (probability === 0.5) {
      return point;
    }
    return probability < 0.5
      ? point * probability / 0.5
      : point * (1 + (probability - 0.5) / 0.5);
  });
  return monotoneQuantileObject(raw, probabilities);
}

function monotoneQuantileObject(values, probabilities) {
  let previous = 0;
  return Object.fromEntries(values.map((value, index) => {
    const current = Math.max(previous, value);
    previous = current;
    return [String(probabilities[index]), current];
  }));
}

function empiricalQuantile(sorted, probability) {
  if (sorted.length === 1) {
    return sorted[0];
  }
  const position = probability * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function validateProbabilities(values) {
  if (!Array.isArray(values) || values.length < 3) {
    throw new Error("m2_current_conformal_probabilities_required");
  }
  const levels = values.map(Number).sort((a, b) => a - b);
  if (
    levels.some((value) => !Number.isFinite(value) || value <= 0 || value >= 1)
    || new Set(levels).size !== levels.length
    || !levels.includes(0.5)
  ) {
    throw new Error("m2_current_conformal_probabilities_invalid");
  }
  return levels;
}

function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`m2_current_${name}_invalid`);
  }
  return number;
}
