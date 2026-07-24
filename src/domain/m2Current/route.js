const FORECASTABLE_SALES_ROUTES = new Set([
  "pure_sales_share",
  "buyout_plus_sales",
  "sales_share"
]);

export function resolveM2CurrentCashRoute(input) {
  const route = String(
    input?.revenueModel
    ?? input?.businessForm
    ?? input?.route
    ?? ""
  ).trim();
  if (route === "") {
    throw new Error("m2_current_cash_route_required");
  }
  const commitment = normalizeCommitment(input?.commitment, input?.origin);
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

function normalizeCommitment(value, origin) {
  if (value === null || value === undefined) {
    return null;
  }
  const confirmedAsOf = String(value.confirmedAsOf ?? "").slice(0, 7);
  const cutoff = String(origin ?? "").slice(0, 7);
  const outstandingAmount = Number(value.outstandingAmount);
  if (
    !/^\d{4}-(?:0[1-9]|1[0-2])$/u.test(confirmedAsOf)
    || !/^\d{4}-(?:0[1-9]|1[0-2])$/u.test(cutoff)
    || confirmedAsOf > cutoff
    || !Number.isFinite(outstandingAmount)
    || outstandingAmount < 0
    || value.signed !== true
    || value.confirmed !== true
    || value.auditable !== true
  ) {
    return null;
  }
  return { outstandingAmount };
}
