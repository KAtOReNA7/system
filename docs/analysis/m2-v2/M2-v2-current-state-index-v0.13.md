# M2 v2 当前状态索引 v0.13

## 当前结论

本索引取代 v0.12 作为仓库治理入口。PR #7 的 cryptographic authority 仍由
不可变的 `M2-v2-current-state-index-v0.3.json` 提供，本文件不改写该绑定。
v0.12 中未被本文件修改的目标隔离、D0/D1、private 边界和人口冻结规则继续
有效。

- `currentDecision=CANARY_FAIL`
- `currentEvaluation=REAL_BILL_RECALIBRATION_IMPROVED_BUT_REJECTED`
- `automationDecision=AUTOMATION_BLOCKED`
- `nextDevelopmentReadiness=VERSIONED_AS_OF_SIGNAL_THEN_UNSEEN_ORIGIN_REQUIRED`
- `matureDataPredictionCapability=false`
- `developmentReplayAuthorized=true`
- `scopedRealBillRecalibrationCompleted=true`
- `candidateSelectionAuthorized=false`
- `finalHoldoutAuthorized=false`
- `releaseAuthorized=false`

## 2026-07-25 真实账单复跑

本机 `m2-algorithm-authoritative-input` capability 通过后，canonical runner
重新物化并评分了 824 部作品、7,851 个冻结 case 和 25 个逐月 origin /
56,856 个 case。结果与既有证据一致：

| 分辨率 / 模型 | WAPE | signed bias | 状态 |
|---|---:|---:|---|
| v0.3 冻结作品 case | 0.50557140 | -0.01198958 | fallback |
| 旧逐月 champion | 0.66335800 | -0.30206120 | FAIL |
| v0.7 历史状态校准 | 0.59576421 | -0.21126360 | REJECT |
| v0.7 dense | 0.39900895 | -0.04555218 | FAIL |
| v0.7 intermittent | 0.82897090 | -0.40113407 | FAIL |
| v0.7 dormant | 1.00725629 | -0.99262504 | FAIL |
| v0.5 portfolio development | 0.11681934 | -0.04876300 | development-only PASS |

v0.7 在逐月诊断中相对旧 champion 改善 10.1896%，但总体 WAPE 仍高于 0.30，
总体 bias、intermittent/dormant、历史特征 available-at 和独立 holdout 均未
通过。其唯一合法结论是：

```text
REJECT_KEEP_V0_3_WORK_LEVEL_FALLBACK
```

## 算法调整

v0.7 保留六个既有基线，增加三个月近期均值、两年同月季节中位数和
`alpha=0.5` EWMA。每个 outer origin 只读取最近 6 个更早且已成熟 origin，
按 `segment × horizon × trailing occurrence` 分层选择；每个选择单元至少
80 个 case，层级不足时逐级回退，最终 zero fail-safe。

这是用户授权的本地 posthoc development diagnostic。它不授权 candidate
selection、final holdout、provider、数据库、automation 或 release。

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

受控真实账单 exact replay：

```bash
npm run doctor:capability -- m2-algorithm-authoritative-input
npm run develop:m2:current:candidate
npm run diagnose:m2:current
npm run verify:m2:current
```

当前证据：

- `docs/analysis/m2-current/M2-current-real-bill-recalibration-v0.1.md`
- `docs/analysis/m2-current/M2-current-real-bill-recalibration-v0.1.json`
- `docs/analysis/m2-current/M2-current-sales-share-candidate-v0.6.json`
- `docs/analysis/m2-current/M2-current-automated-evaluation-v0.4.json`
- `docs/analysis/m2-current/M2-current-public-diagnostic-v0.8.json`
- `docs/analysis/m2-current/M2-current-signal-gap-diagnostic-v0.1.json`
- `docs/analysis/m2-current/M2-current-as-of-source-inventory-v0.1.json`

## 下一开发方向

1. 冻结 v0.7 参数和当前 2022 development 窗口，不继续同窗调参。
2. 物化带 economic、posting、available-at、来源版本和 lineage 的历史
   `availabilitySnapshot`；当前状态不得回填。
3. 新信号先通过 25-origin 次级诊断，再回到冻结 7,851-case 人口。
4. 下一次选模只能使用未参与本轮设计的 later origin 或经单独授权的 final
   holdout。
5. portfolio 不得分配回作品；作品预测、排序和 abstention 独立验证。
6. 120 部人工预估继续跳过；人工只做 post-gate QA。
7. provider、数据库、Canary/full160、release 和 M3 formal 继续未授权。
