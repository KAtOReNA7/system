# M2 real-data algorithm calibration summary v0.1

Mode: authorized local real-data development.

## Candidate Comparison

| Candidate | Works | Blocking reviews | Advisory reviews | Promote | Downlist/suspend |
|---|---|---|---|---|---|
| candidate-a baseline | 3054 | 513 | 2331 | 442 | 744 |
| m2-realdata-dev-candidate-b-v0.1 | 3054 | 85 | 2759 | 557 | 744 |

## Candidate B Delta

| Metric | Candidate B - A |
|---|---|
| manualReviewRequiredCount | -428 |
| advisoryOnlyCount | 428 |
| promoteCount | 115 |
| downlistOrSuspendCount | 0 |

## Lifecycle Algorithm

| Threshold | Value |
|---|---|
| insufficientHistoryCompleteMonths | 6 |
| inactiveRecent6RevenueMax | 0.0 |
| longTailLast12RevenueMax | 2.82 |
| growthRecent6Prior6Ratio | 1.52 |
| decliningRecent6Prior6Ratio | 0.45 |
| reboundRecent3Previous3Ratio | 1.5 |
| stableLast6CoefficientOfVariationMax | 0.73 |

## Forecast Backtest

| Horizon | Model | Samples | MAE | MAPE | Median error | Over | Under |
|---|---|---|---|---|---|---|---|
| 3 | last12_average | 3054 | 680 | 37.2075 | 0.28 | 1902 | 596 |
| 3 | last24_average | 3054 | 1100 | 205.6993 | 1.52 | 2147 | 483 |
| 3 | lifecycle_adjusted | 3054 | 450 | 17.5518 | 0.0 | 1535 | 963 |
| 6 | last12_average | 3054 | 2400 | 93.9446 | 0.07 | 1639 | 910 |
| 6 | last24_average | 3054 | 2300 | 512.3815 | 0.94 | 1841 | 799 |
| 6 | lifecycle_adjusted | 3054 | 1900 | 36.0154 | 10 | 1262 | 1288 |
| 12 | last12_average | 3054 | 5300 | 310.6945 | 0.43 | 1664 | 949 |
| 12 | last24_average | 3054 | 5100 | 1179.6208 | 2.35 | 1760 | 913 |
| 12 | lifecycle_adjusted | 3054 | 4400 | 174.6462 | 10 | 1317 | 1296 |

## Rating Thresholds

| Rating | Amount threshold |
|---|---|
| S+ | 133000 |
| S | 16000 |
| A | 2700 |
| B | 310 |
| C | 10 |
| D | 1.8 |
| E | 0.0 |

These outputs are real-data development results, not final release-approved formal results.
