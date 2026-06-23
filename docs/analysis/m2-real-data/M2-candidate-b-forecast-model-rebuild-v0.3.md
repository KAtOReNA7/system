# M2 candidate-b forecast model rebuild v0.3

Candidate: `m2-realdata-dev-candidate-b-forecast-rebuilt-v0.3`

Previous candidate: `m2-realdata-dev-candidate-b-forecast-calibrated-v0.2`

Legacy candidate: `m2-realdata-dev-candidate-b-v0.1`

This report is sanitized. It contains aggregate metrics and anonymous validation evidence only. It does not include real work names, author names, channel names, raw bill rows, or work x channel x month revenue details.

## Conclusion

- v0.1 fixed optimistic / pessimistic ratio confirmed: `True`
- v0.2 verdict: `FAIL`
- v0.3 base forecast rebuild completed: `True`
- v0.3 interval recalibration completed: `True`
- v0.3 validation verdict: `FAIL`
- Can enter business review: `False`
- Still do not enter M3: `True`
- Still not final release approved: `True`

## Rebuild Scope

| Target | Implementation |
|---|---|
| baseForecastRebuilt | True |
| intervalRecalibratedFromResidualVolatilityConfidence | True |
| inactiveCap | recent near-zero and last-12 cap |
| longTailCap | low-revenue damping cap |
| dAndERatingCap | D/E and low-value base forecast cap |
| abnormalSpikeDamping | 0.35 multiplier after cap |
| insufficientHistoryPolicy | conservative cap and low/blocked confidence |
| copyrightFallbackPolicy | blocked_for_business_use for weak evidence with readiness risk |
| horizonOverextensionPolicy | remaining-month cap for low-confidence or weak-evidence rows |

## Base Forecast Change

| Metric | Value |
|---|---|
| oldTotal | 28875135.04 |
| rebuiltTotal | 17170869.36 |
| delta | -11704265.68 |
| lowValueOldTotal | 60416.63 |
| lowValueRebuiltTotal | 2736.14 |
| lowValueDelta | -57680.49 |

## Base Forecast Change By Lifecycle

| Lifecycle | Count | Old base total | Rebuilt base total | Delta |
|---|---|---|---|---|
| declining | 394 | 487353.07 | 331715.96 | -155637.11 |
| growth | 540 | 7504150.02 | 3391306.53 | -4112843.49 |
| inactive | 800 | 59208.42 | 2033.34 | -57175.08 |
| insufficient_history | 46 | 498425.23 | 48570.62 | -449854.61 |
| long_tail | 132 | 65.11 | 50.84 | -14.27 |
| rebound | 270 | 172450.12 | 169295.56 | -3154.56 |
| stable | 872 | 20153483.07 | 13227896.51 | -6925586.56 |

## Scenario Spread

- Old full optimistic / pessimistic ratio: `{"count": 2311, "p50": 4.4667, "p75": 4.4667, "p90": 4.4667, "p95": 4.4667}`
- Rebuilt full optimistic / pessimistic ratio: `{"count": 2214, "p50": 2.7375, "p75": 3.0, "p90": 3.1793, "p95": 3.2074}`
- Rebuilt high-confidence optimistic / pessimistic ratio: `{"count": 77, "p50": 1.3661, "p75": 1.3781, "p90": 1.3891, "p95": 1.3936}`
- Fixed multiplier detected after rebuild: `False`

## Backtest By Horizon

| Horizon | Cases | WAPE | MAPE | MAE | Interval coverage | Better/equal share | Total abs error <= baseline |
|---|---|---|---|---|---|---|---|
| 3 | 3054 | 0.4413 | 8.027 | 572.503 | 0.3563 | 0.6916 | True |
| 6 | 3054 | 0.4405 | 6.7176 | 1282.2902 | 0.3612 | 0.7256 | True |
| 12 | 3054 | 0.7588 | 13.7965 | 4561.2691 | 0.3062 | 0.6929 | True |

Private readable workbooks are generated under `data/private-output/` and must not be committed.
