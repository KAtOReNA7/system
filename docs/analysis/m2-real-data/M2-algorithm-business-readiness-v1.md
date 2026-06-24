# M2 Algorithm Business Readiness v1

Business review readiness: `not_ready`
M3 allowed: `False`

## Readiness By Group

| Group | Status | Reason |
|---|---|---|
| high_confidence_stable_growth_top_high | business_review_ready | high/medium confidence and enough history |
| inactive_long_tail_D_E_low_revenue | low_confidence_manual_review | zero-inflated guard prevents overforecast but business action remains manual |
| insufficient_history | manual_review_required | model uses shrinkage prior and cannot be formal without more months |
| data_gap_or_copyright_fallback | manual_review_required | forecast may exist but source readiness is incomplete |
| abnormal_spike_or_oneoff | manual_review_required | spike damping is deterministic but business cause remains unconfirmed |

This report is sanitized and aggregate-only. It is not final production release approval.
