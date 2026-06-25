# M2 Disentangled Forecastability v1.0 Conditional Failure Drilldown

Coverage: `0.4414`.
Under-forecast rate: `0.3835`.
Over-forecast rate: `0.2691`.

## Low Coverage Segments

| Segment Type | Segment | Cases | Coverage | WAPE | Under | Over |
|---|---|---|---|---|---|---|
| confidence | high | 5370 | 0.1587 | 0.2976 | 0.2983 | 0.7017 |
| confidence | low | 9546 | 0.1973 | 0.7521 | 0.4371 | 0.5629 |
| confidence | medium | 14687 | 0.2095 | 0.5833 | 0.4531 | 0.5469 |
| forecastability_status | conservative_numeric_forecast | 24635 | 0.4652 | 0.8321 | 0.3507 | 0.2676 |
| forecastability_status | numeric_forecast_eligible | 41860 | 0.4275 | 0.6019 | 0.4028 | 0.2699 |
| horizon | 12 | 13299 | 0.4362 | 0.6008 | 0.3988 | 0.2523 |
| horizon | 18 | 12276 | 0.3834 | 0.6493 | 0.4669 | 0.2273 |
| horizon | 24 | 11253 | 0.3366 | 0.7011 | 0.5308 | 0.2054 |
| horizon | 6 | 14322 | 0.4914 | 0.5563 | 0.3236 | 0.2858 |
| lifecycle | declining | 5538 | 0.1461 | 0.7299 | 0.4547 | 0.5453 |
| lifecycle | growth | 7491 | 0.238 | 0.5527 | 0.5358 | 0.4642 |
| lifecycle | rebound | 3681 | 0.2084 | 0.6778 | 0.4705 | 0.5295 |
| lifecycle | stable | 12893 | 0.1903 | 0.3787 | 0.323 | 0.677 |
| rating | B | 51155 | 0.4663 | 0.6185 | 0.4033 | 0.2289 |
| rating | C | 15340 | 0.3586 | 1.11 | 0.3174 | 0.4029 |
| revenue_bucket | high | 11450 | 0.1934 | 0.7606 | 0.3965 | 0.586 |
| revenue_bucket | low | 2503 | 0.0439 | 0.995 | 0.9557 | 0.0431 |
| revenue_bucket | mid | 16484 | 0.2078 | 0.8331 | 0.4601 | 0.5348 |
| revenue_bucket | top | 3818 | 0.2342 | 0.4361 | 0.3803 | 0.5914 |

## True Forecast Blocked Reasons

| Reason | Count | Revenue Share | Top 5 Count |
|---|---|---|---|
| insufficient_revenue_time_series | 507 | 0.2016 | 24 |
| unresolved_spike_or_oneoff_income | 43 | 0.0135 | 2 |
| no_backtestable_revenue_history | 1 | 0.0 | 0 |

This report is sanitized and aggregate-only.
