# M2 candidate-b forecast and backtest validation v0.2

Candidate: `m2-realdata-dev-candidate-b-forecast-calibrated-v0.2`

Legacy candidate: `m2-realdata-dev-candidate-b-v0.1`

This report is sanitized. It uses anonymous sample IDs only and does not include real work names, author names, channel names, raw bill rows, or work x channel x month revenue detail.

## Conclusion

- 20-work deep dive count: `20`
- Every deep-dive work has revenue forecast: `True`
- Every deep-dive work has 3/6/12-month backtest: `True`
- 200-work sample fail rate: `0.725`
- 200-work sample warning rate: `0.215`
- Candidate-b forecast total absolute error better than trailing baseline across all horizons: `True`
- Old fixed scenario multiplier confirmed: `True`
- New fixed scenario multiplier detected: `False`
- High-confidence optimistic / pessimistic median ratio: `1.461`

## Backtest By Horizon

| Horizon | Cases | WAPE | MAPE | MAE | Interval coverage | Better/equal share | Total abs error <= baseline |
|---|---|---|---|---|---|---|---|
| 3 | 3054 | 0.3456 | 6.626 | 448.2752 | 0.368 | 0.7528 | True |
| 6 | 3054 | 0.6731 | 30.5207 | 1959.4904 | 0.3527 | 0.6742 | True |
| 12 | 3054 | 0.7331 | 14.8672 | 4406.9666 | 0.3238 | 0.7207 | True |

## 20-Work Deep Dive Outcome

| Outcome | Count |
|---|---|
| pass | 1 |
| warning | 3 |
| fail | 16 |

## 200-Work Forecast Error Segments

| Revenue scale | Cases | WAPE | Better/equal share |
|---|---|---|---|
| long_tail | 3 | 1075.1455 | 1.0 |
| mid | 45 | 0.9483 | 0.6667 |
| low | 3 | 0.7644 | 0.0 |
| high | 246 | 0.7501 | 0.5447 |
| top | 303 | 0.5782 | 0.67 |

## Full Cohort Forecast Sanity

- Full cohort count: `3054`
- Low-confidence distribution: `{"blocked_for_business_use": 1533, "high": 94, "low": 996, "medium": 431}`
- High-error segment count in report JSON: `20`

Candidate-b remains an authorized local real-data development candidate, not a final release-approved result.
