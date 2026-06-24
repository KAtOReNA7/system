# M2 Disentangled Forecast Business Readiness v1.1

Readiness: `limited_m2_business_review_ready_for_forecastable_cohort_only`.
M3 allowed: `False`.
Candidate version: `m2-realdata-dev-disentangled-forecast-v1.1-conditional`.

## Business Groups

| Group | Business Use | Reason |
|---|---|---|
| numeric_forecast_eligible | can_enter_limited_m2_business_review | validated numeric forecast cohort |
| conservative_numeric_forecast | reference_only_or_low_confidence_review | forecastable after conservative gate and calibrated interval |
| true_forecast_blocked | no_numeric_forecast | insufficient or genuinely unstable revenue series |
| formal_release_blockers | not_formal_release_approval | formal readiness remains separate from forecastability |

This report is sanitized and aggregate-only. It is not final production release approval.
