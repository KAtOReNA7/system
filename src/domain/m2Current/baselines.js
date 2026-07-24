import {
  scoreM2CurrentEvaluationRows,
  scoreM2CurrentEvaluationSlices
} from "./metrics.js";
import { resolveM2CurrentCashRoute } from "./route.js";

const BASELINE_IDS = Object.freeze([
  "zero",
  "seasonal_naive",
  "SBA",
  "TSB",
  "ADIDA"
]);

export function buildM2CurrentAutomatedBaselineEvaluation(
  caseRows,
  historyRows,
  contract
) {
  if (!Array.isArray(caseRows) || caseRows.length === 0) {
    throw new Error("m2_current_baseline_case_rows_required");
  }
  const history = buildHistoryIndex(historyRows);
  const baselineIds = contract?.evaluationPolicy?.automatedComparators
    ?.filter((id) => BASELINE_IDS.includes(id)) ?? [];
  if (baselineIds.length !== BASELINE_IDS.length) {
    throw new Error("m2_current_required_baselines_missing");
  }
  const rowsByBaseline = Object.fromEntries(
    baselineIds.map((id) => [id, []])
  );
  const abstentions = [];
  for (const row of caseRows) {
    const route = resolveM2CurrentCashRoute({
      route: row.route,
      revenueModel: row.revenueModel,
      origin: row.origin,
      commitment: row.commitment
    });
    if (!route.served || route.abstained) {
      abstentions.push({
        reason: route.abstentionReason,
        route: route.route
      });
      continue;
    }
    const series = historySeries(history, row.standardWorkId, row.origin);
    const scale = scalingErrors(series);
    const forecasts = forecastBaselines(series, row.horizonMonths);
    for (const baselineId of baselineIds) {
      const forecast = forecasts[baselineId];
      rowsByBaseline[baselineId].push({
        ...row,
        pointEstimate: forecast.pointEstimate + route.commitmentAmount,
        occurrenceProbability: forecast.occurrenceProbability,
        scaleAbsoluteError: scale.absolute,
        scaleSquaredError: scale.squared
      });
    }
  }
  if (Object.values(rowsByBaseline).some((rows) => rows.length === 0)) {
    throw new Error("m2_current_baseline_scored_population_empty");
  }
  return {
    schema: "m2.current.automated_baseline_evaluation.v0.1",
    rollingOrigin: {
      required: true,
      historyCutoffInclusive: true,
      futureActualUsedForPrediction: false,
      originCount: new Set(caseRows.map((row) => row.origin)).size
    },
    baselines: Object.fromEntries(
      baselineIds.map((baselineId) => {
        const rows = rowsByBaseline[baselineId];
        return [baselineId, {
          overall: scoreM2CurrentEvaluationRows(rows),
          byHorizon: scoreM2CurrentEvaluationSlices(rows, "horizonMonths"),
          bySegment: scoreM2CurrentEvaluationSlices(rows, "segment"),
          byRoute: scoreM2CurrentEvaluationSlices(rows, "route")
        }];
      })
    ),
    routePolicy: {
      scoredCaseCount: rowsByBaseline[baselineIds[0]].length,
      abstainedCaseCount: abstentions.length,
      abstentionReasons: countBy(abstentions, (row) => row.reason),
      pureBuyoutWithoutCutoffCommitment:
        "null_abstain_not_zero_not_monthly_equivalent"
    }
  };
}

export function attachM2CurrentScaleAndOccurrence(
  rows,
  historyRows,
  occurrenceProbability
) {
  const history = buildHistoryIndex(historyRows);
  return rows.map((row) => {
    const series = historySeries(history, row.standardWorkId, row.origin);
    const scale = scalingErrors(series);
    return {
      ...row,
      scaleAbsoluteError: scale.absolute,
      scaleSquaredError: scale.squared,
      occurrenceProbability: occurrenceProbability(row)
    };
  });
}

function buildHistoryIndex(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("m2_current_history_rows_required");
  }
  const byWork = new Map();
  let firstMonth = null;
  for (const row of rows) {
    const standardWorkId = String(row?.standardWorkId ?? "").trim();
    const month = normalizeMonth(row?.month);
    const amount = finite(row?.amount, "history_amount");
    if (standardWorkId === "") {
      throw new Error("m2_current_history_work_id_required");
    }
    firstMonth = firstMonth === null || month < firstMonth
      ? month
      : firstMonth;
    const monthly = byWork.get(standardWorkId) ?? new Map();
    monthly.set(month, (monthly.get(month) ?? 0) + amount);
    byWork.set(standardWorkId, monthly);
  }
  return { byWork, firstMonth };
}

function historySeries(history, standardWorkId, origin) {
  const cutoff = normalizeMonth(origin);
  if (history.firstMonth > cutoff) {
    throw new Error("m2_current_history_starts_after_origin");
  }
  const monthly = history.byWork.get(String(standardWorkId)) ?? new Map();
  const values = [];
  for (
    let month = history.firstMonth;
    month <= cutoff;
    month = addMonths(month, 1)
  ) {
    values.push(Number(monthly.get(month) ?? 0));
  }
  return values;
}

function forecastBaselines(series, horizonMonths) {
  const horizon = positiveInteger(horizonMonths, "baseline_horizon");
  const nonnegative = series.map((value) => Math.max(0, value));
  const seasonal = Array.from({ length: horizon }, (_, index) => {
    const seasonalIndex = (
      nonnegative.length - 12 + (index % 12)
    );
    return seasonalIndex >= 0 ? nonnegative[seasonalIndex] : 0;
  }).reduce((sum, value) => sum + value, 0);
  const sba = crostonSba(nonnegative);
  const tsb = teunterSyntetosBabai(nonnegative);
  const adida = aggregateDisaggregate(nonnegative);
  return {
    zero: {
      pointEstimate: 0,
      occurrenceProbability: 0
    },
    seasonal_naive: {
      pointEstimate: seasonal,
      occurrenceProbability: seasonal > 0 ? 1 : 0
    },
    SBA: {
      pointEstimate: sba.rate * horizon,
      occurrenceProbability: sba.occurrenceProbability
    },
    TSB: {
      pointEstimate: tsb.rate * horizon,
      occurrenceProbability: tsb.occurrenceProbability
    },
    ADIDA: {
      pointEstimate: adida.rate * horizon,
      occurrenceProbability: adida.occurrenceProbability
    }
  };
}

function crostonSba(series, alpha = 0.1) {
  let size = 0;
  let interval = 0;
  let elapsed = 0;
  let initialized = false;
  let positiveCount = 0;
  for (const value of series) {
    elapsed += 1;
    if (value <= 0) {
      continue;
    }
    positiveCount += 1;
    if (!initialized) {
      size = value;
      interval = elapsed;
      initialized = true;
    } else {
      size += alpha * (value - size);
      interval += alpha * (elapsed - interval);
    }
    elapsed = 0;
  }
  return {
    rate: initialized ? (1 - alpha / 2) * size / interval : 0,
    occurrenceProbability: series.length > 0
      ? positiveCount / series.length
      : 0
  };
}

function teunterSyntetosBabai(series, alpha = 0.1, beta = 0.1) {
  const positives = series.filter((value) => value > 0);
  if (positives.length === 0) {
    return { rate: 0, occurrenceProbability: 0 };
  }
  let probability = positives.length / series.length;
  let size = positives[0];
  for (const value of series) {
    const occurrence = value > 0 ? 1 : 0;
    probability += beta * (occurrence - probability);
    if (occurrence === 1) {
      size += alpha * (value - size);
    }
  }
  return {
    rate: Math.max(0, probability * size),
    occurrenceProbability: clamp(probability, 0, 1)
  };
}

function aggregateDisaggregate(series, alpha = 0.1) {
  const positiveIndexes = series
    .map((value, index) => value > 0 ? index : null)
    .filter((value) => value !== null);
  if (positiveIndexes.length === 0) {
    return { rate: 0, occurrenceProbability: 0 };
  }
  const gaps = positiveIndexes.slice(1).map(
    (value, index) => value - positiveIndexes[index]
  );
  const interval = Math.max(1, Math.round(
    gaps.length > 0
      ? gaps.reduce((sum, value) => sum + value, 0) / gaps.length
      : series.length / positiveIndexes.length
  ));
  const aggregated = [];
  for (let index = 0; index < series.length; index += interval) {
    aggregated.push(
      series.slice(index, index + interval)
        .reduce((sum, value) => sum + value, 0)
    );
  }
  let level = aggregated[0];
  for (const value of aggregated.slice(1)) {
    level += alpha * (value - level);
  }
  return {
    rate: Math.max(0, level / interval),
    occurrenceProbability: positiveIndexes.length / series.length
  };
}

function scalingErrors(series) {
  const seasonal = scalingErrorsForLag(series, series.length >= 24 ? 12 : 1);
  return seasonal.absolute !== null
    ? seasonal
    : scalingErrorsForLag(series, 1);
}

function scalingErrorsForLag(series, lag) {
  let absolute = 0;
  let squared = 0;
  let count = 0;
  for (let index = lag; index < series.length; index += 1) {
    const difference = series[index] - series[index - lag];
    absolute += Math.abs(difference);
    squared += difference ** 2;
    count += 1;
  }
  return {
    absolute: count > 0 && absolute > 0 ? absolute / count : null,
    squared: count > 0 && squared > 0 ? squared / count : null
  };
}

function countBy(rows, selector) {
  const counts = {};
  for (const row of rows) {
    const key = selector(row);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))
  );
}

function normalizeMonth(value) {
  const month = String(value ?? "").slice(0, 7);
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/u.test(month)) {
    throw new Error("m2_current_history_month_invalid");
  }
  return month;
}

function addMonths(value, count) {
  const [year, month] = value.split("-").map(Number);
  const ordinal = year * 12 + month - 1 + count;
  return `${Math.floor(ordinal / 12)}-${String(
    ordinal % 12 + 1
  ).padStart(2, "0")}`;
}

function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`m2_current_${name}_invalid`);
  }
  return number;
}

function finite(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`m2_current_${name}_invalid`);
  }
  return number;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
