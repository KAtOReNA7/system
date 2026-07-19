# 下一步交给 Codex 的指令

## 2026-07-19 PR #7 S1 B0–B7 增量边界

7 项 S0 开发支持基线已经在 exact HEAD `badbf453e1e99ba87cc3064601e480a09ff1b149` 完成。用户现已单独授权直接在 `codex/m2-v2-evidence-pilot-v1` 上按 B0–B7 分层实施 10 项 open finding 的 S1 修复、provider-free 离线重建、显式原子提交、普通 push 与 exact-head 双平台 CI checkpoint。B1 已在 exact remote HEAD `66eecbc57c4186ad61df8152ef38b5f28300f130` 完成，CI run `29692415607` 的 Linux job `88207352223` 与 Windows job `88207352209` 均成功；当前 batch 为 `B2`，未通过本 batch Linux/Windows CI 前不得进入 B3。

10 项 finding 当前仍全部 `OPEN`。B0–B7 通过后最高只能写 `CANDIDATE_CLOSED_PENDING_INDEPENDENT_REVIEW`；B8 独立外审不属于本轮授权，本代理不得声明任何 finding 已独立 `CLOSED`。

## 当前唯一入口

`codex/m2-v2-evidence-pilot-v1` 上的历史完整性修复、private state 离线恢复与 S0 支持基线均已收口。本轮唯一新增授权是 PR #7 的 B0–B7 S1 分层修复；不要把任何历史 C2/C3、V2-B provider、B8 外审或 M3 段落当成执行授权。

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

- 依次实施 B0、B1、B2、B3、B4、B5、B6、B7；B1–B5 虽在设计 DAG 中可并行，本轮仍必须按附件的 checkpoint 顺序执行。
- 修改冻结范围内的产品代码、测试、版本化合同、CI 与公开治理文档；B6 只从既有 immutable/append-only 材料进行 provider-free 离线重建并原子晋升新的 derived state。
- 每个完成的原子 commit 使用显式路径暂存并立即普通 push 到现有分支；每个 batch 保存 exact remote HEAD、Linux/Windows CI 与 provider delta 证据。
- 仅更新 tracked checkpoint 动态表；本轮不得更新 PR 正文，PR 始终保持 Draft/open/unmerged。

## 当前禁止

- 禁止调用任何外部 provider 或执行 provider capability。
- 禁止执行任何 Canary、run、resume 或 full160。
- 禁止修改模型、参数、threshold、gate、B4 或 formal-cash target。
- 禁止训练收入模型或运行 CatBoost、LightGBM、XGBoost。
- 禁止打开 final holdout、embargo 或 deferred labels。
- 禁止进入 V2-C、V2-D、C4 或 M3 formal。
- 禁止 release，禁止 merge PR #7。
- 禁止同一代理执行 B8 独立外审、把 candidate 状态写成 `CLOSED`，或把修复结果解释为训练/下一阶段授权。
- 禁止提交 private input/output、receipts、workbook、环境文件、密钥或敏感明细。
- 禁止使用 `git add .`、`git add -A`、stash、rebase、squash、amend、force push 或删除/覆盖历史审计证据。

## 完成边界

只有 B0–B7 全部通过本地门禁、逐批普通 push、逐批 exact-head Linux/Windows CI、89/89 case 覆盖、`providerRequestDelta=0`、B6 原子晋升与最终边界比较后，才能交接给新的独立 B8 外审。即使达到该边界，`mergeAuthorized=false`、`full160Authorized=false`、`modelTrainingAuthorized=false`、`nextDevelopmentReadiness=NOT_AUTHORIZED` 仍保持不变。
