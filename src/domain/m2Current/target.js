const PURE_BUYOUT = "pure_buyout";

export function buildM2CurrentFormalCashTarget(input) {
  // Historical v0.1-v0.5 replay contract.
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

export function buildM2CurrentSalesShareTarget(input) {
  const salesShareCashActual = finiteActual(
    input?.salesShareCashActual ?? 0,
    "sales_share_cash_actual"
  );
  const isolatedBuyoutCashActual = nonNegative(
    input?.isolatedBuyoutCashActual ?? 0,
    "isolated_buyout_cash_actual"
  );
  const isolatedOtherCashActual = nonNegative(
    input?.isolatedOtherCashActual ?? 0,
    "isolated_other_cash_actual"
  );
  return Object.freeze({
    salesShareCashActual,
    isolatedBuyoutCashActual,
    isolatedOtherCashActual,
    totalLedgerCashActual:
      salesShareCashActual
      + isolatedBuyoutCashActual
      + isolatedOtherCashActual,
    allBuyoutExcludedFromForecast: true,
    commitmentCashExcludedFromForecast: true,
    targetPolicy: "sales_share_cash_only"
  });
}

export function serveM2CurrentPointForecast(input) {
  // Historical v0.1-v0.5 replay contract.
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

export function serveM2CurrentSalesSharePointForecast(input) {
  const businessForm = String(input?.businessForm ?? "");
  if (businessForm === PURE_BUYOUT) {
    return pointOnlyResult(null, "buyout_outside_m2_forecast_scope");
  }
  const futureSalesShareCashPoint = nullableNonNegative(
    input?.futureSalesShareCashPoint ?? input?.futureSalesCashPoint,
    "future_sales_share_cash_point"
  );
  if (futureSalesShareCashPoint === null) {
    return pointOnlyResult(null, "no_auditable_sales_share_cash_component");
  }
  return pointOnlyResult(futureSalesShareCashPoint, null);
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

function finiteActual(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`m2_current_${name}_invalid`);
  }
  return number;
}
