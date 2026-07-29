# M2 训练人口与损失权重审计 v0.1

> 实验：M2 核心老品—已有渠道范围纠偏、冻结重评分与尾部干扰验证 v0.1（M2 Core Legacy Work–Observed Channel Scope Correction, Frozen Rescore and Tail Interference Test v0.1，`M2-EXP-CORE-LEGACY-POPULATION-01`）
>
> 阶段状态：范围治理与训练语义审计已完成（`K0_SCOPE_GOVERNANCE_AND_TRAINING_SEMANTICS_AUDIT_COMPLETE`）。本阶段没有训练模型、修改冻结预测或读取最终留出集。

## 结论先行

当前 M2 目标已经在新合同中收敛为：预测起点时至少积累 3 个完整账单月的老作品，在同一起点时至少积累 3 个完整账单月的已有 canonical 渠道上，预测未来 3、6、12、36 个月开发可建模分成收入。

现有人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`）的训练入口使用全部可用作品，没有原生样本权重；因此“尾部在行数上占比高于金额占比”可以被审计，但它是否造成因果性干扰仍须由预注册的固定训练人口消融验证，不能在本阶段提前下结论。

## 当前范围

- 属于 M2：动态 Core80/Core90 老作品 × 起点已有成熟渠道 × 未来分成收入。
- 不属于 M2：未来新增作品、老作品未来首次进入的新渠道、Core 外尾部、买断及其他非分成现金、公司总收入补差。
- 不足 3 个完整月的作品或渠道是“不预测/弃权”，不是“预测为 0”。
- Core80/Core90 是训练、服务和评价人口筛选器，不是公司组合分量。

## 训练人口量化

| 动态人口 | 训练/评价行 | 行占比 | 独立作品 | 作品×渠道-origin 行 | actual 绝对金额占比 | 零收入月占比 | 训练损失贡献 | 绝对误差贡献 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 动态 Core80（`CORE80`） | 2493 | 2.89% | 105 | 5617 | 73.06% | 2.89% | 56.10% | 56.14% |
| 动态 Core80 至 Core90（`CORE80_TO_CORE90`） | 2979 | 3.45% | 216 | 5180 | 8.77% | 3.44% | 12.07% | 12.06% |
| 动态 Core90 以外尾部（`OUTSIDE_CORE90`） | 75832 | 87.81% | 2551 | 77110 | 11.95% | 12.81% | 18.58% | 18.58% |
| 起点不满足成熟资格（`INELIGIBLE_AT_ORIGIN`） | 5055 | 5.85% | 1512 | 0 | 6.22% | 5.56% | 13.26% | 13.22% |

动态 Core80 平均包含 44.46 部作品，动态 Core90 平均包含 97.13 部作品。参考窗平均覆盖率分别为 80.20% 与 90.05%。这些是起点可见参考窗覆盖，不是未来收入覆盖；未来正确分母覆盖率将在冻结重评分阶段单独计算。

## 现有作品模型训练语义

| 模型 | 真正训练 | 目标/损失 | 原生收入样本权重 | 冻结预测可重建性 |
|---|---|---|---|---|
| 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 是 | WAPE_and_bias_gated_factor_selection | 否 | WORK_TOTAL_ONLY_CHANNEL_DECOMPOSITION_UNAVAILABLE |
| 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 是 | positive_row_WAPE_plus_absolute_bias_and_prior_distance | 否 | AVAILABLE_FROM_FROZEN_ROWS_AND_FOLD_PARAMETERS |
| 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 否 | none_fixed_formula | 否 | AVAILABLE_FROM_FROZEN_FORMULA_AND_AUTHORITY |
| 人工锚定 TSB 发生模型（Human-Anchored TSB Occurrence，`M2-WORK-TSB01`） | 是 | nested_occurrence_and_point_error | 否 | FROZEN_ROWS_IDENTIFIABLE |
| 生命周期感知挑战模型 v0.1（Lifecycle-Aware Challenger v0.1，`M2-WORK-LC01`） | 是 | occurrence_and_log_amount_outer_development_score | 否 | FROZEN_ROWS_IDENTIFIABLE |

## 边界与解释

- 本表审计的是既有冻结训练/评价行的历史语义，未把历史 actual 改写成当前合同。
- 三级分类只用于报告诊断，没有进入 Core 资格或金额倍率。
- 分层收入组合模型 v0.1（Layered Revenue Composition Model v0.1，`M2-PORT-LRC01`）属于当前 M2 范围外组合研究（`OUT_OF_CURRENT_M2_SCOPE_PORTFOLIO_RESEARCH`），不得进入作品模型排名。
- 下一阶段只对可合法获得的冻结作品预测按正确人口重评分；无法重建的模型/粒度会明确标记不可比较（`NOT_COMPARABLE`），不会阻断其他模型。
