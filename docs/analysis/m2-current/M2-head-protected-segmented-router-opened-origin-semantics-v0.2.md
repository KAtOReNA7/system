# M2 HPSR01 opened-origin 语义修订 v0.2

## 结论

LG01 头部保护分段路由模型 v0.1（LG01 Head-Protected Segmented Router
Model v0.1，`M2-WORK-HPSR01`）现在明确区分五个边界：

| 边界 | 当前值 | 含义 |
|---|---|---|
| 最大已检查可用性的预测起点 | `2026-02` | 只证明检查过 origin/date/schema/nullness |
| 最大已打开 actual 值的预测起点 | `2026-02` | 历史冻结评价已读取过该 origin 的标签或金额 |
| 可用性检查到的月份 | `2026-05` | 只检查过 billMonth；不等于账单完整 |
| 历史 actual 值打开到的月份 | `2026-05` | 历史冻结 feature/评价工件与完成收据共同证明 |
| 权威账单完整闭合到的月份 | `2026-04` | `2026-05` 目前只有 3 条事实，仍不完整 |

只读取月份是否存在、字段是否为空、schema 或行数，不再被解释为打开金额。
读取金额、标签、聚合指标或模型表现才推进 actual-opened 边界。证据不充分时必须
登记为 unknown/ambiguous 并保守停止；当前没有未决歧义。

## 失败尝试

历史恢复收据证明一次前置失败发生在完整 outcome 之前，且
`partialOutcomeInspected=false`。因此：

- `failedAttemptTouchedMetadataOnly=true`；
- `failedAttemptOpenedOutcome=false`。

原始历史 receipt 没有被改写。本修订只追加语义分类。

## 对最早 later-origin 的影响

旧 K0 报告把“可用性检查到 `2026-05`”错误地同时用于 actual-opened 资格，
因而给出最早潜在起点 `2026-05`。修订后以
`maxActualValueOpenedOrigin=2026-02` 为准：

- `firstIndependentLaterOrigin=2026-03`；
- 需要完整账单 `2026-04`、`2026-05`、`2026-06`；
- 当前只完整到 `2026-04`，所以不能执行独立评价。

因此本修订改变了最早 later-origin 日期，但没有打开任何新的 future actual
金额、指标、模型表现或 final holdout。
