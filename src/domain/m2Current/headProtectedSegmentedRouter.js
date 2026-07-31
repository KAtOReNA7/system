import {
  assignLg01HeadCashBands,
  quantileLinear
} from "./lg01HeadCashResidual.js";
import {
  selectOriginSafeCoreLegacyPopulations
} from "./coreLegacyPopulation.js";

export const HPSR_MODEL_ID = "M2-WORK-HPSR01";
export const HPSR_EXPERIMENT_ID =
  "M2-EXP-LG01-HEAD-PROTECTED-SEGMENTED-ROUTER-01";
export const HPSR_ARM_IDS = Object.freeze(["R0", "D1", "R1"]);
export const HPSR_WAITING_STATUS =
  "M2_HEAD_PROTECTED_SEGMENTED_ROUTER_WAITING_FOR_NEW_BILLS";
export const HPSR_IMPLEMENTED_STATUS =
  "M2_HEAD_PROTECTED_SEGMENTED_ROUTER_"
    + "IMPLEMENTED_AWAITING_LATER_ORIGIN_DATA";
export const HPSR_READY_FOR_AUTHORIZATION_STATUS =
  "M2_HEAD_PROTECTED_SEGMENTED_ROUTER_"
    + "READY_FOR_SEPARATE_LATER_ORIGIN_AUTHORIZATION";
export const HPSR_BOUND_PROVENANCE_BLOCKED_STATUS =
  "M2_HEAD_PROTECTED_SEGMENTED_ROUTER_"
    + "IMPLEMENTATION_BLOCKED_UNPROVEN_BOUND_PROVENANCE";
export const HPSR_AUTHORITY_BLOCKED_STATUS =
  "M2_HEAD_PROTECTED_SEGMENTED_ROUTER_"
    + "BLOCKED_MISSING_PRIVATE_AUTHORITY";
export const HPSR_NUMERIC_FALLBACK_STATUS =
  "NUMERIC_INPUT_INVALID_FALLBACK_LG01";
export const HPSR_K1_EXECUTION_STATUS =
  "COMPLETED_PUBLIC_SYNTHETIC_VALIDATION";
export const HPSR_K2_WAITING_STATUS =
  "NOT_EXECUTED_AWAITING_SEPARATE_AUTHORIZATION_AND_DATA";

const MONTH_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/u;
const HPSR_CASH_BAND_IDS = Object.freeze(["H50", "M30", "L20"]);
const HPSR_OUTCOME_FIELD_PATTERN =
  /(?:actual|label|outcome|wape|bias|fva|bootstrap)/iu;
const OPENED_EVIDENCE_CLASSES = Object.freeze([
  "AVAILABILITY_METADATA_ONLY",
  "ACTUAL_VALUE_OPENED",
  "UNKNOWN_AMBIGUOUS"
]);

export function summarizeHpsrOpenedEvidence(evidence) {
  if (!Array.isArray(evidence) || evidence.length === 0) {
    throw new Error("hpsr_opened_evidence_required");
  }
  const availabilityOrigins = [];
  const actualOrigins = [];
  const availabilityMonths = [];
  const actualMonths = [];
  const availabilityEvidenceRefs = [];
  const actualEvidenceRefs = [];
  const ambiguousEvidenceRefs = [];
  let failedAttemptTouchedMetadataOnly = false;
  let failedAttemptOpenedOutcome = false;

  for (const item of evidence) {
    const accessClass = String(item?.accessClass ?? "");
    if (!OPENED_EVIDENCE_CLASSES.includes(accessClass)) {
      throw new Error("hpsr_opened_evidence_access_class_invalid");
    }
    const evidenceRef = nonempty(
      item?.evidenceRef,
      "opened_evidence_ref"
    );
    const origin = item?.origin === null || item?.origin === undefined
      ? null
      : requireMonth(item.origin, "opened_evidence_origin");
    const throughMonth =
      item?.throughMonth === null || item?.throughMonth === undefined
        ? null
        : requireMonth(
          item.throughMonth,
          "opened_evidence_through_month"
        );
    if (origin === null && throughMonth === null) {
      throw new Error("hpsr_opened_evidence_boundary_required");
    }
    if (accessClass === "UNKNOWN_AMBIGUOUS") {
      ambiguousEvidenceRefs.push(evidenceRef);
      continue;
    }
    if (origin !== null) availabilityOrigins.push(origin);
    if (throughMonth !== null) availabilityMonths.push(throughMonth);
    availabilityEvidenceRefs.push(evidenceRef);
    if (accessClass === "ACTUAL_VALUE_OPENED") {
      if (origin !== null) actualOrigins.push(origin);
      if (throughMonth !== null) actualMonths.push(throughMonth);
      actualEvidenceRefs.push(evidenceRef);
      if (item.failedAttempt === true) {
        failedAttemptOpenedOutcome = true;
      }
    } else if (item.failedAttempt === true) {
      failedAttemptTouchedMetadataOnly = true;
    }
  }

  return Object.freeze({
    maxAvailabilityInspectedOrigin: maximumMonthOrNull(
      availabilityOrigins
    ),
    maxActualValueOpenedOrigin: maximumMonthOrNull(actualOrigins),
    availabilityInspectedThrough: maximumMonthOrNull(
      availabilityMonths
    ),
    actualValueOpenedThrough: maximumMonthOrNull(actualMonths),
    failedAttemptTouchedMetadataOnly,
    failedAttemptOpenedOutcome,
    availabilityEvidenceRefs: Object.freeze(unique(
      availabilityEvidenceRefs
    ).sort()),
    actualEvidenceRefs: Object.freeze(unique(actualEvidenceRefs).sort()),
    ambiguousEvidenceRefs: Object.freeze(unique(
      ambiguousEvidenceRefs
    ).sort()),
    hasUnknownOrAmbiguousEvidence: ambiguousEvidenceRefs.length > 0
  });
}

export function planHpsrProspectiveReservation({
  maxActualValueOpenedOrigin,
  completeAuthoritativeBillMonthThrough,
  horizonMonths = 3
}) {
  const maximumOpenedOrigin = requireMonth(
    maxActualValueOpenedOrigin,
    "max_actual_value_opened_origin"
  );
  const completeThrough = requireMonth(
    completeAuthoritativeBillMonthThrough,
    "complete_authoritative_bill_month_through"
  );
  if (!Number.isSafeInteger(horizonMonths) || horizonMonths <= 0) {
    throw new Error("hpsr_horizon_months_invalid");
  }
  const firstIndependentLaterOrigin = addMonths(maximumOpenedOrigin, 1);
  const firstIndependentFutureBillMonths = Object.freeze(Array.from(
    { length: horizonMonths },
    (_, index) => addMonths(firstIndependentLaterOrigin, index + 1)
  ));
  const prospectiveFinalHoldoutOrigin = addMonths(
    firstIndependentLaterOrigin,
    horizonMonths
  );
  const prospectiveFinalHoldoutFutureBillMonths = Object.freeze(
    Array.from(
      { length: horizonMonths },
      (_, index) => addMonths(
        prospectiveFinalHoldoutOrigin,
        index + 1
      )
    )
  );
  const firstIndependentLaterOriginReady = (
    compareMonths(
      firstIndependentFutureBillMonths.at(-1),
      completeThrough
    ) <= 0
  );
  const prospectiveFinalHoldoutReady = (
    compareMonths(
      prospectiveFinalHoldoutFutureBillMonths.at(-1),
      completeThrough
    ) <= 0
  );
  if (forecastWindowsOverlap(
    firstIndependentLaterOrigin,
    prospectiveFinalHoldoutOrigin,
    horizonMonths
  )) {
    throw new Error("hpsr_prospective_holdout_window_overlap");
  }
  return Object.freeze({
    firstIndependentLaterOrigin,
    firstIndependentFutureBillMonths,
    firstIndependentRequiredCompleteThrough:
      firstIndependentFutureBillMonths.at(-1),
    firstIndependentLaterOriginReady,
    prospectiveFinalHoldoutOrigin,
    prospectiveFinalHoldoutFutureBillMonths,
    prospectiveFinalHoldoutRequiredCompleteThrough:
      prospectiveFinalHoldoutFutureBillMonths.at(-1),
    prospectiveFinalHoldoutReady,
    prospectiveFinalHoldoutOpened: false,
    prospectiveFinalHoldoutOutcomeRead: false,
    status: firstIndependentLaterOriginReady
      ? HPSR_READY_FOR_AUTHORIZATION_STATUS
      : HPSR_IMPLEMENTED_STATUS
  });
}

export function deriveHpsrResidualBounds(
  developmentRows,
  {
    maximumOpenedDevelopmentOrigin,
    positiveBaseQuantile = 0.1,
    lowerResidualQuantile = 0.05,
    upperResidualQuantile = 0.95
  }
) {
  if (!Array.isArray(developmentRows) || developmentRows.length === 0) {
    throw new Error("hpsr_residual_bound_development_rows_required");
  }
  const maximumOrigin = requireMonth(
    maximumOpenedDevelopmentOrigin,
    "maximum_opened_development_origin"
  );
  const normalized = developmentRows.map((input) => {
    const origin = requireMonth(
      input?.origin,
      "residual_bound_row_origin"
    );
    if (compareMonths(origin, maximumOrigin) > 0) {
      throw new Error(
        "hpsr_residual_bound_later_origin_outcome_forbidden"
      );
    }
    return Object.freeze({
      origin,
      basePointEstimate: nullableNumber(input?.basePointEstimate),
      rawPointEstimate: nullableNumber(input?.rawPointEstimate)
    });
  });
  const finiteRows = normalized.filter((row) => (
    Number.isFinite(row.basePointEstimate)
    && Number.isFinite(row.rawPointEstimate)
  ));
  const positiveBaseRows = finiteRows.filter(
    (row) => row.basePointEstimate > 0
  );
  if (positiveBaseRows.length === 0) {
    throw new Error(
      "hpsr_residual_bound_positive_base_support_required"
    );
  }
  const positiveBaseFloor = quantileLinear(
    positiveBaseRows.map((row) => row.basePointEstimate),
    positiveBaseQuantile
  );
  if (!Number.isFinite(positiveBaseFloor) || positiveBaseFloor <= 0) {
    throw new Error("hpsr_residual_bound_positive_floor_invalid");
  }
  const normalizedResiduals = finiteRows.map((row) => {
    const scale = Math.max(
      Math.abs(row.basePointEstimate),
      positiveBaseFloor
    );
    return (
      row.rawPointEstimate - row.basePointEstimate
    ) / scale;
  }).filter(Number.isFinite);
  if (normalizedResiduals.length === 0) {
    throw new Error("hpsr_residual_bound_support_empty");
  }
  const lowerBound = quantileLinear(
    normalizedResiduals,
    lowerResidualQuantile
  );
  const upperBound = quantileLinear(
    normalizedResiduals,
    upperResidualQuantile
  );
  if (
    !Number.isFinite(lowerBound)
    || !Number.isFinite(upperBound)
    || lowerBound > upperBound
  ) {
    throw new Error("hpsr_residual_bound_quantiles_invalid");
  }
  return Object.freeze({
    status: "FROZEN_FROM_PREVIOUSLY_OPENED_DEVELOPMENT_ONLY",
    valid: true,
    positiveBaseFloor,
    lowerBound,
    upperBound,
    inputRowCount: normalized.length,
    finiteSupportRowCount: finiteRows.length,
    excludedNonfiniteRowCount: normalized.length - finiteRows.length,
    positiveBaseSupportRowCount: positiveBaseRows.length,
    derivationOriginRange: Object.freeze({
      from: minimumMonth(normalized.map((row) => row.origin)),
      through: maximumMonthOrNull(
        normalized.map((row) => row.origin)
      )
    }),
    maximumOpenedDevelopmentOrigin: maximumOrigin,
    laterOriginOutcomeUsed: false,
    finalHoldoutOutcomeUsed: false,
    quantileMethod: "LINEAR_INTERPOLATION_N_MINUS_ONE",
    quantiles: Object.freeze({
      positiveBaseFloor: positiveBaseQuantile,
      lowerNormalizedResidual: lowerResidualQuantile,
      upperNormalizedResidual: upperResidualQuantile
    })
  });
}

export function buildHpsrOriginCashBands({
  origin,
  originVisibleMonthlyCashRows
}) {
  const normalizedOrigin = requireMonth(origin, "cash_band_origin");
  if (
    !Array.isArray(originVisibleMonthlyCashRows)
    || originVisibleMonthlyCashRows.length === 0
  ) {
    throw new Error("hpsr_origin_visible_monthly_cash_rows_required");
  }
  for (const row of originVisibleMonthlyCashRows) {
    const month = requireMonth(row?.month, "cash_row_month");
    if (compareMonths(month, normalizedOrigin) > 0) {
      throw new Error("hpsr_post_origin_cash_row_forbidden");
    }
    assertNoOutcomeFields(row, "origin_visible_cash_row");
  }
  const selection = selectOriginSafeCoreLegacyPopulations({
    origin: normalizedOrigin,
    eligibleMonthlyRows: originVisibleMonthlyCashRows,
    thresholds: { CORE80: 0.8 },
    topCounts: []
  });
  if (selection.status !== "SELECTED") {
    throw new Error("hpsr_dynamic_core80_not_computable");
  }
  const core80WorkIds = selection.populations.CORE80;
  if (!Array.isArray(core80WorkIds) || core80WorkIds.length === 0) {
    throw new Error("hpsr_dynamic_core80_empty");
  }
  const rankedByWork = new Map(selection.ranked.map((row) => [
    row.standardWorkId,
    row
  ]));
  const cashBandRows = assignLg01HeadCashBands(
    core80WorkIds.map((standardWorkId) => {
      const ranked = rankedByWork.get(standardWorkId);
      if (ranked === undefined) {
        throw new Error("hpsr_core80_rank_join_missing");
      }
      return {
        standardWorkId,
        origin: normalizedOrigin,
        trailing12Cash: ranked.referenceRevenue
      };
    }),
    {
      cashBands: {
        nonpositiveOriginCashPolicy:
          "NOT_COMPUTABLE_NONPOSITIVE_ORIGIN_VISIBLE_CASH"
      }
    }
  );
  if (
    cashBandRows.length !== core80WorkIds.length
    || cashBandRows.some((row) => (
      !HPSR_CASH_BAND_IDS.includes(row.bandId)
    ))
  ) {
    throw new Error("hpsr_cash_band_assignment_incomplete");
  }
  const bandCounts = Object.fromEntries(HPSR_CASH_BAND_IDS.map(
    (bandId) => [
      bandId,
      cashBandRows.filter((row) => row.bandId === bandId).length
    ]
  ));
  return Object.freeze({
    status: "DYNAMIC_CORE80_CASH_BANDS_ASSIGNED",
    origin: normalizedOrigin,
    referenceWindow: selection.referenceWindow,
    core80SelectionThreshold: 0.8,
    core80WorkIds: Object.freeze([...core80WorkIds]),
    core80WorkCount: core80WorkIds.length,
    core80CutoffTieCount:
      selection.populationDiagnostics.CORE80.cutoffTieCount,
    core80ReferenceRevenueCapture:
      selection.populationDiagnostics.CORE80.referenceRevenueCapture,
    fixedMinimumWorkCountRequired: false,
    cashBandRows: Object.freeze(cashBandRows),
    bandCounts: Object.freeze(bandCounts),
    futureCashUsed: false
  });
}

export function runHeadProtectedSegmentedRouter({
  origin,
  horizonMonths = 3,
  originVisibleMonthlyCashRows,
  predictionRows,
  residualBoundState,
  executionMode = "SYNTHETIC_FIXTURE"
}) {
  const normalizedOrigin = requireMonth(origin, "router_origin");
  if (Number(horizonMonths) !== 3) {
    throw new Error("hpsr_only_three_month_horizon_allowed");
  }
  if (![
    "SYNTHETIC_FIXTURE",
    "CONTROLLED_LATER_ORIGIN"
  ].includes(executionMode)) {
    throw new Error("hpsr_execution_mode_invalid");
  }
  if (!Array.isArray(predictionRows) || predictionRows.length === 0) {
    throw new Error("hpsr_prediction_rows_required");
  }
  const bounds = normalizeHpsrBoundState(
    residualBoundState,
    executionMode
  );
  const population = buildHpsrOriginCashBands({
    origin: normalizedOrigin,
    originVisibleMonthlyCashRows
  });
  const normalizedPredictions = predictionRows.map((row) => (
    normalizeHpsrPredictionRow(row, {
      origin: normalizedOrigin,
      horizonMonths: 3
    })
  ));
  const predictionByWork = new Map();
  for (const row of normalizedPredictions) {
    if (predictionByWork.has(row.standardWorkId)) {
      throw new Error("hpsr_prediction_case_duplicate");
    }
    predictionByWork.set(row.standardWorkId, row);
  }
  const bandByWork = new Map(population.cashBandRows.map((row) => [
    row.standardWorkId,
    row
  ]));
  const r0Rows = [];
  const d1Rows = [];
  const r1Rows = [];
  for (const standardWorkId of population.core80WorkIds) {
    const row = predictionByWork.get(standardWorkId);
    if (row === undefined) {
      throw new Error("hpsr_core80_prediction_member_missing");
    }
    const cashBand = bandByWork.get(standardWorkId);
    if (cashBand === undefined) {
      throw new Error("hpsr_cash_band_member_missing");
    }
    if (!Number.isFinite(row.lg01Prediction)) {
      throw new Error("hpsr_nonfinite_lg01_base_no_finite_fallback");
    }
    const common = Object.freeze({
      standardWorkId,
      origin: normalizedOrigin,
      horizonMonths: 3,
      cashBandId: cashBand.bandId
    });
    const r0 = Object.freeze({
      ...common,
      armId: "R0",
      modelId: "M2-WORK-LG01",
      pointEstimate: row.lg01Prediction,
      architectureStatus: "FROZEN_LG01_BASELINE"
    });
    const diagnostic = buildHpsrRawDiagnostic(row, common, bounds);
    const candidate = buildHpsrCandidateRow(
      row,
      common,
      bounds,
      diagnostic
    );
    r0Rows.push(r0);
    d1Rows.push(diagnostic);
    r1Rows.push(candidate);
  }
  const caseKeys = r0Rows.map(hpsrCaseKey);
  if (
    !sameValues(caseKeys, d1Rows.map(hpsrCaseKey))
    || !sameValues(caseKeys, r1Rows.map(hpsrCaseKey))
  ) {
    throw new Error("hpsr_case_key_conservation_failed");
  }
  if (!r1Rows.every((row) => Number.isFinite(row.pointEstimate))) {
    throw new Error("hpsr_final_prediction_nonfinite");
  }
  const h50Rows = r1Rows.filter((row) => row.cashBandId === "H50");
  const correctedRows = r1Rows.filter(
    (row) => row.correctionApplied === true
  );
  const fallbackRows = r1Rows.filter(
    (row) => row.fallbackToLg01 === true
  );
  const m30L20Rows = r1Rows.filter(
    (row) => row.cashBandId !== "H50"
  );
  const h50ExactLg01 = h50Rows.every((row) => (
    row.pointEstimate
      === predictionByWork.get(row.standardWorkId).lg01Prediction
    && row.fallbackToLg01 === false
  ));
  if (!h50ExactLg01) {
    throw new Error("hpsr_h50_exact_lg01_invariant_failed");
  }
  const outsideCoreWorkCount = normalizedPredictions.filter(
    (row) => !bandByWork.has(row.standardWorkId)
  ).length;
  const coverage = Object.freeze({
    inputPredictionWorkCount: normalizedPredictions.length,
    dynamicCore80WorkCount: r1Rows.length,
    outsideDynamicCore80AbstainedWorkCount: outsideCoreWorkCount,
    H50ArchitectureRowCount: h50Rows.length,
    H50FallbackRowCount: h50Rows.filter(
      (row) => row.fallbackToLg01
    ).length,
    M30L20RowCount: m30L20Rows.length,
    correctedRowCount: correctedRows.length,
    numericFallbackRowCount: fallbackRows.length,
    boundTriggeredRowCount: r1Rows.filter(
      (row) => row.boundTriggered
    ).length,
    rawB3FiniteExtremeRowCount: d1Rows.filter(
      (row) => row.finiteExtreme
    ).length,
    rawB3NonfiniteRowCount: d1Rows.filter(
      (row) => !row.rawPredictionFinite
    ).length,
    correctedCoverage: ratioOrNull(
      correctedRows.length,
      m30L20Rows.length
    ),
    numericFallbackCoverage: ratioOrNull(
      fallbackRows.length,
      m30L20Rows.length
    ),
    finalFiniteCoverage: ratioOrNull(
      r1Rows.filter((row) => Number.isFinite(row.pointEstimate)).length,
      r1Rows.length
    )
  });
  return Object.freeze({
    schema: "m2.current.head_protected_segmented_router.run.v0.1",
    experimentId: HPSR_EXPERIMENT_ID,
    modelId: HPSR_MODEL_ID,
    executionMode,
    origin: normalizedOrigin,
    horizonMonths: 3,
    status: executionMode === "SYNTHETIC_FIXTURE"
      ? "PUBLIC_SYNTHETIC_ROUTER_VALIDATED"
      : "CONTROLLED_ROUTER_COMPUTED_NO_EVALUATION",
    population,
    r0Rows: Object.freeze(r0Rows),
    d1RawDiagnosticRows: Object.freeze(d1Rows),
    r1RawRouterRows: Object.freeze(r1Rows),
    coverage,
    invariants: Object.freeze({
      dynamicCore80OriginVisibleOnly: true,
      H50RowwiseExactLg01: h50ExactLg01,
      H50IsFallback: false,
      M30Alpha: 1,
      L20Alpha: 1,
      globalAlphaDependency: false,
      otherBandDependency: false,
      alphaSearchExecuted: false,
      caseKeyConservationPass: true,
      allFinalR1PredictionsFinite: true,
      rawB3AndR1StoredSeparately: true,
      futureCashUsed: false,
      outcomeFieldsConsumed: false,
      scoreComputed: false,
      bootstrapExecuted: false
    })
  });
}

export function assertHpsrControlledExecutionGate({
  contract,
  availability,
  authorization
}) {
  if (
    contract?.experiment?.stableExperimentId !== HPSR_EXPERIMENT_ID
    || contract?.model?.stableModelId !== HPSR_MODEL_ID
  ) {
    throw new Error("hpsr_controlled_execute_contract_identity_invalid");
  }
  if (contract?.execution?.K2PrivateEvaluationAuthorizedNow !== true) {
    throw new Error(
      "hpsr_k2_not_authorized_current_task_fail_closed"
    );
  }
  if (
    authorization?.capabilityId
      !== "m2-head-protected-segmented-router"
    || authorization?.experimentId !== HPSR_EXPERIMENT_ID
    || authorization?.modelId !== HPSR_MODEL_ID
    || authorization?.K2PrivateEvaluationAuthorized !== true
    || authorization?.finalHoldoutAuthorized !== false
    || authorization?.singleCompleteOutcomeMaximum !== true
  ) {
    throw new Error("hpsr_new_capability_scoped_authorization_required");
  }
  if (
    availability?.auditBoundary?.newFutureActualAmountsRead !== false
    || availability?.auditBoundary?.newModelMetricsRead !== false
    || availability?.openedSemantics?.unknownOrAmbiguous !== false
  ) {
    throw new Error("hpsr_opened_origin_ledger_not_clean");
  }
  const plan = planHpsrProspectiveReservation({
    maxActualValueOpenedOrigin:
      availability.openedSemantics.maxActualValueOpenedOrigin,
    completeAuthoritativeBillMonthThrough:
      availability.billAvailability
        .completeAuthoritativeBillMonthThrough,
    horizonMonths: 3
  });
  if (!plan.firstIndependentLaterOriginReady) {
    throw new Error("hpsr_later_origin_bills_not_complete");
  }
  if (
    availability?.prospectiveFinalHoldout?.origin
      !== plan.prospectiveFinalHoldoutOrigin
    || availability?.prospectiveFinalHoldout?.opened !== false
    || availability?.prospectiveFinalHoldout?.outcomeRead !== false
    || forecastWindowsOverlap(
      plan.firstIndependentLaterOrigin,
      plan.prospectiveFinalHoldoutOrigin,
      3
    )
  ) {
    throw new Error("hpsr_prospective_final_holdout_not_clean");
  }
  return Object.freeze({
    authorized: true,
    capabilityId: authorization.capabilityId,
    laterOrigin: plan.firstIndependentLaterOrigin,
    prospectiveFinalHoldoutOrigin:
      plan.prospectiveFinalHoldoutOrigin,
    finalHoldoutOutcomeRead: false
  });
}

export function validateHpsrImplementationReadiness(value) {
  const errors = [];
  if (
    value?.schema
      !== "m2.current.head_protected_segmented_router."
        + "k1_implementation_readiness.public.v0.1"
    || value?.experimentId !== HPSR_EXPERIMENT_ID
    || value?.modelId !== HPSR_MODEL_ID
    || value?.status !== HPSR_IMPLEMENTED_STATUS
    || value?.implementation?.canonicalImplementationComplete !== true
    || value?.implementation?.publicSyntheticValidationPassed !== true
    || value?.implementation?.productionSurfaceChangeCount !== 0
    || value?.entrypoints?.readinessInventory
      !== "check:m2:head-protected-segmented-router-dates"
    || value?.entrypoints?.syntheticFixture
      !== "smoke:m2:current:head-protected-segmented-router"
    || value?.entrypoints?.futureControlledExecute
      !== "execute:m2:head-protected-segmented-router"
    || value?.syntheticValidation?.H50RowwiseExactLg01 !== true
    || value?.syntheticValidation?.H50FallbackRowCount !== 0
    || value?.syntheticValidation?.globalAlphaDependency !== false
    || value?.syntheticValidation?.finiteExtremeIsolated !== true
    || value?.syntheticValidation?.nonfiniteRawFallbackToLg01 !== true
    || value?.residualBounds
      ?.provenPreviouslyOpenedDevelopmentOnly !== true
    || value?.residualBounds?.laterOriginOutcomeUsed !== false
    || value?.auditBoundary?.newLaterOriginFutureActualRead !== false
    || value?.auditBoundary?.realScoreProduced !== false
    || value?.auditBoundary?.realBootstrapExecuted !== false
    || value?.authorization?.K2PrivateEvaluationAuthorizedNow !== false
    || value?.authorization?.finalHoldoutOpened !== false
  ) {
    errors.push("hpsr_k1_implementation_readiness_invalid");
  }
  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors)
  });
}

export function validateHeadProtectedSegmentedRouterContract(config) {
  const errors = [];
  if (
    config?.schema
      !== "m2.current.head_protected_segmented_router.v0.1"
  ) {
    errors.push("hpsr_contract_schema_invalid");
  }
  if (config?.model?.stableModelId !== HPSR_MODEL_ID) {
    errors.push("hpsr_contract_model_id_invalid");
  }
  if (
    config?.experiment?.stableExperimentId !== HPSR_EXPERIMENT_ID
  ) {
    errors.push("hpsr_contract_experiment_id_invalid");
  }
  if (
    !sameValues(
      (config?.identities ?? []).map(({ armId }) => armId),
      HPSR_ARM_IDS
    )
  ) {
    errors.push("hpsr_contract_arms_must_be_exactly_r0_d1_r1");
  }
  if (
    config?.experiment?.status !== HPSR_IMPLEMENTED_STATUS
    || config?.experiment?.phase
      !== "IMPLEMENTED_AWAITING_INDEPENDENT_EVALUATION"
    || config?.experiment?.K1 !== HPSR_K1_EXECUTION_STATUS
    || config?.experiment?.K2 !== HPSR_K2_WAITING_STATUS
    || config?.experiment?.outerOutcomeRead !== false
    || config?.experiment?.firstCompleteOutcomeProduced !== false
    || config?.model?.implementationStatus
      !== "IMPLEMENTED_PUBLIC_SYNTHETIC_VERIFIED_"
        + "AWAITING_INDEPENDENT_EVALUATION"
    || config?.model?.registryRole
      !== "implemented_awaiting_independent_evaluation"
  ) {
    errors.push("hpsr_contract_implementation_state_invalid");
  }
  if (
    !sameValues(config?.scope?.horizonsMonths, [3])
    || config?.scope?.primaryPopulationId !== "CORE80"
    || config?.scope?.sensitivityPopulationId !== "CORE90"
    || config?.scope?.corePopulationSource
      !== "ORIGIN_VISIBLE_SALES_SHARE_CASH_ONLY"
    || config?.scope?.corePopulationRecomputedAtEveryOrigin !== true
    || config?.scope?.futureActualTopNAllowed !== false
  ) {
    errors.push("hpsr_contract_population_or_horizon_invalid");
  }
  if (
    config?.laterOriginQualification?.eligibleLaterOriginCount !== 0
    || config?.laterOriginQualification?.currentDecision
      !== HPSR_IMPLEMENTED_STATUS
    || config?.laterOriginQualification
      ?.originMustBeStrictlyAfterMaxActualValueOpenedOrigin !== true
    || config?.laterOriginQualification
      ?.availabilityInspectionAloneMayAdvanceActualOpenedBoundary
      !== false
    || config?.laterOriginQualification
      ?.earliestIndependentLaterOrigin !== "2026-03"
    || config?.laterOriginQualification
      ?.earliestIndependentRequiredCompleteThrough !== "2026-06"
  ) {
    errors.push("hpsr_contract_later_origin_boundary_invalid");
  }
  if (
    config?.finalHoldout?.authorized !== false
    || config?.finalHoldout?.openedByThisTask !== false
    || config?.finalHoldout?.historicalContractModified !== false
    || config?.finalHoldout?.singleAvailableOriginThatIsOnlyHoldoutMayBeConsumed
      !== false
    || config?.finalHoldout?.prospectiveFinalHoldoutOrigin !== "2026-06"
    || config?.finalHoldout?.prospectiveFinalHoldoutOpened !== false
    || config?.finalHoldout?.prospectiveFinalHoldoutOutcomeRead !== false
  ) {
    errors.push("hpsr_contract_final_holdout_boundary_invalid");
  }
  const bands = config?.cashBands?.bands ?? [];
  if (
    !sameValues(bands.map(({ bandId }) => bandId), ["H50", "M30", "L20"])
    || !sameValues(
      bands.map(({ cumulativeCashUpperInclusive }) => (
        cumulativeCashUpperInclusive
      )),
      [0.5, 0.8, 1]
    )
    || config?.cashBands?.futureActualUsed !== false
    || config?.cashBands?.fixedMinimumWorkCountAllowed !== false
    || config?.cashBands?.minimum50Or100WorksRequired !== false
  ) {
    errors.push("hpsr_contract_cash_bands_invalid");
  }
  const formula = config?.routerFormula;
  if (
    formula?.H50?.predictionFormula !== "base"
    || formula?.H50?.architectureComponent !== true
    || formula?.H50?.fallback !== false
    || formula?.H50?.rowwiseExactEqualityToR0Required !== true
    || formula?.M30?.alpha !== 1
    || formula?.L20?.alpha !== 1
    || formula?.M30?.globalAlphaDependencyAllowed !== false
    || formula?.L20?.globalAlphaDependencyAllowed !== false
    || formula?.M30?.otherBandDependencyAllowed !== false
    || formula?.L20?.otherBandDependencyAllowed !== false
    || formula?.alphaSelectionAllowed !== false
  ) {
    errors.push("hpsr_contract_router_formula_invalid");
  }
  const bounds = config?.residualBoundaryFreeze;
  if (
    bounds?.source !== "PREVIOUSLY_OPENED_HCRC01_DEVELOPMENT_ROWS_ONLY"
    || bounds?.laterOriginRowsOrOutcomeAllowed !== false
    || bounds?.positiveBaseFloor?.quantile !== 0.1
    || bounds?.normalizedResidualBounds?.lowerQuantile !== 0.05
    || bounds?.normalizedResidualBounds?.upperQuantile !== 0.95
    || bounds?.boundValuesMustFreezeBeforeLaterOutcome !== true
    || bounds?.boundValuesPresentAtK0B !== false
    || bounds?.boundValuesFrozenAtK1A !== true
    || bounds?.privateDerivedArtifactMaterialized !== true
    || bounds?.publicNumericValuesPublished !== false
    || bounds?.provenanceStatus
      !== "PROVEN_PREVIOUSLY_OPENED_DEVELOPMENT_ONLY"
  ) {
    errors.push("hpsr_contract_residual_bounds_invalid");
  }
  if (
    config?.numericSafety?.finiteExtremeRawB3Policy
      !== "PRESERVE_D1_RAW_AND_CLIP_NORMALIZED_RESIDUAL_BEFORE_R1"
    || config?.numericSafety?.nonfiniteFallbackStatus
      !== HPSR_NUMERIC_FALLBACK_STATUS
    || config?.numericSafety?.nonfiniteLg01BasePolicy
      !== "FAIL_CLOSED_BECAUSE_NO_FINITE_LG01_FALLBACK_EXISTS"
    || config?.numericSafety?.allFinalR1PredictionsFiniteRequired !== true
    || config?.numericSafety?.knownPrimaryCore90MagnitudeExplosionAllowed
      !== false
  ) {
    errors.push("hpsr_contract_numeric_safety_invalid");
  }
  if (
    config?.evaluation?.rawRouterReported !== true
    || config?.evaluation?.correctedOnlySubsetReported !== true
    || config?.evaluation?.fallbackOnlySubsetReported !== true
    || config?.evaluation?.selectedPipelineMayReplaceRawRouter !== false
    || config?.evaluation?.errorConcentrationIsHardGate !== false
    || config?.evaluation?.bootstrap?.workClusterIterations !== 2000
  ) {
    errors.push("hpsr_contract_evaluation_reporting_invalid");
  }
  if (
    config?.execution?.K1ImplementationAuthorizedNow !== true
    || config?.execution?.K1SemanticAndBoundPreparationCompleted !== true
    || config?.execution?.K1CanonicalImplementationCompleted !== true
    || config?.execution?.K1PublicSyntheticValidationCompleted !== true
    || config?.execution?.K2PrivateEvaluationAuthorizedNow !== false
    || config?.execution
      ?.singleQualifiedLaterOriginEvaluationConditionallyAuthorizedByUser
      !== false
    || config?.execution?.oneCompleteOutcomeMaximum !== true
    || config?.execution?.secondCompleteResultAllowed !== false
    || config?.execution?.secondBootstrapAllowed !== false
    || config?.authorization?.finalHoldout !== false
    || config?.authorization?.pullRequestMerge !== false
    || config?.authorization?.K1CanonicalImplementation !== true
    || config?.authorization?.syntheticFixtureValidation !== true
    || config?.authorization?.qualifiedLaterOriginValidation !== false
  ) {
    errors.push("hpsr_contract_execution_authorization_invalid");
  }
  if (
    config?.implementation?.canonicalImplementationComplete !== true
    || config?.implementation?.publicSyntheticValidationPassed !== true
    || config?.implementation?.readinessInventoryEntrypoint
      !== "check:m2:head-protected-segmented-router-dates"
    || config?.implementation?.syntheticFixtureEntrypoint
      !== "smoke:m2:current:head-protected-segmented-router"
    || config?.implementation?.futureControlledExecuteEntrypoint
      !== "execute:m2:head-protected-segmented-router"
    || config?.implementation?.productionLoaderRouteOrApiChanged !== false
    || config?.implementation?.productionSurfaceChangeCount !== 0
  ) {
    errors.push("hpsr_contract_implementation_entrypoints_invalid");
  }
  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors)
  });
}

export function validateHpsrSelectionAttribution(value) {
  const errors = [];
  if (
    value?.schema
      !== "m2.current.head_protected_segmented_router."
        + "selection_gate_attribution.v0.1"
    || value?.sourceStatusPreserved !== "M2_LG01_HEAD_CASH_RESIDUAL_FAIL"
    || value?.auditMode?.oldModelRerun !== false
    || value?.auditMode?.oldBootstrapRerun !== false
    || value?.privateSelectionEvidence
      ?.perOuterSelectionUnitAlphaRejectionReasonsRecoverable !== false
    || value?.recoverableFrozenAggregates?.outerSelectionCount !== 16
    || value?.recoverableFrozenAggregates
      ?.qualifiedGlobalAlphaSelectionCount !== 0
    || value?.dependencyAttribution?.confirmed !== true
    || value?.interpretation?.hcrc01FrozenFailureMayBeRewritten !== false
  ) {
    errors.push("hpsr_selection_attribution_boundary_invalid");
  }
  if (
    !sameValues(
      (value?.perAlphaRejectionCounts ?? []).map(({ alpha }) => alpha),
      [0.25, 0.5, 0.75, 1]
    )
    || !(value?.perAlphaRejectionCounts ?? []).every((row) => (
      row.biasGuard === null
      && row.h50AbsoluteErrorGuard === null
      && row.maximumSingleWorkErrorShareGuard === null
      && row.top10ErrorShareGuard === null
      && row.numericStabilityGuard === null
      && row.core90OppositeDegradationGuard === null
      && row.status
        === "NOT_RECOVERABLE_FROM_REMAINING_FROZEN_EVIDENCE"
    ))
  ) {
    errors.push("hpsr_selection_attribution_unknown_counts_must_stay_null");
  }
  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors)
  });
}

export function validateHpsrLaterOriginAvailability(value) {
  const errors = [];
  if (
    value?.schema
      !== "m2.current.head_protected_segmented_router."
        + "later_origin_availability.v0.2"
    || value?.status !== HPSR_IMPLEMENTED_STATUS
    || value?.auditBoundary?.newFutureActualAmountsRead !== false
    || value?.auditBoundary?.newModelMetricsRead !== false
    || value?.openedSemantics?.maxActualValueOpenedOrigin !== "2026-02"
    || value?.openedSemantics?.availabilityInspectedThrough !== "2026-05"
    || value?.openedSemantics?.actualValueOpenedThrough !== "2026-05"
    || value?.billAvailability
      ?.completeAuthoritativeBillMonthThrough !== "2026-04"
    || value?.candidateInventory?.eligibleLaterOriginCount !== 0
    || value?.candidateInventory
      ?.earliestIndependentLaterOrigin !== "2026-03"
    || value?.candidateInventory
      ?.earliestIndependentRequiredCompleteThrough !== "2026-06"
    || value?.historicalFinalHoldout?.openedByThisAudit !== false
    || value?.prospectiveFinalHoldout?.origin !== "2026-06"
    || value?.prospectiveFinalHoldout?.opened !== false
    || value?.prospectiveFinalHoldout?.outcomeRead !== false
    || value?.execution?.K1 !== HPSR_K1_EXECUTION_STATUS
    || value?.execution?.K2 !== HPSR_K2_WAITING_STATUS
  ) {
    errors.push("hpsr_later_origin_availability_boundary_invalid");
  }
  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors)
  });
}

export function validateHpsrOpenedOriginSemantics(value) {
  const errors = [];
  if (
    value?.schema
      !== "m2.current.head_protected_segmented_router."
        + "opened_origin_semantics.public.v0.2"
    || value?.experimentId !== HPSR_EXPERIMENT_ID
    || value?.modelId !== HPSR_MODEL_ID
    || value?.openedSemantics
      ?.availabilityMetadataCountsAsActualValueOpened !== false
    || value?.openedSemantics
      ?.maxAvailabilityInspectedOrigin !== "2026-02"
    || value?.openedSemantics
      ?.maxActualValueOpenedOrigin !== "2026-02"
    || value?.openedSemantics
      ?.availabilityInspectedThrough !== "2026-05"
    || value?.openedSemantics?.actualValueOpenedThrough !== "2026-05"
    || value?.openedSemantics
      ?.completeAuthoritativeBillMonthThrough !== "2026-04"
    || value?.openedSemantics
      ?.failedAttemptTouchedMetadataOnly !== true
    || value?.openedSemantics?.failedAttemptOpenedOutcome !== false
    || value?.openedSemantics?.unknownOrAmbiguous !== false
    || value?.semanticImpact
      ?.correctedEarliestIndependentLaterOrigin !== "2026-03"
    || value?.semanticImpact?.changedEarliestLaterOrigin !== true
    || value?.auditBoundary?.newFutureActualAmountsRead !== false
    || value?.auditBoundary?.historicalRawReceiptModified !== false
  ) {
    errors.push("hpsr_opened_origin_semantics_invalid");
  }
  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors)
  });
}

export function validateHpsrResidualBoundProvenance(value) {
  const errors = [];
  if (
    value?.schema
      !== "m2.current.head_protected_segmented_router."
        + "residual_bound_provenance.public.v0.1"
    || value?.experimentId !== HPSR_EXPERIMENT_ID
    || value?.modelId !== HPSR_MODEL_ID
    || value?.status
      !== "PROVEN_PREVIOUSLY_OPENED_DEVELOPMENT_ONLY"
    || value?.sourcePopulation
      !== "STRICT_ROLLING_CORE80_H3_B3_JOIN_FROZEN_LG01"
    || value?.derivationOriginRange?.from !== "2023-03"
    || value?.derivationOriginRange?.through !== "2025-09"
    || value?.maximumOpenedDevelopmentOrigin !== "2026-02"
    || value?.inputRowCount !== 577
    || value?.finiteSupportRowCount !== 577
    || value?.privateParameterValuesFrozen !== true
    || value?.publicParameterValuesPublished !== false
    || value?.actualFieldConsumedForBoundDerivation !== false
    || value?.laterOriginOutcomeUsed !== false
    || value?.prospectiveFinalHoldoutOutcomeUsed !== false
    || value?.privateDigestIsCrossComputerGate !== false
  ) {
    errors.push("hpsr_residual_bound_provenance_invalid");
  }
  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors)
  });
}

export function planHpsrLaterOrigins({
  maxPreviouslyOpenedOrigin,
  openedFutureActualThrough,
  latestCompleteMonth,
  horizonMonths = 3,
  existingUntouchedFinalHoldoutOrigin = null
}) {
  const maxOrigin = requireMonth(
    maxPreviouslyOpenedOrigin,
    "max_previously_opened_origin"
  );
  const openedThrough = requireMonth(
    openedFutureActualThrough,
    "opened_future_actual_through"
  );
  const latestComplete = requireMonth(
    latestCompleteMonth,
    "latest_complete_month"
  );
  if (!Number.isSafeInteger(horizonMonths) || horizonMonths <= 0) {
    throw new Error("hpsr_horizon_months_invalid");
  }
  const eligible = [];
  let origin = addMonths(maxOrigin, 1);
  while (compareMonths(origin, latestComplete) <= 0) {
    const futureBillMonths = Array.from(
      { length: horizonMonths },
      (_, index) => addMonths(origin, index + 1)
    );
    if (
      compareMonths(futureBillMonths[0], openedThrough) > 0
      && compareMonths(futureBillMonths.at(-1), latestComplete) <= 0
    ) {
      eligible.push(Object.freeze({
        origin,
        futureBillMonths: Object.freeze(futureBillMonths)
      }));
    }
    origin = addMonths(origin, 1);
  }
  const nonoverlapping = [];
  for (const candidate of eligible) {
    const previous = nonoverlapping.at(-1);
    if (
      previous === undefined
      || compareMonths(candidate.origin, previous.origin) >= horizonMonths
    ) {
      nonoverlapping.push(candidate);
    }
  }
  let finalHoldoutOrigin = existingUntouchedFinalHoldoutOrigin;
  let laterOrigins = [...nonoverlapping];
  if (finalHoldoutOrigin !== null) {
    requireMonth(finalHoldoutOrigin, "existing_final_holdout_origin");
    laterOrigins = laterOrigins.filter((candidate) => (
      !forecastWindowsOverlap(
        candidate.origin,
        finalHoldoutOrigin,
        horizonMonths
      )
    ));
  } else if (laterOrigins.length > 0) {
    finalHoldoutOrigin = laterOrigins.at(-1).origin;
    laterOrigins = laterOrigins.slice(0, -1);
  }
  const availabilityClass = laterOrigins.length >= 2
    ? "MULTI_ORIGIN_VALIDATION_AVAILABLE"
    : laterOrigins.length === 1
      ? "SINGLE_ORIGIN_DIRECTIONAL_VALIDATION_AVAILABLE"
      : "NO_AVAILABLE_LATER_ORIGIN_AFTER_HOLDOUT_RESERVATION";
  return Object.freeze({
    eligibleOrigins: Object.freeze(eligible),
    nonoverlappingOrigins: Object.freeze(nonoverlapping),
    laterOrigins: Object.freeze(laterOrigins),
    reservedFinalHoldoutOrigin: finalHoldoutOrigin,
    availabilityClass,
    waiting: laterOrigins.length === 0
  });
}

export function forecastWindowsOverlap(leftOrigin, rightOrigin, horizonMonths) {
  const leftStart = monthIndex(requireMonth(leftOrigin, "left_origin")) + 1;
  const rightStart = monthIndex(requireMonth(rightOrigin, "right_origin")) + 1;
  const leftEnd = leftStart + horizonMonths - 1;
  const rightEnd = rightStart + horizonMonths - 1;
  return leftStart <= rightEnd && rightStart <= leftEnd;
}

export function addMonths(month, offset) {
  const target = monthIndex(requireMonth(month, "month")) + Number(offset);
  if (!Number.isSafeInteger(target)) {
    throw new Error("hpsr_month_offset_invalid");
  }
  const year = Math.floor(target / 12);
  const monthNumber = target % 12 + 1;
  return `${year}-${String(monthNumber).padStart(2, "0")}`;
}

function normalizeHpsrBoundState(value, executionMode) {
  const parameterValues = value?.parameterValues ?? value;
  const positiveBaseFloor = parameterValues
    ?.frozenDevelopmentPositiveBaseFloor
    ?? parameterValues?.positiveBaseFloor;
  const lowerBound = parameterValues?.frozenDevelopmentQ05
    ?? parameterValues?.lowerBound;
  const upperBound = parameterValues?.frozenDevelopmentQ95
    ?? parameterValues?.upperBound;
  if (
    !Number.isFinite(positiveBaseFloor)
    || positiveBaseFloor <= 0
    || !Number.isFinite(lowerBound)
    || !Number.isFinite(upperBound)
    || lowerBound > upperBound
    || value?.laterOriginOutcomeUsed !== false
    || value?.prospectiveFinalHoldoutOutcomeUsed !== false
  ) {
    throw new Error("hpsr_residual_bound_state_invalid");
  }
  const sourceClass = String(
    value?.sourceClass ?? value?.status ?? ""
  );
  if (
    executionMode === "SYNTHETIC_FIXTURE"
    && sourceClass !== "PUBLIC_SYNTHETIC_FIXTURE_ONLY"
  ) {
    throw new Error("hpsr_synthetic_bound_source_invalid");
  }
  if (
    executionMode === "CONTROLLED_LATER_ORIGIN"
    && sourceClass
      !== "FROZEN_FROM_PREVIOUSLY_OPENED_DEVELOPMENT_ONLY"
  ) {
    throw new Error("hpsr_controlled_bound_provenance_invalid");
  }
  return Object.freeze({
    sourceClass,
    positiveBaseFloor,
    lowerBound,
    upperBound,
    laterOriginOutcomeUsed: false,
    prospectiveFinalHoldoutOutcomeUsed: false
  });
}

function normalizeHpsrPredictionRow(row, {
  origin,
  horizonMonths
}) {
  assertNoOutcomeFields(row, "prediction_row");
  const standardWorkId = nonempty(
    row?.standardWorkId,
    "prediction_standard_work_id"
  );
  if (requireMonth(row?.origin, "prediction_origin") !== origin) {
    throw new Error("hpsr_prediction_origin_mismatch");
  }
  if (Number(row?.horizonMonths) !== horizonMonths) {
    throw new Error("hpsr_prediction_horizon_mismatch");
  }
  const lg01Prediction = row?.lg01Prediction;
  if (
    typeof lg01Prediction !== "number"
    || !Number.isFinite(lg01Prediction)
  ) {
    throw new Error("hpsr_lg01_prediction_must_be_finite");
  }
  const raw = row?.cham01B3Prediction;
  if (raw !== null && typeof raw !== "number") {
    throw new Error("hpsr_cham01_b3_prediction_type_invalid");
  }
  const diagnostics = row?.cham01Diagnostics ?? {};
  if (
    diagnostics?.signedExpm1Overflow !== undefined
    && typeof diagnostics.signedExpm1Overflow !== "boolean"
  ) {
    throw new Error("hpsr_signed_expm1_overflow_flag_invalid");
  }
  if (
    diagnostics?.supportRangeExtrapolation !== undefined
    && typeof diagnostics.supportRangeExtrapolation !== "boolean"
  ) {
    throw new Error("hpsr_support_range_flag_invalid");
  }
  return Object.freeze({
    standardWorkId,
    origin,
    horizonMonths,
    lg01Prediction,
    cham01B3Prediction: raw,
    cham01Diagnostics: Object.freeze({
      signedExpm1Overflow:
        diagnostics.signedExpm1Overflow === true,
      supportRangeExtrapolation:
        diagnostics.supportRangeExtrapolation === true
    })
  });
}

function buildHpsrRawDiagnostic(row, common, bounds) {
  const raw = row.cham01B3Prediction;
  const rawFinite = Number.isFinite(raw);
  const scale = Math.max(
    Math.abs(row.lg01Prediction),
    bounds.positiveBaseFloor
  );
  const residual = rawFinite
    ? raw - row.lg01Prediction
    : null;
  const normalizedResidual = (
    Number.isFinite(residual)
    && Number.isFinite(scale)
    && scale > 0
  ) ? residual / scale : null;
  const finiteExtreme = (
    Number.isFinite(normalizedResidual)
    && (
      normalizedResidual < bounds.lowerBound
      || normalizedResidual > bounds.upperBound
    )
  );
  const ratio = (
    rawFinite
    && row.lg01Prediction !== 0
  ) ? raw / row.lg01Prediction : null;
  const predictionBaseRatio = Number.isFinite(ratio) ? ratio : null;
  const supportRangeExtrapolation = (
    row.cham01Diagnostics.supportRangeExtrapolation
    || finiteExtreme
  );
  let numericStatus = "FINITE_RAW_B3_WITHIN_FROZEN_BOUNDS";
  if (!rawFinite) {
    numericStatus = row.cham01Diagnostics.signedExpm1Overflow
      ? "NONFINITE_RAW_B3_SIGNED_EXPM1_OVERFLOW"
      : "NONFINITE_RAW_B3";
  } else if (!Number.isFinite(residual)) {
    numericStatus = "NONFINITE_RAW_B3_RESIDUAL";
  } else if (finiteExtreme) {
    numericStatus = "FINITE_EXTREME_OUTSIDE_FROZEN_BOUNDS";
  } else if (supportRangeExtrapolation) {
    numericStatus = "FINITE_SUPPORT_RANGE_EXTRAPOLATION";
  }
  return Object.freeze({
    ...common,
    armId: "D1",
    modelId: "M2-WORK-CHAM01",
    rawPointEstimate: raw,
    rawPredictionFinite: rawFinite,
    residual,
    normalizedResidual,
    finiteExtreme,
    signedExpm1Overflow:
      row.cham01Diagnostics.signedExpm1Overflow,
    predictionBaseRatio,
    predictionBaseRatioStatus: predictionBaseRatio === null
      ? "NOT_FINITE_OR_ZERO_BASE"
      : "FINITE",
    supportRangeExtrapolation,
    numericStatus,
    directServingAllowed: false,
    rawCandidatePreserved: true
  });
}

function buildHpsrCandidateRow(row, common, bounds, diagnostic) {
  if (common.cashBandId === "H50") {
    return Object.freeze({
      ...common,
      armId: "R1",
      modelId: HPSR_MODEL_ID,
      pointEstimate: row.lg01Prediction,
      alpha: null,
      globalAlpha: null,
      boundedNormalizedResidual: null,
      boundedResidual: null,
      boundTriggered: false,
      correctionApplied: false,
      fallbackToLg01: false,
      fallbackReason: null,
      numericStatus: "H50_EXACT_LG01_ARCHITECTURE",
      finalPredictionFinite: true
    });
  }
  const scale = Math.max(
    Math.abs(row.lg01Prediction),
    bounds.positiveBaseFloor
  );
  let fallbackReason = null;
  if (!diagnostic.rawPredictionFinite) {
    fallbackReason = diagnostic.signedExpm1Overflow
      ? "NONFINITE_RAW_SIGNED_EXPM1_OVERFLOW"
      : "NONFINITE_RAW";
  } else if (!Number.isFinite(scale) || !(scale > 0)) {
    fallbackReason = "NONFINITE_OR_NONPOSITIVE_SCALE";
  } else if (!Number.isFinite(diagnostic.residual)) {
    fallbackReason = "NONFINITE_RESIDUAL";
  } else if (!Number.isFinite(diagnostic.normalizedResidual)) {
    fallbackReason = "NONFINITE_NORMALIZED_RESIDUAL";
  }
  let boundedNormalizedResidual = null;
  let boundedResidual = null;
  let candidate = null;
  let boundTriggered = false;
  if (fallbackReason === null) {
    boundedNormalizedResidual = clip(
      diagnostic.normalizedResidual,
      bounds.lowerBound,
      bounds.upperBound
    );
    boundTriggered = (
      boundedNormalizedResidual !== diagnostic.normalizedResidual
    );
    boundedResidual = scale * boundedNormalizedResidual;
    candidate = row.lg01Prediction + boundedResidual;
    if (
      !Number.isFinite(boundedResidual)
      || !Number.isFinite(candidate)
    ) {
      fallbackReason = "NONFINITE_BOUNDED_RESULT";
      boundedNormalizedResidual = null;
      boundedResidual = null;
      candidate = null;
      boundTriggered = false;
    }
  }
  const fallbackToLg01 = fallbackReason !== null;
  const pointEstimate = fallbackToLg01
    ? row.lg01Prediction
    : candidate;
  if (!Number.isFinite(pointEstimate)) {
    throw new Error("hpsr_nonfinite_lg01_fallback_impossible");
  }
  return Object.freeze({
    ...common,
    armId: "R1",
    modelId: HPSR_MODEL_ID,
    pointEstimate,
    alpha: 1,
    globalAlpha: null,
    boundedNormalizedResidual,
    boundedResidual,
    boundTriggered,
    correctionApplied: !fallbackToLg01,
    fallbackToLg01,
    fallbackReason,
    numericStatus: fallbackToLg01
      ? HPSR_NUMERIC_FALLBACK_STATUS
      : (
        boundTriggered
          ? "BOUNDED_RESIDUAL_APPLIED_WITH_CLIP"
          : "BOUNDED_RESIDUAL_APPLIED_WITHOUT_CLIP"
      ),
    finalPredictionFinite: true
  });
}

function assertNoOutcomeFields(value, context) {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) {
      assertNoOutcomeFields(item, context);
    }
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (HPSR_OUTCOME_FIELD_PATTERN.test(key)) {
      throw new Error(`hpsr_${context}_outcome_field_forbidden`);
    }
    assertNoOutcomeFields(nested, context);
  }
}

function hpsrCaseKey(row) {
  return [
    row.standardWorkId,
    row.origin,
    Number(row.horizonMonths)
  ].join("\u0000");
}

function clip(value, lower, upper) {
  return Math.max(lower, Math.min(upper, value));
}

function ratioOrNull(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null;
}

function compareMonths(left, right) {
  return monthIndex(left) - monthIndex(right);
}

function monthIndex(month) {
  const [year, value] = month.split("-").map(Number);
  return year * 12 + value - 1;
}

function requireMonth(value, name) {
  if (typeof value !== "string" || !MONTH_PATTERN.test(value)) {
    throw new Error(`hpsr_${name}_invalid`);
  }
  return value;
}

function minimumMonth(values) {
  const months = [...values].sort();
  if (months.length === 0) {
    throw new Error("hpsr_month_collection_empty");
  }
  return months[0];
}

function maximumMonthOrNull(values) {
  const months = [...values].sort();
  return months.at(-1) ?? null;
}

function nullableNumber(value) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonempty(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`hpsr_${name}_required`);
  }
  return value.trim();
}

function unique(values) {
  return [...new Set(values)];
}

function sameValues(actual, expected) {
  return (
    Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index])
  );
}
