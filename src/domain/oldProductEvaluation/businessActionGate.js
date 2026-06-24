export const BUSINESS_ACTION_STATUSES = Object.freeze({
  ACTION_ALLOWED: "action_allowed",
  MANUAL_CONFIRMATION_REQUIRED: "manual_confirmation_required",
  ACTION_BLOCKED: "action_blocked",
  OBSERVE_ONLY: "observe_only"
});

const MANUAL_CONFIRMATION_SUGGESTIONS = new Set([
  "promote",
  "downlist_or_suspend",
  "renewal_review"
]);

export function evaluateBusinessActionGate(features = {}) {
  const suggestionCodes = Array.isArray(features.suggestionCodes) ? features.suggestionCodes : [];
  const forecastabilityStatus = String(features.forecastabilityStatus ?? "");
  const reasons = [];

  if (forecastabilityStatus === "true_forecast_blocked") {
    reasons.push("true_forecast_blocked_before_action");
    return buildBusinessActionResult(
      BUSINESS_ACTION_STATUSES.ACTION_BLOCKED,
      reasons,
      "resolve_forecast_blocker_before_business_action"
    );
  }

  if (forecastabilityStatus === "observe_only_no_numeric_forecast") {
    reasons.push("observe_only_forecastability_status");
    return buildBusinessActionResult(
      BUSINESS_ACTION_STATUSES.OBSERVE_ONLY,
      reasons,
      "observe_without_promote_downlist_or_renewal_action"
    );
  }

  const manualSuggestions = suggestionCodes.filter((code) => MANUAL_CONFIRMATION_SUGGESTIONS.has(code));
  if (manualSuggestions.length > 0 || Boolean(features.manualConfirmationRequired)) {
    reasons.push(...(manualSuggestions.length ? manualSuggestions : ["manual_confirmation_required"]));
    return buildBusinessActionResult(
      BUSINESS_ACTION_STATUSES.MANUAL_CONFIRMATION_REQUIRED,
      reasons,
      "manual_confirmation_before_business_action"
    );
  }

  return buildBusinessActionResult(
    BUSINESS_ACTION_STATUSES.ACTION_ALLOWED,
    ["no_business_action_blocker"],
    "business_action_allowed_if_formal_policy_allows"
  );
}

function buildBusinessActionResult(status, reasonCodes, requiredAction) {
  return {
    businessActionStatus: status,
    businessActionReasonCodes: reasonCodes,
    businessActionBlocksForecast: false,
    requiredBusinessAction: requiredAction
  };
}
