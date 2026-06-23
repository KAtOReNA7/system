# M2 candidate-b v0.3 algorithm validation report

Candidate: `m2-realdata-dev-candidate-b-forecast-rebuilt-v0.3`

Legacy candidate: `m2-realdata-dev-candidate-b-v0.1`

This report is sanitized. It uses aggregate metrics and anonymous sample IDs only.

## Conclusion

- Verdict: `FAIL`
- Candidate-b passes M2 algorithm usability validation: `False`
- Can enter business review: `False`
- Requires continued forecast algorithm work: `True`
- Still do not enter M3: `True`
- Still not final release approved: `True`

## Validation Layers

| Layer | Count | Key result |
|---|---:|---|
| 20-work deep dive | 20 | forecast=True, backtest=True |
| 200-work stratified sample | 200 | failRate=0.765 |
| full cohort sanity | 3054 | P0=53, P1=3350 |

## Acceptance Checklist

| Criterion | Value |
|---|---|
| deepDiveComplete | True |
| sample200FailRate | 0.765 |
| sample200FailRatePass | False |
| sample200WarningRate | 0.18 |
| sample200WarningRatePass | True |
| p0AlgorithmIssueCount | 53 |
| p0Pass | False |
| p1AlgorithmIssueCount | 3350 |
| p1Pass | False |
| legacyFixedMultiplierConfirmed | True |
| newFixedMultiplierDetected | False |
| newFixedMultiplierPass | True |
| highConfidenceMedianOptimisticPessimisticRatio | 1.3661 |
| highConfidenceSpreadPass | True |
| fullP75OptimisticPessimisticRatioExcludingLowConfidenceSpikeInsufficientHistory | 1.8 |
| fullP75SpreadPass | True |
| highValueP0Count | 0 |
| downlistSuspendLogicViolationCount | 0 |
| promoteLogicViolationCount | 0 |
| renewalReviewSupported | True |
| abnormalSpikeAutoPassCount | 0 |
| forecastTotalErrorBetterThanTrailingBaseline | True |
| ratingExplanationConsistent | False |
| suggestionTriggerConsistent | True |
| sanitizedReportSafe | True |
| candidateBPassesPrdAlgorithmUsability | False |

## Backtest By Horizon

| Horizon | Cases | WAPE | MAPE | MAE | Interval coverage | Better/equal share | Total abs error <= baseline |
|---|---|---|---|---|---|---|---|
| 3 | 3054 | 0.4413 | 8.027 | 572.503 | 0.3563 | 0.6916 | True |
| 6 | 3054 | 0.4405 | 6.7176 | 1282.2902 | 0.3612 | 0.7256 | True |
| 12 | 3054 | 0.7588 | 13.7965 | 4561.2691 | 0.3062 | 0.6929 | True |

## Rating Reliability

| Rating | Count |
|---|---|
| S+ | 7 |
| S | 54 |
| A | 136 |
| B | 647 |
| C | 704 |
| D | 395 |
| E | 1111 |

## Suggestion Actionability

| Suggestion | Count | Supported | Unsupported | Manual confirmation |
|---|---|---|---|---|
| downlist_or_suspend | 744 | 744 | 0 | 744 |
| maintain | 686 | 686 | 0 | 0 |
| manual_review_required | 85 | 85 | 0 | 85 |
| observe_only | 460 | 47 | 413 | 0 |
| pricing_or_channel_adjustment | 402 | 402 | 0 | 402 |
| promote | 557 | 557 | 0 | 46 |
| reduce_investment | 252 | 252 | 0 | 0 |
| renewal_review | 209 | 209 | 0 | 209 |
| repackage | 468 | 468 | 0 | 468 |

Candidate-b v0.3 remains a local real-data development candidate, not a final release-approved or M3-ready result unless the verdict is separately accepted.
