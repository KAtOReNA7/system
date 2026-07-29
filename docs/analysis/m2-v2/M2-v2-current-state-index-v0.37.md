# M2 当前状态索引 v0.37

截至 2026-07-29，核心收入人工规则基线 v0.1
（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`）已完成首个且唯一的
真实账单滚动开发评价。合同结论为失败
（`M2_CORE_REVENUE_MANUAL_BASELINE_FAIL`）：3/6 个月存在局部改善，但无截断长期
系数在 36 个月产生明显复合爆炸，不能形成稳定整体结论。

这是一项开发窗口证据，不是训练、调参、选模或生产晋升。现行运行回退、研究比较
基线、活动候选、自动化和 production 均未改变。

## 执行与判定重述

- 评价执行 HEAD：`6b4180cef65565aef414a0398abb4e79b0d242eb`。
- 执行分支：`codex/m2-core-revenue-manual-v0-1`。
- Draft PR：[#32](https://github.com/KAtOReNA7/system/pull/32)，执行时为
  Open/Unmerged。
- 精确 HEAD CI：GitHub Actions run `30431490179`，Linux `verify` 与 Windows
  `verify-windows` 均成功。
- 合法月度预测起点：70 个，范围 2017-08 至 2023-05；标签成熟截止月为
  2026-05。
- 首个有效执行的原始私有 receipt/manifest 自动状态为
  `M2_CORE_REVENUE_MANUAL_BASELINE_MIXED`。验证发现旧门禁只把非有限数视为长期
  失控，漏用了合同中“长期复合预测明显失控则失败”的优先规则。
- 原始私有 receipt/manifest 保持不变；公开机器结果和本状态索引把合同结论重述为
  `M2_CORE_REVENUE_MANUAL_BASELINE_FAIL`。没有重跑或修改候选预测、公式、参数、
  指标或 2,000 次作品聚类 bootstrap。

## 权威、冲销与人口守恒

- 分成账权威行：190,663；作品：2,719；canonical 渠道：39；冲销行：143。
- actual：分成收入开发可建模冲销重述 v1
  （`M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01`）。
- 冲销重述整数守恒差为 0；原始冲销删除数为 0；已分配冲销成分保留；没有整案
  删除。
- 无法归属的冲销残差只从开发可建模目标透明隔离，金额为 -267.769；它仍保留在
  财务对账视图。
- forecast origin 之后才可见的冲销没有进入特征，未来特征泄漏数为 0。
- 候选作品×渠道×horizon 行 61,164；年度组件行 45,873；作品聚合评价行
  17,616；组合行 1,120。
- 公开 artifact 不含作品或渠道行级身份；平台切片匿名化，并执行最少 30 cases、
  20 works、5 portfolio origins 的公开阈值。

## 核心人口与未来现金捕获

| 起点人口 | 平均选择作品数 | 未来作品选择捕获率 | 正式可服务渠道捕获率 |
|---|---:|---:|---:|
| Core80 | 21.74 | 42.66% | 37.71% |
| Core90 | 42.07 | 48.48% | 42.29% |
| 起点 Top20 | 17.09 | 37.12% | 不适用 |
| 起点 Top50 | 40.81 | 47.17% | 不适用 |

未来 oracle 的平均捕获率为 Top20 61.18%、Top50 78.73%。因此起点收入排序能在
短期覆盖主要现金，但随 horizon 延长明显衰减，并不能稳定识别未来头部。

## 冻结候选的绝对成绩

| 人口 | 3 月 WAPE / bias | 6 月 WAPE / bias | 12 月 WAPE / bias | 36 月 WAPE / bias |
|---|---:|---:|---:|---:|
| Core80 | 0.3715 / 0.0853 | 0.4111 / 0.0791 | 0.4583 / 0.1302 | 113.4277 / 113.1478 |
| Core90 | 0.3908 / 0.0656 | 0.4402 / 0.0543 | 0.4848 / 0.1202 | 104.3795 / 104.0569 |

年度组件显示相同故障：Core80 的 Y1/Y2/Y3 WAPE 为 0.5254、3.5041、435.8223；
Core90 为 0.5537、3.1770、418.7362。整体 WAPE 被 36 个月爆炸主导，不能用来
掩盖各 horizon 的不同表现。

## 与冻结比较模型的同案例结果

| 人口 | 冻结比较模型 | Primary 候选 / 基线 WAPE | Primary 相对 FVA | Strict 候选 / 基线 WAPE | Strict 相对 FVA |
|---|---|---:|---:|---:|---:|
| Core80 | 研究比较基线 `M2-WORK-LG01` | 17.1645 / 0.3036 | -5553.30% | 1.5980 / 0.1424 | -1022.20% |
| Core90 | 研究比较基线 `M2-WORK-LG01` | 9.7938 / 0.3401 | -2780.01% | 1.6988 / 0.1654 | -926.99% |
| Core80 | 现行运行回退 `M2-WORK-OA03` | 0.3470 / 0.2967 | -16.96% | 0.1330 / 0.1170 | -13.72% |
| Core90 | 现行运行回退 `M2-WORK-OA03` | 0.3808 / 0.3488 | -9.18% | 0.1894 / 0.1845 | -2.64% |

核心收入人工规则在两个核心人口的 Primary 与 Strict 上均未超过冻结研究比较基线。
相对现行运行回退，3/6 月个别 same-case 切片有至少 1% WAPE 改善，但 bias 恶化，
12 月失败，且该比较模型没有可比 36 月行。这些局部结果只支持诊断，不支持模型
胜出或晋升。

## 长期系数、分类回退与长尾

- Core80 的 k 中位数为 1、P99 为 15.9253、最大值为 634.2886；Core90 的 k
  中位数为 1、P99 为 49.6911、最大值同为 634.2886。
- P1/P99 极端 k 行贡献了 Core80 94.66%、Core90 93.82% 的 F36 绝对误差。
- 冻结 F36 的 WAPE / absolute bias 为 Core80 124.2511 / 123.9553、Core90
  115.6798 / 115.3411；同案 `k=1` 反事实 WAPE 仅为 0.6601 / 0.7212。
- 同渠道×二级分类回退相对只用同渠道回退的绝对误差“改善”为 Core80
  -214.81%、Core90 -56.77%，没有真实增量。
- 长尾池改善了 3/6/12 月组合 WAPE；例如 Core90 从 0.2638/0.3057/0.3682
  降至 0.2034/0.2360/0.3074。但 36 月仍由长期复合爆炸主导，Core90 从
  39.8677 变为 39.8868，没有整体修复。

## 当前角色与封闭边界

- 现行运行回退模型：作品发生—金额校准模型 v0.3
  （Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）。
- 研究比较基线：人工锚定可学习全局模型
  （Human-Anchored Learned Global，`M2-WORK-LG01`）。
- 本轮失败开发候选：核心收入人工规则基线 v0.1（`M2-WORK-CRMR01`）。
- 组合级参考：组合现金 ETS/Holt-Winters（`M2-PORT-ETS01`）。
- 活动候选：无（`activeCandidate=null`）。
- 自动化批准：无（`approvedForAutomation=null`）。

本轮没有训练、调参、选模、final holdout、later-origin、provider、数据库、
Canary/full160、production、release 或 M3 formal。没有修改或替换
`M2-WORK-OA03` 与 `M2-WORK-LG01` 的公式、参数或角色，也不授权自动进入下一
算法方向。

## 当前权威入口

- 机器模型权威：`config/m2-model-registry.v1.json`
- 评价合同：`config/m2-evaluation-contract.v2.2.json`
- 冻结人工规则合同：`config/m2-current-core-revenue-manual.v0.1.json`
- 开发评价机器结果：
  `docs/analysis/m2-current/M2-core-revenue-manual-development-v0.1.json`
- 中文优先开发评价报告：
  `docs/analysis/m2-current/M2-core-revenue-manual-development-v0.1.md`
