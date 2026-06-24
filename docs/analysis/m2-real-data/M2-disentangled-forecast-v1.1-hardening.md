# M2 Disentangled Forecast v1.1 Hardening

Verdict: `CONDITIONAL PASS`.
Candidate version: `m2-realdata-dev-disentangled-forecast-v1.1-conditional`.

## v1.0 vs v1.1

| Version | Verdict | Forecastable Revenue Share | True Blocked Revenue Share | WAPE | Baseline WAPE | Coverage | P0 | P1 |
|---|---|---|---|---|---|---|---|---|
| v1.0 | CONDITIONAL PASS | 0.7666 | 0.2151 | 0.6397 | 0.6848 | 0.4411 | 0 | 0 |
| v1.1 | CONDITIONAL PASS | 0.7779 | 0.2038 | 0.6485 | 0.7039 | 0.5562 | 0 | 0 |

## Gate Boundary Changes

Downgraded to conservative count: `18`.
Downgraded revenue share: `0.011`.

This report is sanitized and aggregate-only. It is not final production release approval.
