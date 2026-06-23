# M2 candidate-b forecast calibration remediation v0.1

Legacy candidate: `m2-realdata-dev-candidate-b-v0.1`

Calibrated candidate: `m2-realdata-dev-candidate-b-forecast-calibrated-v0.2`

## Conclusion

- Legacy v0.1 pass conclusion reversed: `True`
- Old fixed multiplier confirmed: `True`
- New fixed multiplier detected: `False`
- Final verdict: `FAIL`
- Still not final release approved: `true`
- Still do not enter M3: `true`

## Base Forecast Change

| Metric | Value |
|---|---|
| oldTotal | 28875135.04 |
| newTotal | 28384685.66 |
| delta | -490449.38 |
| lowValueOldTotal | 60416.63 |
| lowValueNewTotal | 37461.2 |
| lowValueDelta | -22955.43 |

## Scenario Spread Change

- Old optimistic / pessimistic ratio: `{"count": 2311, "p50": 4.4667, "p75": 4.4667, "p90": 4.4667, "p95": 4.4667}`
- New optimistic / pessimistic ratio: `{"count": 2259, "p50": 2.6792, "p75": 2.9761, "p90": 3.1465, "p95": 3.2}`
- New high-confidence optimistic / pessimistic ratio: `{"count": 86, "p50": 1.461, "p75": 1.4683, "p90": 1.4745, "p95": 1.4772}`

## Backtest By Horizon

| Horizon | Cases | WAPE | MAPE | MAE | Interval coverage | Better/equal share | Total abs error <= baseline |
|---|---|---|---|---|---|---|---|
| 3 | 3054 | 0.3456 | 6.626 | 448.2752 | 0.368 | 0.7528 | True |
| 6 | 3054 | 0.6731 | 30.5207 | 1959.4904 | 0.3527 | 0.6742 | True |
| 12 | 3054 | 0.7331 | 14.8672 | 4406.9666 | 0.3238 | 0.7207 | True |

## Rating and Suggestion Impact

- Rating distribution changed: `False`
- Suggestion distribution changed: `False`
- Confidence distribution: `{"blocked_for_business_use": 1533, "high": 94, "low": 996, "medium": 431}`

This report is sanitized and aggregate-only. Private detail remains under `data/private-output/` and must not be committed.
