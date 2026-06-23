# M2 candidate-b algorithm PRD usability final report v0.2

Candidate: `m2-realdata-dev-candidate-b-forecast-calibrated-v0.2`

Legacy candidate: `m2-realdata-dev-candidate-b-v0.1`

Baseline: `m2-c3-cleaned-bill-nonformal-v0.2/candidate-a`

## Conclusion

- PRD-level algorithm validation completed: `true`
- Legacy candidate-b pass conclusion reversed: `True`
- Forecast scenario calibration completed: `True`
- Verdict: `FAIL`
- Candidate-b passes M2 algorithm usability validation: `False`
- Algorithm change required: `True`
- Can enter business review: `False`
- Requires continued forecast algorithm work: `True`
- Still do not enter M3: `True`
- Still not final release approved: `True`

## Validation Layers

| Layer | Count | Key result |
|---|---:|---|
| 20-work deep dive | 20 | forecast=True, backtest=True |
| 200-work stratified sample | 200 | failRate=0.725 |
| full cohort sanity | 3054 | P0=61, P1=3265 |

## Acceptance Checklist

| Criterion | Value |
|---|---|
| deepDiveComplete | True |
| sample200FailRate | 0.725 |
| sample200FailRatePass | False |
| sample200WarningRate | 0.215 |
| sample200WarningRatePass | True |
| p0AlgorithmIssueCount | 61 |
| p0Pass | False |
| p1AlgorithmIssueCount | 3265 |
| p1Pass | False |
| legacyFixedMultiplierConfirmed | True |
| newFixedMultiplierDetected | False |
| newFixedMultiplierPass | True |
| highConfidenceMedianOptimisticPessimisticRatio | 1.461 |
| highConfidenceSpreadPass | True |
| fullP75OptimisticPessimisticRatioExcludingLowConfidenceSpikeInsufficientHistory | 2.0 |
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

## Main Residual Risks

- Forecast confidence is lower for fallback copyright cases and high-error backtest segments.
- High-rating or action-bearing suggestions remain subject to business review and release gates.
- Candidate-b remains an authorized local real-data development candidate, not a final production release approval.

## Outputs

Sanitized reports and private pack paths are listed in the JSON report. Private packs are under `data/private-output/` and must not be committed.
