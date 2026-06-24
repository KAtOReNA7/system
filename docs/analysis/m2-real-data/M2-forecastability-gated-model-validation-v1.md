# M2 Forecastability-Gated Model Validation v1

Verdict: `FAIL`
Candidate version: `None`

## Model F Summary

| Numeric Revenue Coverage | Numeric WAPE | Baseline WAPE | Coverage | P0 | P1 | P2 |
|---|---|---|---|---|---|---|
| 0.3196 | 0.268 | 0.2555 | 0.1763 | 0 | 0 | 1284 |

## Pass Conditions

| Condition | Passed |
|---|---|
| numericRevenueCoverageAtLeast70 | False |
| numericWapeNotWorseThanBaseline | False |
| numericIntervalCoverageAtLeast60 | False |
| p0EqualsZero | True |
| p1AtMostThree | True |
| highConfidenceSpreadP75AtMost1_5 | True |
| nonForecastableNotMasqueradedAsBusinessForecast | True |

This report is sanitized and aggregate-only. It is not final production release approval.
