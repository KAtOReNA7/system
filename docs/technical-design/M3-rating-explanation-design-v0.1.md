# M3 rating explanation design v0.1

Generated: 2026-06-28

Status: M3-3 fixture/prototype design. This document defines explanation-only candidate rating output for synthetic M3 fixtures.

## Scope

M3 continues to use the S+/S/A/B/C/D/E scale, but every rating must be marked as `new_product_candidate_rating`. The rating is not a development recommendation and is not a resource investment level.

## Output

The rating object includes:

- `rating`
- `value`
- `ratingType = new_product_candidate_rating`
- `ratingExplanation`
- `supportFactors[]`
- `limitingFactors[]`
- `warningFactors[]`
- `comparableInfluence[]`
- `authorRankingInfluence[]`
- `heatInfluence[]`
- `adaptationInfluence[]`
- `sameNameAudioRiskInfluence[]`
- `riskFlags[]`
- `limitationNotes[]`
- `uncertaintyNotes[]`
- `manualReviewNotes[]`

## Explanation Inputs

The explanation layer uses:

- channel-level point forecast
- readiness warning and blocker status
- heat signals
- system comparable works
- operator-specified and same-author context through comparable output
- author ranking enabled or disabled state
- adaptation signals
- same-name audio risk
- buyout separation limitation

## Non-goals

The rating explanation does not output whether the work should be developed. It does not output resource investment level, formal release conclusion, formal task API, export API, or write API.

## Safety Boundary

The module uses only synthetic fixture data. It does not read private material, real work names, real author names, raw bill rows, or databases. It does not write migrations and does not enter M3 formal execution.
