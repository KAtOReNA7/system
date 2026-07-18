# M2 v2 External Evidence Pilot checkpoint — PR #7

## 范围

本 PR 保留 V2-A 完成后的 V2-B.1–B.8 历史 checkpoint，并闭合独立外审识别的 13 项 P1 与 10 项直接耦合 P2。它不是 release PR，也不授权新的 evidence 扩量、Canary、full160 或模型开发。

## 当前状态与决策

- V2-A：完成。
- V2-B.1–B.8：历史 checkpoint，原报告继续保留。
- V2-B.8 Canary v3.1 原始业务结论：`CANARY_CONDITIONAL`。
- 按完整性修复合同从既有 immutable/append-only 材料离线重述后的当前结论：`CANARY_FAIL`；这不是新 Canary。
- `full160Authorized=false`。
- `nextDevelopmentReadiness=NOT_AUTHORIZED`。
- PR #7 P1 remediation：13/13 P1 与 10/10 直接耦合 P2 已实现闭合；下一步仍须新 HEAD 的增量独立外审。

## 当前权威产物

- `docs/analysis/m2-v2/M2-v2-current-state-index-v0.2.md`
- `docs/analysis/m2-v2/M2-v2-canary-v3-1-integrity-restatement-v0.3.md`
- `docs/analysis/m2-v2/M2-v2-PR7-P1-remediation-summary-v0.1.md`
- `docs/analysis/m2-v2/M2-v2-PR7-merge-readiness-v0.1.md`
- `docs/technical-design/m2-v2/M2-v2-verifier-authority-binding-v0.2.md`
- `docs/technical-design/m2-v2/M2-v2-append-only-request-ledger-v0.1.md`
- `docs/technical-design/m2-v2/M2-v2-group-atomic-private-recovery-v0.2.md`
- `docs/technical-design/m2-v2/M2-v2-workbook-independent-verification-v0.1.md`

## 修复摘要

- current authority 与 historical decision 分离，并对 current index/restatement 做 digest 绑定。
- B5–B8 使用 exact-role closed transaction binding；ledger/counters/state/cache/receipts/evaluation 与冻结上游均重算校验。
- 请求事件为 chained append-only ledger，counters 只由 replay 派生，不再删除 reservation 或回滚预算。
- private derived state 仅从既有 immutable/append-only 材料离线恢复，group promotion 可回滚且二次运行为 verified no-op。
- B6 current cache 只保存 normalized safe projection；legacy mutable 与 raw-response current cache 均为 0。
- EventTime clause binding、conflict applicability、provider transport/retention、public-data guard 和 test isolation 均 fail closed。
- v0.4 workbook 由独立 OOXML verifier 校验；视觉确认不会自动填写。

## 测试与 CI

- 默认 `npm test` 纳入全部 PR #7 remediation regression，并通过独立 isolation verifier 证明 tracked/private/untracked content、metadata 与 Git status 不变。
- Linux 与 Windows workflow 均 checkout PR exact HEAD，清空 provider 环境，并执行 no-real-data、lint、build、full test、专项完整性测试、smoke 与 e2e。
- PR 动态 CI 结果以 GitHub 对最终 exact HEAD 的 checks 为准；本文件不预写结果。

## 安全边界

本轮没有调用 provider，没有执行 Canary/full160 或模型训练，没有修改 B4/formal-cash，没有打开 holdout，没有进入 V2-C/V2-D/C4/M3，没有 release 或 merge。

private state、receipts、cache、workbook、审计明细、环境文件和密钥均保持 Git ignored，不进入 PR。

## 合并状态

PR #7 必须保持 `Draft/open/unmerged`。修复完成不构成合并授权；下一步唯一允许动作是对新 HEAD 进行增量独立外审，合并建议在该外审完成前保持 `WITHHELD`。
