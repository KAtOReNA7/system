export const HPSR_MODEL_ID = "M2-WORK-HPSR01";
export const HPSR_EXPERIMENT_ID =
  "M2-EXP-LG01-HEAD-PROTECTED-SEGMENTED-ROUTER-01";
export const HPSR_ARM_IDS = Object.freeze(["R0", "D1", "R1"]);
export const HPSR_WAITING_STATUS =
  "M2_HEAD_PROTECTED_SEGMENTED_ROUTER_WAITING_FOR_NEW_BILLS";

const MONTH_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/u;

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
      ?.originMustBeStrictlyAfterMaxPreviouslyOpened !== true
    || config?.laterOriginQualification
      ?.everyFutureBillMonthMustBeStrictlyAfterOpenedFutureActualThrough
      !== true
  ) {
    errors.push("hpsr_contract_later_origin_boundary_invalid");
  }
  if (
    config?.finalHoldout?.authorized !== false
    || config?.finalHoldout?.openedByThisTask !== false
    || config?.finalHoldout?.historicalContractModified !== false
    || config?.finalHoldout?.singleAvailableOriginThatIsOnlyHoldoutMayBeConsumed
      !== false
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
    config?.execution?.K1ImplementationAuthorizedNow !== false
    || config?.execution?.K2PrivateEvaluationAuthorizedNow !== false
    || config?.execution?.oneCompleteOutcomeMaximum !== true
    || config?.execution?.secondCompleteResultAllowed !== false
    || config?.execution?.secondBootstrapAllowed !== false
    || config?.authorization?.finalHoldout !== false
    || config?.authorization?.pullRequestMerge !== false
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
        + "later_origin_availability.v0.1"
    || value?.status !== HPSR_WAITING_STATUS
    || value?.auditBoundary?.newFutureActualAmountsRead !== false
    || value?.auditBoundary?.newModelMetricsRead !== false
    || value?.openedOriginLedger?.maxPreviouslyOpenedOrigin !== "2026-02"
    || value?.openedOriginLedger?.openedFutureActualThrough !== "2026-05"
    || value?.billAvailability?.latestCompleteMonth !== "2026-04"
    || value?.candidateInventory?.eligibleLaterOriginCount !== 0
    || value?.candidateInventory?.nonoverlappingLaterOriginCount !== 0
    || value?.historicalFinalHoldout?.openedByThisAudit !== false
    || value?.futureReservation?.newFinalHoldoutOpened !== false
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

function sameValues(actual, expected) {
  return (
    Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index])
  );
}
