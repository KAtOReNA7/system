# M2 v2 Canary v3.1 完整性重述 v0.3

状态：`not_for_formal_decision`

当前权威结论是 **`CANARY_FAIL`**；历史 `CANARY_CONDITIONAL` 仅作为原合同检查点保留，不能继续充当当前结论。`full160Authorized=false`，`nextDevelopmentReadiness=NOT_AUTHORIZED`。

本次重述只从既有 immutable/append-only private 输入离线重算。新增 provider 请求为 0；没有重新执行 Canary/full160、没有训练模型、没有更换样本，也没有打开 holdout。

## 历史合同精确复现

| 指标 | 历史重算 |
|---|---:|
| Search | 26 / 27 |
| covered works / Source Records | 10 / 88 |
| entity resolved / unresolved | 9 / 1 |
| evidence candidate / accepted / pilotUsable / rejected | 85 / 52 / 48 / 33 |
| references mapped | 230 / 230 |
| explicit temporal | 32 / 32 |
| mean repeat source overlap | 0.3450793651 |
| same-source claim agreement | 0.6733333333 |
| fresh semantic agreement | 0.2000000000 |
| decision | `CANARY_CONDITIONAL` |

## 当前修复合同重算

| 指标 | 当前重算 |
|---|---:|
| Search | 26 / 27 |
| covered works / Source Records | 10 / 88 |
| entity resolved / unresolved | 9 / 1 |
| evidence candidate / accepted / pilotUsable / rejected | 85 / 51 / 46 / 34 |
| post-remediation references mapped | 226 / 226 |
| EventTime extraction | 10 / 21（0.4761904762） |
| EventTime lineage missing | 0 |
| conflict families | 7 applicable / 9 declared；`FAIL` |
| mean repeat source overlap | 0.3450793651 |
| same-source claim agreement | 0.6833333333 |
| fresh semantic agreement | 0.2000000000 |
| decision | `CANARY_FAIL` |

未通过的门禁是 `explicit_temporal_extraction_complete`、`conflict_family_coverage_complete`、`mean_repeat_source_overlap`、`same_source_claim_agreement` 和 `end_to_end_semantic_claim_agreement`。因此不能沿用历史 conditional 结论，更不能据此扩大执行范围。

## 停止边界

本重述不授权 full160、V2-C/V2-D、模型训练、B4/formal-cash 修改、final holdout、C4/M3、release 或 PR merge。下一步只允许针对 PR #7 新 HEAD 进行增量独立外审。
