# M2 出版行业渠道起点可见现金锚开发重放评价 v0.1

状态：开发不支持（`PSC02_DEVELOPMENT_NOT_SUPPORTED`）。这是一项私有源权威阻断，**不是模型性能失败**
（`PRIVATE_SOURCE_AUTHORITY_BLOCKER_NOT_MODEL_FAILURE`）。

## 结论

唯一受控开发重放（`DEVELOPMENT_REPLAY`）在任何真实 PSC02 预测、outer outcome、
候选 WAPE/FVA 或 bootstrap 形成前失败关闭。当前人工分成账本缺少不可事后推造的
`componentId`、`revisionId`、`effectiveAt`、`availableAt`，且人工拆分账本守恒复核状态为
`FAILED_CLOSED`。因此不能把账单月或当前
缓存补写成合法历史 revision，也不能只在可锚定子集上评分。

冻结 PSC01 原始候选（`M2-CHAN-PSC01-RAW`）的 receipt、manifest 与
3318819 行月度人口元数据存在；冻结 LG01 比较器也存在。
它们只证明比较器入口可用，不能弥补现金锚源权威缺口。

## 三个实验臂

| 所属实验与对象 | 角色 | 本次状态 | 结果 |
|---|---|---|---|
| 现金锚单独诊断（`M2-EXP-PUBLISHING-SCALE-CHANNEL-CASH-ANCHOR-02/D0`） | 机制归因诊断 | `NOT_EXECUTED_PRIVATE_SOURCE_AUTHORITY_BLOCKED` | 未执行、无指标 |
| 锚定对数比率岭回归诊断（`M2-EXP-PUBLISHING-SCALE-CHANNEL-CASH-ANCHOR-02/D1`） | 机制归因诊断 | `NOT_EXECUTED_PRIVATE_SOURCE_AUTHORITY_BLOCKED` | 未执行、无指标 |
| 锚定准 Gamma offset 主设计（`M2-EXP-PUBLISHING-SCALE-CHANNEL-CASH-ANCHOR-02/P`；`M2-CHAN-PSC02-RAW`） | 唯一 raw candidate | `NOT_EXECUTED_PRIVATE_SOURCE_AUTHORITY_BLOCKED` | 未形成预测、评价或 bootstrap |

## 执行与边界

- pre-execution exact HEAD：`21218d7b2132d2ca755b33511c308b4b3066b781`；Linux/Windows：
  `SUCCESS` / `SUCCESS`；
- 完整主设计原始结果：未形成；冻结候选结果：不存在；
- occurrence 逐位一致性和 exact-case coverage：因没有 PSC02 prediction，未执行；
- 真实 outcome、LG01 成绩、候选 WAPE/FVA、五平台、机制、fallback、top cash works、
  统一总额渠道构成和 bootstrap：均未打开或计算；
- `activeCandidate=null`、`approvedForAutomation=null`、`productionReady=false`、
  `finalHoldoutOpened=false`。

公共 synthetic 只验证实现合同，不是 private 模型证据。后续若取得真实、可审计、带
component/revision/effectiveAt/availableAt 的权威输入，仍需独立授权与新的 exact-head
双平台 CI；本报告不授权重试、独立评价、later-origin、final holdout、production、
automation、release、数据库、API、provider 或财务使用。
