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
export const HPSR_RETROSPECTIVE_SUPPORTED_STATUS =
  "M2_HPSR01_RETROSPECTIVE_DEVELOPMENT_SUPPORTED_"
    + "AWAITING_INDEPENDENT_K2";
export const HPSR_RETROSPECTIVE_MIXED_STATUS =
  "M2_HPSR01_RETROSPECTIVE_DEVELOPMENT_MIXED_"
    + "AWAITING_INDEPENDENT_K2";
export const HPSR_RETROSPECTIVE_UNSUPPORTED_STATUS =
  "M2_HPSR01_RETROSPECTIVE_DEVELOPMENT_UNSUPPORTED_STOP_BEFORE_K2";
export const HPSR_RETROSPECTIVE_NO_ORIGIN_STATUS =
  "M2_HPSR01_RETROSPECTIVE_REPLAY_BLOCKED_NO_LEGAL_COMPLETE_ORIGIN";

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

export function planHpsrRetrospectiveOrigins({
  residualBoundDerivationThrough,
  firstIndependentLaterOrigin,
  completeAuthoritativeBillMonthThrough,
  openedOriginProfiles,
  isolatedOrigins = [],
  horizonMonths = 3
}) {
  const boundThrough = requireMonth(
    residualBoundDerivationThrough,
    "retrospective_bound_derivation_through"
  );
  const firstIndependent = requireMonth(
    firstIndependentLaterOrigin,
    "retrospective_first_independent_origin"
  );
  const completeThrough = requireMonth(
    completeAuthoritativeBillMonthThrough,
    "retrospective_complete_bill_month_through"
  );
  if (Number(horizonMonths) !== 3) {
    throw new Error("hpsr_retrospective_only_three_month_horizon_allowed");
  }
  if (!Array.isArray(openedOriginProfiles)) {
    throw new Error("hpsr_retrospective_opened_profiles_required");
  }
  const profileByOrigin = new Map();
  for (const profile of openedOriginProfiles) {
    const origin = requireMonth(
      profile?.origin,
      "retrospective_profile_origin"
    );
    if (profileByOrigin.has(origin)) {
      throw new Error("hpsr_retrospective_profile_origin_duplicate");
    }
    profileByOrigin.set(origin, Object.freeze({
      origin,
      rowCount: nonnegativeInteger(
        profile?.rowCount,
        "retrospective_profile_row_count"
      ),
      nonNullExistingActualCount: nonnegativeInteger(
        profile?.nonNullExistingActualCount,
        "retrospective_profile_actual_count"
      ),
      horizonsMonths: Object.freeze(
        [...new Set(profile?.horizonsMonths ?? [])].map(Number).sort(
          (left, right) => left - right
        )
      )
    }));
  }
  const isolated = new Set((isolatedOrigins ?? []).map((origin) => (
    requireMonth(origin, "retrospective_isolated_origin")
  )));
  const inventory = [];
  for (
    let origin = addMonths(boundThrough, 1);
    compareMonths(origin, firstIndependent) < 0;
    origin = addMonths(origin, 1)
  ) {
    const profile = profileByOrigin.get(origin) ?? null;
    const requiredCompleteThrough = addMonths(origin, horizonMonths);
    const reasons = [];
    if (isolated.has(origin)) {
      reasons.push("HISTORICAL_ISOLATED_OUTCOME");
    }
    if (
      profile === null
      || !profile.horizonsMonths.includes(horizonMonths)
      || profile.rowCount < 1
      || profile.nonNullExistingActualCount !== profile.rowCount
    ) {
      reasons.push("ACTUAL_NOT_OPENED_BEFORE_TASK");
    }
    if (compareMonths(requiredCompleteThrough, completeThrough) > 0) {
      reasons.push("INCOMPLETE_THREE_MONTH_AUTHORITY_WINDOW");
    }
    inventory.push(Object.freeze({
      origin,
      horizonMonths,
      requiredCompleteThrough,
      actualOpenedBeforeTask: (
        profile !== null
        && profile.horizonsMonths.includes(horizonMonths)
        && profile.rowCount > 0
        && profile.nonNullExistingActualCount === profile.rowCount
      ),
      historicalIsolation: isolated.has(origin),
      authorityWindowComplete:
        compareMonths(requiredCompleteThrough, completeThrough) <= 0,
      openedProfileRowCount: profile?.rowCount ?? 0,
      included: reasons.length === 0,
      exclusionReasons: Object.freeze(reasons)
    }));
  }
  const includedOrigins = inventory.filter(
    (item) => item.included
  ).map((item) => item.origin);
  return Object.freeze({
    status: includedOrigins.length > 0
      ? "M2_HPSR01_RETROSPECTIVE_REPLAY_READY"
      : HPSR_RETROSPECTIVE_NO_ORIGIN_STATUS,
    retrospectiveReplayReady: includedOrigins.length > 0,
    residualBoundDerivationThrough: boundThrough,
    firstIndependentLaterOrigin: firstIndependent,
    completeAuthoritativeBillMonthThrough: completeThrough,
    horizonMonths,
    inventory: Object.freeze(inventory),
    includedOrigins: Object.freeze(includedOrigins),
    excludedOrigins: Object.freeze(inventory.filter(
      (item) => !item.included
    ).map((item) => Object.freeze({
      origin: item.origin,
      reasons: item.exclusionReasons
    }))),
    finalHoldoutOutcomeRead: false,
    futureIndependentOutcomeRead: false
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

export function buildHpsrOriginCashBandsFromWorkCash({
  origin,
  originVisibleWorkCashRows
}) {
  const normalizedOrigin = requireMonth(
    origin,
    "work_cash_band_origin"
  );
  if (
    !Array.isArray(originVisibleWorkCashRows)
    || originVisibleWorkCashRows.length === 0
  ) {
    throw new Error("hpsr_origin_visible_work_cash_rows_required");
  }
  const seen = new Set();
  const monthlyRows = originVisibleWorkCashRows.map((row) => {
    assertNoOutcomeFields(row, "origin_visible_work_cash_row");
    const standardWorkId = nonempty(
      row?.standardWorkId,
      "work_cash_standard_work_id"
    );
    if (seen.has(standardWorkId)) {
      throw new Error("hpsr_origin_visible_work_cash_duplicate");
    }
    seen.add(standardWorkId);
    const trailing12Cash = finiteNumber(
      row?.trailing12Cash,
      "work_cash_trailing12_cash"
    );
    return Object.freeze({
      standardWorkId,
      channelUid: "HPSR_ORIGIN_VISIBLE_WORK_CASH_AGGREGATE",
      month: normalizedOrigin,
      cash: trailing12Cash,
      settlementMechanism: "sales_share_only"
    });
  });
  const result = buildHpsrOriginCashBands({
    origin: normalizedOrigin,
    originVisibleMonthlyCashRows: monthlyRows
  });
  return Object.freeze({
    ...result,
    inputCashGrain: "ORIGIN_VISIBLE_TRAILING12_WORK_TOTAL",
    workCashAggregationOnly: true
  });
}

export function runHeadProtectedSegmentedRouter({
  origin,
  horizonMonths = 3,
  originVisibleMonthlyCashRows = null,
  originVisibleWorkCashRows = null,
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
  if (
    (originVisibleMonthlyCashRows === null)
      === (originVisibleWorkCashRows === null)
  ) {
    throw new Error("hpsr_exactly_one_origin_visible_cash_input_required");
  }
  const population = originVisibleWorkCashRows === null
    ? buildHpsrOriginCashBands({
      origin: normalizedOrigin,
      originVisibleMonthlyCashRows
    })
    : buildHpsrOriginCashBandsFromWorkCash({
      origin: normalizedOrigin,
      originVisibleWorkCashRows
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

export function evaluateHpsrRetrospectiveDevelopment({
  originResults,
  decisionPolicy,
  bootstrap = {}
}) {
  if (!Array.isArray(originResults) || originResults.length === 0) {
    throw new Error("hpsr_retrospective_origin_results_required");
  }
  const policy = normalizeRetrospectiveDecisionPolicy(decisionPolicy);
  const bootstrapIterations = positiveInteger(
    bootstrap.iterations ?? 2000,
    "retrospective_bootstrap_iterations"
  );
  const bootstrapSeed = nonnegativeInteger(
    bootstrap.seed ?? 20260731,
    "retrospective_bootstrap_seed"
  );
  if (bootstrapIterations !== 2000) {
    throw new Error("hpsr_retrospective_bootstrap_must_equal_2000");
  }
  const privateRows = [];
  const originSummaries = [];
  const originsSeen = new Set();
  let eligibleActualCashDenominator = 0;
  let core80ActualCashDenominator = 0;
  for (const value of originResults) {
    const run = value?.routerResult;
    const origin = requireMonth(
      value?.origin ?? run?.origin,
      "retrospective_result_origin"
    );
    if (originsSeen.has(origin)) {
      throw new Error("hpsr_retrospective_result_origin_duplicate");
    }
    originsSeen.add(origin);
    if (
      run?.origin !== origin
      || run?.horizonMonths !== 3
      || run?.executionMode !== "CONTROLLED_LATER_ORIGIN"
      || run?.invariants?.scoreComputed !== false
      || run?.invariants?.bootstrapExecuted !== false
    ) {
      throw new Error("hpsr_retrospective_router_result_invalid");
    }
    const allActualRows = normalizeHpsrActualRows(
      value?.actualRows,
      origin
    );
    const actualByWork = new Map(allActualRows.map((row) => [
      row.standardWorkId,
      row
    ]));
    const r0ByWork = uniqueWorkIndex(run.r0Rows, "r0");
    const d1ByWork = uniqueWorkIndex(
      run.d1RawDiagnosticRows,
      "d1"
    );
    const r1ByWork = uniqueWorkIndex(run.r1RawRouterRows, "r1");
    const core80Ids = run.population.core80WorkIds;
    if (
      !sameValues([...r0ByWork.keys()], core80Ids)
      || !sameValues([...d1ByWork.keys()], core80Ids)
      || !sameValues([...r1ByWork.keys()], core80Ids)
      || core80Ids.some((standardWorkId) => (
        !actualByWork.has(standardWorkId)
      ))
    ) {
      throw new Error("hpsr_retrospective_exact_same_case_failed");
    }
    const eligibleActual = sum(allActualRows.map(
      (row) => Math.abs(row.actual)
    ));
    const core80Actual = sum(core80Ids.map(
      (standardWorkId) => Math.abs(
        actualByWork.get(standardWorkId).actual
      )
    ));
    eligibleActualCashDenominator += eligibleActual;
    core80ActualCashDenominator += core80Actual;
    for (const standardWorkId of core80Ids) {
      const actual = actualByWork.get(standardWorkId).actual;
      const r0 = r0ByWork.get(standardWorkId);
      const d1 = d1ByWork.get(standardWorkId);
      const r1 = r1ByWork.get(standardWorkId);
      if (
        r0.cashBandId !== d1.cashBandId
        || r0.cashBandId !== r1.cashBandId
      ) {
        throw new Error("hpsr_retrospective_cash_band_mismatch");
      }
      privateRows.push(Object.freeze({
        schema:
          "m2.current.head_protected_segmented_router."
            + "retrospective_evaluation_row.private.v0.1",
        experimentId: HPSR_EXPERIMENT_ID,
        modelId: HPSR_MODEL_ID,
        actualDefinitionId:
          "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01",
        standardWorkId,
        origin,
        horizonMonths: 3,
        cashBandId: r0.cashBandId,
        actual,
        r0PointEstimate: r0.pointEstimate,
        d1RawPointEstimate: Number.isFinite(d1.rawPointEstimate)
          ? d1.rawPointEstimate
          : null,
        d1RawPredictionFinite: d1.rawPredictionFinite,
        d1FiniteExtreme: d1.finiteExtreme,
        d1NumericStatus: d1.numericStatus,
        r1PointEstimate: r1.pointEstimate,
        r1BoundTriggered: r1.boundTriggered,
        r1CorrectionApplied: r1.correctionApplied,
        r1FallbackToLg01: r1.fallbackToLg01,
        r1FallbackReason: r1.fallbackReason,
        r1NumericStatus: r1.numericStatus,
        caseKey: [
          "STRICT_ROLLING",
          "CORE80",
          standardWorkId,
          origin,
          "3",
          "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01"
        ].join("\u0000")
      }));
    }
    originSummaries.push(Object.freeze({
      origin,
      horizonMonths: 3,
      eligibleWorkCount: allActualRows.length,
      core80WorkCount: core80Ids.length,
      core80ActualCashShare: ratioOrNull(
        core80Actual,
        eligibleActual
      ),
      core80OriginVisibleCashCapture:
        run.population.core80ReferenceRevenueCapture,
      core80CutoffTieCount: run.population.core80CutoffTieCount,
      cashBandWorkCounts: run.population.bandCounts
    }));
  }
  const orderedRows = privateRows.sort(compareRetrospectiveRows);
  const caseKeys = orderedRows.map((row) => row.caseKey);
  if (new Set(caseKeys).size !== caseKeys.length) {
    throw new Error("hpsr_retrospective_case_key_duplicate");
  }
  const r0 = scoreHpsrEvaluationRows(orderedRows, "r0PointEstimate");
  const r1 = scoreHpsrEvaluationRows(orderedRows, "r1PointEstimate");
  const d1FiniteRows = orderedRows.filter(
    (row) => row.d1RawPredictionFinite
  );
  const d1 = scoreHpsrEvaluationRows(
    d1FiniteRows,
    "d1RawPointEstimate",
    "NO_FINITE_D1_ROWS"
  );
  const r1Fva = pairedFva(r1, r0);
  const d1Baseline = scoreHpsrEvaluationRows(
    d1FiniteRows,
    "r0PointEstimate",
    "NO_FINITE_D1_SAME_CASE_BASELINE"
  );
  const d1Fva = pairedFva(d1, d1Baseline);
  const r1Bootstrap = bootstrapHpsrFva(orderedRows, {
    candidateField: "r1PointEstimate",
    baselineField: "r0PointEstimate",
    iterations: bootstrapIterations,
    seed: bootstrapSeed
  });
  const d1Bootstrap = bootstrapHpsrFva(d1FiniteRows, {
    candidateField: "d1RawPointEstimate",
    baselineField: "r0PointEstimate",
    iterations: bootstrapIterations,
    seed: bootstrapSeed + 1
  });
  const timeBlocks = [...originsSeen].sort().map((origin) => {
    const rows = orderedRows.filter((row) => row.origin === origin);
    const baseline = scoreHpsrEvaluationRows(
      rows,
      "r0PointEstimate"
    );
    const candidate = scoreHpsrEvaluationRows(
      rows,
      "r1PointEstimate"
    );
    const fva = pairedFva(candidate, baseline);
    return Object.freeze({
      origin,
      forecastStart: addMonths(origin, 1),
      forecastEnd: addMonths(origin, 3),
      caseCount: rows.length,
      r0Wape: baseline.wape,
      r0SignedBias: baseline.signedBias,
      r1Wape: candidate.wape,
      r1SignedBias: candidate.signedBias,
      pairedFva: fva,
      outcome: fva === null
        ? "NOT_EVALUABLE"
        : fva > 0
          ? "R1_IMPROVED"
          : fva < 0
            ? "R1_DEGRADED"
            : "TIED"
    });
  });
  const evaluableBlocks = timeBlocks.filter(
    (block) => block.pairedFva !== null
  );
  const improvingBlockCount = evaluableBlocks.filter(
    (block) => block.pairedFva > 0
  ).length;
  const degradingBlockCount = evaluableBlocks.filter(
    (block) => block.pairedFva < 0
  ).length;
  const cashBands = Object.freeze(Object.fromEntries(
    HPSR_CASH_BAND_IDS.map((bandId) => {
      const rows = orderedRows.filter(
        (row) => row.cashBandId === bandId
      );
      const absoluteActual = sum(rows.map(
        (row) => Math.abs(row.actual)
      ));
      const bandR0 = scoreHpsrEvaluationRows(
        rows,
        "r0PointEstimate",
        "NO_ROWS_IN_CASH_BAND"
      );
      const bandD1Rows = rows.filter(
        (row) => row.d1RawPredictionFinite
      );
      const bandD1 = scoreHpsrEvaluationRows(
        bandD1Rows,
        "d1RawPointEstimate",
        "NO_FINITE_D1_ROWS_IN_CASH_BAND"
      );
      const bandR1 = scoreHpsrEvaluationRows(
        rows,
        "r1PointEstimate",
        "NO_ROWS_IN_CASH_BAND"
      );
      return [bandId, Object.freeze({
        workCount: new Set(rows.map(
          (row) => row.standardWorkId
        )).size,
        caseCount: rows.length,
        absoluteActualCashShare: ratioOrNull(
          absoluteActual,
          r1.absoluteActualTotal
        ),
        r0: bandR0,
        d1: bandD1,
        r1: bandR1,
        r0AbsoluteErrorContribution: ratioOrNull(
          bandR0.absoluteErrorTotal,
          r0.absoluteErrorTotal
        ),
        d1AbsoluteErrorContribution: ratioOrNull(
          bandD1.absoluteErrorTotal,
          d1.absoluteErrorTotal
        ),
        r1AbsoluteErrorContribution: ratioOrNull(
          bandR1.absoluteErrorTotal,
          r1.absoluteErrorTotal
        ),
        clipCount: rows.filter(
          (row) => row.r1BoundTriggered
        ).length,
        clipRate: ratioOrNull(
          rows.filter((row) => row.r1BoundTriggered).length,
          rows.length
        ),
        d1NonfiniteCount: rows.filter(
          (row) => !row.d1RawPredictionFinite
        ).length,
        d1NonfiniteRate: ratioOrNull(
          rows.filter((row) => !row.d1RawPredictionFinite).length,
          rows.length
        ),
        numericFallbackCount: rows.filter(
          (row) => row.r1FallbackToLg01
        ).length,
        numericFallbackRate: ratioOrNull(
          rows.filter((row) => row.r1FallbackToLg01).length,
          rows.length
        ),
        rawR1Coverage: ratioOrNull(
          rows.filter(
            (row) => Number.isFinite(row.r1PointEstimate)
          ).length,
          rows.length
        )
      })];
    })
  ));
  const h50Rows = orderedRows.filter(
    (row) => row.cashBandId === "H50"
  );
  const h50Equality = h50Rows.every((row) => (
    Object.is(row.r0PointEstimate, row.r1PointEstimate)
    && Math.abs(
      Math.abs(row.r0PointEstimate - row.actual)
        - Math.abs(row.r1PointEstimate - row.actual)
    ) === 0
    && row.r1FallbackToLg01 === false
  ));
  const allFinalPredictionsFinite = orderedRows.every((row) => (
    Number.isFinite(row.actual)
    && Number.isFinite(row.r0PointEstimate)
    && Number.isFinite(row.r1PointEstimate)
  ));
  const candidateConcentrationWorsening = (
    (r1.errorConcentration.maximumWorkShare ?? 0)
      - (r0.errorConcentration.maximumWorkShare ?? 0)
  );
  const catastrophicSingleWorkDominance = (
    r1Fva !== null
    && r1Fva < 0
    && r1.errorConcentration.maximumWorkShare
      >= policy.catastrophicMaximumWorkErrorShare
    && candidateConcentrationWorsening
      >= policy.catastrophicMaximumWorkShareWorsening
  );
  const absoluteBiasWorsening = (
    r1.absoluteBias === null || r0.absoluteBias === null
  ) ? null : r1.absoluteBias - r0.absoluteBias;
  const improvingBlockShare = ratioOrNull(
    improvingBlockCount,
    evaluableBlocks.length
  );
  const degradingBlockShare = ratioOrNull(
    degradingBlockCount,
    evaluableBlocks.length
  );
  const structure = Object.freeze({
    H50RowwisePredictionAndAbsoluteErrorEquality: h50Equality,
    H50ArchitectureNotFallback: h50Rows.every(
      (row) => !row.r1FallbackToLg01
    ),
    allActualAndFinalPredictionsFinite: allFinalPredictionsFinite,
    d1NonfiniteIsolated: orderedRows.every((row) => (
      row.d1RawPredictionFinite
      || (
        row.r1FallbackToLg01
        && Number.isFinite(row.r1PointEstimate)
      )
    )),
    unisolatedNonfiniteCount: orderedRows.filter((row) => (
      !Number.isFinite(row.actual)
      || !Number.isFinite(row.r0PointEstimate)
      || !Number.isFinite(row.r1PointEstimate)
    )).length,
    uniqueWorkWithinOrigin: originResults.every(({ routerResult }) => (
      new Set(routerResult.r1RawRouterRows.map(
        (row) => row.standardWorkId
      )).size === routerResult.r1RawRouterRows.length
    )),
    uniqueCaseKeyCount: new Set(caseKeys).size,
    privateRowCount: orderedRows.length,
    privateRowAndCaseKeyConservation:
      new Set(caseKeys).size === orderedRows.length,
    originVisibleOnly: originResults.every(({ routerResult }) => (
      routerResult.population.futureCashUsed === false
      && routerResult.invariants.futureCashUsed === false
    )),
    actualAmountConservation: true,
    predictionAmountConservation: true
  });
  const unsupportedTriggers = Object.freeze({
    overallWapeDegradedAtLeastOnePercent:
      r1Fva !== null
      && r1Fva <= -policy.unsupportedRelativeWapeDegradation,
    absoluteBiasWorsenedMoreThanTwoPoints:
      absoluteBiasWorsening !== null
      && absoluteBiasWorsening
        > policy.unsupportedAbsoluteBiasWorsening,
    majorityTimeBlocksDegraded:
      degradingBlockShare !== null
      && degradingBlockShare > 0.5,
    unisolatedNonfinite: structure.unisolatedNonfiniteCount > 0,
    catastrophicSingleWorkDominance,
    H50EqualityFailed: !h50Equality
  });
  const supportedChecks = Object.freeze({
    aggregateFvaAtLeastOnePercent:
      r1Fva !== null
      && r1Fva >= policy.supportedMinimumFva,
    bootstrapLowerAboveZero:
      r1Bootstrap.interval95?.lower
        > policy.supportedBootstrapLowerExclusive,
    absoluteBiasWorseningWithinOnePoint:
      absoluteBiasWorsening !== null
      && absoluteBiasWorsening
        <= policy.supportedMaximumAbsoluteBiasWorsening,
    atLeastTwoThirdsEvaluableBlocksImprove:
      improvingBlockShare !== null
      && improvingBlockShare
        >= policy.supportedMinimumImprovingBlockShare,
    stableTimeBlockSupport:
      evaluableBlocks.length >= policy.minimumStableTimeBlocks,
    structureAndFiniteGatesPass: Object.values(structure).every(
      (value) => value !== false
    ) && structure.unisolatedNonfiniteCount === 0,
    noCatastrophicSingleWorkDominance:
      !catastrophicSingleWorkDominance
  });
  const unsupported = Object.values(unsupportedTriggers).some(Boolean);
  const supported = !unsupported
    && Object.values(supportedChecks).every(Boolean);
  const status = unsupported
    ? HPSR_RETROSPECTIVE_UNSUPPORTED_STATUS
    : supported
      ? HPSR_RETROSPECTIVE_SUPPORTED_STATUS
      : HPSR_RETROSPECTIVE_MIXED_STATUS;
  return Object.freeze({
    schema:
      "m2.current.head_protected_segmented_router."
        + "retrospective_development_evaluation.v0.1",
    experimentId: HPSR_EXPERIMENT_ID,
    modelId: HPSR_MODEL_ID,
    status,
    evidenceClass: "RETROSPECTIVE_DEVELOPMENT_NOT_INDEPENDENT",
    horizonMonths: 3,
    origins: Object.freeze([...originsSeen].sort()),
    originCount: originsSeen.size,
    caseCount: orderedRows.length,
    workCount: new Set(orderedRows.map(
      (row) => row.standardWorkId
    )).size,
    originSummaries: Object.freeze(originSummaries.sort(
      (left, right) => left.origin.localeCompare(right.origin)
    )),
    core80ActualCashCoverage: ratioOrNull(
      core80ActualCashDenominator,
      eligibleActualCashDenominator
    ),
    metrics: Object.freeze({
      r0,
      d1,
      d1SameCaseR0: d1Baseline,
      r1,
      r1PairedFvaVsR0: r1Fva,
      d1PairedFvaVsR0: d1Fva,
      absoluteBiasWorsening,
      r1BootstrapFva95: r1Bootstrap,
      d1BootstrapFva95: d1Bootstrap
    }),
    timeBlocks: Object.freeze(timeBlocks),
    timeBlockSummary: Object.freeze({
      evaluableBlockCount: evaluableBlocks.length,
      improvingBlockCount,
      degradingBlockCount,
      improvingBlockShare,
      degradingBlockShare,
      minimumStableTimeBlocks: policy.minimumStableTimeBlocks,
      stableJudgmentSupport:
        evaluableBlocks.length >= policy.minimumStableTimeBlocks
    }),
    cashBands,
    numeric: Object.freeze({
      d1FiniteCount: d1FiniteRows.length,
      d1NonfiniteCount:
        orderedRows.length - d1FiniteRows.length,
      d1NonfiniteRate: ratioOrNull(
        orderedRows.length - d1FiniteRows.length,
        orderedRows.length
      ),
      finiteExtremeCount: orderedRows.filter(
        (row) => row.d1FiniteExtreme
      ).length,
      clipCount: orderedRows.filter(
        (row) => row.r1BoundTriggered
      ).length,
      numericFallbackCount: orderedRows.filter(
        (row) => row.r1FallbackToLg01
      ).length,
      r1RawCoverage: ratioOrNull(
        orderedRows.filter(
          (row) => Number.isFinite(row.r1PointEstimate)
        ).length,
        orderedRows.length
      )
    }),
    structure,
    decision: Object.freeze({
      classification: unsupported
        ? "RETROSPECTIVE_UNSUPPORTED"
        : supported
          ? "RETROSPECTIVE_SUPPORTED"
          : "RETROSPECTIVE_MIXED",
      supportedChecks,
      unsupportedTriggers,
      insufficientStableTimeBlocks:
        evaluableBlocks.length < policy.minimumStableTimeBlocks,
      independentEvidence: false,
      activeCandidate: false,
      approvedForAutomation: false,
      productionReady: false
    }),
    decisionPolicy: policy,
    bootstrapExecutionCount: 1,
    rawCandidateEvaluationCount: 1,
    privateRows: Object.freeze(orderedRows)
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

export function assertHpsrRetrospectiveExecutionGate({
  contract,
  retrospectivePlan
}) {
  if (
    contract?.experiment?.stableExperimentId !== HPSR_EXPERIMENT_ID
    || contract?.model?.stableModelId !== HPSR_MODEL_ID
    || contract?.retrospectiveReplay?.authorizedNow !== true
    || contract?.retrospectiveReplay?.outcomeReadBeforeTaskRequired
      !== true
    || contract?.retrospectiveReplay?.newModelTrainingAllowed !== false
    || contract?.retrospectiveReplay?.hyperparameterSearchAllowed !== false
    || contract?.retrospectiveReplay?.residualBoundReestimationAllowed
      !== false
    || contract?.retrospectiveReplay?.singleCompleteResultMaximum !== true
    || contract?.authorization?.retrospectiveDevelopmentEvaluation !== true
    || contract?.authorization?.finalHoldout !== false
    || contract?.authorization?.production !== false
    || contract?.authorization?.pullRequestMerge !== false
  ) {
    throw new Error("hpsr_retrospective_current_authorization_invalid");
  }
  if (
    retrospectivePlan?.retrospectiveReplayReady !== true
    || !Array.isArray(retrospectivePlan?.includedOrigins)
    || retrospectivePlan.includedOrigins.length < 1
    || retrospectivePlan?.finalHoldoutOutcomeRead !== false
    || retrospectivePlan?.futureIndependentOutcomeRead !== false
  ) {
    throw new Error("hpsr_retrospective_no_legal_complete_origin");
  }
  return Object.freeze({
    authorized: true,
    capabilityId: "m2-head-protected-segmented-router",
    experimentId: HPSR_EXPERIMENT_ID,
    modelId: HPSR_MODEL_ID,
    origins: retrospectivePlan.includedOrigins,
    resultMaximum: 1,
    finalHoldoutOutcomeRead: false,
    independentOutcomeRead: false
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
  const retrospectiveStatuses = new Set([
    HPSR_RETROSPECTIVE_SUPPORTED_STATUS,
    HPSR_RETROSPECTIVE_MIXED_STATUS,
    HPSR_RETROSPECTIVE_UNSUPPORTED_STATUS
  ]);
  const retrospectiveCompleted =
    config?.execution?.retrospectiveDevelopmentEvaluationCompleted
      === true;
  const preOutcomeState = (
    !retrospectiveCompleted
    && config?.experiment?.status === HPSR_IMPLEMENTED_STATUS
    && config?.experiment?.phase
      === "IMPLEMENTED_AWAITING_INDEPENDENT_EVALUATION"
    && config?.experiment?.firstCompleteOutcomeProduced === false
    && config?.model?.implementationStatus
      === "IMPLEMENTED_PUBLIC_SYNTHETIC_VERIFIED_"
        + "AWAITING_INDEPENDENT_EVALUATION"
    && config?.model?.registryRole
      === "implemented_awaiting_independent_evaluation"
  );
  const completedRetrospectiveState = (
    retrospectiveCompleted
    && retrospectiveStatuses.has(config?.experiment?.status)
    && config?.experiment?.phase
      === "RETROSPECTIVE_DEVELOPMENT_EVALUATED"
    && config?.experiment?.firstCompleteOutcomeProduced === true
    && config?.model?.implementationStatus
      === "RETROSPECTIVE_DEVELOPMENT_EVALUATED"
    && [
      "retrospective_development_mixed_awaiting_independent_k2",
      "retrospective_development_supported_awaiting_independent_k2",
      "retrospective_development_unsupported_stop_before_k2"
    ].includes(config?.model?.registryRole)
  );
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
    config?.experiment?.K1 !== HPSR_K1_EXECUTION_STATUS
    || config?.experiment?.K2 !== HPSR_K2_WAITING_STATUS
    || config?.experiment?.outerOutcomeRead !== false
    || (!preOutcomeState && !completedRetrospectiveState)
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
  const replay = config?.retrospectiveReplay;
  if (
    replay?.authorizedNow !== true
    || replay?.evidenceClass
      !== "RETROSPECTIVE_DEVELOPMENT_NOT_INDEPENDENT"
    || replay?.outcomeReadBeforeTaskRequired !== true
    || replay?.originSelectionRuntimeDerived !== true
    || replay?.horizonMonths !== 3
    || replay?.fixedCham01B3Fit?.huberDelta !== 1
    || replay?.fixedCham01B3Fit?.l2 !== 10
    || replay?.fixedCham01B3Fit?.hyperparameterSearchExecuted !== false
    || replay?.newModelTrainingAllowed !== false
    || replay?.hyperparameterSearchAllowed !== false
    || replay?.alphaSearchAllowed !== false
    || replay?.residualBoundReestimationAllowed !== false
    || replay?.cashBandChangeAllowed !== false
    || replay?.singleCompleteResultMaximum !== true
    || replay?.secondCompleteResultAllowed !== false
    || replay?.bootstrap?.iterations !== 2000
    || replay?.bootstrap?.clusterUnit !== "standardWorkId"
    || replay?.singleTimeBlockMayBeSupported !== false
    || replay?.singleTimeBlockMayBeMixedOrUnsupported !== true
  ) {
    errors.push("hpsr_contract_retrospective_replay_invalid");
  } else {
    try {
      normalizeRetrospectiveDecisionPolicy(replay.decisionPolicy);
    } catch {
      errors.push("hpsr_contract_retrospective_decision_policy_invalid");
    }
  }
  if (
    config?.execution?.K1ImplementationAuthorizedNow !== true
    || config?.execution?.K1SemanticAndBoundPreparationCompleted !== true
    || config?.execution?.K1CanonicalImplementationCompleted !== true
    || config?.execution?.K1PublicSyntheticValidationCompleted !== true
    || config?.execution
      ?.retrospectiveDevelopmentEvaluationAuthorizedNow !== true
    || config?.execution
      ?.retrospectiveDevelopmentEvaluationCompleted
      !== retrospectiveCompleted
    || config?.execution?.K2PrivateEvaluationAuthorizedNow !== false
    || config?.execution
      ?.singleQualifiedLaterOriginEvaluationConditionallyAuthorizedByUser
      !== true
    || config?.execution?.oneCompleteOutcomeMaximum !== true
    || config?.execution?.secondCompleteResultAllowed !== false
    || config?.execution?.secondBootstrapAllowed !== false
    || config?.authorization?.finalHoldout !== false
    || config?.authorization?.pullRequestMerge !== false
    || config?.authorization?.K1CanonicalImplementation !== true
    || config?.authorization?.syntheticFixtureValidation !== true
    || config?.authorization?.retrospectiveDevelopmentEvaluation !== true
    || config?.authorization?.qualifiedLaterOriginValidation !== true
    || config?.authorization
      ?.qualifiedLaterOriginValidationUsableNow !== false
    || config?.authorization?.modelTrainingNow !== false
    || config?.authorization?.modelSelectionNow !== false
    || config?.authorization?.frozenFormulaOriginFaithfulRefitNow !== true
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
    || !sameValues(
      config?.implementation?.retrospectiveControlledExecuteArguments,
      ["--retrospective"]
    )
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

function normalizeRetrospectiveDecisionPolicy(value) {
  const policy = Object.freeze({
    supportedMinimumFva: finiteNumber(
      value?.supportedMinimumFva,
      "retrospective_supported_minimum_fva"
    ),
    supportedBootstrapLowerExclusive: finiteNumber(
      value?.supportedBootstrapLowerExclusive,
      "retrospective_supported_bootstrap_lower"
    ),
    supportedMaximumAbsoluteBiasWorsening: finiteNumber(
      value?.supportedMaximumAbsoluteBiasWorsening,
      "retrospective_supported_bias_worsening"
    ),
    supportedMinimumImprovingBlockShare: finiteNumber(
      value?.supportedMinimumImprovingBlockShare,
      "retrospective_supported_block_share"
    ),
    minimumStableTimeBlocks: positiveInteger(
      value?.minimumStableTimeBlocks,
      "retrospective_minimum_stable_time_blocks"
    ),
    unsupportedRelativeWapeDegradation: finiteNumber(
      value?.unsupportedRelativeWapeDegradation,
      "retrospective_unsupported_wape_degradation"
    ),
    unsupportedAbsoluteBiasWorsening: finiteNumber(
      value?.unsupportedAbsoluteBiasWorsening,
      "retrospective_unsupported_bias_worsening"
    ),
    catastrophicMaximumWorkErrorShare: finiteNumber(
      value?.catastrophicMaximumWorkErrorShare,
      "retrospective_catastrophic_work_share"
    ),
    catastrophicMaximumWorkShareWorsening: finiteNumber(
      value?.catastrophicMaximumWorkShareWorsening,
      "retrospective_catastrophic_share_worsening"
    )
  });
  if (
    policy.supportedMinimumFva !== 0.01
    || policy.supportedBootstrapLowerExclusive !== 0
    || policy.supportedMaximumAbsoluteBiasWorsening !== 0.01
    || policy.supportedMinimumImprovingBlockShare !== 2 / 3
    || policy.minimumStableTimeBlocks !== 2
    || policy.unsupportedRelativeWapeDegradation !== 0.01
    || policy.unsupportedAbsoluteBiasWorsening !== 0.02
    || policy.catastrophicMaximumWorkErrorShare !== 0.35
    || policy.catastrophicMaximumWorkShareWorsening !== 0.1
  ) {
    throw new Error("hpsr_retrospective_decision_policy_changed");
  }
  return policy;
}

function normalizeHpsrActualRows(rows, origin) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("hpsr_retrospective_actual_rows_required");
  }
  const seen = new Set();
  return Object.freeze(rows.map((row) => {
    const standardWorkId = nonempty(
      row?.standardWorkId,
      "retrospective_actual_work_id"
    );
    if (seen.has(standardWorkId)) {
      throw new Error("hpsr_retrospective_actual_work_duplicate");
    }
    seen.add(standardWorkId);
    if (
      requireMonth(row?.origin, "retrospective_actual_origin")
        !== origin
      || Number(row?.horizonMonths) !== 3
    ) {
      throw new Error("hpsr_retrospective_actual_cell_mismatch");
    }
    return Object.freeze({
      standardWorkId,
      origin,
      horizonMonths: 3,
      actual: finiteNumber(
        row?.actual,
        "retrospective_actual_amount"
      )
    });
  }).sort((left, right) => (
    left.standardWorkId.localeCompare(right.standardWorkId)
  )));
}

function uniqueWorkIndex(rows, armId) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`hpsr_retrospective_${armId}_rows_required`);
  }
  const output = new Map();
  for (const row of rows) {
    const standardWorkId = nonempty(
      row?.standardWorkId,
      `${armId}_work_id`
    );
    if (output.has(standardWorkId)) {
      throw new Error(`hpsr_retrospective_${armId}_work_duplicate`);
    }
    output.set(standardWorkId, row);
  }
  return output;
}

function scoreHpsrEvaluationRows(
  rows,
  predictionField,
  nullReason = "NO_EVALUATION_ROWS"
) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return Object.freeze({
      status: "NOT_COMPUTABLE",
      nullReason,
      caseCount: 0,
      workCount: 0,
      originCount: 0,
      absoluteActualTotal: 0,
      absoluteErrorTotal: 0,
      wape: null,
      signedBias: null,
      absoluteBias: null,
      mae: null,
      medianAbsoluteError: null,
      errorConcentration: Object.freeze({
        maximumWorkShare: null,
        top5WorkShare: null,
        top10WorkShare: null
      })
    });
  }
  const scored = rows.map((row) => {
    const actual = finiteNumber(row.actual, "evaluation_actual");
    const prediction = finiteNumber(
      row[predictionField],
      `evaluation_${predictionField}`
    );
    const error = prediction - actual;
    return Object.freeze({
      standardWorkId: row.standardWorkId,
      origin: row.origin,
      actual,
      prediction,
      error,
      absoluteError: Math.abs(error)
    });
  });
  const absoluteActualTotal = sum(scored.map(
    (row) => Math.abs(row.actual)
  ));
  const actualTotal = sum(scored.map((row) => row.actual));
  const predictionTotal = sum(scored.map((row) => row.prediction));
  const absoluteErrors = scored.map(
    (row) => row.absoluteError
  ).sort((left, right) => left - right);
  const absoluteErrorTotal = sum(absoluteErrors);
  const workErrors = [...groupHpsrBy(
    scored,
    (row) => row.standardWorkId
  ).values()].map((workRows) => sum(workRows.map(
    (row) => row.absoluteError
  ))).sort((left, right) => right - left);
  return Object.freeze({
    status: absoluteActualTotal > 0
      ? "COMPUTED"
      : "NOT_COMPUTABLE_ZERO_ABSOLUTE_ACTUAL",
    nullReason: absoluteActualTotal > 0
      ? null
      : "ZERO_ABSOLUTE_ACTUAL_DENOMINATOR",
    caseCount: scored.length,
    workCount: new Set(scored.map(
      (row) => row.standardWorkId
    )).size,
    originCount: new Set(scored.map((row) => row.origin)).size,
    absoluteActualTotal,
    actualTotal,
    predictionTotal,
    absoluteErrorTotal,
    wape: ratioOrNull(absoluteErrorTotal, absoluteActualTotal),
    signedBias: absoluteActualTotal > 0
      ? (predictionTotal - actualTotal) / absoluteActualTotal
      : null,
    absoluteBias: absoluteActualTotal > 0
      ? Math.abs(predictionTotal - actualTotal) / absoluteActualTotal
      : null,
    mae: absoluteErrorTotal / scored.length,
    medianAbsoluteError: quantileSorted(absoluteErrors, 0.5),
    errorConcentration: Object.freeze({
      maximumWorkShare: ratioOrNull(
        workErrors[0] ?? 0,
        absoluteErrorTotal
      ),
      top5WorkShare: ratioOrNull(
        sum(workErrors.slice(0, 5)),
        absoluteErrorTotal
      ),
      top10WorkShare: ratioOrNull(
        sum(workErrors.slice(0, 10)),
        absoluteErrorTotal
      )
    })
  });
}

function pairedFva(candidate, baseline) {
  if (
    candidate?.wape === null
    || baseline?.wape === null
    || !(baseline.wape > 0)
  ) {
    return null;
  }
  return (baseline.wape - candidate.wape) / baseline.wape;
}

function bootstrapHpsrFva(rows, {
  candidateField,
  baselineField,
  iterations,
  seed
}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return Object.freeze({
      status: "NOT_COMPUTABLE",
      nullReason: "NO_SAME_CASE_ROWS",
      method: "PAIRED_WHOLE_STANDARD_WORK_CLUSTER",
      iterations: 0,
      seed,
      workCount: 0,
      interval95: null
    });
  }
  const byWork = groupHpsrBy(rows, (row) => row.standardWorkId);
  const workIds = [...byWork.keys()].sort();
  if (workIds.length < 2) {
    return Object.freeze({
      status: "NOT_COMPUTABLE",
      nullReason: "FEWER_THAN_TWO_WORK_CLUSTERS",
      method: "PAIRED_WHOLE_STANDARD_WORK_CLUSTER",
      iterations: 0,
      seed,
      workCount: workIds.length,
      interval95: null
    });
  }
  const random = hpsrMulberry32(seed);
  const values = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const sampled = [];
    for (let index = 0; index < workIds.length; index += 1) {
      const workId = workIds[Math.floor(random() * workIds.length)];
      sampled.push(...byWork.get(workId));
    }
    const candidate = scoreHpsrEvaluationRows(
      sampled,
      candidateField
    );
    const baseline = scoreHpsrEvaluationRows(
      sampled,
      baselineField
    );
    const fva = pairedFva(candidate, baseline);
    if (fva !== null && Number.isFinite(fva)) values.push(fva);
  }
  values.sort((left, right) => left - right);
  return Object.freeze({
    status: values.length === iterations ? "COMPUTED" : "PARTIAL",
    nullReason: values.length > 0 ? null : "NO_COMPUTABLE_BOOTSTRAP_DRAW",
    method: "PAIRED_WHOLE_STANDARD_WORK_CLUSTER",
    iterations: values.length,
    requestedIterations: iterations,
    seed,
    workCount: workIds.length,
    interval95: values.length > 0 ? Object.freeze({
      lower: quantileSorted(values, 0.025),
      median: quantileSorted(values, 0.5),
      upper: quantileSorted(values, 0.975)
    }) : null
  });
}

function compareRetrospectiveRows(left, right) {
  return (
    left.origin.localeCompare(right.origin)
    || left.standardWorkId.localeCompare(right.standardWorkId)
  );
}

function groupHpsrBy(values, keyOf) {
  const output = new Map();
  for (const value of values) {
    const key = keyOf(value);
    const rows = output.get(key) ?? [];
    rows.push(value);
    output.set(key, rows);
  }
  return output;
}

function quantileSorted(sorted, probability) {
  if (sorted.length === 0) return null;
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function hpsrMulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
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

function finiteNumber(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`hpsr_${name}_must_be_finite`);
  }
  return value;
}

function nonnegativeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`hpsr_${name}_must_be_nonnegative_integer`);
  }
  return value;
}

function positiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`hpsr_${name}_must_be_positive_integer`);
  }
  return value;
}

function nonempty(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`hpsr_${name}_required`);
  }
  return value.trim();
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
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
