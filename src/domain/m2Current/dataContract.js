const MONTH_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/u;

export const M2_CURRENT_OCCURRENCE_DEFINITION = Object.freeze({
  event: "forecastable_cash_actual_strictly_greater_than_zero",
  zero: "forecastable_cash_actual_less_than_or_equal_to_zero",
  negativeCashTreatment: "zero_occurrence_retained_in_amount_error",
  unit: "work_origin_horizon_route"
});

export function classifyM2CurrentLabel(row, evaluationAsOf) {
  const cutoff = requireMonth(evaluationAsOf, "evaluation_as_of");
  if (nonempty(row?.exclusionReason)) {
    return Object.freeze({
      status: "excluded",
      reason: String(row.exclusionReason)
    });
  }
  const targetEnd = requireMonth(row?.targetEnd, "target_end");
  const labelAvailableAsOf = nullableMonth(
    row?.labelAvailableAsOf,
    "label_available_as_of"
  );
  if (
    targetEnd > cutoff
    || labelAvailableAsOf === null
    || labelAvailableAsOf > cutoff
  ) {
    return Object.freeze({
      status: "right_censored",
      reason: targetEnd > cutoff
        ? "target_window_not_closed"
        : labelAvailableAsOf === null
          ? "label_availability_not_recorded"
          : "label_not_available_at_evaluation_cutoff"
    });
  }
  if (
    row?.actual === null
    || row?.actual === undefined
    || row?.actual === ""
    || !Number.isFinite(Number(row.actual))
  ) {
    return Object.freeze({
      status: "invalid",
      reason: "mature_label_missing_or_nonfinite"
    });
  }
  return Object.freeze({
    status: "observed",
    reason: null,
    occurrence: Number(row.actual) > 0
  });
}

export function partitionM2CurrentLabels(rows, evaluationAsOf) {
  if (!Array.isArray(rows)) {
    throw new Error("m2_current_label_rows_required");
  }
  const partitions = {
    observed: [],
    right_censored: [],
    excluded: [],
    invalid: []
  };
  for (const row of rows) {
    const label = classifyM2CurrentLabel(row, evaluationAsOf);
    partitions[label.status].push({ ...row, labelStatus: label.status });
  }
  return Object.freeze({
    observedRows: Object.freeze(partitions.observed),
    counts: Object.freeze(Object.fromEntries(
      Object.entries(partitions).map(([key, values]) => [key, values.length])
    )),
    scoreableShare: rows.length === 0
      ? null
      : partitions.observed.length / rows.length
  });
}

export function buildM2CurrentDenseOriginSchedule({
  firstOrigin,
  lastOrigin,
  stepMonths = 1,
  horizons,
  labelAvailableThrough
}) {
  const first = requireMonth(firstOrigin, "first_origin");
  const last = requireMonth(lastOrigin, "last_origin");
  const labelCutoff = requireMonth(
    labelAvailableThrough,
    "label_available_through"
  );
  const step = positiveInteger(stepMonths, "origin_step_months");
  if (first > last) {
    throw new Error("m2_current_origin_schedule_inverted");
  }
  const allowedHorizons = uniquePositiveIntegers(horizons, "schedule_horizons");
  const origins = [];
  const cells = [];
  for (let origin = first; origin <= last; origin = addMonths(origin, step)) {
    origins.push(origin);
    for (const horizonMonths of allowedHorizons) {
      const targetEnd = addMonths(origin, horizonMonths);
      cells.push(Object.freeze({
        origin,
        horizonMonths,
        targetEnd,
        labelStatus: targetEnd <= labelCutoff
          ? "eligible_for_materialization"
          : "right_censored"
      }));
    }
  }
  return Object.freeze({
    cadence: step === 1 ? "monthly" : `every_${step}_months`,
    origins: Object.freeze(origins),
    cells: Object.freeze(cells),
    eligibleCellCount: cells.filter(
      (cell) => cell.labelStatus === "eligible_for_materialization"
    ).length,
    rightCensoredCellCount: cells.filter(
      (cell) => cell.labelStatus === "right_censored"
    ).length
  });
}

export function validateM2CurrentCommitmentSnapshot(
  snapshot,
  { standardWorkId, origin, horizonMonths }
) {
  const workId = nonempty(standardWorkId);
  if (workId === null || snapshot === null || typeof snapshot !== "object") {
    throw new Error("m2_current_commitment_snapshot_invalid");
  }
  const commitmentId = requireString(
    snapshot.commitmentId,
    "commitment_id"
  );
  if (requireString(snapshot.standardWorkId, "commitment_work_id") !== workId) {
    throw new Error("m2_current_commitment_work_mismatch");
  }
  const cutoff = requireMonth(origin, "commitment_origin");
  const signedAsOf = requireMonth(
    snapshot.signedAsOf,
    "commitment_signed_as_of"
  );
  const confirmedAsOf = requireMonth(
    snapshot.confirmedAsOf,
    "commitment_confirmed_as_of"
  );
  const availableAsOf = requireMonth(
    snapshot.availableAsOf,
    "commitment_available_as_of"
  );
  const expectedPostingMonth = requireMonth(
    snapshot.expectedPostingMonth,
    "commitment_expected_posting_month"
  );
  if (
    signedAsOf > confirmedAsOf
    || confirmedAsOf > availableAsOf
    || availableAsOf > cutoff
  ) {
    throw new Error("m2_current_commitment_as_of_order_invalid");
  }
  const horizon = positiveInteger(
    horizonMonths,
    "commitment_horizon_months"
  );
  if (
    expectedPostingMonth <= cutoff
    || expectedPostingMonth > addMonths(cutoff, horizon)
  ) {
    throw new Error("m2_current_commitment_posting_outside_horizon");
  }
  const confirmedAmount = nonnegative(
    snapshot.confirmedAmount,
    "commitment_confirmed_amount"
  );
  const outstandingAmount = nonnegative(
    snapshot.outstandingAmount,
    "commitment_outstanding_amount"
  );
  if (outstandingAmount > confirmedAmount) {
    throw new Error("m2_current_commitment_outstanding_exceeds_confirmed");
  }
  if (
    snapshot.status !== "confirmed"
    || snapshot.signed !== true
    || snapshot.auditable !== true
  ) {
    throw new Error("m2_current_commitment_state_invalid");
  }
  const evidenceReferences = uniqueStrings(
    snapshot.evidenceReferences,
    "commitment_evidence_references"
  );
  return Object.freeze({
    commitmentId,
    standardWorkId: workId,
    signedAsOf,
    confirmedAsOf,
    availableAsOf,
    expectedPostingMonth,
    confirmedAmount,
    outstandingAmount,
    evidenceReferences: Object.freeze(evidenceReferences)
  });
}

export function addM2CurrentMonths(value, count) {
  return addMonths(requireMonth(value, "month"), Number(count));
}

function addMonths(value, count) {
  if (!Number.isSafeInteger(count)) {
    throw new Error("m2_current_month_offset_invalid");
  }
  const [year, month] = value.split("-").map(Number);
  const ordinal = year * 12 + month - 1 + count;
  return `${Math.floor(ordinal / 12)}-${String(
    ordinal % 12 + 1
  ).padStart(2, "0")}`;
}

function nullableMonth(value, name) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return requireMonth(value, name);
}

function requireMonth(value, name) {
  const month = String(value ?? "");
  if (!MONTH_PATTERN.test(month)) {
    throw new Error(`m2_current_${name}_invalid`);
  }
  return month;
}

function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`m2_current_${name}_invalid`);
  }
  return number;
}

function nonnegative(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`m2_current_${name}_invalid`);
  }
  return number;
}

function requireString(value, name) {
  const normalized = nonempty(value);
  if (normalized === null) {
    throw new Error(`m2_current_${name}_required`);
  }
  return normalized;
}

function nonempty(value) {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : null;
}

function uniquePositiveIntegers(values, name) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`m2_current_${name}_required`);
  }
  const normalized = values.map((value) => positiveInteger(value, name));
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`m2_current_${name}_duplicate`);
  }
  return normalized;
}

function uniqueStrings(values, name) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`m2_current_${name}_required`);
  }
  const normalized = values.map((value) => requireString(value, name));
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`m2_current_${name}_duplicate`);
  }
  return normalized;
}
