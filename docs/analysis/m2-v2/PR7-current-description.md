# M2 v2 External Evidence Pilot checkpoint

## 范围

本 PR 保留 V2-A 完成后的 V2-B.1–B.8 历史 checkpoint，并收口 verifier/private-state 完整性修复。它不是 release PR，也不授权新的 evidence 扩量或模型开发。

## 当前状态与决策

- V2-A：完成。
- V2-B.1–B.8：历史 checkpoint，原报告继续保留。
- V2-B.8 Canary v3.1 原始决策：`CANARY_CONDITIONAL`。
- 完整性修复后合同的离线 restatement：`CANARY_FAIL`；这不是新 Canary。
- `full160Authorized=false`。
- `nextDevelopmentReadiness=NOT_AUTHORIZED`。
- verifier/private-state remediation、离线恢复与本轮全量验证已经完成；最终结论以版本化 remediation summary、integrity restatement 与 private audit v0.2 为准。

## 当前权威产物

- `docs/analysis/m2-v2/M2-v2-current-state-index-v0.1.md`
- `docs/analysis/m2-v2/M2-v2-integrity-remediation-summary-v0.1.md`
- `docs/analysis/m2-v2/M2-v2-canary-v3-1-integrity-restatement-v0.2.md`
- `docs/technical-design/m2-v2/M2-v2-verifier-readonly-contract-v0.1.md`
- `docs/technical-design/m2-v2/M2-v2-private-state-recovery-contract-v0.1.md`
- `docs/technical-design/m2-v2/M2-v2-request-state-atomic-binding-v0.1.md`

## 完整性修复

- B5/B6/B7/B8 verifier 已按只读、幂等合同收口，连续两次运行前后 governed private state hash 不变。
- receipt payload 与 cache-hit runtime view 已分离，state/cache/receipt/counter 原子绑定已建立。
- private derived state 已仅从既有 authoritative immutable 与 append-only 材料离线恢复，provider request delta 为 0。
- 原 V2-B.8 报告未被静默覆盖；合同修复后的指标由版本化 restatement 单独解释。

## 测试与 CI

- 默认 `npm test` 纳入历史关键回归、B4–B8、integrity synthetic 与 secret guard 测试；本轮 required local validation 已完成。
- Linux 与 Windows CI workflow 均执行 install、real-data/secret guard、lint、build、test、smoke、e2e 与 synthetic verifier contract；本文不预写远端 CI 的动态状态。
- CI 不读取真实 private state，不配置 provider；真实 private verifier proof 只保存在 Git ignored 审计角色。
- 100% 全项目复审与 PR 描述 UTF-8 roundtrip 已作为 Git ignored private 收口证据记录，不在 PR body 展开 private 明细。

## 安全边界

本 PR 未授权或执行 provider 请求、Canary、full160、模型训练、B4/formal-cash 修改、final holdout、V2-C/V2-D、C4、M3 formal 或 release。private 数据、receipts、workbook、环境文件和密钥不进入 Git。

PR 必须保持 `Draft`、`open`、`unmerged`，由用户安排外部审查。完整性修复完成不构成 full160 或下一开发阶段授权。
