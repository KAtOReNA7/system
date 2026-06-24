# M2 Disentangled Algorithm Business Readiness v1

Readiness: `limited_m2_business_review_ready_for_forecastable_cohort`
M3 allowed: `False`

## Business Groups

| Group | Business Use | Reason |
|---|---|---|
| numeric_forecast_eligible | can_enter_business_review_if_validation_passes | forecastability is based only on local revenue time-series evidence |
| conservative_numeric_forecast | reference_forecast_only | forecastable but lower confidence or tail/volatile pattern |
| formal_release_blocked_but_forecastable | can_validate_algorithm_locally_but_cannot_release_formally | formal readiness blockers are separated from forecastability |
| business_action_blocked_but_forecastable | forecast_can_be_reviewed_but_action_requires_confirmation | promote/downlist/renewal controls block action, not forecast |
| true_forecast_blocked | no_numeric_forecast | insufficient series, severe unresolved spike, or not backtestable |

This report is sanitized and aggregate-only. It is not final production release approval.
