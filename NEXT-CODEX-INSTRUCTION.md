# 下一步交给 Codex 的指令

## 2026-07-19 PR #7 S0 增量边界

当前增量任务只授权建立并验证 7 项 S0 开发支持基线。S0 不是 finding remediation；`docs/analysis/m2-v2/M2-v2-PR7-open-findings-status-v0.1.md` 所列 5 个 P1 与 5 个直接耦合 P2 仍全部 `OPEN`。禁止自动进入 S1、修改 `src/domain/m2V2EvidencePilot/**`、调用 provider/数据库/Canary/full160、训练、更新 PR 正文、mark ready 或 merge PR #7。即使 S0 全部通过，也必须停止并等待用户单独授权。

## 当前唯一入口

`codex/m2-v2-evidence-pilot-v1` 上的 M2 v2 完整性修复与 private state 离线恢复已经收口。除本轮明确限定的 PR #7 S0 开发支持任务外，当前没有获批的下一开发任务；S0 完成后必须停止。不要把任何历史 C2/C3、V2-B provider 或 M3 段落当成执行授权。

当前权威导航：

1. `docs/analysis/m2-v2/M2-v2-current-state-index-v0.2.md`
2. `docs/analysis/m2-v2/M2-v2-integrity-remediation-summary-v0.1.md`
3. `docs/analysis/m2-v2/M2-v2-canary-v3-1-integrity-restatement-v0.3.md`
4. `docs/technical-design/m2-v2/M2-v2-verifier-readonly-contract-v0.1.md`
5. `docs/technical-design/m2-v2/M2-v2-private-state-recovery-contract-v0.1.md`
6. `docs/technical-design/m2-v2/M2-v2-request-state-atomic-binding-v0.1.md`

所有 v0.1 current-state index、旧 NEXT/next-step、旧 decision、V2-B PRD 中的授权语句都只保留为 `historical / superseded / not authorization`；不得据此调用 provider、resume 或开始任何后续阶段。

## 冻结状态

- V2-A 已完成。
- V2-B.1 至 V2-B.8 是保留的历史 checkpoint；原始 V2-B.8 Canary v3.1 结论为 `CANARY_CONDITIONAL`。
- 修复合同下的离线 integrity restatement 结论为 `CANARY_FAIL`；`full160Authorized=false`。
- verifier 只读/幂等、原子绑定、B8 fail-closed 缺口、private derived state 离线恢复与全量验证已经完成；100% 复审和 PR body roundtrip 细节记录在 Git ignored private 收口证据中。
- C1、legacy C2-R、C2-R.1、C2、C3 均为 development `FAIL`，禁止重复进入。
- B4 只作为 comparator/fallback，未改变、未 release。
- formal-cash target 与 pure-buyout 无 cutoff commitment 时 null abstain 的规则保持冻结。
- final holdout、embargo shadow、deferred 60-month labels 均 sealed。
- 所有结果保持 `not_for_formal_decision`；`nextDevelopmentReadiness=NOT_AUTHORIZED`。

## 当前允许

- 保持 PR #7 为 Draft/open/unmerged，并由用户安排外部审查。
- 只读查看版本化 public 收口文档和 Git ignored private 审计证据。
- 在用户另行明确授权后，按新的自包含指令开始新的工作；修复完成本身不构成授权。

## 当前禁止

- 禁止调用任何外部 provider 或执行 provider capability。
- 禁止执行任何 Canary、run、resume 或 full160。
- 禁止修改模型、参数、threshold、gate、B4 或 formal-cash target。
- 禁止训练收入模型或运行 CatBoost、LightGBM、XGBoost。
- 禁止打开 final holdout、embargo 或 deferred labels。
- 禁止进入 V2-C、V2-D、C4 或 M3 formal。
- 禁止 release，禁止 merge PR #7。
- 禁止提交 private input/output、receipts、workbook、环境文件、密钥或敏感明细。
- 禁止使用 `git add .`、stash、rebase、force push 或删除审计证据。

## 完成边界

完整性修复已经按版本化 summary、restatement、最终 private audit v0.2 与 PR roundtrip 证据收口。现在必须停止并等待用户将 Draft/open PR #7 交给外部审查；`nextDevelopmentReadiness=NOT_AUTHORIZED`，不得顺势开始下一开发阶段。
