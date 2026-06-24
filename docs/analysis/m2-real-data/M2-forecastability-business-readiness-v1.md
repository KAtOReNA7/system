# M2 Forecastability Business Readiness v1

Readiness: `not_ready_for_m2_business_review`
M3 allowed: `False`

## Business Groups

| Group | Business Use | Reason |
|---|---|---|
| numeric_forecast_eligible | allowed_for_business_review_only_if_verdict_pass_or_conditional | material history, meaningful recent revenue, controlled volatility, no severe gap |
| conservative_numeric_forecast | reference_only_low_confidence | bounded forecast can be shown, but not used for strong business actions |
| observe_only_no_numeric_forecast | no_business_numeric_forecast | low materiality, zero-heavy, inactive, long-tail, D/E, or near-zero revenue |
| manual_review_required | blocked_until_manual_review | spike, data gap, copyright fallback, mapping/basic-info issue, or insufficient history |
| excluded_from_forecast_baseline | excluded_from_acceptance_score | not backtestable or no usable revenue history |

This report is sanitized and aggregate-only. It is not final production release approval.
