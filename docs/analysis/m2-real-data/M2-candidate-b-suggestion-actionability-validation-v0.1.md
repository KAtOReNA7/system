# M2 candidate-b suggestion actionability validation v0.1

Candidate: `m2-realdata-dev-candidate-b-forecast-calibrated-v0.2`

This report validates whether suggestions are explainable by forecast, lifecycle, risk, and copyright signals.

## Suggestion Distribution

| Suggestion | Count |
|---|---|
| downlist_or_suspend | 744 |
| maintain | 686 |
| manual_review_required | 85 |
| observe_only | 460 |
| pricing_or_channel_adjustment | 402 |
| promote | 557 |
| reduce_investment | 252 |
| renewal_review | 209 |
| repackage | 468 |

## Support Summary

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

## Sanity Checks

- Promote logic violations: `0`
- Downlist/suspend logic violations: `0`
- Renewal review without expiry risk: `0`
- Actionability pass: `True`

Candidate-b is not for automated business action and remains not final release approved.
