# M2 v2 完整性修复收口摘要 v0.1

状态：`completed_pending_external_review`

分类：`public_sanitized`、`not_for_formal_decision`

日期：2026-07-18

## 结论

本轮授权的 verifier 只读/幂等修复、receipt/cache/state/counter 原子绑定、B8 合同缺口修复、private derived state 离线恢复及全量验证已经完成。最终的 100% 全项目复审与 PR 描述 UTF-8 roundtrip 证据保存在 Git ignored private 审计角色中；公开文档不复制 private 内容。PR #7 必须继续保持 Draft/open/unmerged，等待用户交付外部审查。

V2-B.8 原始 Canary v3.1 报告及其 `CANARY_CONDITIONAL` 结论原样保留。按修复后合同从既有 immutable manifests、append-only receipts 与冻结 Source Records 离线重算得到的当前 restatement 结论为 `CANARY_FAIL`。这不是一次新 Canary，也没有新增 provider 请求；`full160Authorized=false`，`nextDevelopmentReadiness=NOT_AUTHORIZED`。

## 已完成修复

- B5/B6/B7/B8 verifier 已改为只读、幂等并隔离跨阶段状态；真实 private state 上的连续两轮验证保持 governed hash 不变。
- immutable receipt payload 与 cache-hit runtime view 已分离，并为 state、cache、receipt 与 request counter 建立原子绑定和 fail-closed 校验。
- 受污染的 derived state 已先保全，再仅使用既有权威 immutable/append-only 材料离线恢复；原始 receipts 与历史报告未被静默改写。
- B8 的零分母、positive evidence source classification、source-category diversity、eventTime lineage 与 conflict-family 合同缺口已按 fail-closed 语义修复。
- 默认测试、real-data/secret guard、lint、build、smoke、e2e、synthetic verifier contract 与 Windows CI 合同已纳入验证范围。本摘要只陈述本轮本地全量验证已完成，不预判远端 CI 的实时状态。

## 决策分层

| 层级 | 结论 | 用途 |
|---|---|---|
| V2-B.8 原始历史合同 | `CANARY_CONDITIONAL` | 保留历史 checkpoint，不作为当前合同结论 |
| 完整性修复后 restatement | `CANARY_FAIL` | 当前合同解释；不授权扩量或下一阶段 |
| full160 | `full160Authorized=false` | 禁止执行 |
| 下一开发阶段 | `nextDevelopmentReadiness=NOT_AUTHORIZED` | 停止并等待外部审查 |

## 收口证据边界

版本化 public restatement 与本摘要给出脱敏结论；100% tracked-file 覆盖、private state 恢复、双轮 verifier hash、完整验证 receipt、最终 private audit v0.2 与 PR body roundtrip 细节仅保存在 Git ignored 审计角色中。公开摘要不声称未知的 P2/P3 数量，也不把远端 CI 的动态状态写成静态事实。

本轮边界为：`providerRequestDelta=0`；未执行 Canary、full160 或模型训练；未修改 B4 或 formal-cash；未打开 holdout；未进入 V2-C、V2-D、C4 或 M3；未 release；未 merge PR。

## 停止条件

完整性修复收口后不自动进入任何后续开发。下一步仅是由用户安排对 Draft/open PR #7 的外部审查；任何新的开发、provider 调用、Canary、full160、模型训练或 merge 都需要新的明确授权。
