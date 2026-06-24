# M2 Disentangled Forecastability v1.0 Conditional Failure Drilldown

Coverage: `0.4411`.
Under-forecast rate: `0.3835`.
Over-forecast rate: `0.269`.

## Low Coverage Segments

| Segment Type | Segment | Cases | Coverage | WAPE | Under | Over |
|---|---|---|---|---|---|---|
| confidence | high | 5300 | 0.1592 | 0.296 | 0.2994 | 0.7006 |
| confidence | medium | 14707 | 0.2092 | 0.5835 | 0.452 | 0.548 |
| forecastability_status | conservative_numeric_forecast | 24830 | 0.463 | 0.8331 | 0.3513 | 0.2687 |
| forecastability_status | numeric_forecast_eligible | 41665 | 0.4281 | 0.6007 | 0.4027 | 0.2691 |
| horizon | 12 | 13299 | 0.4357 | 0.6006 | 0.3989 | 0.2523 |
| horizon | 18 | 12276 | 0.3832 | 0.649 | 0.467 | 0.2272 |
| horizon | 24 | 11253 | 0.3364 | 0.7007 | 0.5309 | 0.2053 |
| horizon | 6 | 14322 | 0.4913 | 0.5561 | 0.3236 | 0.2857 |
| lifecycle | declining | 5538 | 0.1464 | 0.7291 | 0.4547 | 0.5453 |
| lifecycle | growth | 7491 | 0.238 | 0.5521 | 0.5362 | 0.4638 |
| lifecycle | rebound | 3681 | 0.2086 | 0.6776 | 0.4705 | 0.5295 |
| lifecycle | stable | 12893 | 0.1903 | 0.3783 | 0.3231 | 0.6769 |
| rating | B | 38805 | 0.4392 | 0.6498 | 0.4153 | 0.2492 |
| rating | C | 15340 | 0.3583 | 1.11 | 0.3175 | 0.4029 |
| revenue_bucket | high | 11450 | 0.1935 | 0.7586 | 0.3969 | 0.5857 |
| revenue_bucket | low | 2503 | 0.0443 | 0.995 | 0.9557 | 0.0431 |
| revenue_bucket | mid | 16484 | 0.2067 | 0.833 | 0.4601 | 0.5347 |
| revenue_bucket | top | 3818 | 0.2334 | 0.4361 | 0.38 | 0.5917 |

## True Forecast Blocked Reasons

| Reason | Count | Revenue Share | Top 5 Count |
|---|---|---|---|
| insufficient_revenue_time_series | 507 | 0.2016 | 24 |
| unresolved_spike_or_oneoff_income | 43 | 0.0135 | 2 |
| no_backtestable_revenue_history | 1 | 0.0 | 0 |

This report is sanitized and aggregate-only.
