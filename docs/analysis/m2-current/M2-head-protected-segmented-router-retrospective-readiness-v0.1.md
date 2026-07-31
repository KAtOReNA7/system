# M2 HPSR01 回溯评价与条件式独立 K2 就绪审计 v0.1

## 结论

- 回溯开发复现就绪（`retrospectiveReplayReady=true`）：是。
- 独立 K2 就绪（`independentK2Ready=false`）：否。
- 唯一合法回溯起点为 `2025-11`；它的 actual 在本任务前已经打开，三个月账单窗口已权威完整，且不属于历史隔离 outcome。
- 独立后续起点由 ledger 动态解析为 `2026-03`，需要 `2026-04`、`2026-05`、`2026-06` 三个月完整账单；当前只连续完整至 `2026-04`。
- prospective final holdout 动态解析为 `2026-06`，仍未打开。

本审计只读取月份、行数、空值、schema、opened 语义与账单完整性元数据；没有读取尚未打开的 future actual 金额，没有运行模型、评价或 bootstrap。

## 权威能力

| 角色 | 状态 | 是否阻断 |
| --- | --- | --- |
| 不可重建私有源权威（`PRIVATE_SOURCE_AUTHORITY`） | 可用 | 否 |
| 可重建派生缓存（`PRIVATE_DERIVED_CACHE`） | 就绪 | 否；即使缺失也必须自动重建 |
| 历史运行溯源（`PRIVATE_RUN_PROVENANCE`） | 可选溯源缺失 | 否 |
| residual bound provenance | 仅来自此前已打开 development 行，仍有效 | 否 |

## 动态回溯 origin 清单

| origin | 决定 | 原因 |
| --- | --- | --- |
| `2025-10` | 排除 | 本任务前没有 actual 已打开证据 |
| `2025-11` | 纳入 | 满足全部七项回溯人口门禁 |
| `2025-12` | 排除 | 历史 final holdout / 隔离 outcome |
| `2026-01` | 排除 | 本任务前没有 actual 已打开证据 |
| `2026-02` | 排除 | 三个月 future bill window 尚不完整 |

候选月份来自 residual-bound derivation through 与 first independent later-origin 之间的动态枚举，不在实现中写死。

## 结果读取前冻结的评价合同

- 只评价三个月 horizon、动态 Core80 成熟老品既有成熟业务范围。
- R0 为冻结 LG01；D1 为冻结公式 CHAM01 B3 原始诊断；R1 为唯一 HPSR01 raw candidate。
- CHAM01 B3 只允许冻结公式的 origin-faithful refit，固定 `huberDelta=1`、`l2=10`；不执行网格搜索。
- H50 逐行严格等于 LG01；M30/L20 的 alpha 固定为 1；不重估 residual bounds。
- paired work-cluster bootstrap 固定 2,000 次。
- 单一时间块可产生真实回溯结果，但证据不足以判为 supported；它仍可在明确退化时判为 unsupported。
- 回溯结果不属于独立证据，不建立 active candidate，不批准自动化、production 或 release。

## K2

当前用户指令已经给予 capability-scoped 条件式独立 K2 授权，但账单成熟条件尚未成立，因此该授权当前不可使用。回溯结果形成后不得把它冒充 K2，也不得打开 `2026-06` prospective final holdout。
