# M2 严格 as-of 分成信号就绪度 v0.1

## 结论

D1 公共事实层已经实现，但现有冻结人口和逐月诊断人口都没有符合新合同的历史
`availabilitySnapshot`。因此只能把这些 work-origin-segment 单元标记为
`unknown_at_origin`，不能把现有当前状态、账单月份或事后整理结果回填成历史可用
信号。

这意味着下一步仍然是补齐可审计的数据可用性证据，而不是开发新的模型家族。

## D0 对账

本机受控权威材料将 -230.38 元追溯到一笔底层负向现金事实。它在冻结人口中重叠
1 个 case，在 25-origin 逐月人口中重叠 6 个 case。

现有权威字段不能证明它属于分成退款还是买断冲销，并且缺少原始结算调整说明、
合同或其他明确 cash-type 证据。因此本轮：

- 不改变分类；
- 不放宽零容忍门禁；
- 保持 `UNKNOWN_ABSTAIN`；
- 只在获得原始结算调整或合同证据后重新对账。

底层作品、渠道和账单标识只保留在 Git ignored private capability 中，没有写入
本公开文档。

## D1 公共合同

canonical core 新增：

- `src/domain/m2Current/revenueShareFact.js`
- `src/domain/m2Current/availabilitySnapshot.js`
- `src/domain/m2Current/signalGapLedger.js`

`revenueShareFact` 强制区分 `sale`、`refund`、`reversal`，并记录
`economicTime`、`postingTime`、`availableAt`。每个事实必须保留 exact-work、
渠道、币种、来源数据集、来源版本、来源记录摘要和 transform lineage。

`availabilitySnapshot` 只有在完整历史快照自身及其中事实都在 origin cutoff 前
可得时，才允许生成 `observed_as_of`。历史快照不存在时必须生成
`unknown_at_origin`；`currentStateBackfillUsed=true` 会被合同直接拒绝。

## 信号缺口

以下覆盖率只表示“符合 D1 新合同的、版本化历史 as-of 快照覆盖”，不表示原始账单
完全不存在，也不把旧账单月份假设成可用时间。

| 人口 | 输入 case | work-origin-segment | 合规 snapshot | occurrence 覆盖 | two-part 就绪覆盖 |
|---|---:|---:|---:|---:|---:|
| 冻结权威人口 | 7,851 | 2,402 | 0 | 0 | 0 |
| 25-origin 逐月诊断 | 56,856 | 20,600 | 0 | 0 | 0 |

冻结人口缺口：

| segment | work-origin-segment | occurrence 缺失 | positive amount 缺失 |
|---|---:|---:|---:|
| dense | 1,575 | 1,575 | 1,575 |
| intermittent | 593 | 593 | 593 |
| dormant | 234 | 234 | 234 |

逐月诊断缺口：

| segment | work-origin-segment | occurrence 缺失 | positive amount 缺失 |
|---|---:|---:|---:|
| dense | 8,060 | 8,060 | 8,060 |
| intermittent | 11,406 | 11,406 | 11,406 |
| dormant | 1,134 | 1,134 | 1,134 |

聚合证据见
`docs/analysis/m2-current/M2-current-signal-gap-diagnostic-v0.1.json`。

## 下一输入与门禁

下一输入必须是 cutoff 时真实可得、可审计、可版本化的 exact-work 历史快照，
优先顺序为：

1. 分成账单事实的 economic、posting、available-at 时间；
2. 版本化的渠道状态与合同可售状态；
3. 每个历史 origin 对应的完整性证明和来源摘要。

没有历史 snapshot 时不得用当前状态回填。覆盖率量化完成但仍为零，因而
`newCandidateFamilyDevelopment=false` 继续有效。只有合规快照覆盖和缺失机制可
审计后，才能申请最小动态 two-part 候选；final holdout、Canary 和 release 仍未
授权。
