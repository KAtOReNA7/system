# 下一步交给 Codex 的指令

## 当前唯一入口

PR #7–#11 均已合并，旧 PR 分支不得继续作为开发入口。每次任务先按
`AGENTS.md` 自动完成远端同步、分支/PR/CI/worktree 核对、全库查重和
private-independent 基线验证；用户无需重复下达这些共性命令。

当前权威导航：

1. `docs/analysis/m2-v2/M2-v2-current-state-index-v0.9.md`
2. `docs/analysis/m2-v2/M2-repository-code-convergence-and-portable-development-audit-v0.4.md`
3. `docs/analysis/m2-current/M2-current-automated-model-development-v0.4.md`
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
- `nextDevelopmentReadiness=BUSINESS_COVERAGE_AND_ABSOLUTE_QUALITY_REQUIRED`
- `full160Authorized=false`
- final holdout、embargo shadow、deferred labels 均 sealed
- provider、数据库、Canary/full160、release、M3 formal 未授权

## v0.3 冻结 development 结论

`M2-current-occurrence-amount-calibration-v0.3` 以 v0.2 为 base，只在严格更早
成熟 case 上通过 1% WAPE 改善和 bias 门禁时启用 occurrence + conditional
amount 校准。当前冻结 population 未移动：824 部作品、7,851 个 case、5 个 origin。

- v0.3 WAPE/bias：0.50557140 / -0.01198958
- v0.2 WAPE/bias：0.51114966 / -0.00586227
- 相对 v0.2：-1.0913%；paired 95% CI
  [-0.03714631, -0.00015184]
- 相对 B4：-9.1491%；paired 95% CI
  [-0.16709546, -0.03228091]
- development WAPE 门槛：0.30；未通过
- intermittent WAPE：0.90733
- dormant WAPE/bias：1.00018 / -0.99972

因此结论保持 `CANDIDATE_DEVELOPMENT_PARTIAL_BLOCKED`。相对改善真实但很小，
绝对误差和 segment 质量仍不可用；不得声称已经替代人工或可以发布。

## 下一项 M2 工作的正确方向

1. 保持 rolling-origin、zero/seasonal naive/SBA/TSB/ADIDA、B4、v0.2、v0.3
   的同人口回归，不删除弱基线。
2. 优先解决 intermittent/dormant 的可识别 as-of 信号和 cash observability；
   不移动冻结人口，不剔除困难 case，不将 null 计为 0。
3. 只接收真实、cutoff 时已签署、确认且可审计的 commitment snapshot。
   无承诺 pure-buyout 必须 null abstain，不进入人工或机器数值预估。
4. 后续新候选、final holdout、provider、数据库和 release 均需各自新增授权。

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
