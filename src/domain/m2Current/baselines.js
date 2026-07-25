import {
  scoreM2CurrentEvaluationRows,
  scoreM2CurrentEvaluationSlices
} from "./metrics.js";
import {
  resolveM2CurrentCashRoute,
  resolveM2CurrentSalesShareRoute
} from "./route.js";

const BASELINE_IDS = Object.freeze([
  "zero",
  "seasonal_naive",
  "Croston",
  "SBA",
  "TSB",
  "ADIDA"
]);

const HISTORY_REGIME_BASELINE_IDS = Object.freeze([
  ...BASELINE_IDS,
  "recent_mean_3",
  "seasonal_median_2",
  "ewma_0_5"
]);

export function buildM2CurrentAutomatedBaselineEvaluation(
  caseRows,
  historyRows,
  contract
) {
  if (!Array.isArray(caseRows) || caseRows.length === 0) {
    throw new Error("m2_current_baseline_case_rows_required");
  }
  const history = buildM2CurrentHistoryIndex(historyRows);
  const requestedBaselineIds =
    contract?.evaluationPolicy?.automatedComparators ?? [];
  const baselineIds = requestedBaselineIds.filter(
    (id) => BASELINE_IDS.includes(id)
  );
  if (
    baselineIds.length !== requestedBaselineIds.length
    || baselineIds.length === 0
  ) {
    throw new Error("m2_current_required_baselines_missing");
  }
  const rowsByBaseline = Object.fromEntries(
    baselineIds.map((id) => [id, []])
  );
  const abstentions = [];
  for (const row of caseRows) {
    const resolveRoute = contract.schema === "m2.current.config.v0.6"
      ? resolveM2CurrentSalesShareRoute
      : resolveM2CurrentCashRoute;
    const route = resolveRoute({
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
    const series = Array.isArray(row.historySeries)
      ? validateHistorySeries(row.historySeries)
      : getM2CurrentHistorySeries(history, row.standardWorkId, row.origin);
    const scale = scalingErrors(series);
    const forecasts = forecastBaselines(series, row.horizonMonths);
    for (const baselineId of baselineIds) {
      const forecast = forecasts[baselineId];
      rowsByBaseline[baselineId].push({
        ...row,
        pointEstimate:
          forecast.pointEstimate + (route.commitmentAmount ?? 0),
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
    rowsByBaseline,
    routePolicy: {
      scoredCaseCount: rowsByBaseline[baselineIds[0]].length,
      abstainedCaseCount: abstentions.length,
      abstentionReasons: countBy(abstentions, (row) => row.reason),
      pureBuyoutWithoutCutoffCommitment:
        "null_abstain_not_zero_not_monthly_equivalent"
    }
  };
}

export function buildM2CurrentRollingBaselineChampion(
  rowsByBaseline,
  { minimumTrainingRows = 80 } = {}
) {
  const baselineIds = Object.keys(rowsByBaseline).sort();
  if (
    baselineIds.length === 0
    || baselineIds.some((id) => !Array.isArray(rowsByBaseline[id]))
  ) {
    throw new Error("m2_current_baseline_champion_rows_required");
  }
  const origins = [...new Set(
    rowsByBaseline[baselineIds[0]].map((row) => row.origin)
  )].sort();
  const rows = [];
  const selections = [];
  for (const origin of origins) {
    const candidates = baselineIds.map((baselineId) => {
      const training = rowsByBaseline[baselineId].filter((row) => (
        row.origin < origin && row.labelAvailableAsOf <= origin
      ));
      return {
        baselineId,
        training,
        metrics: training.length >= minimumTrainingRows
          ? safePointScore(training)
          : null
      };
    }).filter((entry) => entry.metrics !== null).sort((a, b) => (
      a.metrics.wape - b.metrics.wape
      || Math.abs(a.metrics.signedBias) - Math.abs(b.metrics.signedBias)
      || a.baselineId.localeCompare(b.baselineId)
    ));
    const selected = candidates[0] ?? {
      baselineId: "zero",
      training: [],
      metrics: null
    };
    const outer = rowsByBaseline[selected.baselineId].filter(
      (row) => row.origin === origin
    );
    rows.push(...outer.map((row) => ({
      ...row,
      selectedBaselineId: selected.baselineId
    })));
    selections.push({
      outerOrigin: origin,
      selectedBaselineId: selected.baselineId,
      matureEarlierCaseCount: selected.training.length,
      trainingMetrics: selected.metrics,
      sameOrLaterOuterTruthRead: false
    });
  }
  return {
    rows,
    selections,
    overall: scoreM2CurrentEvaluationRows(rows),
    byOrigin: scoreM2CurrentEvaluationSlices(rows, "origin"),
    bySegment: scoreM2CurrentEvaluationSlices(rows, "segment")
  };
}

export function buildM2CurrentHistoryRegimeChallenger(
  rowsByBaseline,
  {
    minimumTrainingRows = 80,
    trainingOriginWindow = 6
  } = {}
) {
  const minimumRows = positiveInteger(
    minimumTrainingRows,
    "history_regime_minimum_training_rows"
  );
  const originWindow = positiveInteger(
    trainingOriginWindow,
    "history_regime_training_origin_window"
  );
  const existingBaselineIds = Object.keys(rowsByBaseline ?? {}).sort();
  if (
    BASELINE_IDS.some((id) => !existingBaselineIds.includes(id))
    || existingBaselineIds.some(
      (id) => !Array.isArray(rowsByBaseline[id])
    )
  ) {
    throw new Error("m2_current_history_regime_baseline_rows_required");
  }
  const templateRows = rowsByBaseline.zero;
  if (
    templateRows.length === 0
    || templateRows.some(
      (row) => !Array.isArray(row.historySeries)
        || row.historySeries.length === 0
    )
  ) {
    throw new Error("m2_current_history_regime_history_series_required");
  }
  assertAlignedBaselineRows(rowsByBaseline, templateRows);
  const candidateRows = {
    ...Object.fromEntries(
      BASELINE_IDS.map((id) => [id, rowsByBaseline[id]])
    ),
    recent_mean_3: templateRows.map((row) => historyForecastRow(
      row,
      recentMeanForecast(row.historySeries, row.horizonMonths, 3)
    )),
    seasonal_median_2: templateRows.map((row) => historyForecastRow(
      row,
      seasonalMedianForecast(row.historySeries, row.horizonMonths, 2)
    )),
    ewma_0_5: templateRows.map((row) => historyForecastRow(
      row,
      ewmaForecast(row.historySeries, row.horizonMonths, 0.5)
    ))
  };
  const origins = [...new Set(templateRows.map((row) => row.origin))].sort();
  const groupers = [
    {
      level: "segment_horizon_trailing_occurrence",
      group: (row) => [
        row.segment,
        row.horizonMonths,
        trailingOccurrenceBucket(row.historySeries)
      ].join("|")
    },
    {
      level: "segment_horizon",
      group: (row) => [row.segment, row.horizonMonths].join("|")
    },
    {
      level: "segment",
      group: (row) => String(row.segment)
    },
    {
      level: "global",
      group: () => "all"
    }
  ];
  const rows = [];
  const selections = [];
  for (const origin of origins) {
    const matureOrigins = [...new Set(
      templateRows.filter((row) => (
        row.origin < origin && row.labelAvailableAsOf <= origin
      )).map((row) => row.origin)
    )].sort().slice(-originWindow);
    const allowedTrainingOrigins = new Set(matureOrigins);
    const selectionTables = groupers.map(({ group }) => (
      buildHistoryRegimeSelectionTable(
        candidateRows,
        origin,
        allowedTrainingOrigins,
        group,
        minimumRows
      )
    ));
    const summary = {
      outerOrigin: origin,
      matureTrainingOriginCount: matureOrigins.length,
      earliestMatureTrainingOrigin: matureOrigins[0] ?? null,
      latestMatureTrainingOrigin:
        matureOrigins[matureOrigins.length - 1] ?? null,
      selectedCaseCount: 0,
      fallbackCaseCount: 0,
      selectedBaselineCounts: {},
      selectionLevelCounts: {},
      sameOrLaterOuterTruthRead: false
    };
    for (let index = 0; index < templateRows.length; index += 1) {
      const row = templateRows[index];
      if (row.origin !== origin) {
        continue;
      }
      let selected = null;
      let selectedLevel = "no_mature_training_fallback";
      for (
        let levelIndex = 0;
        levelIndex < groupers.length && selected === null;
        levelIndex += 1
      ) {
        const grouper = groupers[levelIndex];
        selected = selectionTables[levelIndex]
          .get(grouper.group(row))?.[0] ?? null;
        if (selected !== null) {
          selectedLevel = grouper.level;
        }
      }
      const selectedBaselineId = selected?.baselineId ?? "zero";
      rows.push({
        ...candidateRows[selectedBaselineId][index],
        selectedBaselineId,
        selectionLevel: selectedLevel,
        trainingCaseCount: selected?.caseCount ?? 0,
        trainingWape: selected?.wape ?? null,
        trainingSignedBias: selected?.signedBias ?? null
      });
      summary.selectedCaseCount += 1;
      if (selected === null) {
        summary.fallbackCaseCount += 1;
      }
      summary.selectedBaselineCounts[selectedBaselineId] = (
        summary.selectedBaselineCounts[selectedBaselineId] ?? 0
      ) + 1;
      summary.selectionLevelCounts[selectedLevel] = (
        summary.selectionLevelCounts[selectedLevel] ?? 0
      ) + 1;
    }
    selections.push({
      ...summary,
      selectedBaselineCounts: sortRecord(summary.selectedBaselineCounts),
      selectionLevelCounts: sortRecord(summary.selectionLevelCounts)
    });
  }
  return {
    schema: "m2.current.history_regime_challenger.v0.1",
    role: "posthoc_development_diagnostic_only",
    design: {
      candidateBaselineIds: [...HISTORY_REGIME_BASELINE_IDS],
      minimumTrainingRows: minimumRows,
      trainingOriginWindow: originWindow,
      selectionHierarchy: groupers.map(({ level }) => level),
      selectionMetric: "mature_earlier_label_WAPE",
      historyBoundary:
        "bill_month_history_through_origin_but_historical_available_at_not_proven",
      promotionEligible: false,
      finalHoldoutOpened: false,
      sameOrLaterOuterTruthRead: false
    },
    rows,
    selections,
    overall: scoreM2CurrentEvaluationRows(rows),
    byOrigin: scoreM2CurrentEvaluationSlices(rows, "origin"),
    byHorizon: scoreM2CurrentEvaluationSlices(rows, "horizonMonths"),
    bySegment: scoreM2CurrentEvaluationSlices(rows, "segment")
  };
}

export function attachM2CurrentScaleAndOccurrence(
  rows,
  historyRows,
  occurrenceProbability
) {
  const history = buildM2CurrentHistoryIndex(historyRows);
  return rows.map((row) => {
    const series = getM2CurrentHistorySeries(
      history,
      row.standardWorkId,
      row.origin
    );
    const scale = scalingErrors(series);
    return {
      ...row,
      scaleAbsoluteError: scale.absolute,
      scaleSquaredError: scale.squared,
      occurrenceProbability: occurrenceProbability(row)
    };
  });
}

export function buildM2CurrentHistoryIndex(rows) {
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

export function getM2CurrentHistorySeries(history, standardWorkId, origin) {
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
  const croston = crostonClassic(nonnegative);
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
    Croston: {
      pointEstimate: croston.rate * horizon,
      occurrenceProbability: croston.occurrenceProbability
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

function buildHistoryRegimeSelectionTable(
  rowsByBaseline,
  outerOrigin,
  allowedTrainingOrigins,
  group,
  minimumTrainingRows
) {
  const table = new Map();
  for (const baselineId of HISTORY_REGIME_BASELINE_IDS) {
    const aggregates = new Map();
    for (const row of rowsByBaseline[baselineId]) {
      if (
        !allowedTrainingOrigins.has(row.origin)
        || row.origin >= outerOrigin
        || row.labelAvailableAsOf > outerOrigin
      ) {
        continue;
      }
      const key = group(row);
      const current = aggregates.get(key) ?? {
        caseCount: 0,
        actualDenominator: 0,
        absoluteError: 0,
        signedError: 0
      };
      current.caseCount += 1;
      current.actualDenominator += Math.abs(Number(row.actual));
      current.absoluteError += Math.abs(
        Number(row.pointEstimate) - Number(row.actual)
      );
      current.signedError += Number(row.pointEstimate) - Number(row.actual);
      aggregates.set(key, current);
    }
    for (const [key, aggregate] of aggregates) {
      if (
        aggregate.caseCount < minimumTrainingRows
        || aggregate.actualDenominator <= 0
      ) {
        continue;
      }
      const candidates = table.get(key) ?? [];
      candidates.push({
        baselineId,
        caseCount: aggregate.caseCount,
        wape: aggregate.absoluteError / aggregate.actualDenominator,
        signedBias: aggregate.signedError / aggregate.actualDenominator
      });
      table.set(key, candidates);
    }
  }
  for (const candidates of table.values()) {
    candidates.sort((left, right) => (
      left.wape - right.wape
      || Math.abs(left.signedBias) - Math.abs(right.signedBias)
      || left.baselineId.localeCompare(right.baselineId)
    ));
  }
  return table;
}

function assertAlignedBaselineRows(rowsByBaseline, templateRows) {
  for (const baselineId of BASELINE_IDS) {
    const rows = rowsByBaseline[baselineId];
    if (
      rows.length !== templateRows.length
      || rows.some((row, index) => (
        row.standardWorkId !== templateRows[index].standardWorkId
        || row.origin !== templateRows[index].origin
        || Number(row.horizonMonths)
          !== Number(templateRows[index].horizonMonths)
        || row.route !== templateRows[index].route
      ))
    ) {
      throw new Error("m2_current_history_regime_baseline_alignment_drift");
    }
  }
}

function historyForecastRow(row, pointEstimate) {
  const value = Math.max(0, finite(pointEstimate, "history_regime_forecast"));
  return {
    ...row,
    pointEstimate: value,
    occurrenceProbability: value > 0 ? 1 : 0
  };
}

function recentMeanForecast(series, horizonMonths, lookbackMonths) {
  const values = validateHistorySeries(series)
    .map((value) => Math.max(0, value))
    .slice(-positiveInteger(lookbackMonths, "history_regime_lookback"));
  const horizon = positiveInteger(
    horizonMonths,
    "history_regime_forecast_horizon"
  );
  return values.reduce((sum, value) => sum + value, 0)
    / Math.max(1, values.length)
    * horizon;
}

function seasonalMedianForecast(series, horizonMonths, years) {
  const values = validateHistorySeries(series)
    .map((value) => Math.max(0, value));
  const horizon = positiveInteger(
    horizonMonths,
    "history_regime_forecast_horizon"
  );
  const yearCount = positiveInteger(years, "history_regime_seasonal_years");
  let total = 0;
  for (let offset = 0; offset < horizon; offset += 1) {
    const seasonalValues = [];
    for (let year = 1; year <= yearCount; year += 1) {
      const index = values.length - 12 * year + (offset % 12);
      if (index >= 0 && index < values.length) {
        seasonalValues.push(values[index]);
      }
    }
    seasonalValues.sort((left, right) => left - right);
    total += seasonalValues.length > 0
      ? seasonalValues[Math.floor((seasonalValues.length - 1) / 2)]
      : 0;
  }
  return total;
}

function ewmaForecast(series, horizonMonths, alpha) {
  const values = validateHistorySeries(series)
    .map((value) => Math.max(0, value));
  const horizon = positiveInteger(
    horizonMonths,
    "history_regime_forecast_horizon"
  );
  const smoothing = finite(alpha, "history_regime_ewma_alpha");
  if (smoothing <= 0 || smoothing > 1) {
    throw new Error("m2_current_history_regime_ewma_alpha_invalid");
  }
  let level = values[0];
  for (const value of values.slice(1)) {
    level = smoothing * value + (1 - smoothing) * level;
  }
  return level * horizon;
}

function trailingOccurrenceBucket(series) {
  const positiveCount = validateHistorySeries(series)
    .slice(-12)
    .filter((value) => value > 0)
    .length;
  return positiveCount === 0
    ? "occurrence_0"
    : positiveCount <= 2
      ? "occurrence_1_2"
      : positiveCount <= 6
        ? "occurrence_3_6"
        : "occurrence_7_12";
}

function sortRecord(record) {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => (
      left.localeCompare(right)
    ))
  );
}

function crostonClassic(series, alpha = 0.1) {
  const result = crostonState(series, alpha);
  return {
    rate: result.initialized ? result.size / result.interval : 0,
    occurrenceProbability: result.occurrenceProbability
  };
}

function crostonSba(series, alpha = 0.1) {
  const result = crostonState(series, alpha);
  return {
    rate: result.initialized
      ? (1 - alpha / 2) * result.size / result.interval
      : 0,
    occurrenceProbability: result.occurrenceProbability
  };
}

function crostonState(series, alpha) {
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
    initialized,
    size,
    interval,
    occurrenceProbability: series.length > 0
      ? positiveCount / series.length
      : 0
  };
}

export function forecastM2CurrentBaselines(series, horizonMonths) {
  return forecastBaselines(validateHistorySeries(series), horizonMonths);
}

export function buildM2CurrentHistoryFeatures(
  series,
  { horizonMonths, basePointEstimate, segment, route }
) {
  const values = validateHistorySeries(series);
  const nonnegative = values.map((value) => Math.max(0, value));
  const trailing = (count) => nonnegative.slice(-count);
  const sum = (items) => items.reduce((total, value) => total + value, 0);
  const positiveCount = (items) => items.filter((value) => value > 0).length;
  const lastPositiveIndex = nonnegative.findLastIndex((value) => value > 0);
  const positiveValues = nonnegative.filter((value) => value > 0);
  const last3 = trailing(3);
  const last6 = trailing(6);
  const last12 = trailing(12);
  const last24 = trailing(24);
  return Object.freeze({
    logBasePoint: Math.log1p(Math.max(0, Number(basePointEstimate) || 0)),
    logTrailing3: Math.log1p(sum(last3)),
    logTrailing6: Math.log1p(sum(last6)),
    logTrailing12: Math.log1p(sum(last12)),
    logTrailing24: Math.log1p(sum(last24)),
    occurrence3: positiveCount(last3) / Math.max(1, last3.length),
    occurrence6: positiveCount(last6) / Math.max(1, last6.length),
    occurrence12: positiveCount(last12) / Math.max(1, last12.length),
    occurrence24: positiveCount(last24) / Math.max(1, last24.length),
    logMeanPositive: Math.log1p(
      positiveValues.length > 0 ? sum(positiveValues) / positiveValues.length : 0
    ),
    monthsSincePositive: lastPositiveIndex < 0
      ? values.length + 1
      : values.length - lastPositiveIndex - 1,
    recentToPriorRatio: (
      sum(last6) + 1
    ) / (sum(nonnegative.slice(-12, -6)) + 1),
    historyMonths: values.length,
    logHorizon: Math.log(Number(horizonMonths)),
    segmentDense: segment === "dense" ? 1 : 0,
    segmentIntermittent: segment === "intermittent" ? 1 : 0,
    segmentDormant: segment === "dormant" ? 1 : 0,
    routeMixed: route === "buyout_plus_sales" ? 1 : 0
  });
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

function validateHistorySeries(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("m2_current_history_series_required");
  }
  return values.map((value) => finite(value, "history_amount"));
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function safePointScore(rows) {
  try {
    return scoreM2CurrentEvaluationRows(rows);
  } catch (error) {
    if (error?.message === "m2_current_actual_denominator_zero") {
      return null;
    }
    throw error;
  }
}
