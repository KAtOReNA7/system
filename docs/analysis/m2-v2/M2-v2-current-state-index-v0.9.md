# M2 v2 当前状态索引 v0.9

## 当前结论

本索引取代 v0.8 作为仓库治理入口。PR #7 的 cryptographic authority 仍由不可变的
`M2-v2-current-state-index-v0.3.json` 提供，本文件不改写其绑定。

2026-07-24 已完成：

- 取消人工预估书单和人工/机器数值竞赛；
- 将旧 120 部 JSON 退役为历史审计 artifact；
- 固化无 cutoff 承诺 pure-buyout 的 `null abstain`；
- 建立 rolling-origin、五个简单基线、two-part 指标和 coverage 分解；
- 在冻结 development population 上复验 v0.3。

当前状态：

- `currentDecision=CANARY_FAIL`
- `nextDevelopmentReadiness=BUSINESS_COVERAGE_AND_ABSOLUTE_QUALITY_REQUIRED`
- `currentCandidate=M2-current-occurrence-amount-calibration-v0.3`
- `currentCandidateDecision=PARTIAL_PASS`
- `humanNumericBaselineRequired=false`
- `businessSampleRequired=false`
- `finalHoldoutAuthorized=false`
- `releaseAuthorized=false`

## 人口与覆盖

3,053 部权威作品继续冻结为 824 部模型人口和 2,229 部排除人口；模型开发人口仍为
7,851 个 formal-cash case。全库/Top10 现金可观察性为 73.96%/75.94%，低于
90%。本轮没有移动人口、剔除困难 case 或猜测未承诺现金。

## v0.3 结果

| 模型 | WAPE | signed bias |
|---|---:|---:|
| B4 | 0.55648454 | 0.08910997 |
| v0.2 | 0.51114966 | -0.00586227 |
| v0.3 | 0.50557140 | -0.01198958 |

v0.3 相对 v0.2 改善 1.0913%，paired work×origin 95% CI 为
[-3.7146%, -0.0152%]；相对 B4 改善 9.1491%，95% CI 为
[-16.7095%, -3.2281%]。

相对改善不等于可用。v0.3 仍未通过：

- 绝对 development WAPE 门槛 0.30；
- intermittent WAPE 0.9073；
- dormant WAPE/bias 1.00018 / -0.99972；
- 全库和 Top10 现金覆盖 0.90 门槛。

因此状态保持 `CANDIDATE_DEVELOPMENT_PARTIAL_BLOCKED`，不得表述为能替代人工、
能打开 holdout 或能发布。

## 人工与 pure-buyout 边界

- 旧 120 部清单不再是 current 配置、runner、loader、readiness 或验收依赖。
- 人工只做自动技术门禁后的 post-gate quality assurance，不预测金额。
- pure-buyout 没有 cutoff 时已签署、确认且可审计的 commitment 时必须
  `null abstain`；不得返回 0、月均等效值或概率金额。
- `buyout_plus_sales` 没有 commitment 时只预测 sales cash。

## 当前入口

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

具备 authority input 且只复现 exact v0.3：

```bash
npm run doctor:capability -- m2-algorithm-authoritative-input
npm run develop:m2:current:candidate
npm run diagnose:m2:current
npm run verify:m2:current
```

当前证据：

- `docs/analysis/m2-current/M2-current-automated-model-development-v0.4.md`
- `docs/analysis/m2-current/M2-current-occurrence-amount-candidate-v0.3.json`
- `docs/analysis/m2-current/M2-current-automated-evaluation-v0.1.json`
- `docs/analysis/m2-current/M2-current-public-diagnostic-v0.4.json`

final holdout、provider、数据库、Canary/full160、后续新候选、release 和 M3 formal
仍需各自新增授权。
