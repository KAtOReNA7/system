# 下一步交给 Codex 的指令

## 2026-07-24 当前唯一执行入口

PR #7 已通过独立 B8 复审和双平台 CI，并以普通 merge 合入 `main`；merge commit 为 `91dee993058d80ab36085ec0d3176b7ad154527e`，旧分支已删除。当前只继续 PR #8 `codex/m2-repository-convergence-toolchain` 的全盘复盘修正。

PR #8 已完成工程实现，剩余动作按顺序自动执行：

1. 更新 AGENTS、README、当前状态索引和审计收口；
2. 在当前工作树执行 no-real-data、doctor、lint、build、默认测试、smoke、E2E 和 `verify:m2:current`；
3. 显式路径提交并普通 push，等待 exact-head Linux/Windows CI；
4. 接受并处理可见外部 review 反馈，mark ready；
5. 普通 merge，快进同步本地 `main`，删除已合并开发分支并确认工作区干净。

用户已授权上述 review、ready 和 merge，不需要再次询问。只有 remote drift/non-fast-forward、不可恢复的验证失败、外部 review 的实质性阻断，或必须扩大到 provider、数据库、训练、holdout、release、M3 formal 时才停止。

当前权威导航为：

1. `docs/analysis/m2-v2/M2-v2-current-state-index-v0.4.md`
2. `docs/analysis/m2-v2/M2-repository-code-convergence-and-portable-development-audit-v0.3.md`
3. `docs/analysis/m2-current/M2-current-public-diagnostic-baseline-v0.1.md`

`currentDecision=CANARY_FAIL`、`nextDevelopmentReadiness=NOT_AUTHORIZED`、`full160Authorized=false`、`modelTrainingAuthorized=false` 不变。下方所有关于 PR #7 仍为 Draft、禁止 merge 或 B0–B8 尚待执行的内容均为历史 checkpoint，不再是当前任务入口。

## 2026-07-24 B8 独立复审已闭环（历史 checkpoint）

独立 reviewer 已在 exact HEAD `d2f92cd03bc9d82672676298d04daed765c4ce8a` 完成重复 B8，结论为 `B8_PASS_ALL_FINDINGS_CLOSABLE`。CI run `30034932174` 的 Linux/Windows jobs 均成功；10 项 finding 已由版本化 successor 记录为 `CLOSED`，B0–B8 全部 `COMPLETE`。

当前入口：

1. `docs/analysis/m2-v2/M2-v2-PR7-findings-closure-status-v0.2.md`
2. `docs/analysis/m2-v2/M2-v2-PR7-B8-independent-closure-v0.1.md`
3. `docs/analysis/m2-v2/M2-v2-current-state-index-v0.3.json`
4. `docs/analysis/m2-v2/M2-v2-PR7-B6-offline-authority-promotion-v0.1.md`

PR #7 继续保持 Draft/open/unmerged；不得 mark ready、merge 或 release。全盘审计的下一工程项是独立 cleanup/toolchain PR，但必须等 PR #7 经外部 review、明确获准合并且其 head 进入 `origin/main` 后，才能从更新后的 `main` 建立。不得把 cleanup 混入当前 PR。

`currentDecision=CANARY_FAIL`、`nextDevelopmentReadiness=NOT_AUTHORIZED`、`mergeAuthorized=false`、`full160Authorized=false`、`modelTrainingAuthorized=false` 均保持不变。

## 2026-07-24 B8 首轮独立复审返工

B7 implementation exact HEAD `4663fce6b656a7269bb624b9e2d74629bab999df` 已通过 run `30032162656` 的 Linux/Windows CI。首轮独立 B8 结论为 `B8_FAIL_REMEDIATION_REQUIRED`：canonical no-argument verifier/current-authority reader 仍指向 predecessor authority，且 B6 graph population 后缺少 formal claimable readonly proof。

当前继续使用 `codex/m2-v2-evidence-pilot-v1` 完成 closing correction。必须修正 canonical current 路由、在 clean exact HEAD 运行 `npm run m2:v2:pr7:b8:readonly-proof`、完成全量验证和双平台 CI，然后由独立 reviewer 重做 B8。复审 PASS 前不得关闭 finding、mark ready、merge 或 release。

## 2026-07-19 PR #7 S1 B0–B7 增量边界

7 项 S0 开发支持基线已经在 exact HEAD `badbf453e1e99ba87cc3064601e480a09ff1b149` 完成。用户现已单独授权直接在 `codex/m2-v2-evidence-pilot-v1` 上按 B0–B7 分层实施 10 项 open finding 的 S1 修复、provider-free 离线重建、显式原子提交、普通 push 与 exact-head 双平台 CI checkpoint。B6 已在 exact HEAD `3e79ce654cd335129005d3916f25f5bf8a2bef7d` 通过 run `30030360312` 的 Linux/Windows CI。B7 已完成本地全 registry 回归，Windows 88/88 原生案例、161 tests、zero skip；当前为 `REGRESSION_COMPLETE_PENDING_EXACT_HEAD_CI`，`currentBatch=B7`、`nextBatch=B8`。B8 已获授权，但只能由独立 reviewer 执行。

10 项 finding 当前仍全部 `OPEN`。B0–B7 通过后最高只能写 `CANDIDATE_CLOSED_PENDING_INDEPENDENT_REVIEW`；B8 独立外审已经授权，但实施代理不得自审或声明任何 finding 已独立 `CLOSED`。

## 当前唯一入口

`codex/m2-v2-evidence-pilot-v1` 上的历史完整性修复、private state 离线恢复与 S0 支持基线均已收口。本轮唯一新增授权是 PR #7 的 B0–B7 S1 分层修复；不要把任何历史 C2/C3、V2-B provider、B8 外审或 M3 段落当成执行授权。

当前权威导航：

1. `docs/analysis/m2-v2/M2-v2-current-state-index-v0.3.json`
2. `docs/analysis/m2-v2/M2-v2-PR7-B6-offline-authority-promotion-v0.1.md`
3. `docs/analysis/m2-v2/M2-v2-canary-v3-1-integrity-restatement-v0.4.json`
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
