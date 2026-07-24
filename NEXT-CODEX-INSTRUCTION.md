# 下一步交给 Codex 的指令

## 当前唯一入口

PR #7、PR #8、PR #9 和 PR #10 均已合并，旧 PR 分支不得继续作为开发入口。
不得切换到 `codex/m2-v2-evidence-pilot-v1` 或
`codex/m2-repository-convergence-toolchain` 继续开发。

每次任务先按 `AGENTS.md` 自动完成远端同步、工作区/分支/PR/CI/worktree 核对、重复实现检查和 private-independent 基线验证。用户无需重复下达这些共性命令。

当前权威导航：

1. `docs/analysis/m2-v2/M2-v2-current-state-index-v0.8.md`
2. `docs/analysis/m2-v2/M2-repository-code-convergence-and-portable-development-audit-v0.4.md`
3. `docs/analysis/m2-current/M2-current-reliable-model-development-v0.3.md`
4. `AGENTS.md`

## 当前开发状态

- 核心 clone/install/lint/build/test/smoke/M2 public diagnostics/formal start/fixture start 均必须不依赖 private。
- Node 24.x、npm 11.13.0、Python 3.11–3.13 是统一工具链合同。
- package scripts 已按 `current-public`、`archive-only`、`restricted-local` 分类。
- formal 与 fixture composition 已分离；formal export 保持 point-only。
- C1、legacy C2-R、C2-R.1、C2、C3 均为历史失败路线，不得复制或重复执行为新候选。

当前业务状态：

- `currentDecision=CANARY_FAIL`
- `nextDevelopmentReadiness=AUTOMATED_BACKTEST_AND_BUSINESS_COVERAGE_REQUIRED`
- `full160Authorized=false`
- exact v0.2 candidate development replay 和 120 部确定性样本已完成
- 120 部样本只用于 post-hoc 误差诊断；人工数值预测和强制逐行复核已取消
- final holdout、embargo shadow、deferred labels 均 sealed

## 下一项 M2 工作的正确方向

覆盖原因 ledger 和 v0.2 current candidate 已完成。候选 WAPE
0.51114966、bias -0.00586227，相对 B4 改善 8.15%，paired 95% CI 为
[-15.75%, -2.91%]；5 个 horizon bias 均通过。相对 v0.1 的 paired CI
[-11.83%, +1.05%] 穿过零，因此不得声称统计确定优于 v0.1。dormant 没有改善，
当前结论仍是 `PARTIAL_PASS`。

下一步固定为：

1. 建立月度 rolling-origin 自动评价，并同人口比较全零、seasonal naive、SBA、
   TSB、ADIDA、B4、v0.1 和 v0.2。
2. 分开诊断现金发生与正金额，报告 WAPE、bias、MASE、RMSSE 及 horizon、
   segment、route、coverage、abstention 切片。
3. 120 部样本只保留为误差诊断，不要求用户填写预测金额、逐行复核或三张模板。
4. 单独接收真实、cutoff 时已签署确认且可审计的 commitment snapshot；不得由
   算法猜测未承诺买断。
5. dormant 在没有新的 as-of 可用信息前保持 B4 fallback，不得使用当前
   shelf/rights 状态回填历史 origin。
6. 自动技术门禁通过后，人工只做小规模最终结果接受/有限接受/拒绝；获得单独授权
   后才可打开 final holdout。

没有新授权时，只能继续公共诊断、fixture、工具链、文档和仓库维护，不得调用 provider、数据库、Canary/full160、holdout、release 或 M3 formal。

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
