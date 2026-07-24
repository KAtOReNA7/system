# 下一步交给 Codex 的指令

## 当前唯一入口

PR #7–#12 均已合并，旧 PR 分支不得继续作为开发入口。每次任务先按
`AGENTS.md` 自动完成远端同步、分支/PR/CI/worktree 核对、全库查重和
private-independent 基线验证；用户无需重复下达这些共性命令。

当前权威导航：

1. `docs/analysis/m2-v2/M2-v2-current-state-index-v0.10.md`
2. `docs/analysis/m2-v2/M2-repository-code-convergence-and-portable-development-audit-v0.4.md`
3. `docs/analysis/m2-current/M2-current-R0-R5-evaluation-and-development-v0.5.md`
4. `AGENTS.md`

## 当前开发状态

- 核心 clone/install/lint/build/test/smoke/public diagnostic/start 不依赖 private。
- formal 与 fixture composition 分离；formal export 保持 point-only。
- C1、legacy C2-R、C2-R.1、C2、C3 是历史失败路线，不得复制或重跑为新候选。
- 120 部人工预估/复核清单已取消。旧 JSON 仅供历史审计，不是 current
  配置、runner、loader、readiness 或验收依赖。
- 人工只做自动技术门禁后的 post-gate quality assurance，不填写预测金额。

当前业务状态：

- `currentDecision=CANARY_FAIL`
- `automationDecision=AUTOMATION_BLOCKED`
- `nextDevelopmentReadiness=AUDITABLE_AS_OF_SIGNAL_AND_CASH_OBSERVABILITY_REQUIRED`
- `full160Authorized=false`
- final holdout、embargo shadow、deferred labels 均 sealed
- provider、数据库、Canary/full160、release、M3 formal 未授权

## R0–R5 development 结论

当前冻结 population 未移动：824 部作品、7,851 个 case、5 个权威 origin。
新增 25 个逐月 origin、56,856 个成熟次级 diagnostic case。全局 hurdle GLM、
Tweedie boosting、hurdle GBM、MinT 和受约束 ensemble 均经过 nested gate，
但没有 challenger 稳定通过。

- v0.3 WAPE/bias：0.50557140 / -0.01198958
- v0.4 gated result：0.50557140 / -0.01198958（exact v0.3 fallback）
- monthly baseline champion WAPE/bias：0.66335800 / -0.30206120
- monthly 80% interval coverage：0.64363277
- development WAPE 门槛：0.30；未通过
- intermittent WAPE：0.90733
- dormant WAPE/bias：1.00018 / -0.99972

因此结论为 `CANDIDATE_DEVELOPMENT_FAIL_BLOCKED`。v0.4 数值与 v0.3 相同来自
安全 fallback，不是候选升级；绝对误差和 segment 质量仍不可用。

## 下一项 M2 工作的正确方向

1. 保持 v0.3/v0.4 fallback、25-origin 诊断、六个简单基线、概率评价、
   risk–coverage、business loss 和 FVA 可复现。
2. 只接收 cutoff 时真实可得、可审计、可版本化的 exact-work signal：
   commitment、sales historical availability、合同/可售/发布/渠道状态。
3. 先建立 intermittent/dormant occurrence 与 positive amount 的数据缺口
   ledger；无历史 snapshot 的 current 状态不得事后回填。
4. 新信号先过 25-origin 诊断，再回到 7,851-case 权威人口做 nested 复验。
5. 停止新增模型家族和同类调参；120 部人工评估完全跳过。
6. final holdout、provider、数据库和 release 均需各自新增授权。

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

缺少任何 private artifact 时，只能由所属 capability doctor 报告局部阻断；不得把
整台电脑判定为无法开发。
