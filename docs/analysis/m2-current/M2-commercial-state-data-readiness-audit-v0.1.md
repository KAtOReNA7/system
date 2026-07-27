# M2 commercial-state data readiness audit v0.1

日期：2026-07-26
状态：`ANALYSIS ONLY — NO MODEL DEVELOPMENT`

## Decision

`NEEDS_DATA_MATERIALIZATION_FIRST`

当前仓库不具备训练 `M2-commercial-state-model-v0.1` 的历史数据基础。

这不是因为完全没有业务字段。相反，当前权利主表对 3,053 部作品的
`版权开始`、`版权到期`、`作品状态` 和 `音频版权状态` 覆盖均为 100%；
渠道主表也完成了 133 个原始组合到 74 个 canonical 渠道的映射。

阻断点是：这些都是 current snapshot，历史 `effectiveAt`、`availableAt`、
source version、source record 和 relation lineage 覆盖为 0。若现在把 current
字段回填到历史 origin，primary 12,039 行和 strict inventory 97,490 行将全部
暴露于时间泄漏。

因此：

- 不是 `READY_FOR_MODEL_DEVELOPMENT`；
- 也不是永久 `NOT_FEASIBLE`；
- 必须先物化版本化的 commercial relation/event history。

## 1. 先澄清：现有 availabilitySnapshot 不是商业可售快照

`src/domain/m2Current/availabilitySnapshot.js` 已实现
`m2.current.availability_snapshot.v0.1`，但它的语义是：

> 在历史 origin 时，分成现金事实是否完整可得，以及 occurrence/positive amount
> 是否可计算。

它不包含渠道上架、下架、恢复、合同生效、权利到期或 saleable period。

| 检查项 | schema 是否有 | 真实合规数据是否有 | 结论 |
|---|---:|---:|---|
| snapshot `availableAt` | 是，在 `authority` | 0 | 合同存在，数据未物化 |
| snapshot `version` | 是，在 `authority` | 0 | 合同存在，数据未物化 |
| snapshot source `recordId`/hash | 是 | 0 | 合同存在，数据未物化 |
| commercial `effectiveAt` | 否 | 0 | 现金 fact 只有 `economicTime`，不能替代 relation effective time |
| snapshot lineage | snapshot 本身无；引用 fact 有 transform lineage | 0 | 没有真实 conforming fact/snapshot |
| complete-as-of authority | schema 强制要求 | 0 | 缺失时只能 `unknown_at_origin` |

`revenueShareFact` 合同进一步要求：

- `economicTime`；
- `postingTime`；
- `availableAt`；
- source system/dataset/version/recordId/hash；
- transform lineage。

但当前 192,370 行正式现金 extract 只有 `billMonth`、`sourceRowNumber` 和事后
`rowHash`；上述三时间、source version、source record 和 lineage 的实际覆盖均为
0。`billMonth` 不能同时证明经济发生、入账和系统可查询时间。

现有真实合规快照覆盖：

| 人口 | work-origin-segment | observed snapshot | unknown | 覆盖率 |
|---|---:|---:|---:|---:|
| 旧冻结人口 | 2,402 | 0 | 2,402 | 0% |
| 25-origin dense 人口 | 20,600 | 0 | 20,600 | 0% |

仓库中的 3-work/2-origin synthetic bundle 证明合同和 portable intake 能运行，
不构成真实数据覆盖。

## 2. A：哪些字段真实存在

### 2.1 作品 current master

已对 capability-scoped private artifact 做聚合只读检查，未输出作品或来源标识。
该 artifact 状态为 `verified_complete`，唯一 snapshot 的 `asOfDate` 为
2026-07-13。

| 字段 | 非空作品 | 覆盖 | 值类型/分布 |
|---|---:|---:|---|
| 版权开始 | 3,053 | 100% | 3,053 个 exact date |
| 版权到期 | 3,053 | 100% | exact 2,503；perpetual 473；relative 59；expired unknown 16；year-only 2 |
| 作品状态 | 3,053 | 100% | 已上架 2,298；已下架 755 |
| 音频版权状态 | 3,053 | 100% | 有效 2,250；无限期 473；已到期 330 |
| 字段来源说明 | 3,053 | 100% | current 字段来源，不是历史 source record |
| release/launch/first available | 0 | 0% | current M2 formal input 中无此字段 |

仓库内另有 M1 `firstPublicationDate` 候选和历史 backfill 审计，但该字段没有进入
verified M2 3,053-work formal input，也没有 record-level `availableAt`。出版日期、
有声上线日期和首次可售日期并非同一语义，因此这些候选不计入 verified launch
覆盖。

artifact 顶层有生成时间、as-of date 和 5 个 source manifest digest，但逐记录没有：

- `effectiveAt`；
- `availableAt`；
- `sourceVersion`；
- `sourceRecordId`/`recordId`；
- relation lineage。

所以 3,053/3,053 的 current completeness 不能转化为历史 origin completeness。

### 2.2 现金事实

真实 extract：

- 192,370 行；
- 3,052 部有账单观察；
- 190,663 行分成、1,707 行买断；
- 108 个连续 bill month，2017-06 至 2026-05；
- 最新完整月为 2026-04，共 107 个完整月。

这些字段真实存在：作品、渠道、金额、cash category、bill month、source row number、
row hash。它们适合现金守恒和事后月序列，不是 commercial-state relation ledger。

### 2.3 渠道 master 与现金历史

| 数据 | 当前覆盖 |
|---|---:|
| 人工确认 raw channel pair | 133/133 |
| canonical channel | 74 |
| 分成账单实际使用 canonical channel | 39 |
| 分成事实映射 | 190,663/190,663 |
| master `effectiveMonth` | 0/133 |
| 历史渠道状态 snapshot | 0 |

25-origin private cash history 有：

- 20,600 个 work-origin row；
- 38,440 个嵌套 work-origin-channel row；
- 758 部有渠道现金历史；
- 22 个 canonical 渠道进入该旧 dense 窗口；
- 每个嵌套 row 都有 current `channelRole`、`revenueMode`、
  `historyFirstMonth` 和 `historySeries`。

但其中没有一个显式 channel entry、exit、restore、reactivation、rights start、
rights expiry、saleable on/off、`effectiveAt` 或 `availableAt` 字段。
`historyFirstMonth` 是第一笔现金，不是渠道关系生效事件。

## 3. B：哪些字段只有 current snapshot

只有 current snapshot、不能回填历史 origin 的字段：

1. 作品级 `版权开始`、`版权到期`；
2. `作品状态`、`音频版权状态`；
3. current 字段来源说明；
4. canonical channel 的 role、revenue mode、content form；
5. current 渠道 mapping；
6. 当前 artifact 的 `asOfDate=2026-07-13` 和顶层 source manifest digest。

特别注意：

- `版权开始` 日期可以描述业务有效期的候选起点，但不能证明该值何时进入系统；
- `版权到期` 可能已被续约、纠错或替换，没有历史版本就不能重建旧 origin；
- work-level rights 不能证明某一渠道在某月真实可售；
- current channel role 没有 effective month，既有开发报告已明确标记为 post-hoc
  static attribute。

## 4. C：哪些字段可以 as-of origin 使用

对 commercial state 而言，当前答案是：**没有真实字段可以作为合规 as-of
commercial-state feature 或 label 使用。**

| 候选 | as-of 可用？ | 原因 |
|---|---:|---|
| current 作品状态 | 否 | 唯一 snapshot 晚于全部历史 development origin |
| current 音频版权状态 | 否 | 无历史版本和 availableAt |
| current 版权起止 | 否 | 有业务日期，无记录可用时间和变更历史 |
| current channel role/mode | 否 | 133/133 缺 effective month |
| first cash month | 否，不能作为商业事件 | 是结算代理，不是 launch/entry |
| last/zero cash month | 否，不能作为 exit/dead | 可能是结算滞后、季节性或无收入 |
| bill-month cash history | 只可作既有现金历史代理 | postingTime/availableAt 未证明，不能升级为 relation authority |
| conforming availability snapshot | 理论上可以 | 真实 observed snapshot 数为 0 |

已有来源盘点还记录：

- 分成结算、冲销/调账和作品渠道历史被确认存在，但没有导出为带版本和
  available-at 的历史 authority；
- 分成合同状态历史不存在。

这使 retrospective materialization 取决于源系统是否另有审计日志；不能从 current
值或完整现金缓存反推。

## 5. D：覆盖率

### 5.1 Work

| 指标 | 数量 | 覆盖 |
|---|---:|---:|
| 权威作品 | 3,053 | 100% denominator |
| 有任意账单观察 | 3,052 | 99.97% |
| 有 2021—2025 分成事实 | 2,682 | 87.85% |
| current rights/status 完整 | 3,053 | 100% current-only |
| verified release/launch | 0 | 0% |
| historical commercial state as-of | 0 | 0% |

### 5.2 Channel

| 指标 | 数量 | 覆盖 |
|---|---:|---:|
| canonical master | 74 | 100% identity master |
| 分成实际使用 | 39 | — |
| 分成事实映射 | 190,663/190,663 | 100% |
| raw pair effective month | 0/133 | 0% |
| master channel historical status | 0/74 | 0% |
| used channel historical status | 0/39 | 0% |
| explicit work-channel relation event | 0 | 0% |

### 5.3 Work-origin-case

以下人口是独立审计视图，不能相加：

| 人口 | case | work-origin(-segment) | commercial valid | unknown |
|---|---:|---:|---:|---:|
| 旧冻结 signal audit | 7,851 | 2,402 | 0 | 7,851 |
| 25-origin dense signal audit | 56,856 | 20,600 | 0 | 56,856 |
| commercial primary comparator | 12,039 | 1,125 works / 13 origins | 0 | 12,039 |
| strict candidate inventory | 97,490 | 2,650 works / 16 origins | 0 | 97,490 |
| strict evaluated comparator | 74,320 | 2,650 works / 11 outer origins | 0 | 74,320 |

### 5.4 Month

| 月份口径 | 已有月份 | commercial-state as-of 覆盖 |
|---|---:|---:|
| 全部现金 bill month | 108 | 0 |
| 完整现金 bill month | 107 | 0 |
| primary origin month | 13 | 0 |
| 旧 dense origin month | 25 | 0 |
| strict evaluation outer origin | 11 | 0 |
| current master snapshot date | 1 | 仅 2026-07-13，不是历史序列 |

## 6. E：如果现在开发 commercial-state-model

### 6.1 Training rows

| 口径 | 候选 rows | valid training rows | unknown rows |
|---|---:|---:|---:|
| primary | 12,039 | 0 | 12,039 |
| strict inventory | 97,490 | 0 | 97,490 |

原因不只是缺 feature。状态训练 target 同样需要 origin 后的版本化商业 snapshot；
当前既没有历史 feature snapshot，也没有可审核的 future state label。

### 6.2 Leakage risk

若把 2026-07-13 current master 回填：

- primary：12,039/12,039 行暴露，100%；
- strict inventory：97,490/97,490 行暴露，100%；
- channel master：133/133 raw pair 缺 effective month；
- dense channel history：38,440/38,440 嵌套 row 的 role/mode as-of 未证明；
- formal cash extract：192,370/192,370 行没有 postingTime/availableAt。

风险类型：

1. current status 回填旧 origin 的直接时间泄漏；
2. 续约或状态修订后的值覆盖历史值；
3. first/last cash 被误当 entry/exit；
4. 没有 snapshot 被误写成 dead，而不是 `unknown_at_origin`；
5. work-level rights 被错误扩展为 channel-level saleability。

结论：现在强行训练得到的不是低覆盖 commercial-state 模型，而是一个
100% current-backfilled 的 post-hoc 模型。

## 7. 进入数据物化前最少需要什么

需要一份 exact-work × channel/contract/right relation 的历史 ledger 或 complete
snapshot：

- event：entry、exit、restore/reactivation、saleable_on、saleable_off、
  rights_start、rights_expiry；
- `effectiveAt`；
- `availableAt`；
- source system/dataset/version/recordId/hash；
- transform lineage；
- 每个 origin 的 `complete_as_of_snapshot`；
- verified release/launch/first available date 及其 record-level authority；
- 缺失历史时显式 `unknown_at_origin`。

如果源系统有历史审计日志，可以做 retrospective materialization；如果没有，只能从
现在开始 prospective snapshot，等待相应预测标签成熟。不能用 current 状态、现金
首末月或人工补零制造历史。

## 8. 最终判断

`NEEDS_DATA_MATERIALIZATION_FIRST`

支持继续的数据基础：

- 3,053 部 current 权利/状态主表；
- 74 个 canonical 渠道和 100% 分成映射；
- 2017-06 起连续现金历史；
- 已实现的 strict authority envelope、unknown 语义和 portable intake。

尚未具备的决定性基础：

- historical commercial relation events；
- record-level effective/available time；
- historical source versions 与 lineage；
- verified release/launch date；
- channel-level saleable/rights window；
- 可用于训练状态 target 的 future commercial snapshots。

本轮没有修改 production 代码，没有训练模型，也没有改变任何现金序列阈值。
