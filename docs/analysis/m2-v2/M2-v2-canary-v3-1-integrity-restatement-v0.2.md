# M2 v2 Canary v3.1 完整性重述 v0.2

状态：`not_for_formal_decision`

结论：修正合同后的离线重算为 **`CANARY_FAIL`**；`full160Authorized=false`。

## 为什么需要重述

历史 V2-B.8 报告使用当时的 canonicalization、source classification、eventTime 与 conflict 实现。完整性审计确认这些实现存在五类缺口：零分母可能 fail-open、official 来源误提升、类别多样性未真正落实、eventTime 可借用非 claim 支持日期、conflict family 覆盖不完整。

本重述只使用原冻结 manifest、repeat、Source Bundle、append-only physical receipts、Source Records 与 evidence records 离线重算；未调用 provider、未重新执行 Canary、未更换样本。历史报告和历史 `CANARY_CONDITIONAL` 原样保留，不被静默覆盖。

## 冻结边界

- fixed 10-work manifest：`4288ad6130fe34da6f56f361604d44f1124313b3b3f4fc98b870570333d65f23`
- repeat：`e3be6282451c02d6a630aeec322951d62fc477ca9e27d0f9cc2db0fc68e471fc`
- Frozen Source Bundle：`d68896763b2a7b63afd3580c623e06cd72eaa9432b396dd3e9e62b6a50f643df`
- manifest 变化：0；样本替换：0；provider 新增请求：0

## 历史合同精确复现

| 指标 | 独立复算结果 |
|---|---:|
| Search | 26/27（96.2963%） |
| work coverage / Source Records | 10/10 / 88 |
| entity resolved / unresolved | 9 / 1 |
| evidence candidate / accepted / pilotUsable / rejected | 85 / 52 / 48 / 33 |
| pre-cap source references | 230/230 mapped |
| post-cap source references | 226/226 mapped |
| explicit temporal | 32/32 |
| mean repeat source overlap | 0.345079 |
| same-source claim agreement | 0.673333 |
| fresh semantic agreement | 0.200000 |
| decision | `CANARY_CONDITIONAL` |

这证明历史指标可以从原权威输入独立重现；合同修复后的变化不是 private state 恢复失败。

## 修正合同重算

| 指标 | restated | 相对历史 |
|---|---:|---:|
| Search / work / Source Records | 26/27；10/10；88 | 不变 |
| entity resolved / unresolved | 9 / 1 | 不变 |
| candidate | 85 | 0 |
| accepted | 51 | -1 |
| pilotUsable | 46 | -2 |
| rejected | 34 | +1 |
| post-cap source references | 226/226 mapped | 不变 |
| explicit temporal | 21/37（57.1429%） | -11 条明确时间 |
| eventTime provenance missing | 0 | 新增严格 lineage 后无缺失 |
| same-source agreement | 0.683333 | +0.010000 |
| fresh semantic agreement | 0.200000 | 不变 |

修正后未通过的 gate 为：`explicit_temporal_extraction_complete`、`mean_repeat_source_overlap`、`same_source_claim_agreement`、`end_to_end_semantic_claim_agreement`。因此 restated decision 必须为 `CANARY_FAIL`，不能沿用历史 `CANARY_CONDITIONAL` 作为当前合同结论。

## 停止边界

本重述不授权 full160、V2-C/V2-D、模型训练、B4/formal-cash 修改、final holdout、C4/M3、release 或 PR merge。下一开发状态仍为 `NOT_AUTHORIZED`。
