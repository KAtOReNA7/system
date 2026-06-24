# M1 Ledger Backfill Work-Centric Match Audit v1

本报告以 M2 当前标准作品集合为中心，不输出真实作品明细。

- M2 标准作品数：`3054`

## 作品中心匹配覆盖
| 匹配类型 | 作品数 |
|---|---|
| exact ID matched | 1233 |
| mapping ID matched | 1 |
| title_author_exact matched | 170 |
| title_author_fuzzy matched | 40 |
| no ledger match | 1814 |
| conflict | 192 |

## 收入贡献覆盖
| 指标 | 占比 |
|---|---|
| matchedRevenueShare | 66.1% |
| unmatchedRevenueShare | 33.9% |
| highConfidenceBackfillableRevenueShare | 63.7% |
| conflictRevenueShare | 12.1% |

## Top 收入作品覆盖
| 收入层 | 作品数 | matched | unmatched | strict auto works | conflict |
|---|---|---|---|---|---|
| top 1% | 30 | 21 | 9 | 20 | 4 |
| top 5% | 152 | 107 | 45 | 104 | 33 |
| top 10% | 305 | 184 | 121 | 181 | 55 |
| middle | 1222 | 580 | 642 | 575 | 97 |
| low | 1527 | 476 | 1051 | 469 | 40 |

结论：ledger-row unmatched 主要反映台账覆盖范围大于当前 M2 作品集合，不能直接等价为 M2 作品未覆盖；M2 判断必须使用作品中心口径。