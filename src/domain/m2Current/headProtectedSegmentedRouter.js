import {
  quantileLinear
} from "./lg01HeadCashResidual.js";

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

const MONTH_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/u;
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
    config?.experiment?.status !== HPSR_WAITING_STATUS
    || config?.experiment?.K1
      !== "NOT_EXECUTED_WAITING_FOR_NEW_BILLS"
    || config?.experiment?.K2
      !== "NOT_EXECUTED_WAITING_FOR_NEW_BILLS"
    || config?.experiment?.outerOutcomeRead !== false
    || config?.experiment?.firstCompleteOutcomeProduced !== false
  ) {
    errors.push("hpsr_contract_waiting_execution_boundary_invalid");
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
      !== HPSR_WAITING_STATUS
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
      !== "NUMERIC_INPUT_INVALID_FALLBACK_LG01"
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
    || config?.execution?.K2PrivateEvaluationAuthorizedNow !== false
    || config?.execution?.oneCompleteOutcomeMaximum !== true
    || config?.execution?.secondCompleteResultAllowed !== false
    || config?.execution?.secondBootstrapAllowed !== false
    || config?.authorization?.finalHoldout !== false
    || config?.authorization?.pullRequestMerge !== false
    || config?.authorization?.K1CanonicalImplementation !== true
    || config?.authorization?.syntheticFixtureValidation !== true
  ) {
    errors.push("hpsr_contract_execution_authorization_invalid");
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
    || value?.status !== HPSR_WAITING_STATUS
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
    || value?.execution?.K1 !== "NOT_EXECUTED_WAITING_FOR_NEW_BILLS"
    || value?.execution?.K2 !== "NOT_EXECUTED_WAITING_FOR_NEW_BILLS"
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
