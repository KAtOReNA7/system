# M2-C-0 cleaned-bill algorithm calibration exploration report v0.1

## 1. Status and boundary

Status: NON-FORMAL AGGREGATE CALIBRATION CANDIDATE.

This round reads user-provided local real development data for algorithm calibration exploration. It does not execute formal evaluation, does not write any database, does not activate a `mapping_version`, does not implement `local_dry_run`, does not add write/export/evaluation-task APIs, and does not modify `db/migrations/`.

All outputs are aggregate-only. No raw bill rows, real work names, real author names, real channel names, private workbook bodies, or single-work revenue details are included in this report.

## 2. Data categories read

Read local authorized data categories:

- real bill workbook under the project data area;
- digital copyright ledger workbook under the project data area;
- mapping candidate material;
- operations confirmation / mapping-related material;
- existing M1/M2 public analysis summaries.

Not read:

- `.env`, `.env.local`, `.pgpass`;
- database connection strings;
- any formal database;
- Docker runtime or containers.

## 3. Data dictionary summary

Real bill fields used:

| Role | Field semantics |
| --- | --- |
| month | bill month |
| channel | channel ID / channel name, used only for aggregate concentration |
| authorization category | used as descriptive input only, not as business-form source of truth |
| raw work ID | used to derive or overlay standard work identity |
| work name | read as source field but not written to public outputs |
| actual sales amount | aggregate revenue calibration input |

Master-data fields used:

| Role | Field semantics |
| --- | --- |
| work ID | standard/copyright ledger work identity |
| signing date | copyright start candidate |
| expiry date | copyright end candidate |

Mapping / operations material was used only to understand approved or candidate raw-ID to standard-work projection and confirmation context. Original confirmation workbook content is not reproduced.

## 4. Aggregate scale summary

| Metric | Value |
| --- | ---: |
| Raw bill rows read | 192,872 |
| Valid calibration rows | 192,872 |
| Complete-month calibration rows | 192,869 |
| Work count | 3,054 |
| Work-month-business-form aggregate rows | 95,090 |
| Month range | 2017-06 to 2026-05 |
| Latest complete month candidate | 2026-04 |
| Incomplete months excluded | 2026-05 |
| Business forms | 2 |
| Rows with mapping overlay applied | 54,544 |
| Rows with channel ID | 192,872 |
| Unambiguous copyright-end works in ledger | 7,542 |
| Copyright-date conflict works in ledger | 2 |

Amount sign distribution after complete-month filtering:

| Sign | Row count |
| --- | ---: |
| Positive | 192,222 |
| Zero | 501 |
| Negative | 146 |

## 5. Population distribution summary

All amount thresholds below are rounded aggregate distribution candidates. They are not formal business rules.

| Distribution | p20 | p40 | p65 | p85 | p95 | p99 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Total historical revenue | 30 | 280 | 4,300 | 25,400 | 101,000 | 831,000 |
| Last-12-month revenue | 1.76 | 10 | 310 | 2,700 | 15,200 | 133,000 |

Other aggregate findings:

- Zero last-12 revenue work share: 20.46%.
- Long-tail work share candidate: 19.91%.
- Channel concentration is structurally high in this dataset: p50 / p75 / p90 top-channel share are all 1.0.
- Remaining copyright-month quantiles where unambiguous: p25=2, p50=16, p75=34.

## 6. Lifecycle rule candidates

Candidate thresholds:

| Lifecycle input | Candidate |
| --- | ---: |
| insufficient history complete months | 6 |
| inactive recent-6 revenue max | 0 |
| long-tail last-12 revenue max | 2.82 |
| growth recent6 / prior6 ratio | 1.52 |
| declining recent6 / prior6 ratio | 0.45 |
| rebound recent3 / previous3 ratio | 1.50 |
| stable last-6 coefficient of variation max | 0.73 |

Resulting population split:

| Lifecycle | Count | Share |
| --- | ---: | ---: |
| stable | 872 | 28.55% |
| inactive | 800 | 26.20% |
| growth | 540 | 17.68% |
| declining | 394 | 12.90% |
| rebound | 270 | 8.84% |
| long_tail | 132 | 4.32% |
| insufficient_history | 46 | 1.51% |

Manual review is recommended for borderline ratio cases, copyright-date conflicts, high channel concentration, and abnormal spike signals.

## 7. Forecast parameter candidates and backtest summary

Models tested:

- last-12-month average;
- last-24-month average;
- lifecycle-adjusted last-12-month average.

Recommended non-formal base model candidate:

```text
last12 monthly average × horizon months × lifecycle factor
```

Lifecycle factor candidates:

| Lifecycle | Factor |
| --- | ---: |
| stable | 0.63 |
| rebound | 0.63 |
| growth | 0.82 |
| long_tail | 1.09 |
| declining | 0.35 |
| inactive | 0.79 |
| insufficient_history | 2.50 |

Scenario multiplier candidates:

| Scenario | Multiplier |
| --- | ---: |
| pessimistic | 0.45 |
| base | 1.00 |
| optimistic | 2.01 |

Backtest aggregate error summary:

| Horizon | Model | Sample count | MAE | MAPE | Median error | Over | Under |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 3 | last12_average | 3,054 | 680 | 37.2075 | 0.28 | 1,902 | 596 |
| 3 | last24_average | 3,054 | 1,100 | 205.6993 | 1.52 | 2,147 | 483 |
| 3 | lifecycle_adjusted | 3,054 | 450 | 17.5518 | 0.00 | 1,535 | 963 |
| 6 | last12_average | 3,054 | 2,400 | 93.9446 | 0.07 | 1,639 | 910 |
| 6 | last24_average | 3,054 | 2,300 | 512.3815 | 0.94 | 1,841 | 799 |
| 6 | lifecycle_adjusted | 3,054 | 1,900 | 36.0154 | 10 | 1,262 | 1,288 |
| 12 | last12_average | 3,054 | 5,300 | 310.6945 | 0.43 | 1,664 | 949 |
| 12 | last24_average | 3,054 | 5,100 | 1179.6208 | 2.35 | 1,760 | 913 |
| 12 | lifecycle_adjusted | 3,054 | 4,400 | 174.6462 | 10 | 1,317 | 1,296 |

MAPE is extremely sensitive to very small actual values in long-tail and inactive samples, so MAE, median error, over/under balance, and lifecycle segmentation should be reviewed together. The lifecycle-adjusted model is the preferred candidate because it reduces aggregate MAE across all tested horizons.

Samples not suitable for automatic forecast:

- insufficient history;
- abnormal spike / likely one-off income;
- copyright-date conflicts;
- unresolved mapping uncertainty;
- zero or near-zero actual windows where percentage error is unstable.

## 8. Rating threshold candidates

Recommended rating method:

```text
max(last12 historical revenue, 12-month lifecycle-adjusted forecast)
```

Candidate absolute thresholds and distribution breakpoints:

| Rating | Percentile breakpoint | Absolute amount candidate | Sample share |
| --- | ---: | ---: | ---: |
| S+ | p99 | 133,000 | 1.03% |
| S | p95 | 16,000 | 3.99% |
| A | p85 | 2,700 | 10.21% |
| B | p65 | 310 | 19.88% |
| C | p40 | 10 | 28.61% |
| D | p20 | 1.80 | 16.26% |
| E | below p20 / zero | 0 | 20.01% |

Interpretation:

- D/E is the low-investment or downlist/suspend candidate band, but final action still requires operational policy.
- S/S+ is the high-priority candidate band and must still be screened for one-off spikes, mapping uncertainty, and copyright expiry.
- Old-product rating is not equivalent to new-product launch rating because it is driven by observed historical revenue and remaining-rights economics.
- External events should increase at most two levels and require manual review.
- Insufficient-history samples should fall back to observe-only / manual review rather than high-confidence rating.

## 9. Risk rule candidates

| Rule | Trigger | Severity | Manual review |
| --- | --- | --- | --- |
| data_readiness | missing aggregate input, unresolved mapping, or missing required master data | high | yes |
| revenue_decline | recent6/prior6 ratio <= 0.45 | medium | no |
| copyright_expiry | remaining copyright months <= 12 | high | yes |
| insufficient_history | history months < 6 | medium | yes |
| business_form_mixed | standard work has both business forms | low | no |
| inactive_tail | lifecycle in inactive or long_tail | medium | no |
| abnormal_spike | peak month share >= 0.90 | medium | yes |
| buyout_or_oneoff_income | peak month share >= 0.90 with otherwise sparse revenue | medium | yes |
| channel_concentration | top channel share >= 0.95 | medium | no |
| mapping_uncertainty | invalid, unmapped, or conflict-group raw work ID | high | yes |
| incomplete_month_boundary | bill max month exceeds latest complete month | low | no |

## 10. Suggestion rule candidates

| Suggestion | Trigger | Priority | Manual review |
| --- | --- | --- | --- |
| promote | S+/S or lifecycle=growth without high readiness risk | high | yes |
| maintain | A/B and stable or modest growth | medium | no |
| reduce_investment | C/D with declining or inactive signal | medium | no |
| repackage | mixed business form or channel concentration with non-low revenue | medium | yes |
| pricing_or_channel_adjustment | long_tail or rebound with manageable channel concentration | medium | yes |
| renewal_review | copyright expiry and rating not below C | high | yes |
| observe_only | insufficient history or incomplete-month boundary dominates | low | no |
| downlist_or_suspend | E + inactive + no renewal/event support | medium | yes |
| manual_review_required | mapping uncertainty, abnormal spike, one-off income, or copyright conflict | high | yes |

## 11. Parameter file

Created:

- `src/domain/oldProductEvaluation/calibratedParameters.js`

The parameter file contains only non-formal aggregate calibration candidates and is marked:

- `nonFormalCalibration=true`;
- `realDataAggregated=true`;
- `notForFormalDecision=true`.

The fixture engine was not modified in this round. This avoids changing the already-closed M2-B fixture regression baseline while making M2-C-0 calibrated candidates available for a controlled future integration step.

## 12. Caveats

- This is not a formal business conclusion.
- The mapping candidate is not activated as a database `mapping_version`.
- Real-data calibration was performed locally from authorized files; no raw detail is committed.
- Channel concentration appears high and may require operational interpretation before it becomes a high-severity rule.
- MAPE is unstable for tiny actual values; do not use MAPE alone for threshold decisions.

## 13. Recommended next step

Proceed to a controlled M2-C-1 integration design: decide how the non-formal calibrated parameters should be referenced by the engine, how to keep fixture and formal-calibration modes separate, and what additional operational approvals are required before any local dry-run or formal evaluation path is implemented.
