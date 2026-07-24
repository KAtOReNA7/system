import {
  buildM2CurrentHistoryFeatures
} from "./baselines.js";
import {
  fitM2CurrentGlobalModel,
  M2_CURRENT_GLOBAL_MODEL_FAMILIES
} from "./models.js";
import {
  scoreM2CurrentEvaluationRows,
  scoreM2CurrentEvaluationSlices,
  scoreM2CurrentPointRows
} from "./metrics.js";

export function buildM2CurrentGlobalModelBakeoff(
  baseRows,
  modelDevelopment
) {
  const rows = prepareRows(baseRows);
  const origins = [...new Set(rows.map((row) => row.origin))].sort();
  const minimumTrainingRows = positiveInteger(
    modelDevelopment?.minimumTrainingRows,
    "global_minimum_training_rows"
  );
  const families = modelDevelopment?.families;
  if (
    !Array.isArray(families)
    || families.length !== M2_CURRENT_GLOBAL_MODEL_FAMILIES.length
    || M2_CURRENT_GLOBAL_MODEL_FAMILIES.some(
      (family) => !families.some((entry) => entry.id === family)
    )
  ) {
    throw new Error("m2_current_global_model_families_invalid");
  }
  const familyResults = Object.fromEntries(families.map((family) => [
    family.id,
    buildFamilyRows({
      family,
      rows,
      origins,
      minimumTrainingRows
    })
  ]));
  const selectedRows = [];
  const selections = [];
  for (const origin of origins) {
    const candidates = families.map((family) => {
      const selection = familyResults[family.id].selections.find(
        (entry) => entry.outerOrigin === origin
      );
      return { family: family.id, ...selection };
    }).filter((entry) => (
      Number.isFinite(entry.nestedValidationWape)
      && Number.isFinite(entry.baseValidationWape)
    )).sort((a, b) => (
      a.nestedValidationWape - b.nestedValidationWape
      || a.family.localeCompare(b.family)
    ));
    const best = candidates[0] ?? null;
    const improvement = best === null
      ? null
      : best.nestedValidationWape / best.baseValidationWape - 1;
    const selectedFamily = (
      best !== null
      && improvement
        <= -Number(modelDevelopment.minimumNestedRelativeWapeImprovement)
      && Math.abs(best.nestedValidationSignedBias)
        <= Number(modelDevelopment.maximumNestedAbsoluteBias)
    )
      ? best.family
      : null;
    selections.push({
      outerOrigin: origin,
      selectedFamily: selectedFamily ?? "base_candidate_fallback",
      nestedRelativeWapeToBase: improvement,
      selectionReason: selectedFamily === null
        ? "no_family_cleared_nested_wape_and_bias_gates"
        : "family_cleared_nested_wape_and_bias_gates",
      sameOrLaterOuterTruthRead: false,
      innerFoldCount: best?.innerFoldCount ?? 0
    });
    const selectedByKey = selectedFamily === null
      ? null
      : new Map(
        familyResults[selectedFamily].rows
          .filter((row) => row.origin === origin)
          .map((row) => [caseKey(row), row])
      );
    for (const row of rows.filter((entry) => entry.origin === origin)) {
      const selected = selectedByKey?.get(caseKey(row));
      selectedRows.push(selected ?? {
        ...row,
        globalModelFamily: "base_candidate_fallback",
        occurrenceProbability: baseOccurrenceProbability(row),
        conditionalAmount: null
      });
    }
  }
  return {
    schema: "m2.current.global_model_bakeoff.v0.1",
    design: {
      outerOriginCount: origins.length,
      nestedSelection: true,
      strictlyEarlierMatureLabelsOnly: true,
      sameOrLaterOuterTruthRead: false,
      featureTiming: "history_through_case_origin_only",
      families: M2_CURRENT_GLOBAL_MODEL_FAMILIES
    },
    families: Object.fromEntries(Object.entries(familyResults).map(
      ([family, result]) => [family, {
        overall: scoreM2CurrentEvaluationRows(result.rows),
        byOrigin: scoreM2CurrentEvaluationSlices(result.rows, "origin"),
        bySegment: scoreM2CurrentEvaluationSlices(result.rows, "segment"),
        selections: result.selections
      }]
    )),
    selectedRows,
    selections,
    selected: {
      overall: scoreM2CurrentEvaluationRows(selectedRows),
      byOrigin: scoreM2CurrentEvaluationSlices(selectedRows, "origin"),
      bySegment: scoreM2CurrentEvaluationSlices(selectedRows, "segment")
    }
  };
}

export function buildM2CurrentConstrainedEnsemble(
  baseRows,
  challengerRows,
  ensemblePolicy
) {
  const baseByKey = new Map(baseRows.map((row) => [caseKey(row), row]));
  const challengerByKey = new Map(
    challengerRows.map((row) => [caseKey(row), row])
  );
  if (
    baseByKey.size !== challengerByKey.size
    || [...baseByKey.keys()].some((key) => !challengerByKey.has(key))
  ) {
    throw new Error("m2_current_ensemble_case_parity_failed");
  }
  const weights = ensemblePolicy.weights.map(Number);
  if (
    weights.length === 0
    || weights.some((weight) => weight < 0 || weight > 1)
    || !weights.includes(0)
  ) {
    throw new Error("m2_current_ensemble_weights_invalid");
  }
  const origins = [...new Set(baseRows.map((row) => row.origin))].sort();
  const rows = [];
  const selections = [];
  for (const origin of origins) {
    const trainingKeys = [...baseByKey.keys()].filter((key) => {
      const row = baseByKey.get(key);
      return row.origin < origin && row.labelAvailableAsOf <= origin;
    });
    const candidates = weights.map((weight) => {
      const trainingRows = trainingKeys.map((key) => blendRow(
        baseByKey.get(key),
        challengerByKey.get(key),
        weight
      ));
      if (trainingRows.length === 0) {
        return { weight, metrics: null };
      }
      return {
        weight,
        metrics: safeScore(trainingRows)
      };
    }).filter((entry) => (
      entry.metrics !== null
      && Math.abs(entry.metrics.signedBias)
        <= Number(ensemblePolicy.maximumTrainingAbsoluteBias)
    )).sort((a, b) => (
      a.metrics.wape - b.metrics.wape
      || Math.abs(a.metrics.signedBias) - Math.abs(b.metrics.signedBias)
      || a.weight - b.weight
    ));
    const selected = candidates[0] ?? { weight: 0, metrics: null };
    selections.push({
      outerOrigin: origin,
      selectedChallengerWeight: selected.weight,
      matureEarlierCaseCount: trainingKeys.length,
      trainingMetrics: selected.metrics,
      sameOrLaterOuterTruthRead: false
    });
    for (const baseRow of baseRows.filter((row) => row.origin === origin)) {
      rows.push(blendRow(
        baseRow,
        challengerByKey.get(caseKey(baseRow)),
        selected.weight
      ));
    }
  }
  return {
    rows,
    selections,
    overall: scoreM2CurrentEvaluationRows(rows),
    byOrigin: scoreM2CurrentEvaluationSlices(rows, "origin"),
    bySegment: scoreM2CurrentEvaluationSlices(rows, "segment")
  };
}

function buildFamilyRows({ family, rows, origins, minimumTrainingRows }) {
  const output = [];
  const selections = [];
  for (const origin of origins) {
    const trainingRows = rows.filter((row) => (
      row.origin < origin && row.labelAvailableAsOf <= origin
    ));
    const outerRows = rows.filter((row) => row.origin === origin);
    if (trainingRows.length < minimumTrainingRows) {
      output.push(...outerRows.map((row) => ({
        ...row,
        globalModelFamily: "base_candidate_fallback",
        occurrenceProbability: baseOccurrenceProbability(row),
        conditionalAmount: null
      })));
      selections.push({
        outerOrigin: origin,
        selectedParameters: null,
        matureEarlierCaseCount: trainingRows.length,
        innerFoldCount: 0,
        nestedValidationWape: null,
        nestedValidationSignedBias: null,
        baseValidationWape: null,
        selectionReason: "mature_earlier_training_rows_below_minimum",
        sameOrLaterOuterTruthRead: false
      });
      continue;
    }
    const nested = selectParametersNested(
      family,
      trainingRows,
      family.parameters,
      minimumTrainingRows
    );
    const model = fitM2CurrentGlobalModel(
      family.id,
      trainingRows,
      nested.parameters
    );
    output.push(...outerRows.map((row) => predictedRow(row, model, family.id)));
    selections.push({
      outerOrigin: origin,
      selectedParameters: nested.parameters,
      matureEarlierCaseCount: trainingRows.length,
      innerFoldCount: nested.innerFoldCount,
      nestedValidationWape: nested.metrics?.wape ?? null,
      nestedValidationSignedBias: nested.metrics?.signedBias ?? null,
      baseValidationWape: nested.baseMetrics?.wape ?? null,
      selectionReason: nested.innerFoldCount > 0
        ? "selected_by_inner_rolling_origin"
        : "default_parameters_no_eligible_inner_fold",
      sameOrLaterOuterTruthRead: false
    });
  }
  return { rows: output, selections };
}

function selectParametersNested(
  family,
  trainingRows,
  parameterGrid,
  minimumTrainingRows
) {
  if (!Array.isArray(parameterGrid) || parameterGrid.length === 0) {
    throw new Error("m2_current_global_parameter_grid_required");
  }
  const innerOrigins = [...new Set(trainingRows.map((row) => row.origin))]
    .sort();
  const candidates = parameterGrid.map((parameters) => {
    const predicted = [];
    const base = [];
    let innerFoldCount = 0;
    for (const innerOrigin of innerOrigins) {
      const fitRows = trainingRows.filter((row) => (
        row.origin < innerOrigin && row.labelAvailableAsOf <= innerOrigin
      ));
      const validationRows = trainingRows.filter(
        (row) => row.origin === innerOrigin
      );
      if (
        fitRows.length < minimumTrainingRows
        || validationRows.length === 0
      ) {
        continue;
      }
      const model = fitM2CurrentGlobalModel(family.id, fitRows, parameters);
      predicted.push(...validationRows.map(
        (row) => predictedRow(row, model, family.id)
      ));
      base.push(...validationRows);
      innerFoldCount += 1;
    }
    return {
      parameters,
      innerFoldCount,
      metrics: predicted.length > 0 ? safeScore(predicted) : null,
      baseMetrics: base.length > 0 ? safeScore(base) : null
    };
  }).sort((a, b) => (
    (a.metrics?.wape ?? Infinity) - (b.metrics?.wape ?? Infinity)
    || Math.abs(a.metrics?.signedBias ?? Infinity)
      - Math.abs(b.metrics?.signedBias ?? Infinity)
    || JSON.stringify(a.parameters).localeCompare(JSON.stringify(b.parameters))
  ));
  return candidates.find((candidate) => candidate.metrics !== null)
    ?? {
      parameters: parameterGrid[0],
      innerFoldCount: 0,
      metrics: null,
      baseMetrics: null
    };
}

function prepareRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("m2_current_global_rows_required");
  }
  return rows.map((row) => {
    if (!Array.isArray(row.historySeries) || row.historySeries.length === 0) {
      throw new Error("m2_current_global_history_series_required");
    }
    return {
      ...row,
      actual: Number(row.actual),
      pointEstimate: Math.max(0, Number(row.pointEstimate)),
      features: buildM2CurrentHistoryFeatures(row.historySeries, {
        horizonMonths: row.horizonMonths,
        basePointEstimate: row.pointEstimate,
        segment: row.segment,
        route: row.route
      })
    };
  }).sort(compareRows);
}

function predictedRow(row, model, family) {
  const prediction = model.predict(row.features);
  const recent = row.historySeries.slice(-24).reduce(
    (sum, value) => sum + Math.max(0, Number(value)),
    0
  );
  const cap = Math.max(
    1,
    Number(row.pointEstimate) * 3,
    recent / Math.max(1, Math.min(24, row.historySeries.length))
      * Number(row.horizonMonths) * 5
  );
  return {
    ...row,
    pointEstimate: Math.min(cap, Math.max(0, prediction.pointEstimate)),
    occurrenceProbability: prediction.occurrenceProbability,
    conditionalAmount: prediction.conditionalAmount,
    globalModelFamily: family,
    modelPredictionCapped: prediction.pointEstimate > cap
  };
}

function blendRow(base, challenger, challengerWeight) {
  const weight = Number(challengerWeight);
  return {
    ...base,
    pointEstimate: Math.max(
      0,
      Number(base.pointEstimate) * (1 - weight)
        + Number(challenger.pointEstimate) * weight
    ),
    occurrenceProbability: clamp(
      baseOccurrenceProbability(base) * (1 - weight)
        + baseOccurrenceProbability(challenger) * weight,
      0,
      1
    ),
    ensembleChallengerWeight: weight,
    ensembleChallengerFamily: challenger.globalModelFamily
  };
}

function baseOccurrenceProbability(row) {
  const value = Number(row.occurrenceProbability);
  return Number.isFinite(value)
    ? clamp(value, 0, 1)
    : Number(row.pointEstimate) > 0 ? 1 : 0;
}

function safeScore(rows) {
  try {
    return scoreM2CurrentPointRows(rows);
  } catch (error) {
    if (error?.message === "m2_current_actual_denominator_zero") {
      return null;
    }
    throw error;
  }
}

function caseKey(row) {
  return [
    row.standardWorkId,
    row.origin,
    row.horizonMonths,
    row.route
  ].join("|");
}

function compareRows(a, b) {
  return (
    a.origin.localeCompare(b.origin)
    || a.standardWorkId.localeCompare(b.standardWorkId)
    || a.horizonMonths - b.horizonMonths
    || a.route.localeCompare(b.route)
  );
}

function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`m2_current_${name}_invalid`);
  }
  return number;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
