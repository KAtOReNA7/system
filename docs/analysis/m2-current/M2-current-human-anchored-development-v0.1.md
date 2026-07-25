# M2 人工锚定层级概率模型开发回测 v0.1

## 结论

本轮已经把人工主力/边缘渠道算法改造成唯一结构主干，并从全部 3053 部权威作品建立人口账本。2021—2025 年存在分成流水的作品为 2682 部；36 个月成熟开发集覆盖 1125 部独立作品和 12039 个作品×起点案例，没有固定抽取 300 本，也没有把重复案例冒充独立样本。

当前开发判定为 **HUMAN_ANCHORED_DEVELOPMENT_FAIL**，成熟度判定为
**M2_NOT_MATURE**。无论开发门禁是否通过，2021—2025
窗口内都没有可用于独立 later-origin 的 36 个月标签，因此本结果不能发布、
不能自动化，也不能表述为成熟 M2。

## 主要结果

| 口径 | WAPE | 偏差 |
|---|---:|---:|
| 人工规则原样回放 | 0.531410 | -0.405523 |
| 人工锚定模型（36个月、跨作品） | 0.440227 | -0.123666 |
| 严格 as-of 短周期辅助回测 | 0.454232 | 0.104759 |
| v0.3 精确重叠案例 | 0.376102 | 0.097273 |
| 新模型精确重叠案例 | 0.276833 | -0.121505 |

相对人工规则的 36 个月 WAPE 变化为 -17.16%；相对 v0.3 精确重叠案例的 WAPE 变化为 -26.39%。按独立作品聚类 bootstrap 的相对人工规则 95% 区间为 [-38.40%, 5.36%]。
中央 80% 区间覆盖率为 80.09%。

全体作品外 development 层选择中，层级专家接受状态为
`false`，发生/冲销层接受状态为
`false`。未通过的原始层会
回退上一层；FVA 的 0 表示安全回退，不表示该原始层获得了独立成功证据。

## 逐层 FVA

| 层级 | WAPE 绝对改善 | WAPE 相对改善 |
|---|---:|---:|
| manualFaithful → learnedGlobal | 0.091183 | 17.16% |
| learnedGlobal → hierarchicalPositive | 0.000000 | 0.00% |
| hierarchicalPositive → occurrenceAndReversal | 0.000000 | 0.00% |

模型层级固定为：人工原式 → 可学习人工参数 → 四个受约束专家 →
发生概率与冲销 → 分位数/区间。任何层表现变差都会在 FVA 中暴露，不得用
“新模型数量”代替证据。

## 数据与时序边界

- 现金目标只有未来分成收入；买断现金未进入历史特征、标签或指标。
- 正向收入与负数冲销分别建账，最终满足“正向－冲销＝分成净现金”。
- 现金金额只使用 2021-01 至 2025-12；2023—2025 只在对应短周期标签已成熟时使用。
- 36 个月主评估是五折按作品分组的开发回测，不是 later-origin 时序验证。
- 短周期辅助回测的每个 outer origin 只读取当时已经成熟的更早标签。
- 渠道统一关系和类型来自人工表，但生效年月覆盖仍为 0%，所以它们只能支持
  当前 development；三级分类只作分层报告，不参与预测。
- private 行、作品 ID 和渠道 ID 未公开；provider、数据库、final holdout、
  Canary、release 和 M3 formal 均未打开。

## 门禁

| 门禁 | 状态 |
|---|---|
| modernWindowAndPopulationExpanded | 通过 |
| mappingAndCashConservation | 通过 |
| noImmatureZeroImputation | 通过 |
| primaryAbsoluteWape | 未通过 |
| primaryAbsoluteBias | 未通过 |
| relativeImprovementToManual | 通过 |
| relativeImprovementToV03OnExactOverlap | 通过 |
| majorSegmentBias | 未通过 |
| central80Coverage | 通过 |
| eachLayerFvaNonnegative | 通过 |
| workClusterBootstrapRelativeManualUpperBelowZero | 未通过 |
| independentLaterOrigin | 未通过 |

独立 later-origin 是成熟度的硬门禁。代码合入 main 只表示实现和公共可复现边界
完成，不等于模型发布。
