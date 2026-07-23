# 下一步交给 Codex 的指令

## 当前唯一入口

PR #7、PR #8 和 PR #9 均已合并，旧 PR 分支已删除。不得切换到 `codex/m2-v2-evidence-pilot-v1` 或 `codex/m2-repository-convergence-toolchain` 继续开发。

每次任务先按 `AGENTS.md` 自动完成远端同步、工作区/分支/PR/CI/worktree 核对、重复实现检查和 private-independent 基线验证。用户无需重复下达这些共性命令。

当前权威导航：

1. `docs/analysis/m2-v2/M2-v2-current-state-index-v0.5.md`
2. `docs/analysis/m2-v2/M2-repository-code-convergence-and-portable-development-audit-v0.4.md`
3. `docs/analysis/m2-current/M2-current-public-diagnostic-baseline-v0.1.md`
4. `AGENTS.md`

## 当前开发状态

- 核心 clone/install/lint/build/test/smoke/M2 public diagnostics/formal start/fixture start 均必须不依赖 private。
- Node 24.x、npm 11.13.0、Python 3.11–3.13 是统一工具链合同。
- package scripts 已按 `current-public`、`archive-only`、`restricted-local` 分类。
- formal 与 fixture composition 已分离；formal export 保持 point-only。
- C1、legacy C2-R、C2-R.1、C2、C3 均为历史失败路线，不得复制或重复执行为新候选。

当前业务状态：

- `currentDecision=CANARY_FAIL`
- `nextDevelopmentReadiness=NOT_AUTHORIZED`
- `full160Authorized=false`
- `modelTrainingAuthorized=false`
- final holdout、embargo shadow、deferred labels 均 sealed

## 下一项 M2 工作的正确方向

如果用户另行授权新的 M2 算法开发，必须从 `src/domain/m2Current/**` 的 canonical core 继续，并按以下顺序：

1. 解释并缩小 824/3,053 model works 的输入覆盖缺口。
2. 在同一 7,851-case formal-cash universe 上固定 B4 comparator。
3. 分别诊断 dense、intermittent、dormant、horizon 和 TopK。
4. 只比较受约束、可解释的候选；不得复制历史 runner。
5. 同时通过 coverage、WAPE、bias、paired CI 和业务抽检后，才申请 final holdout。

没有新的明确授权时，只能继续公共诊断、fixture、工具链、文档和仓库维护，不得调用 provider、数据库、训练、Canary/full160、holdout、release 或 M3 formal。

## 新电脑基线

```bash
npm ci
npm run doctor:dev
npm run check:no-real-data
npm run lint
npm run build
npm test
npm run smoke
npm run smoke:portable-start
npm run test:e2e
npm run verify:m2:current
```

缺少任何 private artifact 时，只能由所属 capability doctor 报告局部阻断；不得把整台电脑判定为无法开发。
