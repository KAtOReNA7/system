# M1 Cleaned Ledger Minimal Work-Centric Match Audit v3

- M2 total standard works: `3054`
- Matched works: `1248`
- Unmatched works: `1806`
- Conflict works: `7`
- Matched revenue share: `66.11%`

## Match Method Distribution
| 匹配方式 | 作品数 |
| --- | --- |
| unmatched | 1806 |
| exact_work_id | 1233 |
| title_author_fuzzy | 15 |

## Top Revenue Coverage
| 范围 | workCount | matchedWorkCount | matchedWorkRate | matchedRevenueShare |
| --- | --- | --- | --- | --- |
| top1Percent | 31 | 22 | 0.709677 | 0.706746 |
| top5Percent | 153 | 108 | 0.705882 | 0.700492 |
| top10Percent | 306 | 184 | 0.601307 | 0.683957 |

## v2 Comparison
- v2 available: `True`
- v2 matched works: `1240`
- v3 only uses the seven-field cleaned ledger; old publisher/audio-rights/CIP/contract parsing is obsolete.
