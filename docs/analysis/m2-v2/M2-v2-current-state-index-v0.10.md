# M2 v2 当前状态索引 v0.10

## 当前结论

本索引取代 v0.9 作为仓库治理入口。PR #7 的 cryptographic authority 仍由不可变的
`M2-v2-current-state-index-v0.3.json` 提供；本文件不改写该绑定。

2026-07-24 已完成 M2 current R0–R5 评估能力：

- strict target、occurrence、censoring、route 和 commitment snapshot 合同；
- 25 个逐月 origin、56,856-case 次级 development diagnostic；
- zero、seasonal naive、Croston、SBA、TSB、ADIDA 强制基线；
- nested global hurdle GLM、Tweedie boosting 和 hurdle GBM bakeoff；
- rolling conformal quantiles、WIS/CRPS、MinT 和受约束 ensemble；
- risk–coverage、业务损失和 Forecast Value Added；
- 120 部人工评估按用户决定完全跳过，不重建、不重放。

结果不是新模型通过。三个全局家族和 MinT 均未清除 nested gate，v0.4 在所有
outer origin 回退 exact v0.3。当前 development champion 仍为
`M2-current-occurrence-amount-calibration-v0.3`。

当前状态：

- `currentDecision=CANARY_FAIL`
- `currentEvaluation=CANDIDATE_DEVELOPMENT_FAIL_BLOCKED`
- `automationDecision=AUTOMATION_BLOCKED`
- `nextDevelopmentReadiness=AUDITABLE_AS_OF_SIGNAL_AND_CASH_OBSERVABILITY_REQUIRED`
- `humanNumericBaselineRequired=false`
- `businessSampleRequired=false`
- `finalHoldoutAuthorized=false`
- `releaseAuthorized=false`

## 质量与人口

权威人口继续冻结为 3,053 部作品、824 部 model works 和 7,851 个 formal-cash
case。全库/Top10 cash observability 为 0.7396468495 / 0.759412528，低于 0.90。

| 模型或 gated result | WAPE | signed bias |
|---|---:|---:|
| B4 | 0.55648454 | 0.08910997 |
| v0.2 | 0.51114966 | -0.00586227 |
| v0.3 champion | 0.50557140 | -0.01198958 |
| v0.4 gated result | 0.50557140 | -0.01198958 |

v0.4 与 v0.3 完全相同是 fallback，不是 challenger 打平。绝对 WAPE 仍高于 0.30；
intermittent WAPE 0.90732841，dormant WAPE/bias 1.00018361 / -0.99972006。

概率诊断在权威人口上的 80% interval coverage 为 0.82397147，但逐月次级诊断
只有 0.64363277；逐月 rolling baseline champion WAPE/bias 为
0.66335800 / -0.30206120。这证明五个半年 origin 不能被描述为 dense monthly
evaluation，且总体 calibration 通过不能抵消 amount 失效。

## 业务边界

- 正式目标仍是 future bill cash。
- 未承诺 future buyout 不进入预测。
- pure-buyout 无 strict cutoff commitment 时必须 `null abstain`。
- commitment 必须 exact-work、签署、确认、cutoff 前可得、可审计且入账月位于
  horizon。
- 人工只做 post-gate quality assurance，不预测金额。
- 120 部历史 JSON 不参与 current config、runner、loader、readiness 或验收。
- final holdout、embargo shadow、deferred60、provider、数据库、Canary/full160、
  release 和 M3 formal 继续 sealed/未授权。

## 当前唯一入口

公共开发：

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

已验证 private authority 下的 bounded development replay：

```bash
npm run doctor:capability -- m2-algorithm-authoritative-input
npm run develop:m2:current:candidate
npm run diagnose:m2:current
npm run verify:m2:current
```

当前证据：

- `docs/analysis/m2-current/M2-current-R0-R5-evaluation-and-development-v0.5.md`
- `docs/analysis/m2-current/M2-current-global-distributional-candidate-v0.4.json`
- `docs/analysis/m2-current/M2-current-automated-evaluation-v0.2.json`
- `docs/analysis/m2-current/M2-current-public-diagnostic-v0.5.json`

## 下一开发方向

停止新增模型家族和同类调参。下一阶段只接受 cutoff 时可得、可审计、可版本化的
真实信号：

1. commitment snapshot；
2. sales cash 的 historical availability snapshots；
3. intermittent/dormant occurrence 与 positive amount 的数据缺口 ledger；
4. 新信号先通过 25-origin 次级诊断，再在 7,851-case 权威人口上 nested 复验；
5. 未稳定胜过 v0.3 且未通过绝对/segment/risk–coverage/business-loss 门禁时，
   继续 fallback，禁止打开 final holdout。
