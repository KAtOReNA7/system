# M2 lifecycle-aware revenue forecast challenger v0.1

## 结论

- 候选：`M2-lifecycle-aware-revenue-forecast-challenger-v0.1`
- 决策：`LIFECYCLE_AWARE_DEVELOPMENT_FAIL_TRIVIAL_POSTHOC_GAIN`
- 范围：算法 development 实验，不是发布、Canary、自动化或 exact v0.3 替换。
- exact v0.3 fallback、人工账单权威和 sales-share cash boundary 均未修改。

## baseline 与 challenger

| 评估 | learnedGlobal + common reversal | lifecycle-aware | 相对 WAPE |
|---|---:|---:|---:|
| 36 个月按作品外五折 | 0.44022495 | 0.44016120 | -0.01% |
| strict earlier-label rolling | 0.41191878 | 0.41189883 | -0.00% |

baseline 只精确重放冻结的 learnedGlobal + common reversal；challenger 使用
lifecycle-aware occurrence 与 log-amount 配置。当前 state routing 明确来自已完成
development 实验，不增加发布门禁，也不构成独立模型选择。

在当前结果之前完成的 rapid experiment 均保存在 public JSON 的
`completedRapidExperiments`，包含各自 dataset version、feature version、
model config、evaluation result 与失败归因。本报告主表对应当前 experiment
`M2-lifecycle-aware-revival-selected-challenger-experiment-05-v0.1`。

当前 selected pipeline 只在
`revival` 状态使用 challenger；
其余状态回退 frozen baseline。该路由来自已见 development 实验，语义为
`posthoc_from_completed_experiment_04_development_only_not_independent_selection`。raw challenger 在 primary/strict
的 WAPE 分别为 `0.50139298` /
`0.62275977`，不会被 fallback 覆盖。

selected pipeline 在 primary/strict 的相对变化只有
`-0.0145%` / `-0.0048%`，
低于预先用于结果解释的 1% materiality，也来自 post-hoc state routing；因此最终
仍判为 development fail，不支持模型升级。

## 模型

1. 仅用 origin 当时已有的分成正向现金月序列，将作品互斥分类为
   `active/stable/decline/dormant/revival`。
2. 正则化 logistic 估计
   (P(S_{w,o,h}>0mid lifecycle, history))，再按 lifecycle 做收缩校准。
3. 最终 raw amount 使用 frozen learnedGlobal 正收入点预测作为 offset，学习
   lifecycle 条件的收缩 log-revenue ratio；直接 Huber `log1p` 与 capped
   版本作为已保存的失败快速实验，不进入当前 raw 候选。
4. 冲销继续使用既有独立 reversal 层；最终
   `positive forecast - reversal forecast = net sales-share cash forecast`。

## 生命周期指标（36 个月主评估）

| lifecycle | case | challenger WAPE | baseline WAPE | 相对变化 | challenger bias |
|---|---:|---:|---:|---:|---:|
| active | 5232 | 0.63221236 | 0.63221236 | 0.00% | -0.36252109 |
| stable | 2018 | 0.26589552 | 0.26589552 | 0.00% | 0.05432565 |
| decline | 4726 | 0.59285067 | 0.59285067 | 0.00% | -0.10028806 |
| dormant | 48 | 1.00000000 | 1.00000000 | 0.00% | -1.00000000 |
| revival | 15 | 0.21483855 | 0.73854449 | -70.91% | -0.04959077 |

Occurrence Brier/log loss 为
`0.03478308 / 0.14933947`；
正金额条件 WAPE/log1p MAE 为
`0.51942521 / 1.28814575`。

## 高收入作品误差

| 累计作品层 | 作品数 | 正收入占比 | challenger WAPE | baseline WAPE | 相对变化 | challenger 绝对误差占比 |
|---|---:|---:|---:|---:|---:|---:|
| top 1% | 12 | 55.51% | 0.27338640 | 0.27338640 | 0.00% | 34.48% |
| top 5% | 57 | 83.70% | 0.36315427 | 0.36315427 | 0.00% | 69.06% |
| top 10% | 113 | 91.23% | 0.40183571 | 0.40183571 | 0.00% | 83.29% |

公开结果只保留聚合；逐作品 lifecycle、实际值和误差只写入 Git ignored private
evaluation artifact。

## exact v0.3 重叠


| case | raw lifecycle WAPE | selected WAPE | learnedGlobal WAPE | exact v0.3 WAPE | raw 相对 exact v0.3 |
|---:|---:|---:|---:|---:|---:|
| 5203 | 0.27458711 | 0.27723899 | 0.27723899 | 0.37610234 | -26.99% |

该 overlap 沿用 deterministic work fold，但 raw/selected 比较均处于同一
development 窗口，不是独立 later-origin；exact v0.3 点值没有进入 lifecycle
参数拟合或 state-routing 选择。

## 可复现记录

两个 experiment 都在 JSON 中保存了：

- `datasetVersion`
- `featureVersion`
- 完整 `modelConfig`
- primary 与 strict rolling 的 `evaluation`

公开 synthetic 入口不读取 private：

```bash
npm run diagnose:m2:lifecycle-aware
```

本机受控 development：

```bash
npm run doctor:capability -- m2-current-lifecycle-aware
npm run develop:m2:current:lifecycle-aware
```

## 边界

- 没有修改 production loader、route 或 forecast API。
- 没有打开 independent later-origin、final holdout、provider、数据库、Canary、
  full160、release 或 M3 formal。
- 当前业务状态继续为 `CANARY_FAIL` / `AUTOMATION_BLOCKED`。
