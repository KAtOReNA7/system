import {
  scoreM2CurrentPointRows,
  scoreM2CurrentSlices
} from "./metrics.js";

const DEFAULT_CONCENTRATION_SHARES = [0.001, 0.005, 0.01, 0.05, 0.1];

export function evaluateM2CurrentResolution(
  rows,
  {
    bootstrapIterations = 2000,
    bootstrapSeed = 20260724
  } = {}
) {
  const normalized = requireForecastRows(rows);
  const byOriginHorizon = aggregateForecastRows(
    normalized,
    ["origin", "horizonMonths"]
  );
  const byOrigin = aggregateForecastRows(normalized, ["origin"]);
  const byHorizon = aggregateForecastRows(normalized, ["horizonMonths"]);
  return {
    workCase: scoreM2CurrentPointRows(normalized),
    portfolioOriginHorizon: summarizeAggregateRows(byOriginHorizon),
    portfolioOrigin: summarizeAggregateRows(byOrigin),
    portfolioHorizon: summarizeAggregateRows(byHorizon),
    originClusterBootstrap: bootstrapOriginMetrics(
      byOrigin,
      bootstrapIterations,
      bootstrapSeed
    )
  };
}

export function summarizeM2CurrentCashConcentration(
  rows,
  shares = DEFAULT_CONCENTRATION_SHARES
) {
  const normalized = requireForecastRows(rows);
  const ranked = [...normalized].sort(
    (left, right) => Math.abs(right.actual) - Math.abs(left.actual)
  );
  const actualDenominator = ranked.reduce(
    (sum, row) => sum + Math.abs(row.actual),
    0
  );
  const errorDenominator = ranked.reduce(
    (sum, row) => sum + Math.abs(row.pointEstimate - row.actual),
    0
  );
  return {
    caseCount: ranked.length,
    bands: shares.map((share) => {
      const caseCount = Math.max(1, Math.ceil(ranked.length * share));
      const selected = ranked.slice(0, caseCount);
      return {
        requestedCaseShare: share,
        caseCount,
        actualCaseShare: caseCount / ranked.length,
        absoluteCashShare: selected.reduce(
          (sum, row) => sum + Math.abs(row.actual),
          0
        ) / actualDenominator,
        absoluteErrorShare: selected.reduce(
          (sum, row) => sum + Math.abs(row.pointEstimate - row.actual),
          0
        ) / errorDenominator
      };
    })
  };
}

export function buildM2CurrentPortfolioReconstruction(rows, policy) {
  const validatedPolicy = validatePortfolioPolicy(policy);
  const instances = buildPortfolioInstances(rows);
  const modelDefinitions = buildModelDefinitions(validatedPolicy);
  const allModelCells = [];
  for (const instance of instances) {
    for (const [horizonText, actual] of Object.entries(instance.actualByHorizon)) {
      const horizonMonths = Number(horizonText);
      for (const model of modelDefinitions) {
        const monthlyForecast = model.forecast(
          instance.historySeries,
          horizonMonths
        );
        allModelCells.push({
          origin: instance.origin,
          horizonMonths,
          labelAvailableAsOf: addMonths(instance.origin, horizonMonths),
          actual,
          pointEstimate: sum(monthlyForecast),
          modelId: model.id
        });
      }
    }
  }
  const trainingRows = allModelCells.filter(
    (row) => row.labelAvailableAsOf
      <= validatedPolicy.selectionLabelsAvailableAsOf
  );
  if (trainingRows.length === 0) {
    throw new Error("m2_current_portfolio_training_rows_required");
  }
  const rankedModels = modelDefinitions.map((model) => {
    const modelRows = trainingRows.filter((row) => row.modelId === model.id);
    return {
      id: model.id,
      parameters: model.parameters,
      training: scoreM2CurrentPointRows(modelRows)
    };
  }).sort((left, right) => (
    left.training.wape - right.training.wape
    || Math.abs(left.training.signedBias)
      - Math.abs(right.training.signedBias)
    || left.id.localeCompare(right.id)
  ));
  const selectedModels = rankedModels.slice(
    0,
    validatedPolicy.selectedModelCount
  );
  const selectedIds = new Set(selectedModels.map((model) => model.id));
  const trainingEnsembleRows = ensembleModelCells(
    trainingRows.filter((row) => selectedIds.has(row.modelId))
  );
  const rawScale = (
    sum(trainingEnsembleRows.map((row) => row.actual))
    / sum(trainingEnsembleRows.map((row) => row.pointEstimate))
  );
  const scale = (
    rawScale * trainingEnsembleRows.length
      + validatedPolicy.scalePriorCellCount
  ) / (
    trainingEnsembleRows.length
      + validatedPolicy.scalePriorCellCount
  );
  const evaluationModelRows = allModelCells.filter(
    (row) => (
      selectedIds.has(row.modelId)
      && row.origin >= validatedPolicy.evaluationFirstOrigin
    )
  );
  const candidateRows = ensembleModelCells(evaluationModelRows).map((row) => ({
    ...row,
    pointEstimate: Math.max(0, row.pointEstimate * scale)
  }));
  const seasonalNaiveRows = instances
    .filter((instance) => (
      instance.origin >= validatedPolicy.evaluationFirstOrigin
    ))
    .flatMap((instance) => (
      Object.entries(instance.actualByHorizon).map(
        ([horizonText, actual]) => {
          const horizonMonths = Number(horizonText);
          return {
            origin: instance.origin,
            horizonMonths,
            labelAvailableAsOf: addMonths(
              instance.origin,
              horizonMonths
            ),
            actual,
            pointEstimate: sum(seasonalNaive(
              instance.historySeries,
              horizonMonths,
              validatedPolicy.seasonLength
            ))
          };
        }
      )
    ));
  if (candidateRows.length !== seasonalNaiveRows.length) {
    throw new Error("m2_current_portfolio_comparator_parity_failed");
  }
  const candidate = {
    ...summarizePortfolioValidation(candidateRows),
    originClusterBootstrap:
      evaluateM2CurrentResolution(candidateRows).originClusterBootstrap
  };
  const seasonalNaiveComparator = {
    ...summarizePortfolioValidation(seasonalNaiveRows),
    originClusterBootstrap:
      evaluateM2CurrentResolution(seasonalNaiveRows).originClusterBootstrap
  };
  const forecastValueAdded = (
    seasonalNaiveComparator.overall.wape - candidate.overall.wape
  ) / seasonalNaiveComparator.overall.wape;
  const gates = {
    evaluationOriginCountPassed:
      candidate.originCount >= validatedPolicy.minimumEvaluationOriginCount,
    wapePassed:
      candidate.overall.wape <= validatedPolicy.maximumPortfolioWape,
    absoluteBiasPassed:
      Math.abs(candidate.overall.signedBias)
        <= validatedPolicy.maximumAbsoluteBias,
    wapeUpper95Passed:
      candidate.originClusterBootstrap.wape.upper95
        <= validatedPolicy.maximumPortfolioWape,
    absoluteBiasIntervalPassed:
      Math.max(
        Math.abs(candidate.originClusterBootstrap.signedBias.lower95),
        Math.abs(candidate.originClusterBootstrap.signedBias.upper95)
      ) <= validatedPolicy.maximumAbsoluteBias,
    p90CellAbsolutePercentageErrorPassed:
      candidate.cellAbsolutePercentageError.p90
        <= validatedPolicy.maximumP90CellAbsolutePercentageError,
    forecastValueAddedPassed:
      forecastValueAdded >= validatedPolicy.minimumForecastValueAdded
  };
  return {
    schema: "m2.current.portfolio_reconstruction.v0.1",
    method: "as_of_aggregate_additive_holt_winters_ensemble",
    mathematicalModel: {
      level:
        "l_t=alpha*(y_t-s_{t-m})+(1-alpha)*(l_{t-1}+phi*b_{t-1})",
      trend:
        "b_t=beta*(l_t-l_{t-1})+(1-beta)*phi*b_{t-1}",
      seasonal:
        "s_t=gamma*(y_t-l_t)+(1-gamma)*s_{t-m}",
      monthlyForecast:
        "yhat_{t+k}=max(0,l_t+sum_{j=1..k}(phi^j)*b_t+s_{t-m+k})",
      horizonCash:
        "Yhat_{o,h}=calibration_scale*sum_{k=1..h}(yhat_{o+k})",
      hierarchy:
        "portfolio history and truth are sums over works served as of each origin"
    },
    asOfBoundary: {
      historyThroughOriginOnly: true,
      modelSelectionLabelsAvailableThrough:
        validatedPolicy.selectionLabelsAvailableAsOf,
      evaluationFirstOrigin: validatedPolicy.evaluationFirstOrigin,
      sameOrLaterEvaluationTruthUsedForSelection: false,
      finalHoldoutOpened: false
    },
    search: {
      modelCount: modelDefinitions.length,
      selectedModelCount: validatedPolicy.selectedModelCount,
      selectedModels,
      selectionMetric: "training_portfolio_WAPE",
      ensemble: "arithmetic_mean",
      trainingCellCount: trainingEnsembleRows.length,
      rawCalibrationScale: rawScale,
      scalePriorCellCount: validatedPolicy.scalePriorCellCount,
      calibrationScale: scale
    },
    candidate,
    seasonalNaiveComparator,
    forecastValueAdded,
    gates,
    allPortfolioDevelopmentGatesPassed: Object.values(gates).every(Boolean),
    privateValidationRows: candidateRows,
    privateSeasonalNaiveRows: seasonalNaiveRows
  };
}

function buildPortfolioInstances(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("m2_current_portfolio_rows_required");
  }
  const servedRows = rows.filter((row) => (
    row?.served !== false
    && row?.abstained !== true
    && Number.isFinite(Number(row?.actual))
  ));
  const origins = [...new Set(servedRows.map((row) => month(row.origin)))]
    .sort();
  return origins.map((origin) => {
    const originRows = servedRows.filter((row) => row.origin === origin);
    const workOriginRows = [
      ...new Map(originRows.map((row) => [
        String(row.historyKey ?? row.standardWorkId),
        row
      ])).values()
    ];
    const historyRows = workOriginRows.filter((row) => (
      row.historyFirstObservedMonth !== null
      && row.historyFirstObservedMonth !== undefined
      && Array.isArray(row.historySeries)
      && row.historySeries.length > 0
    ));
    if (historyRows.length === 0) {
      throw new Error("m2_current_portfolio_history_required");
    }
    const firstMonthIndex = Math.min(...historyRows.map(
      (row) => monthIndex(month(row.historyFirstObservedMonth))
    ));
    const originMonthIndex = monthIndex(origin);
    const historySeries = Array(
      originMonthIndex - firstMonthIndex + 1
    ).fill(0);
    for (const row of historyRows) {
      const offset = (
        monthIndex(month(row.historyFirstObservedMonth)) - firstMonthIndex
      );
      row.historySeries.forEach((value, index) => {
        const targetIndex = offset + index;
        if (targetIndex >= 0 && targetIndex < historySeries.length) {
          historySeries[targetIndex] += finite(value, "history_value");
        }
      });
    }
    const actualByHorizon = {};
    for (const row of originRows) {
      const horizonMonths = positiveInteger(
        row.horizonMonths,
        "horizon_months"
      );
      actualByHorizon[horizonMonths] = (
        actualByHorizon[horizonMonths] ?? 0
      ) + finite(row.actual, "actual");
    }
    return {
      origin,
      historyFirstObservedMonth: monthFromIndex(firstMonthIndex),
      historySeries,
      actualByHorizon
    };
  });
}

function buildModelDefinitions(policy) {
  const result = [];
  for (const damping of policy.dampingFactors) {
    for (const alpha of policy.alphaValues) {
      for (const beta of policy.betaValues) {
        result.push({
          id: modelId("holt", { damping, alpha, beta }),
          parameters: {
            family: "damped_holt",
            damping,
            alpha,
            beta
          },
          forecast: (history, horizon) => dampedHolt(
            history,
            horizon,
            { damping, alpha, beta }
          )
        });
      }
    }
  }
  for (const damping of policy.seasonalDampingFactors) {
    for (const alpha of policy.seasonalAlphaValues) {
      for (const beta of policy.seasonalBetaValues) {
        for (const gamma of policy.gammaValues) {
          result.push({
            id: modelId("holt_winters_additive", {
              damping,
              alpha,
              beta,
              gamma
            }),
            parameters: {
              family: "additive_holt_winters",
              damping,
              alpha,
              beta,
              gamma,
              seasonLength: policy.seasonLength
            },
            forecast: (history, horizon) => additiveHoltWinters(
              history,
              horizon,
              {
                damping,
                alpha,
                beta,
                gamma,
                seasonLength: policy.seasonLength
              }
            )
          });
        }
      }
    }
  }
  return result;
}

function dampedHolt(
  values,
  horizon,
  { damping, alpha, beta }
) {
  const history = requireHistory(values, 2);
  let level = history[0];
  const trendWindow = Math.min(11, history.length - 1);
  let trend = (history[trendWindow] - history[0]) / trendWindow;
  for (let index = 1; index < history.length; index += 1) {
    const previousLevel = level;
    level = alpha * history[index]
      + (1 - alpha) * (level + damping * trend);
    trend = beta * (level - previousLevel)
      + (1 - beta) * damping * trend;
  }
  return Array.from({ length: horizon }, (_, index) => Math.max(
    0,
    level + dampedTrendMultiplier(damping, index + 1) * trend
  ));
}

function additiveHoltWinters(
  values,
  horizon,
  {
    damping,
    alpha,
    beta,
    gamma,
    seasonLength
  }
) {
  const history = requireHistory(values, seasonLength * 2);
  const firstSeason = sum(history.slice(0, seasonLength)) / seasonLength;
  const secondSeason = sum(
    history.slice(seasonLength, seasonLength * 2)
  ) / seasonLength;
  let level = firstSeason;
  let trend = (secondSeason - firstSeason) / seasonLength;
  const seasonal = Array.from(
    { length: seasonLength },
    (_, index) => history[index] - firstSeason
  );
  for (let index = 0; index < history.length; index += 1) {
    const seasonalIndex = index % seasonLength;
    const previousSeasonal = seasonal[seasonalIndex];
    const previousLevel = level;
    level = alpha * (history[index] - previousSeasonal)
      + (1 - alpha) * (level + damping * trend);
    trend = beta * (level - previousLevel)
      + (1 - beta) * damping * trend;
    seasonal[seasonalIndex] = gamma * (history[index] - level)
      + (1 - gamma) * previousSeasonal;
  }
  return Array.from({ length: horizon }, (_, index) => Math.max(
    0,
    level
      + dampedTrendMultiplier(damping, index + 1) * trend
      + seasonal[(history.length + index) % seasonLength]
  ));
}

function seasonalNaive(values, horizon, seasonLength) {
  const history = requireHistory(values, seasonLength);
  return Array.from(
    { length: horizon },
    (_, index) => Math.max(
      0,
      history[history.length - seasonLength + index % seasonLength]
    )
  );
}

function ensembleModelCells(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.origin}|${row.horizonMonths}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    origin: group[0].origin,
    horizonMonths: group[0].horizonMonths,
    labelAvailableAsOf: group[0].labelAvailableAsOf,
    actual: group[0].actual,
    pointEstimate: sum(group.map((row) => row.pointEstimate)) / group.length
  })).sort((left, right) => (
    left.origin.localeCompare(right.origin)
    || left.horizonMonths - right.horizonMonths
  ));
}

function summarizePortfolioValidation(rows) {
  const originCount = new Set(rows.map((row) => row.origin)).size;
  return {
    originCount,
    originHorizonCellCount: rows.length,
    overall: scoreM2CurrentPointRows(rows),
    byHorizon: scoreM2CurrentSlices(rows, "horizonMonths"),
    byOrigin: scoreM2CurrentSlices(rows, "origin"),
    cellAbsolutePercentageError: cellErrorDistribution(rows)
  };
}

function aggregateForecastRows(rows, fields) {
  const groups = new Map();
  for (const row of rows) {
    const key = fields.map((field) => String(row[field])).join("|");
    const aggregate = groups.get(key) ?? {
      caseCount: 0,
      actual: 0,
      pointEstimate: 0
    };
    for (const field of fields) {
      aggregate[field] = row[field];
    }
    aggregate.caseCount += 1;
    aggregate.actual += row.actual;
    aggregate.pointEstimate += row.pointEstimate;
    groups.set(key, aggregate);
  }
  return [...groups.values()].sort((left, right) => (
    fields.map((field) => String(left[field])).join("|")
      .localeCompare(fields.map((field) => String(right[field])).join("|"))
  ));
}

function summarizeAggregateRows(rows) {
  return {
    groupCount: rows.length,
    ...scoreM2CurrentPointRows(rows),
    cellAbsolutePercentageError: cellErrorDistribution(rows)
  };
}

function cellErrorDistribution(rows) {
  const errors = rows
    .filter((row) => Math.abs(row.actual) > 0)
    .map((row) => (
      Math.abs(row.pointEstimate - row.actual) / Math.abs(row.actual)
    ))
    .sort((left, right) => left - right);
  if (errors.length === 0) {
    throw new Error("m2_current_portfolio_error_denominator_zero");
  }
  return {
    cellCount: errors.length,
    median: quantile(errors, 0.5),
    p75: quantile(errors, 0.75),
    p90: quantile(errors, 0.9),
    maximum: errors.at(-1),
    shareAtOrBelow10Percent:
      errors.filter((value) => value <= 0.1).length / errors.length,
    shareAtOrBelow20Percent:
      errors.filter((value) => value <= 0.2).length / errors.length,
    shareAtOrBelow30Percent:
      errors.filter((value) => value <= 0.3).length / errors.length
  };
}

function bootstrapOriginMetrics(rows, iterations, seed) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("m2_current_portfolio_origin_rows_required");
  }
  const originRows = rows.map((row) => ({
    ...row,
    origin: month(row.origin),
    actual: finite(row.actual, "actual"),
    pointEstimate: finite(row.pointEstimate, "point_estimate")
  }));
  const clusterCount = originRows.length;
  const exactResampleCount = clusterCount ** clusterCount;
  const exact = exactResampleCount <= 10000;
  const resampleCount = exact
    ? exactResampleCount
    : positiveInteger(iterations, "bootstrap_iterations");
  const wapes = [];
  const biases = [];
  let randomState = positiveInteger(seed, "bootstrap_seed") >>> 0;
  for (let iteration = 0; iteration < resampleCount; iteration += 1) {
    let exactIndex = iteration;
    const sample = [];
    for (let draw = 0; draw < clusterCount; draw += 1) {
      let selectedIndex;
      if (exact) {
        selectedIndex = exactIndex % clusterCount;
        exactIndex = Math.floor(exactIndex / clusterCount);
      } else {
        randomState = (
          Math.imul(1664525, randomState) + 1013904223
        ) >>> 0;
        selectedIndex = randomState % clusterCount;
      }
      sample.push(originRows[selectedIndex]);
    }
    const scored = scoreM2CurrentPointRows(sample);
    wapes.push(scored.wape);
    biases.push(scored.signedBias);
  }
  wapes.sort((left, right) => left - right);
  biases.sort((left, right) => left - right);
  return {
    schema: "m2.current.origin_cluster_bootstrap.v0.1",
    method: exact
      ? "exact_origin_cluster_resampling_with_replacement"
      : "deterministic_origin_cluster_bootstrap",
    confidence: 0.95,
    originCount: clusterCount,
    resampleCount,
    wape: {
      lower95: quantile(wapes, 0.025),
      median: quantile(wapes, 0.5),
      upper95: quantile(wapes, 0.975)
    },
    signedBias: {
      lower95: quantile(biases, 0.025),
      median: quantile(biases, 0.5),
      upper95: quantile(biases, 0.975)
    }
  };
}

function validatePortfolioPolicy(value) {
  const policy = {
    selectionLabelsAvailableAsOf: month(
      value?.selectionLabelsAvailableAsOf
    ),
    evaluationFirstOrigin: month(value?.evaluationFirstOrigin),
    minimumEvaluationOriginCount: positiveInteger(
      value?.minimumEvaluationOriginCount,
      "minimum_evaluation_origin_count"
    ),
    seasonLength: positiveInteger(
      value?.seasonLength,
      "season_length"
    ),
    selectedModelCount: positiveInteger(
      value?.selectedModelCount,
      "selected_model_count"
    ),
    scalePriorCellCount: nonnegativeInteger(
      value?.scalePriorCellCount,
      "scale_prior_cell_count"
    ),
    dampingFactors: unitIntervalArray(
      value?.dampingFactors,
      "damping_factors"
    ),
    alphaValues: unitIntervalArray(value?.alphaValues, "alpha_values"),
    betaValues: unitIntervalArray(value?.betaValues, "beta_values"),
    seasonalDampingFactors: unitIntervalArray(
      value?.seasonalDampingFactors,
      "seasonal_damping_factors"
    ),
    seasonalAlphaValues: unitIntervalArray(
      value?.seasonalAlphaValues,
      "seasonal_alpha_values"
    ),
    seasonalBetaValues: unitIntervalArray(
      value?.seasonalBetaValues,
      "seasonal_beta_values"
    ),
    gammaValues: unitIntervalArray(value?.gammaValues, "gamma_values"),
    maximumPortfolioWape: unitInterval(
      value?.maximumPortfolioWape,
      "maximum_portfolio_wape"
    ),
    maximumAbsoluteBias: unitInterval(
      value?.maximumAbsoluteBias,
      "maximum_absolute_bias"
    ),
    maximumP90CellAbsolutePercentageError: unitInterval(
      value?.maximumP90CellAbsolutePercentageError,
      "maximum_p90_cell_absolute_percentage_error"
    ),
    minimumForecastValueAdded: unitInterval(
      value?.minimumForecastValueAdded,
      "minimum_forecast_value_added"
    )
  };
  if (
    value?.method !== "as_of_aggregate_additive_holt_winters_ensemble"
    || value?.populationPolicy !== "served_works_frozen_at_each_origin"
    || value?.sameOrLaterEvaluationTruthRead !== false
  ) {
    throw new Error("m2_current_portfolio_policy_invalid");
  }
  if (
    policy.selectionLabelsAvailableAsOf > policy.evaluationFirstOrigin
  ) {
    throw new Error("m2_current_portfolio_selection_after_evaluation");
  }
  return policy;
}

function requireForecastRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("m2_current_resolution_rows_required");
  }
  return rows.map((row) => ({
    ...row,
    origin: month(row.origin),
    horizonMonths: positiveInteger(row.horizonMonths, "horizon_months"),
    actual: finite(row.actual, "actual"),
    pointEstimate: finite(row.pointEstimate, "point_estimate")
  }));
}

function requireHistory(values, minimumLength) {
  if (!Array.isArray(values) || values.length < minimumLength) {
    throw new Error("m2_current_portfolio_history_too_short");
  }
  return values.map((value) => finite(value, "history_value"));
}

function modelId(family, parameters) {
  return `${family}:${Object.entries(parameters)
    .map(([key, value]) => `${key}=${value}`)
    .join(",")}`;
}

function dampedTrendMultiplier(damping, horizon) {
  if (damping === 1) {
    return horizon;
  }
  return damping * (1 - damping ** horizon) / (1 - damping);
}

function addMonths(value, count) {
  return monthFromIndex(monthIndex(month(value)) + count);
}

function monthIndex(value) {
  const [year, monthNumber] = value.split("-").map(Number);
  return year * 12 + monthNumber - 1;
}

function monthFromIndex(value) {
  const year = Math.floor(value / 12);
  const monthNumber = value % 12 + 1;
  return `${year}-${String(monthNumber).padStart(2, "0")}`;
}

function month(value) {
  if (
    typeof value !== "string"
    || !/^\d{4}-(?:0[1-9]|1[0-2])$/u.test(value)
  ) {
    throw new Error("m2_current_portfolio_month_invalid");
  }
  return value;
}

function unitIntervalArray(values, name) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`m2_current_portfolio_${name}_required`);
  }
  const normalized = values.map((value) => unitInterval(value, name));
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`m2_current_portfolio_${name}_duplicate`);
  }
  return normalized;
}

function unitInterval(value, name) {
  const number = finite(value, name);
  if (number < 0 || number > 1) {
    throw new Error(`m2_current_portfolio_${name}_invalid`);
  }
  return number;
}

function positiveInteger(value, name) {
  const number = finite(value, name);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`m2_current_portfolio_${name}_invalid`);
  }
  return number;
}

function nonnegativeInteger(value, name) {
  const number = finite(value, name);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`m2_current_portfolio_${name}_invalid`);
  }
  return number;
}

function finite(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`m2_current_portfolio_${name}_invalid`);
  }
  return number;
}

function quantile(sorted, probability) {
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower]
    + (sorted[upper] - sorted[lower]) * (position - lower);
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}
