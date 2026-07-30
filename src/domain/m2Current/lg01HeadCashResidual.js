import { createHash } from "node:crypto";

import {
  bootstrapM2HorizonAmountSameCase
} from "./coreLegacyHorizonAmount.js";

export const LG01_HEAD_CASH_RESIDUAL_MODEL_ID = "M2-WORK-HCRC01";
export const LG01_HEAD_CASH_RESIDUAL_EXPERIMENT_ID =
  "M2-EXP-LG01-HEAD-CASH-RESIDUAL-01";
export const LG01_HEAD_CASH_RESIDUAL_ARM_IDS = Object.freeze([
  "C0",
  "C1",
  "C2",
  "C3"
]);

const EXPECTED_ALPHA_GRID = Object.freeze([0.25, 0.5, 0.75, 1]);
const CASH_BAND_IDS = Object.freeze(["H50", "M30", "L20"]);
const EPSILON = 1e-12;
const PRIVATE_GATE_METRICS = Symbol("hcrcPrivateGateMetrics");

export function validateLg01HeadCashResidualContract(config) {
  const errors = [];

  if (config?.schema !== "m2.current.lg01_head_cash_residual.v0.1") {
    errors.push("hcrc_contract_schema_invalid");
  }
  if (
    config?.experiment?.stableExperimentId
      !== LG01_HEAD_CASH_RESIDUAL_EXPERIMENT_ID
  ) {
    errors.push("hcrc_contract_experiment_id_invalid");
  }
  if (config?.model?.stableModelId !== LG01_HEAD_CASH_RESIDUAL_MODEL_ID) {
    errors.push("hcrc_contract_model_id_invalid");
  }

  const armIds = (config?.arms ?? []).map((arm) => arm.armId);
  if (!sameValues(armIds, LG01_HEAD_CASH_RESIDUAL_ARM_IDS)) {
    errors.push("hcrc_contract_arms_must_be_exactly_c0_through_c3");
  }
  if (!sameValues(config?.scope?.horizonsMonths, [3])) {
    errors.push("hcrc_contract_horizon_must_be_three_months_only");
  }
  if (!sameValues(config?.alpha?.candidateGrid, EXPECTED_ALPHA_GRID)) {
    errors.push("hcrc_contract_alpha_grid_invalid");
  }
  if (config?.alpha?.zeroIsCandidate !== false) {
    errors.push("hcrc_contract_zero_alpha_must_be_fallback_only");
  }
  if (
    config?.residualBounding?.clip?.lowerQuantile !== 0.05
    || config?.residualBounding?.clip?.upperQuantile !== 0.95
  ) {
    errors.push("hcrc_contract_residual_clip_must_be_q05_q95");
  }
  if (
    config?.residualBounding?.trainingFoldPositiveBaseFloor?.quantile !== 0.1
  ) {
    errors.push("hcrc_contract_positive_base_floor_must_be_q10");
  }
  if (
    config?.experiment?.outerOutcomeRead !== false
    || config?.experiment?.firstCompleteOutcomeProduced !== false
  ) {
    errors.push("hcrc_contract_outer_outcome_must_remain_unread_at_preregistration");
  }
  if (
    config?.execution?.singlePrivateDevelopmentEvaluationAuthorized !== true
    || config?.execution?.secondCompleteResultAllowed !== false
  ) {
    errors.push("hcrc_contract_single_private_evaluation_boundary_invalid");
  }
  if (
    config?.frozenInputs?.lg01RefitAllowed !== false
    || config?.frozenInputs?.cham01RefitAllowed !== false
  ) {
    errors.push("hcrc_contract_frozen_predecessor_refit_forbidden");
  }
  if (
    config?.cashBands?.futureActualUsed !== false
    || config?.cashBands?.historyWindowPolicy
      !== "LATEST_UP_TO_12_ORIGIN_VISIBLE_MONTHS_MISSING_MONTHS_ARE_ZERO_CASH"
    || config?.bandShrinkage?.fixedMinimumWorkCountAllowed !== false
  ) {
    errors.push("hcrc_contract_cash_band_support_must_be_origin_visible");
  }
  if (
    config?.evaluation?.bootstrap?.iterations !== 2000
    || config?.evaluation?.bootstrap?.wholeWorkCluster !== true
  ) {
    errors.push("hcrc_contract_bootstrap_must_cluster_two_thousand_whole_works");
  }
  if (
    config?.evaluation?.rawAndSelectedReportedSeparately !== true
    || config?.evaluation?.fallbackMayReplaceRawMetrics !== false
  ) {
    errors.push("hcrc_contract_raw_candidate_must_remain_visible");
  }

  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors)
  });
}

function sameValues(actual, expected) {
  return (
    Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index])
  );
}

export function runLg01HeadCashResidualExperiment(inputRows, config) {
  const validation = validateLg01HeadCashResidualContract(config);
  if (!validation.valid) {
    fail(validation.errors.join(","));
  }
  const rows = normalizeInputRows(inputRows);
  const predictions = [];
  const selections = [];
  const families = unique(rows.map((row) => row.evaluationFamily));

  for (const family of families) {
    const familyRows = rows.filter(
      (row) => row.evaluationFamily === family
    );
    const core80Rows = familyRows.filter(
      (row) => row.populationId === "CORE80"
    );
    const bandIndex = buildBandIndex(core80Rows, config);
    const origins = unique(familyRows.map((row) => row.origin)).sort();

    for (const outerOrigin of origins) {
      const globalSelection = selectGlobalAlpha({
        rows: core80Rows,
        outerOrigin,
        config
      });
      const bandSelections = selectBandAlphas({
        rows: core80Rows,
        outerOrigin,
        globalSelection,
        config
      });
      selections.push({
        schema:
          "m2.current.lg01_head_cash_residual.selection.private.v0.1",
        experimentId: LG01_HEAD_CASH_RESIDUAL_EXPERIMENT_ID,
        evaluationFamily: family,
        outerOrigin,
        global: globalSelection,
        bands: bandSelections
      });

      const boundState = buildResidualBoundState(
        eligibleEarlierRows(core80Rows, outerOrigin),
        config
      );
      const outerRows = familyRows.filter(
        (row) => row.origin === outerOrigin
      );
      for (const row of outerRows) {
        const bandId = bandIndex.get(inputCaseKey(row))
          ?? "OUTSIDE_CORE80_SENSITIVITY";
        predictions.push(buildReferencePrediction(row, {
          armId: "C0",
          pointEstimate: row.basePointEstimate,
          bandId,
          numericStatus: Number.isFinite(row.basePointEstimate)
            ? "FROZEN_BASELINE_FINITE"
            : "NUMERIC_STABILITY_FAIL_NONFINITE_BASE"
        }));
        predictions.push(buildReferencePrediction(row, {
          armId: "C1",
          pointEstimate: row.rawPointEstimate,
          bandId,
          numericStatus: !Number.isFinite(row.rawPointEstimate)
            ? "NUMERIC_STABILITY_FAIL_NONFINITE_RAW"
            : (
              row.evaluationFamily === "PRIMARY_ROLLING"
              && row.populationId === "CORE90"
            )
              ? "NUMERIC_STABILITY_FAIL_FROZEN_EXTREME_REFERENCE"
              : "FROZEN_DIAGNOSTIC_FINITE"
        }));
        predictions.push(buildCandidatePrediction(row, {
          armId: "C2",
          alpha: globalSelection.selectedAlpha,
          safetyFence: globalSelection.safetyFence,
          boundState,
          bandId,
          globalAlpha: globalSelection.selectedAlpha,
          supportWeight: 1
        }));
        const selectedBand = CASH_BAND_IDS.includes(bandId)
          ? bandSelections[bandId]
          : null;
        predictions.push(buildCandidatePrediction(row, {
          armId: "C3",
          alpha: selectedBand?.effectiveAlpha
            ?? globalSelection.selectedAlpha,
          safetyFence: selectedBand?.safetyFence
            ?? globalSelection.safetyFence,
          boundState,
          bandId,
          globalAlpha: globalSelection.selectedAlpha,
          supportWeight: selectedBand?.supportWeight ?? 0
        }));
      }
    }
  }

  const sortedPredictions = predictions.sort(comparePredictionRows);
  const evaluation = evaluatePredictions({
    predictions: sortedPredictions,
    config
  });
  return Object.freeze({
    inputRows: Object.freeze(rows),
    predictions: Object.freeze(sortedPredictions),
    selections: Object.freeze(selections.sort(compareSelectionRows)),
    evaluation
  });
}

export function buildResidualBoundState(rows, config) {
  const finiteRows = rows.filter((row) => (
    Number.isFinite(row.basePointEstimate)
    && Number.isFinite(row.rawPointEstimate)
  ));
  const positiveBaseRows = finiteRows.filter(
    (row) => row.basePointEstimate > 0
  );
  const minimumOrigins = Number(
    config.residualBounding.trainingFoldPositiveBaseFloor
      .minimumIndependentOriginCount
  );
  if (
    unique(positiveBaseRows.map((row) => row.origin)).length
      < minimumOrigins
  ) {
    return Object.freeze({
      status: "INSUFFICIENT_EARLIER_POSITIVE_BASE_ORIGINS",
      valid: false,
      positiveBaseFloor: null,
      lowerBound: null,
      upperBound: null,
      trainingRowCount: finiteRows.length,
      trainingOriginCount:
        unique(finiteRows.map((row) => row.origin)).length
    });
  }
  const floor = quantileLinear(
    positiveBaseRows.map((row) => row.basePointEstimate),
    config.residualBounding.trainingFoldPositiveBaseFloor.quantile
  );
  const normalizedResiduals = finiteRows.map((row) => {
    const scale = Math.max(Math.abs(row.basePointEstimate), floor);
    return scale > 0
      ? (row.rawPointEstimate - row.basePointEstimate) / scale
      : null;
  }).filter(Number.isFinite);
  if (
    !Number.isFinite(floor)
    || floor <= 0
    || normalizedResiduals.length === 0
  ) {
    return Object.freeze({
      status: "NONFINITE_OR_EMPTY_RESIDUAL_BOUND_SUPPORT",
      valid: false,
      positiveBaseFloor: null,
      lowerBound: null,
      upperBound: null,
      trainingRowCount: finiteRows.length,
      trainingOriginCount:
        unique(finiteRows.map((row) => row.origin)).length
    });
  }
  return Object.freeze({
    status: "EARLIER_ORIGIN_RESIDUAL_BOUND_READY",
    valid: true,
    positiveBaseFloor: floor,
    lowerBound: quantileLinear(
      normalizedResiduals,
      config.residualBounding.clip.lowerQuantile
    ),
    upperBound: quantileLinear(
      normalizedResiduals,
      config.residualBounding.clip.upperQuantile
    ),
    trainingRowCount: finiteRows.length,
    trainingOriginCount:
      unique(finiteRows.map((row) => row.origin)).length
  });
}

export function assignLg01HeadCashBands(rows, config) {
  const uniqueRows = deduplicateRows(rows).sort((left, right) => (
    Math.max(Number(right.trailing12Cash), 0)
      - Math.max(Number(left.trailing12Cash), 0)
    || left.standardWorkId.localeCompare(right.standardWorkId)
  ));
  const total = sum(uniqueRows.map(
    (row) => Math.max(Number(row.trailing12Cash), 0)
  ));
  if (!(total > 0)) {
    return Object.freeze(uniqueRows.map((row) => Object.freeze({
      standardWorkId: row.standardWorkId,
      origin: row.origin,
      bandId: null,
      rankingValue: Math.max(Number(row.trailing12Cash), 0),
      cumulativeCashBefore: 0,
      cumulativeCashAfter: 0,
      cumulativeCashShareAfter: null,
      status: config.cashBands.nonpositiveOriginCashPolicy
    })));
  }
  let cumulative = 0;
  return Object.freeze(uniqueRows.map((row) => {
    const cash = Math.max(Number(row.trailing12Cash), 0);
    const shareBefore = cumulative / total;
    const bandId = shareBefore < 0.5
      ? "H50"
      : shareBefore < 0.8
        ? "M30"
        : "L20";
    const before = cumulative;
    cumulative += cash;
    return Object.freeze({
      standardWorkId: row.standardWorkId,
      origin: row.origin,
      bandId,
      rankingValue: cash,
      cumulativeCashBefore: before,
      cumulativeCashAfter: cumulative,
      cumulativeCashShareAfter: cumulative / total,
      status: "ORIGIN_VISIBLE_CASH_BAND_ASSIGNED"
    });
  }));
}

function materializeCashBandRows(rows, config) {
  const output = [];
  for (const origin of unique(rows.map((row) => row.origin)).sort()) {
    const originRows = rows.filter((row) => row.origin === origin);
    const bands = new Map(assignLg01HeadCashBands(
      originRows,
      config
    ).map((row) => [row.standardWorkId, row.bandId]));
    output.push(...originRows.map((row) => ({
      ...row,
      cashBandId: bands.get(row.standardWorkId) ?? null
    })));
  }
  return output;
}

export function quantileLinear(values, probability) {
  const finite = values.filter(Number.isFinite)
    .map(Number)
    .sort((left, right) => left - right);
  const p = Number(probability);
  if (finite.length === 0 || !(p >= 0 && p <= 1)) return null;
  if (finite.length === 1) return finite[0];
  const position = p * (finite.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const weight = position - lower;
  return finite[lower] * (1 - weight) + finite[upper] * weight;
}

export function assertM2Lg01HeadCashResidualPublicSafe(value) {
  const serialized = JSON.stringify(value);
  for (const pattern of [
    /standardWorkId/iu,
    /channelUid/iu,
    /workTitle/iu,
    /authorName/iu,
    /data[\\/]+private-(?:input|output)/iu,
    /[A-Z]:[\\/]/u,
    /(?:^|[\\/])Users[\\/]/u
  ]) {
    if (pattern.test(serialized)) {
      fail("hcrc_public_payload_unsafe");
    }
  }
  return true;
}

function normalizeInputRows(inputRows) {
  if (!Array.isArray(inputRows) || inputRows.length === 0) {
    fail("hcrc_input_rows_required");
  }
  const keys = new Set();
  return Object.freeze(inputRows.map((input) => {
    const row = Object.freeze({
      evaluationFamily: requireMember(
        input.evaluationFamily,
        ["PRIMARY_ROLLING", "STRICT_ROLLING"],
        "evaluation_family"
      ),
      populationId: requireMember(
        input.populationId,
        ["CORE80", "CORE90"],
        "population"
      ),
      standardWorkId: nonempty(input.standardWorkId, "standard_work_id"),
      origin: requireMonth(input.origin),
      horizonMonths: Number(input.horizonMonths),
      actual: requireFinite(input.actual, "actual"),
      basePointEstimate: nullableFinite(
        input.basePointEstimate,
      ),
      rawPointEstimate: nullableFinite(
        input.rawPointEstimate,
      ),
      trailing12Cash: requireFinite(
        input.trailing12Cash,
        "trailing12_cash"
      ),
      baseSourceFinite: Number.isFinite(input.basePointEstimate),
      rawSourceFinite: Number.isFinite(input.rawPointEstimate),
      labelAvailableAsOf: requireMonth(input.labelAvailableAsOf),
      originVisibleOnly: input.originVisibleOnly === true
    });
    if (row.horizonMonths !== 3) {
      fail("hcrc_input_horizon_must_be_three");
    }
    if (!row.originVisibleOnly) {
      fail("hcrc_input_origin_visibility_unproven");
    }
    const key = inputCaseKey(row);
    if (keys.has(key)) fail("hcrc_input_duplicate_case");
    keys.add(key);
    return row;
  }).sort(compareInputRows));
}

function selectGlobalAlpha({ rows, outerOrigin, config }) {
  const candidates = config.alpha.candidateGrid.map((alpha) => (
    evaluateCrossFittedAlpha({
      rows,
      outerOrigin,
      alpha,
      config
    })
  ));
  const eligible = candidates.filter((candidate) => (
    candidate.numericEligible
    && candidate.biasEligible
    && candidate.headCashEligible
  )).sort((left, right) => (
    nullableSort(left.totalAbsoluteError, right.totalAbsoluteError)
    || left.alpha - right.alpha
  ));
  const selected = eligible[0] ?? null;
  return Object.freeze({
    status: selected
      ? "GLOBAL_ALPHA_SELECTED_FROM_EARLIER_INNER_ORIGINS"
      : "NO_ELIGIBLE_GLOBAL_ALPHA_FALLBACK_C0",
    selectedAlpha: selected?.alpha ?? null,
    safetyFence: selected?.safetyFence ?? null,
    candidateDiagnostics: Object.freeze(candidates),
    earlierInnerOriginCount: unique(
      eligibleEarlierRows(rows, outerOrigin).map((row) => row.origin)
    ).length,
    outerOutcomeReadForSelection: false
  });
}

function selectBandAlphas({
  rows,
  outerOrigin,
  globalSelection,
  config
}) {
  if (!Number.isFinite(globalSelection.selectedAlpha)) {
    return Object.freeze(Object.fromEntries(CASH_BAND_IDS.map(
      (bandId) => [bandId, Object.freeze({
        bandId,
        status: "GLOBAL_ALPHA_INELIGIBLE_FALLBACK_C0",
        candidateAlpha: null,
        effectiveAlpha: null,
        globalAlpha: null,
        supportWeight: 0,
        safetyFence: null
      })]
    )));
  }
  const candidatesByAlpha = new Map(config.alpha.candidateGrid.map(
    (alpha) => [
      alpha,
      evaluateCrossFittedAlpha({
        rows,
        outerOrigin,
        alpha,
        config
      })
    ]
  ));
  const eligibleBandRows = materializeCashBandRows(
    eligibleEarlierRows(rows, outerOrigin),
    config
  );
  const globalAnchorLoss = globalSelection.candidateDiagnostics.find(
    (candidate) => candidate.alpha === globalSelection.selectedAlpha
  )?.normalizedAbsoluteError ?? null;
  const output = {};
  for (const bandId of CASH_BAND_IDS) {
    const candidates = [];
    const totalEligibleBandCash = sum(eligibleBandRows.filter(
      (row) => row.cashBandId === bandId
    ).map((row) => Math.max(Number(row.trailing12Cash), 0)));
    for (const alpha of config.alpha.candidateGrid) {
      const crossFit = candidatesByAlpha.get(alpha);
      const bandRows = crossFit.rows.filter(
        (row) => row.cashBandId === bandId
      );
      const independentTimeBlocks = countIndependentTimeBlocks(
        bandRows.map((row) => row.origin),
        3
      );
      if (
        independentTimeBlocks
          < config.bandShrinkage.minimumIndependentTimeBlocksForBandSpecificEvidence
      ) {
        continue;
      }
      const supportWeight = bandSupportWeight({
        bandRows,
        independentTimeBlocks,
        totalEligibleBandCash,
        config
      });
      const effectiveAlpha = (
        globalSelection.selectedAlpha
        + supportWeight * (alpha - globalSelection.selectedAlpha)
      );
      const effective = scoreCrossFitRowsAtAlpha(
        crossFit.rows,
        effectiveAlpha
      );
      const effectiveBand = effective.rows.filter(
        (row) => row.cashBandId === bandId
      );
      const bandLoss = normalizedAbsoluteError(effectiveBand);
      const globalLoss = globalAnchorLoss;
      const safetyFence = predictionRatioFence(effective.rows, config);
      const numericEligible = (
        effective.rows.length > 0
        && effective.rows.every((row) => Number.isFinite(row.pointEstimate))
        && ratiosInsideFence(effective.rows, safetyFence)
      );
      candidates.push(Object.freeze({
        bandId,
        candidateAlpha: alpha,
        effectiveAlpha,
        globalAlpha: globalSelection.selectedAlpha,
        supportWeight,
        independentTimeBlockCount: independentTimeBlocks,
        bandNormalizedAbsoluteError: bandLoss,
        globalNormalizedAbsoluteError: globalLoss,
        selectionLoss: Number.isFinite(bandLoss)
          && Number.isFinite(globalLoss)
          ? supportWeight * bandLoss + (1 - supportWeight) * globalLoss
          : null,
        safetyFence,
        numericEligible
      }));
    }
    const selected = candidates.filter(
      (candidate) => candidate.numericEligible
    ).sort((left, right) => (
      nullableSort(left.selectionLoss, right.selectionLoss)
      || left.candidateAlpha - right.candidateAlpha
    ))[0] ?? null;
    output[bandId] = Object.freeze(selected
      ? {
        ...selected,
        status: selected.supportWeight > 0
          ? "BAND_ALPHA_SELECTED_AND_SHRUNK_TO_GLOBAL"
          : "INSUFFICIENT_BAND_SUPPORT_USE_GLOBAL_ALPHA"
      }
      : {
        bandId,
        status: "INSUFFICIENT_BAND_SUPPORT_USE_GLOBAL_ALPHA",
        candidateAlpha: globalSelection.selectedAlpha,
        effectiveAlpha: globalSelection.selectedAlpha,
        globalAlpha: globalSelection.selectedAlpha,
        supportWeight: 0,
        safetyFence: globalSelection.safetyFence,
        candidateDiagnostics: Object.freeze(candidates)
      });
  }
  return Object.freeze(output);
}

function evaluateCrossFittedAlpha({ rows, outerOrigin, alpha, config }) {
  const earlier = eligibleEarlierRows(rows, outerOrigin);
  const innerOrigins = unique(earlier.map((row) => row.origin)).sort();
  const output = [];
  for (const innerOrigin of innerOrigins) {
    const boundState = buildResidualBoundState(
      eligibleEarlierRows(rows, innerOrigin),
      config
    );
    if (!boundState.valid) continue;
    const bands = new Map(assignLg01HeadCashBands(
      earlier.filter((row) => row.origin === innerOrigin),
      config
    ).map((row) => [
      `${row.standardWorkId}\u0000${row.origin}`,
      row.bandId
    ]));
    for (const row of earlier.filter(
      (candidate) => candidate.origin === innerOrigin
    )) {
      const bounded = boundedResidual(row, boundState);
      if (!bounded.valid) continue;
      output.push({
        standardWorkId: row.standardWorkId,
        origin: row.origin,
        actual: row.actual,
        basePointEstimate: row.basePointEstimate,
        trailing12Cash: row.trailing12Cash,
        cashBandId: bands.get(
          `${row.standardWorkId}\u0000${row.origin}`
        ) ?? null,
        boundedResidual: bounded.value,
        positiveBaseFloor: boundState.positiveBaseFloor,
        pointEstimate:
          row.basePointEstimate + alpha * bounded.value
      });
    }
  }
  const scored = scoreCrossFitRowsAtAlpha(output, alpha);
  const safetyFence = predictionRatioFence(scored.rows, config);
  const base = scoreRows(scored.rows, "basePointEstimate");
  const candidate = scoreRows(scored.rows, "pointEstimate");
  const headRows = scored.rows.filter((row) => row.cashBandId === "H50");
  const headBaseError = totalAbsoluteError(
    headRows,
    "basePointEstimate"
  );
  const headCandidateError = totalAbsoluteError(
    headRows,
    "pointEstimate"
  );
  const independentOrigins = unique(
    scored.rows.map((row) => row.origin)
  ).length;
  return Object.freeze({
    alpha,
    rows: Object.freeze(scored.rows),
    crossFittedRowCount: scored.rows.length,
    crossFittedOriginCount: independentOrigins,
    totalAbsoluteError: candidate.absoluteError,
    normalizedAbsoluteError: normalizedAbsoluteError(scored.rows),
    candidateBias: candidate.signedBias,
    baseBias: base.signedBias,
    headCashAbsoluteError: headCandidateError,
    headCashBaseAbsoluteError: headBaseError,
    safetyFence,
    numericEligible: (
      independentOrigins
        >= config.residualBounding.trainingFoldPositiveBaseFloor
          .minimumIndependentOriginCount
      && scored.rows.length > 0
      && scored.rows.every((row) => Number.isFinite(row.pointEstimate))
      && ratiosInsideFence(scored.rows, safetyFence)
    ),
    biasEligible: (
      Number.isFinite(candidate.signedBias)
      && Number.isFinite(base.signedBias)
      && Math.abs(candidate.signedBias)
        <= Math.abs(base.signedBias) + 0.01
    ),
    headCashEligible: (
      headRows.length > 0
      && headCandidateError <= headBaseError
    )
  });
}

function scoreCrossFitRowsAtAlpha(rows, alpha) {
  return {
    rows: rows.map((row) => ({
      ...row,
      pointEstimate:
        row.basePointEstimate + alpha * row.boundedResidual,
      numericSafetyRatio: predictionScaleRatio(
        row.basePointEstimate + alpha * row.boundedResidual,
        row.basePointEstimate,
        row.positiveBaseFloor
      )
    }))
  };
}

function bandSupportWeight({
  bandRows,
  independentTimeBlocks,
  totalEligibleBandCash,
  config
}) {
  const originFactor = clamp(
    (independentTimeBlocks - 1) / 3,
    0,
    1
  );
  const finiteCash = sum(bandRows.filter(
    (row) => Number.isFinite(row.pointEstimate)
  ).map((row) => Math.max(Number(row.trailing12Cash), 0)));
  const cashCoverage = totalEligibleBandCash > 0
    ? Math.min(finiteCash / totalEligibleBandCash, 1)
    : 0;
  const workCash = new Map();
  for (const row of bandRows) {
    workCash.set(
      row.standardWorkId,
      (workCash.get(row.standardWorkId) ?? 0)
        + Math.max(Number(row.trailing12Cash), 0)
    );
  }
  const weights = [...workCash.values()].filter((value) => value > 0);
  const cashEss = weights.length === 0
    ? 0
    : sum(weights) ** 2 / sum(weights.map((value) => value ** 2));
  const cashEssRatio = workCash.size > 0 ? cashEss / workCash.size : 0;
  const fence = predictionRatioFence(bandRows, config);
  const stabilityFactor = (
    bandRows.length > 0
    && bandRows.every((row) => Number.isFinite(row.pointEstimate))
    && ratiosInsideFence(bandRows, fence)
  ) ? 1 : 0;
  return Math.min(
    originFactor,
    cashCoverage,
    cashEssRatio,
    stabilityFactor
  );
}

function buildCandidatePrediction(row, {
  armId,
  alpha,
  safetyFence,
  boundState,
  bandId,
  globalAlpha,
  supportWeight
}) {
  const bounded = boundedResidual(row, boundState);
  let rawPointEstimate = null;
  let rawNumericStatus = "NOT_EVALUABLE_NO_EARLIER_BOUND_SUPPORT";
  let fallbackReason = "NO_EARLIER_BOUND_SUPPORT";
  let ratio = null;
  if (!Number.isFinite(alpha)) {
    fallbackReason = "NO_ELIGIBLE_ALPHA";
  } else if (!bounded.valid) {
    fallbackReason = bounded.reason;
    if (/NONFINITE/u.test(bounded.reason)) {
      rawNumericStatus =
        "NUMERIC_STABILITY_FAIL_NONFINITE_BASE_RAW_SCALE_OR_BOUND";
    }
  } else {
    rawPointEstimate =
      row.basePointEstimate + alpha * bounded.value;
    ratio = predictionBaseRatio(
      rawPointEstimate,
      row.basePointEstimate
    );
    if (!Number.isFinite(rawPointEstimate)) {
      rawPointEstimate = null;
      rawNumericStatus = "NUMERIC_STABILITY_FAIL_NONFINITE_PREDICTION";
      fallbackReason = "NONFINITE_PREDICTION";
    } else if (!ratioInsideFence(
      predictionScaleRatio(
        rawPointEstimate,
        row.basePointEstimate,
        boundState.positiveBaseFloor
      ),
      safetyFence
    )) {
      rawNumericStatus =
        "NUMERIC_STABILITY_FAIL_PREDICTION_BASE_RATIO_OUTSIDE_EARLIER_FENCE";
      fallbackReason = "PREDICTION_BASE_RATIO_OUTSIDE_EARLIER_FENCE";
    } else {
      rawNumericStatus = "NUMERIC_STABILITY_PASS";
      fallbackReason = null;
    }
  }
  const selectedPointEstimate = fallbackReason === null
    ? rawPointEstimate
    : row.basePointEstimate;
  return Object.freeze({
    schema: "m2.current.lg01_head_cash_residual.prediction.private.v0.1",
    experimentId: LG01_HEAD_CASH_RESIDUAL_EXPERIMENT_ID,
    modelId: LG01_HEAD_CASH_RESIDUAL_MODEL_ID,
    armId,
    evaluationFamily: row.evaluationFamily,
    populationId: row.populationId,
    standardWorkId: row.standardWorkId,
    origin: row.origin,
    horizonMonths: row.horizonMonths,
    actual: row.actual,
    basePointEstimate: row.basePointEstimate,
    frozenRawPointEstimate: row.rawPointEstimate,
    trailing12Cash: row.trailing12Cash,
    cashBandId: bandId,
    alpha,
    globalAlpha,
    supportWeight,
    positiveBaseFloor: boundState.positiveBaseFloor,
    normalizedResidualLowerBound: boundState.lowerBound,
    normalizedResidualUpperBound: boundState.upperBound,
    boundedResidual: bounded.valid ? bounded.value : null,
    residualBoundTriggered: bounded.boundTriggered,
    rawPointEstimate,
    selectedPointEstimate,
    predictionBaseRatio: ratio,
    numericSafetyRatio: Number.isFinite(rawPointEstimate)
      ? predictionScaleRatio(
        rawPointEstimate,
        row.basePointEstimate,
        boundState.positiveBaseFloor
      )
      : null,
    rawNumericStatus,
    selectedStatus: fallbackReason === null
      ? "RAW_CANDIDATE_SELECTED"
      : "FALLBACK_TO_C0",
    fallbackReason,
    abstained: !Number.isFinite(selectedPointEstimate),
    rawCandidatePreserved: true,
    selectedFallbackCannotCreatePass: true,
    originVisibleOnly: true
  });
}

function buildReferencePrediction(row, {
  armId,
  pointEstimate,
  bandId,
  numericStatus
}) {
  return Object.freeze({
    schema: "m2.current.lg01_head_cash_residual.prediction.private.v0.1",
    experimentId: LG01_HEAD_CASH_RESIDUAL_EXPERIMENT_ID,
    modelId: armId === "C0"
      ? "M2-WORK-LG01"
      : "M2-WORK-CHAM01",
    armId,
    evaluationFamily: row.evaluationFamily,
    populationId: row.populationId,
    standardWorkId: row.standardWorkId,
    origin: row.origin,
    horizonMonths: row.horizonMonths,
    actual: row.actual,
    basePointEstimate: row.basePointEstimate,
    frozenRawPointEstimate: row.rawPointEstimate,
    trailing12Cash: row.trailing12Cash,
    cashBandId: bandId,
    alpha: armId === "C0" ? 0 : 1,
    globalAlpha: null,
    supportWeight: null,
    positiveBaseFloor: null,
    normalizedResidualLowerBound: null,
    normalizedResidualUpperBound: null,
    boundedResidual: null,
    residualBoundTriggered: false,
    rawPointEstimate: pointEstimate,
    selectedPointEstimate: pointEstimate,
    predictionBaseRatio: predictionBaseRatio(
      pointEstimate,
      row.basePointEstimate
    ),
    numericSafetyRatio: null,
    rawNumericStatus: numericStatus,
    selectedStatus: "FROZEN_REFERENCE",
    fallbackReason: null,
    abstained: !Number.isFinite(pointEstimate),
    rawCandidatePreserved: true,
    selectedFallbackCannotCreatePass: true,
    originVisibleOnly: true
  });
}

function boundedResidual(row, state) {
  if (!state.valid) {
    return {
      valid: false,
      value: null,
      boundTriggered: false,
      reason: state.status
    };
  }
  if (
    !Number.isFinite(row.basePointEstimate)
    || !Number.isFinite(row.rawPointEstimate)
    || !Number.isFinite(state.positiveBaseFloor)
  ) {
    return {
      valid: false,
      value: null,
      boundTriggered: false,
      reason: "NONFINITE_BASE_RAW_OR_SCALE"
    };
  }
  const scale = Math.max(
    Math.abs(row.basePointEstimate),
    state.positiveBaseFloor
  );
  if (!(scale > 0) || !Number.isFinite(scale)) {
    return {
      valid: false,
      value: null,
      boundTriggered: false,
      reason: "NONFINITE_OR_NONPOSITIVE_SCALE"
    };
  }
  const normalized = (
    row.rawPointEstimate - row.basePointEstimate
  ) / scale;
  if (!Number.isFinite(normalized)) {
    return {
      valid: false,
      value: null,
      boundTriggered: false,
      reason: "NONFINITE_NORMALIZED_RESIDUAL"
    };
  }
  const clipped = clamp(
    normalized,
    state.lowerBound,
    state.upperBound
  );
  return {
    valid: Number.isFinite(clipped),
    value: scale * clipped,
    boundTriggered: clipped !== normalized,
    reason: Number.isFinite(clipped)
      ? null
      : "NONFINITE_CLIPPED_RESIDUAL"
  };
}

function evaluatePredictions({ predictions, config }) {
  const cells = [];
  for (const family of unique(
    predictions.map((row) => row.evaluationFamily)
  )) {
    for (const populationId of ["CORE80", "CORE90"]) {
      for (const armId of LG01_HEAD_CASH_RESIDUAL_ARM_IDS) {
        const rows = predictions.filter((row) => (
          row.evaluationFamily === family
          && row.populationId === populationId
          && row.armId === armId
        ));
        if (rows.length === 0) continue;
        cells.push(Object.freeze({
          evaluationFamily: family,
          populationId,
          horizonMonths: 3,
          armId,
          comparisonStatus: family === "PRIMARY_ROLLING"
            ? "NOT_COMPARABLE"
            : "EXACT_SAME_CASE_VS_FROZEN_LG01",
          raw: aggregateVariant(rows, {
            field: "rawPointEstimate",
            variant: "RAW",
            family,
            armId,
            populationId,
            config
          }),
          selected: aggregateVariant(rows, {
            field: "selectedPointEstimate",
            variant: "SELECTED",
            family,
            armId,
            populationId,
            config
          })
        }));
      }
    }
  }
  const decision = decideCandidate(cells, config);
  return Object.freeze({
    cells: Object.freeze(cells),
    decision
  });
}

function aggregateVariant(rows, {
  field,
  variant,
  family,
  armId,
  populationId,
  config
}) {
  const finiteRows = rows.filter(
    (row) => Number.isFinite(row[field])
  ).map((row) => ({ ...row, pointEstimate: row[field] }));
  const metrics = scoreRows(finiteRows, "pointEstimate");
  const baseMetrics = scoreRows(finiteRows, "basePointEstimate");
  const comparable = family === "STRICT_ROLLING";
  const pairedFva = comparable && baseMetrics.absoluteError > 0
    ? (
      baseMetrics.absoluteError - metrics.absoluteError
    ) / baseMetrics.absoluteError
    : null;
  const bootstrap = comparable && finiteRows.length > 0
    ? bootstrapM2HorizonAmountSameCase(finiteRows.map((row) => ({
      standardWorkId: row.standardWorkId,
      origin: row.origin,
      horizonMonths: 3,
      actual: row.actual,
      candidatePointEstimate: row.pointEstimate,
      baselinePointEstimate: row.basePointEstimate
    })), {
      iterations: config.evaluation.bootstrap.iterations,
      seed: config.evaluation.bootstrap.seed
        + stableSeed(family, populationId, armId, variant)
    })
    : null;
  const blocks = comparable
    ? independentTimeBlockSummary(finiteRows)
    : null;
  const totalOriginVisibleCash = sum(finiteRows.map(
    (row) => Math.max(Number(row.trailing12Cash), 0)
  ));
  const bandMetrics = Object.fromEntries(CASH_BAND_IDS.map(
    (bandId) => [
      bandId,
      aggregateBand(
        finiteRows.filter((row) => row.cashBandId === bandId),
        totalOriginVisibleCash,
        config
      )
    ]
  ));
  const top = {
    top20: aggregateOriginTopN(finiteRows, 20),
    top50: aggregateOriginTopN(finiteRows, 50)
  };
  const candidateNumericFailures = rows.filter((row) => (
    /^NUMERIC_STABILITY_FAIL/u.test(row.rawNumericStatus)
  )).length;
  const nonfiniteCount = rows.filter((row) => (
    !Number.isFinite(row[field])
    && /^NUMERIC_STABILITY_FAIL/u.test(row.rawNumericStatus)
  )).length;
  const fallbackCount = rows.filter(
    (row) => row.selectedStatus === "FALLBACK_TO_C0"
  ).length;
  const abstainCount = rows.filter((row) => row.abstained).length;
  const boundTriggerCount = rows.filter(
    (row) => row.residualBoundTriggered
  ).length;
  return Object.freeze({
    variant,
    ...metrics,
    baseOnSameCases: baseMetrics,
    pairedFvaVsC0: pairedFva,
    bootstrap: bootstrap === null ? null : {
      status: bootstrap.status,
      method: bootstrap.method ?? null,
      iterations: bootstrap.iterations,
      confidenceLevel: config.evaluation.bootstrap.confidenceLevel,
      lower:
        bootstrap.relativeWapeImprovement95?.lower ?? null,
      median:
        bootstrap.relativeWapeImprovement95?.median ?? null,
      upper:
        bootstrap.relativeWapeImprovement95?.upper ?? null
    },
    independentTimeBlocks: blocks,
    cashBands: bandMetrics,
    originVisibleTopWorkErrors: top,
    fallbackCount,
    abstainCount,
    nonfiniteCount,
    boundTriggerCount,
    numericFailureCount: candidateNumericFailures,
    numericStabilityStatus: (
      nonfiniteCount === 0
      && abstainCount === 0
      && (
        !["C2", "C3"].includes(armId)
        || candidateNumericFailures === 0
      )
    ) ? "NUMERIC_STABILITY_PASS" : "NUMERIC_STABILITY_FAIL",
    rawCoverage: rows.length > 0 ? finiteRows.length / rows.length : 0
  });
}

function scoreRows(rows, pointField) {
  const finiteRows = rows.filter((row) => (
    Number.isFinite(row.actual)
    && Number.isFinite(row[pointField])
  ));
  const errors = finiteRows.map(
    (row) => Math.abs(row[pointField] - row.actual)
  );
  const denominator = sum(finiteRows.map(
    (row) => Math.abs(row.actual)
  ));
  const absoluteError = sum(errors);
  const errorByWork = new Map();
  for (let index = 0; index < finiteRows.length; index += 1) {
    const row = finiteRows[index];
    errorByWork.set(
      row.standardWorkId,
      (errorByWork.get(row.standardWorkId) ?? 0) + errors[index]
    );
  }
  const workErrors = [...errorByWork.values()].sort(
    (left, right) => right - left
  );
  const ratios = finiteRows.map((row) => predictionBaseRatio(
    row[pointField],
    row.basePointEstimate
  )).filter(Number.isFinite);
  return Object.freeze({
    caseCount: finiteRows.length,
    workCount: errorByWork.size,
    originCount: unique(finiteRows.map((row) => row.origin)).length,
    actualCash: sum(finiteRows.map((row) => row.actual)),
    predictedCash: sum(finiteRows.map((row) => row[pointField])),
    absoluteError,
    wape: denominator > 0 ? absoluteError / denominator : null,
    signedBias: denominator > 0
      ? sum(finiteRows.map((row) => row[pointField] - row.actual))
        / denominator
      : null,
    mae: finiteRows.length > 0
      ? absoluteError / finiteRows.length
      : null,
    medianAbsoluteError: median(errors),
    errorConcentration: {
      maximumSingleWorkAbsoluteErrorShare:
        absoluteError > 0 ? (workErrors[0] ?? 0) / absoluteError : null,
      top5WorkAbsoluteErrorShare:
        absoluteError > 0 ? sum(workErrors.slice(0, 5)) / absoluteError : null,
      top10WorkAbsoluteErrorShare:
        absoluteError > 0 ? sum(workErrors.slice(0, 10)) / absoluteError : null
    },
    predictionBaseRatio: {
      p50: quantileLinear(ratios, 0.5),
      p90: quantileLinear(ratios, 0.9),
      p95: quantileLinear(ratios, 0.95),
      p99: quantileLinear(ratios, 0.99),
      max: ratios.length > 0 ? Math.max(...ratios) : null
    }
  });
}

function aggregateBand(rows, totalOriginVisibleCash, config) {
  const candidate = scoreRows(rows, "pointEstimate");
  const baseline = scoreRows(rows, "basePointEstimate");
  const originCash = sum(rows.map(
    (row) => Math.max(Number(row.trailing12Cash), 0)
  ));
  const publishable = (
    candidate.caseCount >= config.publicPrivacy.minimumCaseCount
    && candidate.workCount >= config.publicPrivacy.minimumWorkCount
  );
  const relativeImprovement = baseline.absoluteError > 0
    ? (
      baseline.absoluteError - candidate.absoluteError
    ) / baseline.absoluteError
    : null;
  const result = {
    privacyStatus: publishable
      ? "PUBLISHED_ABOVE_THRESHOLD"
      : config.publicPrivacy.smallCellStatus,
    caseCount: candidate.caseCount,
    workCount: candidate.workCount,
    originCount: candidate.originCount,
    originVisibleCash: originCash,
    originVisibleCashShare: totalOriginVisibleCash > 0
      ? originCash / totalOriginVisibleCash
      : null,
    wape: publishable ? candidate.wape : null,
    signedBias: publishable ? candidate.signedBias : null,
    absoluteError: publishable ? candidate.absoluteError : null,
    baselineAbsoluteError: publishable
      ? baseline.absoluteError
      : null,
    relativeAbsoluteErrorImprovementVsC0:
      publishable ? relativeImprovement : null
  };
  Object.defineProperty(result, PRIVATE_GATE_METRICS, {
    enumerable: false,
    value: Object.freeze({
      relativeAbsoluteErrorImprovementVsC0: relativeImprovement,
      candidateAbsoluteError: candidate.absoluteError,
      baselineAbsoluteError: baseline.absoluteError
    })
  });
  return Object.freeze(result);
}

function aggregateOriginTopN(rows, count) {
  const selected = [];
  for (const origin of unique(rows.map((row) => row.origin)).sort()) {
    selected.push(...rows.filter(
      (row) => row.origin === origin
    ).sort((left, right) => (
      right.trailing12Cash - left.trailing12Cash
      || left.standardWorkId.localeCompare(right.standardWorkId)
    )).slice(0, count));
  }
  const candidateError = totalAbsoluteError(selected, "pointEstimate");
  const baselineError = totalAbsoluteError(
    selected,
    "basePointEstimate"
  );
  return Object.freeze({
    requestedWorkCountPerOrigin: count,
    caseCount: selected.length,
    absoluteError: candidateError,
    baselineAbsoluteError: baselineError,
    relativeAbsoluteErrorImprovementVsC0: baselineError > 0
      ? (baselineError - candidateError) / baselineError
      : null
  });
}

function independentTimeBlockSummary(rows) {
  const origins = unique(rows.map((row) => row.origin)).sort();
  const selected = [];
  let lastSerial = -Infinity;
  for (const origin of origins) {
    const serial = monthSerial(origin);
    if (serial - lastSerial >= 3) {
      selected.push(origin);
      lastSerial = serial;
    }
  }
  const results = selected.map((origin) => {
    const originRows = rows.filter((row) => row.origin === origin);
    const candidateError = totalAbsoluteError(
      originRows,
      "pointEstimate"
    );
    const baselineError = totalAbsoluteError(
      originRows,
      "basePointEstimate"
    );
    return {
      improving: candidateError < baselineError,
      candidateAbsoluteError: candidateError,
      baselineAbsoluteError: baselineError
    };
  });
  const wins = results.filter((row) => row.improving).length;
  return Object.freeze({
    rule: "GREEDY_NONOVERLAPPING_FORECAST_WINDOWS_BY_HORIZON",
    count: results.length,
    wins,
    lossesOrTies: results.length - wins,
    improvingShare: results.length > 0 ? wins / results.length : null
  });
}

function countIndependentTimeBlocks(origins, horizonMonths) {
  let count = 0;
  let lastEnd = -Infinity;
  for (const origin of unique(origins).sort()) {
    const start = monthSerial(origin) + 1;
    const end = monthSerial(origin) + horizonMonths;
    if (start <= lastEnd) continue;
    count += 1;
    lastEnd = end;
  }
  return count;
}

function decideCandidate(cells, config) {
  const candidates = ["C2", "C3"].map((armId) => {
    const primary = findVariant(
      cells,
      "STRICT_ROLLING",
      "CORE80",
      armId,
      "raw"
    );
    const sensitivity = findVariant(
      cells,
      "STRICT_ROLLING",
      "CORE90",
      armId,
      "raw"
    );
    const primaryNumeric = findVariant(
      cells,
      "PRIMARY_ROLLING",
      "CORE90",
      armId,
      "raw"
    );
    const confirmed = config.decisionPolicy.confirmedDevelopmentPass;
    const bootstrapLower = primary?.bootstrap?.lower ?? null;
    const bootstrapUpper = primary?.bootstrap?.upper ?? null;
    const headImprovement =
      primary?.cashBands?.H50
        ?.relativeAbsoluteErrorImprovementVsC0
      ?? primary?.cashBands?.H50?.[PRIVATE_GATE_METRICS]
        ?.relativeAbsoluteErrorImprovementVsC0
      ?? null;
    const maximumShare =
      primary?.errorConcentration
        ?.maximumSingleWorkAbsoluteErrorShare ?? null;
    const baseMaximumShare =
      primary?.baseOnSameCases?.errorConcentration
        ?.maximumSingleWorkAbsoluteErrorShare ?? null;
    const top10Share =
      primary?.errorConcentration?.top10WorkAbsoluteErrorShare ?? null;
    const baseTop10Share =
      primary?.baseOnSameCases?.errorConcentration
        ?.top10WorkAbsoluteErrorShare ?? null;
    const checks = Object.freeze({
      rawCandidateEvidence:
        primary !== null && primary.caseCount > 0,
      minimumCore80PairedFva:
        Number.isFinite(primary?.pairedFvaVsC0)
        && primary.pairedFvaVsC0
          >= confirmed.minimumCore80PairedFva,
      improvingTimeBlockShare:
        Number.isFinite(
          primary?.independentTimeBlocks?.improvingShare
        )
        && primary.independentTimeBlocks.improvingShare
          > confirmed.minimumImprovingTimeBlockShareExclusive,
      biasGuard:
        Number.isFinite(primary?.signedBias)
        && Number.isFinite(primary?.baseOnSameCases?.signedBias)
        && Math.abs(primary.signedBias)
          <= Math.abs(primary.baseOnSameCases.signedBias)
            + confirmed.maximumAbsoluteBiasWorsening,
      headCashGuard:
        Number.isFinite(headImprovement)
        && headImprovement
          >= confirmed.minimumH50AbsoluteErrorImprovement,
      maximumWorkConcentrationGuard:
        Number.isFinite(maximumShare)
        && Number.isFinite(baseMaximumShare)
        && maximumShare
          <= baseMaximumShare
            + confirmed.maximumSingleWorkErrorShareWorsening,
      top10ConcentrationGuard:
        Number.isFinite(top10Share)
        && Number.isFinite(baseTop10Share)
        && top10Share
          <= baseTop10Share
            + confirmed.maximumTop10ErrorConcentrationWorsening,
      numericStability:
        primary?.numericStabilityStatus === "NUMERIC_STABILITY_PASS"
        && sensitivity?.numericStabilityStatus
          === "NUMERIC_STABILITY_PASS"
        && primaryNumeric?.numericStabilityStatus
          === "NUMERIC_STABILITY_PASS",
      core90NoOppositeMaterialDegradation:
        Number.isFinite(sensitivity?.pairedFvaVsC0)
        && sensitivity.pairedFvaVsC0
          >= -confirmed.minimumCore80PairedFva
    });
    const guardrailsPass = Object.values(checks).every(Boolean);
    const confirmedPass = (
      guardrailsPass
      && Number.isFinite(bootstrapLower)
      && bootstrapLower
        > confirmed.bootstrapLowerBoundMustExceed
    );
    const promising = (
      guardrailsPass
      && Number.isFinite(bootstrapLower)
      && Number.isFinite(bootstrapUpper)
      && bootstrapLower <= 0
      && bootstrapUpper >= 0
    );
    return Object.freeze({
      armId,
      status: confirmedPass
        ? config.decisionPolicy.confirmedDevelopmentPass.status
        : promising
          ? config.decisionPolicy.promisingUnconfirmed.status
          : config.decisionPolicy.failureStatus,
      checks,
      primaryWape: primary?.wape ?? null,
      primaryPairedFva: primary?.pairedFvaVsC0 ?? null,
      bootstrapLower,
      bootstrapUpper,
      failureReasons: Object.entries(checks)
        .filter(([, passed]) => !passed)
        .map(([key]) => key)
    });
  });
  const rank = new Map([
    [config.decisionPolicy.confirmedDevelopmentPass.status, 0],
    [config.decisionPolicy.promisingUnconfirmed.status, 1],
    [config.decisionPolicy.failureStatus, 2]
  ]);
  const selected = [...candidates].sort((left, right) => (
    (rank.get(left.status) ?? 9) - (rank.get(right.status) ?? 9)
    || nullableSort(left.primaryWape, right.primaryWape)
    || left.armId.localeCompare(right.armId)
  ))[0];
  return Object.freeze({
    status: selected.status,
    selectedRawArmId: selected.armId,
    candidates: Object.freeze(candidates),
    activeCandidate: null,
    approvedForAutomation: null,
    selectedFallbackMayCreatePass: false
  });
}

function findVariant(cells, family, populationId, armId, variant) {
  return cells.find((cell) => (
    cell.evaluationFamily === family
    && cell.populationId === populationId
    && cell.armId === armId
  ))?.[variant] ?? null;
}

function buildBandIndex(rows, config) {
  const index = new Map();
  for (const origin of unique(rows.map((row) => row.origin))) {
    for (const band of assignLg01HeadCashBands(
      rows.filter((row) => row.origin === origin),
      config
    )) {
      index.set(
        [
          rows[0]?.evaluationFamily ?? "",
          "CORE80",
          band.standardWorkId,
          origin,
          3
        ].join("\u0000"),
        band.bandId
      );
      index.set(
        [
          rows[0]?.evaluationFamily ?? "",
          "CORE90",
          band.standardWorkId,
          origin,
          3
        ].join("\u0000"),
        band.bandId
      );
    }
  }
  return index;
}

function predictionRatioFence(rows, config) {
  const ratios = rows.map((row) => (
    Number.isFinite(row.numericSafetyRatio)
      ? row.numericSafetyRatio
      : predictionScaleRatio(
        row.pointEstimate,
        row.basePointEstimate,
        row.positiveBaseFloor
      )
  )).filter(Number.isFinite);
  if (ratios.length === 0) return null;
  const q01 = quantileLinear(
    ratios,
    config.numericStability.stablePredictionBaseRatio.lowerCoreQuantile
  );
  const q99 = quantileLinear(
    ratios,
    config.numericStability.stablePredictionBaseRatio.upperCoreQuantile
  );
  const q25 = quantileLinear(ratios, 0.25);
  const q75 = quantileLinear(ratios, 0.75);
  const iqr = q75 - q25;
  return Object.freeze({
    lower: q01 - 1.5 * iqr,
    upper: q99 + 1.5 * iqr,
    sourceRowCount: ratios.length
  });
}

function ratiosInsideFence(rows, fence) {
  return fence !== null && rows.every((row) => ratioInsideFence(
    Number.isFinite(row.numericSafetyRatio)
      ? row.numericSafetyRatio
      : predictionScaleRatio(
        row.pointEstimate,
        row.basePointEstimate,
        row.positiveBaseFloor
      ),
    fence
  ));
}

function ratioInsideFence(ratio, fence) {
  return (
    Number.isFinite(ratio)
    && fence !== null
    && Number.isFinite(fence.lower)
    && Number.isFinite(fence.upper)
    && ratio >= fence.lower
    && ratio <= fence.upper
  );
}

function predictionBaseRatio(pointEstimate, basePointEstimate) {
  return basePointEstimate !== null
    && basePointEstimate !== undefined
    && Math.abs(Number(basePointEstimate)) > EPSILON
    && Number.isFinite(pointEstimate)
    && Number.isFinite(basePointEstimate)
    ? pointEstimate / basePointEstimate
    : null;
}

function predictionScaleRatio(
  pointEstimate,
  basePointEstimate,
  positiveBaseFloor
) {
  if (
    !Number.isFinite(pointEstimate)
    || !Number.isFinite(basePointEstimate)
    || !Number.isFinite(positiveBaseFloor)
    || !(positiveBaseFloor > 0)
  ) {
    return null;
  }
  const sign = basePointEstimate < 0 ? -1 : 1;
  const denominator = sign * Math.max(
    Math.abs(basePointEstimate),
    positiveBaseFloor
  );
  return pointEstimate / denominator;
}

function eligibleEarlierRows(rows, outerOrigin) {
  return rows.filter((row) => (
    row.origin < outerOrigin
    && row.labelAvailableAsOf <= outerOrigin
  ));
}

function normalizedAbsoluteError(rows) {
  const denominator = sum(rows.map((row) => Math.abs(row.actual)));
  return denominator > 0
    ? totalAbsoluteError(rows, "pointEstimate") / denominator
    : null;
}

function totalAbsoluteError(rows, pointField) {
  return sum(rows.filter((row) => (
    Number.isFinite(row.actual) && Number.isFinite(row[pointField])
  )).map((row) => Math.abs(row[pointField] - row.actual)));
}

function deduplicateRows(rows) {
  const output = new Map();
  for (const row of rows) {
    output.set(
      `${row.standardWorkId}\u0000${row.origin}`,
      row
    );
  }
  return [...output.values()];
}

function inputCaseKey(row) {
  return [
    row.evaluationFamily,
    row.populationId,
    row.standardWorkId,
    row.origin,
    Number(row.horizonMonths)
  ].join("\u0000");
}

function compareInputRows(left, right) {
  return (
    left.evaluationFamily.localeCompare(right.evaluationFamily)
    || left.populationId.localeCompare(right.populationId)
    || left.origin.localeCompare(right.origin)
    || left.standardWorkId.localeCompare(right.standardWorkId)
  );
}

function comparePredictionRows(left, right) {
  return (
    compareInputRows(left, right)
    || left.armId.localeCompare(right.armId)
  );
}

function compareSelectionRows(left, right) {
  return (
    left.evaluationFamily.localeCompare(right.evaluationFamily)
    || left.outerOrigin.localeCompare(right.outerOrigin)
  );
}

function stableSeed(...values) {
  return createHash("sha256")
    .update(values.join("\u0000"))
    .digest()
    .readUInt32BE(0) % 1000000;
}

function monthSerial(month) {
  const [year, value] = month.split("-").map(Number);
  return year * 12 + value - 1;
}

function median(values) {
  return quantileLinear(values, 0.5);
}

function unique(values) {
  return [...new Set(values)];
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function clamp(value, lower, upper) {
  return Math.min(upper, Math.max(lower, value));
}

function nullableSort(left, right) {
  const leftValue = Number.isFinite(left) ? left : Infinity;
  const rightValue = Number.isFinite(right) ? right : Infinity;
  return leftValue - rightValue;
}

function requireMember(value, allowed, name) {
  if (!allowed.includes(value)) fail(`hcrc_${name}_invalid`);
  return value;
}

function requireMonth(value) {
  const month = nonempty(value, "month");
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/u.test(month)) {
    fail("hcrc_month_invalid");
  }
  return month;
}

function requireFinite(value, name) {
  if (value === null || value === undefined) {
    fail(`hcrc_${name}_nonfinite`);
  }
  const number = Number(value);
  if (!Number.isFinite(number)) fail(`hcrc_${name}_nonfinite`);
  return number;
}

function nullableFinite(value) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonempty(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    fail(`hcrc_${name}_required`);
  }
  return value.trim();
}

function fail(message) {
  throw new Error(message);
}
