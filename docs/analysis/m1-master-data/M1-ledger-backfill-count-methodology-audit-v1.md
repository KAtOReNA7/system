# M1 Ledger Backfill Count Methodology Audit v1

本报告只包含统计口径说明，不包含真实作品名、作者名、渠道名或台账原文。

| 口径 | 数量 |
|---|---|
| standard_work_id 数 | 3054 |
| raw work id 数 | 3575 |
| business form 行数 | 3528 |
| basic info gap view 行数 | 3099 |
| matched ledger rows | 1558 |
| candidate rows | 12945 |
| field candidate rows | 12945 |
| candidate standard works | 1240 |

## 口径修正结论
- 权威评估对象口径为 `standard_work_id`。
- `candidate row` / `field candidate` 是字段候选口径，同一作品可有多个字段候选。
- 上一轮缺口数可超过 3054，是因为 basic info gap view 与字段候选不是唯一标准作品口径。
- 后续补全效果必须同时给出 standard_work_id、candidate row 和 field candidate 三种口径。
- 禁止继续用混合口径判断补全效果。