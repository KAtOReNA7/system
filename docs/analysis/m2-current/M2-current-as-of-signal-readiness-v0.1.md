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

已对与正式执行 manifest 摘要完全一致的原始工作簿做只读核验，并定位到对应
source row。该源表只有 7 列；与现金判断有关的公开可披露字段只有期间、业务授权
分类和金额，没有独立的退款、冲销、结算调整类型或调整说明列，且该行没有公式。
业务授权分类描述内容/合同形态，不能替代 cash-event authority。因此原表本身仍
不足以解除 `UNKNOWN_ABSTAIN`。

底层作品、渠道和账单标识只保留在 Git ignored private capability 中，没有写入
本公开文档。

随后又完成了全 Git 历史和本机受控库存的扩展只读盘点：

- Git 历史中 60 个名称可能相关的 artifact 里，唯一同时具备 work、cash 和
  availability 语义的是当前 synthetic fixture；非 synthetic 权威源为 0；
- 本机受控库存中命中目标作品的 804 个结构化对象，仅重复作品、业务形态、
  授权分类、版权或派生实际值，没有 cash event、退款、冲销、结算调整、
  economic/posting/available-at 或来源版本权威字段；
- 11 类候选工作簿中有 9 类命中目标作品，但命中行属于作品映射、授权分类、
  运营确认或版权状态，不是现金事件台账。

因此，扩大检索范围没有发现能解除 D0 的既有权威；它也没有产生可用于 D1 的
历史 as-of snapshot。该盘点只形成 aggregate-only 公开摘要，不把受控库存变成
其他电脑的启动依赖。机器可读结论见
`M2-current-authority-source-audit-v0.1.json`。

## D1 公共合同

canonical core 新增：

- `src/domain/m2Current/revenueShareFact.js`
- `src/domain/m2Current/availabilitySnapshot.js`
- `src/domain/m2Current/signalGapLedger.js`
- `src/domain/m2Current/signalInputBundle.js`

`revenueShareFact` 强制区分 `sale`、`refund`、`reversal`，并记录
`economicTime`、`postingTime`、`availableAt`。每个事实必须保留 exact-work、
渠道、币种、来源数据集、来源版本、来源记录摘要和 transform lineage。

`availabilitySnapshot` 只有在完整历史快照自身及其中事实都在 origin cutoff 前
可得时，才允许生成 `observed_as_of`。历史快照不存在时必须生成
`unknown_at_origin`；`currentStateBackfillUsed=true` 会被合同直接拒绝。

portable intake 允许 synthetic fixture 或 capability-scoped private bundle，
但只输出聚合诊断。它通过 SHA-256、行数和 canonical case-population
fingerprint 绑定输入，拒绝人口移动、引用缺失、历史不完整、当前状态回填和
币种混用。该入口不连接数据库，不调用 provider，也不打开 final holdout。

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

下一输入必须是 cutoff 时真实可得、可审计、可版本化的 exact-work 历史快照。
优先顺序为：

1. 分成账单事实的 economic、posting、available-at 时间；
2. 版本化的渠道状态与合同可售状态；
3. 每个历史 origin 对应的完整性证明和来源摘要。

没有历史 snapshot 时不得用当前状态回填。覆盖率量化完成但仍为零，因此
`newCandidateFamilyDevelopment=false` 继续有效。只有合规快照覆盖和缺失机制可
审计后，才能申请最小动态 two-part 候选；final holdout、Canary 和 release
仍未授权。

公开门禁现已区分两类权限：

- `developmentReplayAuthorized=true` 只允许精确重放已经完成的冻结
  development evidence；
- `newCandidateFamilyDevelopmentAuthorized=false`、`candidateSelectionAuthorized=false`
  和 `modelTrainingAuthorized=false` 禁止把历史重放权限解释成继续训练或选模。
