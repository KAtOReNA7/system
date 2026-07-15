# M2 C1 transparent ensemble 开发验证

结论：C1 development 为 `FAIL`；结果继续 `not_for_formal_decision`，未打开 final holdout，也未授权 C2-R/C2/C3。

## 核心指标

| 指标 | 结果 |
|---|---:|
| all-scoreable WAPE | 3.8502 |
| all-scoreable signed bias | +351.14% |
| 高价值 WAPE | 2.9538 |
| 高价值 signed bias | +271.88% |
| 内部 80% coverage | 83.02% |
| 内部 mean WIS | 23538.8487 |
| served 指标 | 互补小样本保护，公开抑制 |

## outer-origin 候选选择

| origin | 选择状态 | 候选 | earlier origins | earlier scoreable cases | bias-feasible |
|---|---|---|---:|---:|---:|
| 2020-12 | frozen_fallback_insufficient_inner_evidence | `pair:robust_positive_median@0.50+trailing_mean_12@0.50` | 0 | 0 | 0 |
| 2021-06 | frozen_fallback_insufficient_inner_evidence | `pair:robust_positive_median@0.50+trailing_mean_12@0.50` | 1 | 716 | 0 |
| 2021-12 | frozen_fallback_no_bias_feasible_candidate | `pair:robust_positive_median@0.50+trailing_mean_12@0.50` | 2 | 2130 | 0 |
| 2022-06 | frozen_fallback_no_bias_feasible_candidate | `pair:robust_positive_median@0.50+trailing_mean_12@0.50` | 3 | 4562 | 0 |
| 2022-12 | frozen_fallback_no_bias_feasible_candidate | `pair:robust_positive_median@0.50+trailing_mean_12@0.50` | 4 | 7963 | 0 |

## 验收门槛

| 条件 | 结果 |
|---|---|
| `overallWapeAtMost060` | FAIL |
| `overallBiasWithin10Percent` | FAIL |
| `servedBiasWithin10Percent` | FAIL |
| `highValueBiasWithin10Percent` | FAIL |
| `eachCoreHorizonBiasWithin15Percent` | FAIL |
| `horizon3_6_12ImproveAtLeast3Percent` | FAIL |
| `horizon18_24RegressAtMost2Percent` | FAIL |
| `top10WapeImprovesAtLeast5Percent` | FAIL |
| `top1Top5RegressAtMost5Percent` | FAIL |
| `outerOriginWinShareAtLeast70Percent` | FAIL |
| `noThreeConsecutiveOriginsRegressOver5Percent` | FAIL |
| `internal80CoverageBetween75And85Percent` | PASS |
| `meanWisImprovesAtLeast5Percent` | FAIL |
| `standardizedWidthRegressAtMost10Percent` | FAIL |
| `pairedBootstrapUpper95BelowZero` | FAIL |
| `P0IsZero` | PASS |
| `P1IsZero` | PASS |
| `P2IsFactReviewOnly` | PASS |
| `automaticOperatingActionFieldsAreZero` | PASS |

内部 80% 区间只用于 coverage/WIS/过度自信审计，公开产物不包含预测区间端点。产品边界仍只有单点值、年度拆分、confidence 和 limitations。
