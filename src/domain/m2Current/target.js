const PURE_BUYOUT = "pure_buyout";

export function buildM2CurrentFormalCashTarget(input) {
  const salesCashActual = nonNegative(input?.salesCashActual ?? 0, "sales_cash_actual");
  const committedCashActual = nonNegative(
    input?.committedCashActual ?? 0,
    "committed_cash_actual"
  );
  const uncommittedBuyoutSurpriseActual = nonNegative(
    input?.uncommittedBuyoutSurpriseActual ?? 0,
    "uncommitted_buyout_surprise_actual"
  );
  return {
    forecastableCashActual: salesCashActual + committedCashActual,
    uncommittedBuyoutSurpriseActual,
    totalLedgerCashActual:
      salesCashActual + committedCashActual + uncommittedBuyoutSurpriseActual
  };
}

export function serveM2CurrentPointForecast(input) {
  const businessForm = String(input?.businessForm ?? "");
  const commitmentKnownAsOfCutoff = input?.commitmentKnownAsOfCutoff === true;
  if (businessForm === PURE_BUYOUT && !commitmentKnownAsOfCutoff) {
    return pointOnlyResult(null, "pure_buyout_without_auditable_commitment");
  }

  const futureSalesCashPoint = nullableNonNegative(
    input?.futureSalesCashPoint,
    "future_sales_cash_point"
  );
  const committedFutureCashPoint = commitmentKnownAsOfCutoff
    ? nullableNonNegative(
      input?.committedFutureCashPoint,
      "committed_future_cash_point"
    )
    : null;
  if (futureSalesCashPoint === null && committedFutureCashPoint === null) {
    return pointOnlyResult(null, "no_auditable_future_cash_component");
  }
  return pointOnlyResult(
    (futureSalesCashPoint ?? 0) + (committedFutureCashPoint ?? 0),
    null
  );
}

function pointOnlyResult(pointEstimate, abstentionReason) {
  return {
    pointEstimate,
    pointEstimateOnly: true,
    scenarioFieldsIncluded: false,
    predictionIntervalEndpointsIncluded: false,
    abstained: pointEstimate === null,
    abstentionReason
  };
}

function nullableNonNegative(value, name) {
  if (value === null || value === undefined) {
    return null;
  }
  return nonNegative(value, name);
}

function nonNegative(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`m2_current_${name}_invalid`);
  }
  return number;
}
