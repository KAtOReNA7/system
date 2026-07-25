# M2 v2 当前状态索引 v0.12

## 当前结论

本索引取代 v0.11 作为仓库治理入口。PR #7 的 cryptographic authority 仍由
不可变的 `M2-v2-current-state-index-v0.3.json` 提供，本文件不改写该绑定。

- `currentDecision=CANARY_FAIL`
- `currentEvaluation=SALES_SHARE_TARGET_MIGRATED_PORTFOLIO_DEVELOPMENT_PASS_WORK_LEVEL_BLOCKED`
- `automationDecision=AUTOMATION_BLOCKED`
- `nextDevelopmentReadiness=SALES_SHARE_TARGET_VALIDATION_AND_WORK_LEVEL_SIGNAL_REQUIRED`
- `matureDataPredictionCapability=false`
- `highAccuracyPortfolioDevelopmentBacktestAvailable=true`
- `humanNumericBaselineRequired=false`
- `businessSampleRequired=false`
- `developmentReplayAuthorized=true`
- `newCandidateFamilyDevelopmentAuthorized=false`
- `finalHoldoutAuthorized=false`
- `releaseAuthorized=false`

## 2026-07-25 业务目标修正

M2 当前只预测未来分成收入现金。全部买断现金，包括 cutoff 时已签署、确认、
可审计的买断应收，都进入模型外账单/审计层，不进入特征、标签、回测、预测、
区间或年度明细。pure-buyout 始终 null abstain。

当前实际值分区为：

```text
salesShareCashActual
+ isolatedBuyoutCashActual
+ isolatedOtherCashActual
= totalLedgerCashActual
```

分成目标完整性与分成收入占公司全部账单现金的经济比例分别报告。旧
`forecastable cash / total ledger cash` 比例只作历史经济范围披露，不再作为
分成模型覆盖率门禁。

## 同人口迁移结果

人口未移动：3,053 部权威作品、824 部 model works、7,851 个冻结 case；
逐月诊断仍为 25 origin、56,856 个成熟 case。

| 证据 | 冻结 case | 逐月 case |
|---|---:|---:|
| case 数 | 7,851 | 56,856 |
| 数值标签变化数 | 0 | 0 |
| 隔离买断现金 case 求和 | 4,800,850.1534 | 11,578,794.9998 |
| 分类不确定现金占比 | 0.00000272843046 | 0.00000286514362 |
| 最大守恒差 | 5.82e-11 | 2.33e-10 |

这些现金金额是重叠 work-origin-horizon case 的求和，不是全库经济总额。标签
变化为 0，是因为当前 authority 没有进入旧标签的 cutoff-linked 买断或其他
承诺现金；本轮修正固定未来语义并去除 commitment private 依赖，但不会自动
改善现有算法精度。

冻结不确定项只有 1 个 case、金额 -230.38。它可能是分成退款或买断冲回，
缺少可审计 cash type 时不得静默归类。

## 当前质量

| 分辨率 / 模型 | WAPE | signed bias | 状态 |
|---|---:|---:|---|
| B4 作品 case | 0.55648454 | 0.08910997 | comparator |
| v0.6 作品 case | 0.50557140 | -0.01198958 | FAIL |
| v0.6 稀疏 origin×horizon | 0.08397490 | -0.01198972 | 局部结果 |
| 逐月 champion origin×horizon | 0.32846914 | -0.30206335 | FAIL |
| seasonal naive portfolio（同窗） | 0.21217335 | -0.19566080 | comparator |
| v0.6 portfolio development | 0.11681934 | -0.04876300 | PASS |

完整 M2 仍阻断，因为：

- 作品级 WAPE 高于 0.30；
- intermittent/dormant 失败；
- target-classification uncertainty 在严格零容忍门禁下未穷尽；
- portfolio 评价窗口属于 development，不是独立 holdout；
- final holdout、automation 与 release 未授权。

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

- `docs/analysis/m2-current/M2-sales-share-only-target-decision-v0.1.md`
- `docs/analysis/m2-current/M2-sales-share-model-full-audit-and-research-v0.1.md`
- `docs/analysis/m2-current/M2-sales-share-forecast-research-sources-v0.1.json`
- `docs/analysis/m2-current/M2-current-sales-share-candidate-v0.6.json`
- `docs/analysis/m2-current/M2-current-automated-evaluation-v0.4.json`
- `docs/analysis/m2-current/M2-current-signal-gap-diagnostic-v0.1.json`
- `docs/analysis/m2-current/M2-current-as-of-signal-readiness-v0.1.md`
- `docs/analysis/m2-current/M2-current-authority-source-audit-v0.1.json`
- `docs/analysis/m2-current/M2-current-as-of-source-inventory-v0.1.json`
- `docs/analysis/m2-current/M2-current-signal-input-portable-intake-v0.1.md`
- `docs/analysis/m2-current/M2-current-signal-input-portable-diagnostic-v0.1.json`
- `docs/analysis/m2-current/M2-current-public-diagnostic-v0.7.json`

## 下一开发方向

1. D0 已定位并在 manifest 匹配的原始工作簿中只读核验同一笔 -230.38 元负向
   现金事实；原表没有独立退款/冲销/结算调整类型或说明字段，业务授权分类不能
   证明 cash event。等待原始结算调整/合同依据，继续 `UNKNOWN_ABSTAIN`。
2. 冻结现有 2022 development 窗口，不再同窗调参。
3. D1 公共合同和缺口 ledger 已实现；下一步物化带 economic、posting、
   available-at、来源版本和 lineage 的历史 `availabilitySnapshot`，禁止当前
   状态回填。当前冻结 2,402 和逐月 20,600 个 work-origin-segment 的合规
   snapshot 覆盖均为 0。
4. 已审计四类现有候选来源，均不能证明历史 predictor availability；digest-bound
   portable signal input 与 aggregate-only CLI 已实现。受控输入无需固定 private
   文件名，通过 bundle/cases 参数接入，缺失权威时继续 `unknown_at_origin`。
   全 Git 历史与本机受控库存的扩展盘点也没有发现现金事件类型或历史
   availability 权威。历史 evidence 可精确重放，但新模型训练和选模未授权。
5. 新信号覆盖可审计后先通过 25-origin 诊断，再回到 7,851-case population 做 grouped
   nested evaluation。
6. 下一次 portfolio 评价只能使用未参与选择的 later-origin 或单独授权
   final holdout；当前 holdout 继续 sealed。
7. portfolio、work allocation/ranking、abstention 是独立 capability。
8. 120 部人工预估继续跳过；人工只做 post-gate QA。
9. provider、数据库、Canary/full160、release 和 M3 formal 继续未授权。
