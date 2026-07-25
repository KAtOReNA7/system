# M2 严格 as-of 分成信号就绪度 v0.1

## 结论

D1 公共事实层已经实现，但现有冻结人口和逐月诊断人口都没有符合新合同的历史
`availabilitySnapshot`。因此只能把这些 work-origin-segment 单元标记为
`unknown_at_origin`，不能把现有当前状态、账单月份或事后整理结果回填成历史可用
信号。

这意味着下一步仍然是补齐可审计的数据可用性证据，而不是开发新的模型家族。

## D0 对账

本机受控权威材料将 -230.38 元追溯到一笔底层负向现金事实。该事实写入冻结人口
5 个、25-origin 逐月人口 20 个重叠 case；原先其中分别有 1 个、6 个 case 因
cash type 不明而计入 uncertainty。这些都是同一底层事实跨多个 origin/horizon
的重复出现，不是 25 笔独立现金。

2026-07-25 用户依据财务系统记录确认：

- 该精确现金事实属于**分成收入**；
- 负数事件为**冲销**；
- 财务凭证不对外提供，原始记录不进入 Git；
- 全部负数均按冲销事件解释。

确认以底层作品、渠道、月份和金额的 canonical SHA-256 绑定，仅解除该唯一现金
事实的 target-classification uncertainty。全局“负数均为冲销”只确定
`eventType=reversal`，不得据此推断其他负数属于分成、买断或其他现金类别。

正式重放后，冻结与逐月人口的分类不确定现金占比、case 数和金额均为 0，严格
零容忍 target-classification 门禁通过。确认没有改变 824/7,851 人口、任何预测值
或 WAPE/bias，也不授权新模型、holdout、数据库、provider 或 release。

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

因此，扩大检索范围当时没有发现能自动解除 D0 的既有权威，也没有产生可用于
D1 的历史 as-of snapshot。该历史审计结论继续保留；其后收到的用户业务确认由
`config/m2-current-user-confirmation.v0.1.json` 独立记录，并通过摘要精确绑定。
该配置不含作品、渠道或原始财务记录，不把受控库存变成其他电脑的启动依赖。

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

用户进一步确认：B1 分成结算明细、B2 冲销/调账明细、B3 作品渠道历史均存在且
保留历史，但目前均不导出；B4 分成合同状态历史不存在。当前 authority 观察到
B1 最早月份为 2017-06、B2 最早负数月份为 2019-11，B3 各作品第一条明细月份
范围为 2017-06 至 2026-04。这些是当前记录内容的观察范围，不是系统首次可查询
时间，也不满足 `availableAt` 与版本化完整性合同，所以合规 snapshot 覆盖仍为 0。

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
