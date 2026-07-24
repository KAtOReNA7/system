const FORECASTABLE_SALES_ROUTES = new Set([
  "pure_sales_share",
  "buyout_plus_sales",
  "sales_share"
]);

export function resolveM2CurrentCashRoute(input) {
  // Historical v0.1-v0.5 replay contract. Current v0.6 callers must use
  // resolveM2CurrentSalesShareRoute so commitments never enter M2 forecasts.
  const route = String(
    input?.revenueModel
    ?? input?.businessForm
    ?? input?.route
    ?? ""
  ).trim();
  if (route === "") {
    throw new Error("m2_current_cash_route_required");
  }
  const commitment = normalizeCommitment(input?.commitment, input);
  if (route === "pure_buyout") {
    if (commitment === null) {
      return Object.freeze({
        route,
        forecastScope: "none",
        pointEstimate: null,
        served: false,
        abstained: true,
        abstentionReason:
          "uncommitted_future_buyout_not_forecastable",
        buyoutMonthlyEquivalentAllowed: false,
        notCashForecast: true
      });
    }
    return Object.freeze({
      route,
      forecastScope: "cutoff_confirmed_commitment_only",
      pointEstimate: commitment.outstandingAmount,
      served: true,
      abstained: false,
      abstentionReason: null,
      buyoutMonthlyEquivalentAllowed: false,
      notCashForecast: false
    });
  }
  if (!FORECASTABLE_SALES_ROUTES.has(route)) {
    return Object.freeze({
      route,
      forecastScope: "none",
      pointEstimate: null,
      served: false,
      abstained: true,
      abstentionReason: "unknown_revenue_model",
      buyoutMonthlyEquivalentAllowed: false,
      notCashForecast: true
    });
  }
  return Object.freeze({
    route,
    forecastScope: route === "buyout_plus_sales"
      ? "sales_cash_plus_separately_confirmed_commitment"
      : "sales_cash",
    pointEstimate: null,
    served: true,
    abstained: false,
    abstentionReason: null,
    buyoutMonthlyEquivalentAllowed: false,
    notCashForecast: false,
    commitmentAmount: commitment?.outstandingAmount ?? 0
  });
}

export function assertM2CurrentModelCaseRoute(input) {
  // Historical v0.1-v0.5 replay assertion.
  const decision = resolveM2CurrentCashRoute(input);
  if (!decision.served || decision.abstained) {
    throw new Error(
      `m2_current_model_case_route_abstained:${decision.abstentionReason}`
    );
  }
  if (
    decision.route === "pure_buyout"
    && decision.forecastScope !== "cutoff_confirmed_commitment_only"
  ) {
    throw new Error("m2_current_pure_buyout_route_policy_invalid");
  }
  return decision;
}

export function resolveM2CurrentSalesShareRoute(input) {
  const route = String(
    input?.revenueModel
    ?? input?.businessForm
    ?? input?.route
    ?? ""
  ).trim();
  if (route === "") {
    throw new Error("m2_current_sales_share_route_required");
  }
  if (route === "pure_buyout") {
    return Object.freeze({
      route,
      forecastScope: "none",
      pointEstimate: null,
      served: false,
      abstained: true,
      abstentionReason: "buyout_outside_m2_forecast_scope",
      buyoutMonthlyEquivalentAllowed: false,
      notCashForecast: true,
      allBuyoutExcludedFromForecast: true
    });
  }
  if (!FORECASTABLE_SALES_ROUTES.has(route)) {
    return Object.freeze({
      route,
      forecastScope: "none",
      pointEstimate: null,
      served: false,
      abstained: true,
      abstentionReason: "unknown_revenue_model",
      buyoutMonthlyEquivalentAllowed: false,
      notCashForecast: true,
      allBuyoutExcludedFromForecast: true
    });
  }
  return Object.freeze({
    route,
    forecastScope: "sales_share_cash_only",
    pointEstimate: null,
    served: true,
    abstained: false,
    abstentionReason: null,
    buyoutMonthlyEquivalentAllowed: false,
    notCashForecast: false,
    allBuyoutExcludedFromForecast: true
  });
}

export function assertM2CurrentSalesShareModelCaseRoute(input) {
  const decision = resolveM2CurrentSalesShareRoute(input);
  if (!decision.served || decision.abstained) {
    throw new Error(
      `m2_current_sales_share_model_case_route_abstained:${decision.abstentionReason}`
    );
  }
  if (decision.forecastScope !== "sales_share_cash_only") {
    throw new Error("m2_current_sales_share_route_policy_invalid");
  }
  return decision;
}

function normalizeCommitment(value, input) {
  if (value === null || value === undefined) {
    return null;
  }
  try {
    return validateM2CurrentCommitmentSnapshot(value, {
      standardWorkId: input?.standardWorkId,
      origin: input?.origin,
      horizonMonths: input?.horizonMonths
    });
  } catch {
    return null;
  }
}
import {
  validateM2CurrentCommitmentSnapshot
} from "./dataContract.js";
