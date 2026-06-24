# M2 Forecast Materiality Root-Cause Audit v1

candidate-b and ungated A-E bake-off are treated as failed routes for M2 forecast baseline promotion.

## Revenue Contribution

| Group | Works | Revenue | Revenue Share |
|---|---|---|---|
| top 1% | 31 | 67608772.42 | 0.5332 |
| top 5% | 153 | 102673932.12 | 0.8098 |
| top 10% | 306 | 112513777.79 | 0.8874 |
| bottom 50% | 1527 | 231217.91 | 0.0018 |
| zero or near-zero | 386 | 1160.75 | 0.0 |

## Ungated Failure Materiality

| Fail Cases | Fail Rate By Count | Fail Revenue Share | Low-Revenue Fail Count Share | Low-Revenue Fail Revenue Share | P0 Revenue Share | P1 Revenue Share |
|---|---|---|---|---|---|---|
| 32830 | 0.1654 | 0.4898 | 0.643 | 0.6011 | 0.0 | 0.0 |

## Segment Materiality

| Segment Type | Segment | Count | Revenue Share |
|---|---|---|---|
| rating | B | 647 | 0.3752 |
| rating | S+ | 7 | 0.2093 |
| rating | E | 1111 | 0.1979 |
| rating | S | 54 | 0.1243 |
| rating | A | 136 | 0.0523 |
| rating | C | 704 | 0.0368 |
| rating | D | 395 | 0.0043 |
| lifecycle | stable | 872 | 0.6526 |
| lifecycle | inactive | 800 | 0.1968 |
| lifecycle | growth | 540 | 0.0804 |
| lifecycle | declining | 394 | 0.0534 |
| lifecycle | rebound | 270 | 0.0153 |
| lifecycle | long_tail | 132 | 0.0009 |
| lifecycle | insufficient_history | 46 | 0.0007 |
| revenueBucket | top | 153 | 0.8098 |
| revenueBucket | high | 609 | 0.1612 |
| revenueBucket | mid | 1044 | 0.0275 |
| revenueBucket | long_tail | 133 | 0.0009 |
| revenueBucket | low | 1115 | 0.0006 |
| riskBucket | data_gap_or_copyright_fallback | 1874 | 0.457 |
| riskBucket | channel_concentration | 235 | 0.2076 |
| riskBucket | copyright_expiry | 343 | 0.123 |
| riskBucket | abnormal_spike | 382 | 0.1087 |
| riskBucket | no_major_risk | 141 | 0.0937 |
| riskBucket | other_risk | 48 | 0.0055 |
| riskBucket | revenue_decline | 18 | 0.0035 |
| riskBucket | inactive_tail | 3 | 0.0006 |
| riskBucket | insufficient_history | 10 | 0.0003 |
| forecastabilityStatus | manual_review_required | 2293 | 0.5824 |
| forecastabilityStatus | numeric_forecast_eligible | 236 | 0.3196 |
| forecastabilityStatus | conservative_numeric_forecast | 222 | 0.0857 |
| forecastabilityStatus | observe_only_no_numeric_forecast | 302 | 0.0123 |
| forecastabilityStatus | excluded_from_forecast_baseline | 1 | 0.0 |

This report is sanitized and aggregate-only.
