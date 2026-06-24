# M2 candidate-b forecast and backtest validation v0.1

Candidate: `m2-realdata-dev-candidate-b-v0.1`

This report is sanitized. It uses anonymous sample IDs only and does not include real work names, author names, channel names, raw bill rows, or work x channel x month revenue detail.

## Conclusion

- 20-work deep dive count: `20`
- Every deep-dive work has revenue forecast: `True`
- Every deep-dive work has 3/6/12-month backtest: `True`
- 200-work sample fail rate: `0.0`
- Candidate-b forecast total absolute error better than trailing baseline across all horizons: `True`

## Backtest By Horizon

| Horizon | Cases | WAPE | Better/equal share | Total abs error <= baseline |
|---|---|---|---|---|
| 3 | 3054 | 0.3483 | 0.7508 | True |
| 6 | 3054 | 0.6633 | 0.6686 | True |
| 12 | 3054 | 0.7341 | 0.7276 | True |

## 20-Work Deep Dive Outcome

| Outcome | Count |
|---|---|
| pass | 4 |
| warning | 16 |
| fail | 0 |

## 200-Work Forecast Error Segments

| Revenue scale | Cases | WAPE | Better/equal share |
|---|---|---|---|
| long_tail | 3 | 1075.1455 | 1.0 |
| mid | 45 | 0.9469 | 0.7111 |
| low | 3 | 0.7644 | 0.0 |
| high | 246 | 0.7523 | 0.5569 |
| top | 303 | 0.5708 | 0.67 |

## Full Cohort Forecast Sanity

- Full cohort count: `3054`
- Low-confidence distribution: `{"high": 625, "low": 2224, "medium": 205}`
- High-error segment count in report JSON: `20`

Candidate-b remains an authorized local real-data development candidate, not a final release-approved result.
