# M2 v2 当前状态索引 v0.11

## 当前结论

本索引取代 v0.10 作为仓库治理入口。PR #7 的 cryptographic authority 仍由
不可变的 `M2-v2-current-state-index-v0.3.json` 提供，本文件不改写该绑定。

M2 当前状态为：

- `currentDecision=CANARY_FAIL`
- `currentEvaluation=PORTFOLIO_DEVELOPMENT_BACKTEST_PASS_WORK_LEVEL_BLOCKED`
- `automationDecision=AUTOMATION_BLOCKED`
- `nextDevelopmentReadiness=PORTFOLIO_INDEPENDENT_VALIDATION_AND_WORK_LEVEL_SIGNAL_REQUIRED`
- `matureDataPredictionCapability=false`
- `highAccuracyPortfolioDevelopmentBacktestAvailable=true`
- `humanNumericBaselineRequired=false`
- `businessSampleRequired=false`
- `finalHoldoutAuthorized=false`
- `releaseAuthorized=false`

## 本轮修正

此前 R0–R5 证明全局 hurdle GLM、Tweedie stumps、hurdle GBM、MinT 与 ensemble
均不能解决作品级问题，但评价仍将不同业务分辨率混在一起。本轮已在 canonical
`src/domain/m2Current/**` 内完成多粒度重构，没有复制历史 runner：

1. 作品 case、origin 组合和 origin×horizon 组合分别评分；
2. 5-origin 稀疏权威结果与 25-origin 逐月结果强制并列；
3. 增加 strictly as-of 的加总 additive Holt–Winters ensemble；
4. 固化 portfolio development gate 与完整 M2 maturity gate 的分离；
5. 120 部人工预估继续完全跳过。

## 质量与人口

人口继续冻结为 3,053 部作品、824 部 model works、7,851 个 formal-cash
case。全库/Top10 cash observability 为 `0.7396468495 / 0.759412528`，
低于 `0.90`。

| 分辨率 / 模型 | WAPE | signed bias | 状态 |
|---|---:|---:|---|
| B4 作品 case | 0.55648454 | 0.08910997 | comparator |
| v0.3/v0.4 作品 case | 0.50557140 | -0.01198958 | FAIL |
| v0.3/v0.4 稀疏 origin×horizon | 0.08397490 | -0.01198972 | 局部结果 |
| 旧逐月 champion origin×horizon | 0.32846914 | -0.30206335 | FAIL |
| seasonal naive portfolio（同窗） | 0.21217335 | -0.19566080 | comparator |
| v0.5 portfolio development | 0.11681934 | -0.04876300 | PASS |

v0.5 使用 12 个逐月 evaluation origin、30 个成熟 origin×horizon cell；
相对 seasonal naive 的 FVA 为 `0.44941559`，cell APE p90 为
`0.28366167`。按 origin 聚类 bootstrap 的 WAPE 95% CI 为
`[0.08500048, 0.13717581]`，bias 95% CI 为
`[-0.09940077, 0.02145806]`。这只允许“portfolio development backtest
pass”声明。

完整 M2 仍阻断，因为：

- 作品级 WAPE 高于 0.30；
- intermittent/dormant 失败；
- cash observability 低于 0.90；
- v0.5 评价窗口属于 development，不是独立 holdout；
- final holdout 与 release 未授权。

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

受控 development exact replay：

```bash
npm run doctor:capability -- m2-algorithm-authoritative-input
npm run develop:m2:current:candidate
npm run diagnose:m2:current
npm run verify:m2:current
```

当前证据：

- `docs/analysis/m2-current/M2-current-maturity-reconstruction-v0.6.md`
- `docs/analysis/m2-current/M2-current-multi-resolution-candidate-v0.5.json`
- `docs/analysis/m2-current/M2-current-automated-evaluation-v0.3.json`
- `docs/analysis/m2-current/M2-current-public-diagnostic-v0.6.json`

## 下一开发方向

1. 冻结 v0.5 与当前 2022 development 窗口，不再同窗调参。
2. 未获授权前保持 final holdout sealed；下一次 portfolio 评价只能使用未参与
   选择的 later-origin 或单独授权 holdout。
3. 作品级只接收 cutoff 时真实可得、可审计、可版本化的 commitment、合同、
   可售、渠道与发布时间 snapshot。
4. 新信号先通过逐月 origin，再回到冻结 7,851-case population 做 grouped
   nested evaluation。
5. portfolio、work allocation/ranking、abstention 是独立 capability；
   portfolio 通过不得自动授权作品级预测或 automation。
6. 120 部人工预估继续完全跳过；人工只做 post-gate QA。
7. provider、数据库、Canary/full160、release 和 M3 formal 继续未授权。
