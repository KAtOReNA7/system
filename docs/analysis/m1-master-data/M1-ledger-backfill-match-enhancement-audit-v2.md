# M1 Ledger Backfill Match Enhancement Audit v2

本报告为脱敏聚合报告，不包含真实作品名、作者名或台账原文。

- 原匹配作品数：`1240`
- 新增高置信匹配作品数：`0`
- v2 匹配作品数：`1240`
- v2 未匹配作品数：`1814`

## 候选分组
| 分组 | 候选行数 |
|---|---|
| high_revenue_unmatched_priority_review | 120 |
| low_confidence_manual_review | 1 |
| medium_confidence_new_match | 3 |

## Top 收入覆盖变化
| 收入层 | 作品数 | 原匹配 | v2新增高置信 | v2匹配 | 仍未匹配 |
|---|---|---|---|---|---|
| top 1% | 30 | 21 | 0 | 21 | 9 |
| top 5% | 152 | 107 | 0 | 107 | 45 |
| top 10% | 305 | 184 | 0 | 184 | 121 |
| middle | 1222 | 580 | 0 | 580 | 642 |
| low | 1527 | 476 | 0 | 476 | 1051 |

结论：v2 已审计 ID 规范化、标题/作者规范化和高收入未匹配优先复核；新增匹配仍需用户在 private 包中确认。