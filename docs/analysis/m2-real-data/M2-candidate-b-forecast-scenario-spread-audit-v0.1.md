# M2 candidate-b forecast scenario spread audit v0.1

Legacy candidate: `m2-realdata-dev-candidate-b-v0.1`

Calibrated candidate: `m2-realdata-dev-candidate-b-forecast-calibrated-v0.2`

## Conclusion

candidate-b scenario generation is not sufficiently data-driven and fails scenario reliability requirement.

The legacy v0.1 scenario spread is fixed-rate: old full optimistic / pessimistic ratio P50 = `4.4667`, P75 = `4.4667`, P95 = `4.4667`.

The v0.2 calibration removes the fixed multiplier path: new full optimistic / pessimistic ratio P50 = `2.6792`, P75 = `2.9761`, P95 = `3.2`.

## Requirement Checks

| Criterion | Value |
|---|---|
| oldFixedMultiplierConfirmed | True |
| newFixedMultiplierDetected | False |
| highConfidenceMedianOptimisticPessimisticRatioLe1_5 | True |
| fullP75OptimisticPessimisticRatioLe2ExcludingLowConfidenceSpikeInsufficientHistory | True |

## By Rating

| Rating | Old ratio P50 | Old ratio P75 | New ratio P50 | New ratio P75 | New ratio P95 | Fixed after |
|---|---|---|---|---|---|---|
| A | 4.4667 | 4.4667 | 1.895 | 2.0 | 2.0 | False |
| B | 4.4667 | 4.4667 | 2.4946 | 2.5788 | 2.8727 | False |
| C | 4.4667 | 4.4667 | 2.6873 | 2.9016 | 3.0312 | False |
| D | 4.4667 | 4.4667 | 3.0124 | 3.1365 | 3.2 | False |
| E | 4.4667 | 4.4667 | 3.0 | 3.1833 | 3.5 | False |
| S | 4.4667 | 4.4667 | 1.8896 | 2.0 | 2.0 | False |
| S+ | 4.4667 | 4.4667 | 1.4678 | 1.7386 | 2.0 | False |

## By Lifecycle

| Lifecycle | Old ratio P50 | Old ratio P75 | New ratio P50 | New ratio P75 | New ratio P95 | Fixed after |
|---|---|---|---|---|---|---|
| declining | 4.4667 | 4.4667 | 2.8975 | 3.1308 | 3.4 | False |
| growth | 4.4667 | 4.4667 | 2.6517 | 2.9505 | 3.1593 | False |
| inactive | 4.4667 | 4.4667 | 2.8787 | 2.9539 | 3.2833 | False |
| insufficient_history | 4.4667 | 4.4667 | 3.0135 | 3.1497 | 3.1644 | False |
| long_tail | 4.4667 | 4.4667 | 3.0224 | 3.1775 | 3.3763 | False |
| rebound | 4.4667 | 4.4667 | 2.9542 | 3.1103 | 3.2063 | False |
| stable | 4.4667 | 4.4667 | 2.5099 | 2.6448 | 2.9822 | False |

## By Forecast Confidence

| Confidence | Old ratio P50 | Old ratio P75 | New ratio P50 | New ratio P75 | New ratio P95 | Fixed after |
|---|---|---|---|---|---|---|
| blocked_for_business_use | 4.4667 | 4.4667 | 3.0 | 3.1429 | 3.3 | False |
| high | 4.4667 | 4.4667 | 1.461 | 1.4683 | 1.4772 | False |
| low | 4.4667 | 4.4667 | 2.5567 | 2.6452 | 2.8994 | False |
| medium | 4.4667 | 4.4667 | 1.9119 | 2.0 | 2.0 | False |

This report is aggregate and sanitized. It does not include real work names, author names, channel names, raw bill rows, or work x channel x month revenue detail.
