<!-- 由 config/m2-model-registry.v1.json 确定性生成；请勿手工改写成绩或角色。 -->
# M2 模型目录与成绩总账 v1

本目录是模型登记表（Model Registry）的中文阅读视图。唯一当前机器权威仍是
`config/m2-model-registry.v1.json`；本文件不授予训练、自动化、生产或发布权限。

## 当前角色

- 现行运行回退模型（operational fallback）：作品发生-金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）。
- 研究比较基线（research baseline）：人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`）。
- 组合级参考（portfolio reference）：组合现金 ETS/Holt-Winters 模型（Portfolio ETS/Holt-Winters，`M2-PORT-ETS01`）。
- 活动候选（active candidate）：无（`null`）。
- 自动化批准模型（approved for automation）：无（`null`）。
- 当前阻断实验：出版行业规模适配渠道核心开发
  （`M2-EXP-PUBLISHING-SCALE-CHANNEL-01`）；私有物化已启动，但在候选拟合前因实现
  接线错误 fail-closed，没有形成候选结果。

## 持久模型与模型族

| 能力 | 类型 | 中文名称（英文原名、稳定 ID） | 旧 ID / 别名 | 当前角色（机器状态） | 谱系 |
|---|---|---|---|---|---|
| 作品点预测（WORK） | 模型（model） | 旧现金生命周期公式（Legacy Cash Lifecycle Formula，`M2-WORK-B4`） | `B4`、`B4 formula`、`B4 comparator` | 仅作比较（`comparator_only`） | 无前序；后续 `M2-WORK-SEG01`、`M2-WORK-HRC02`、`M2-WORK-OA03` |
| 作品点预测（WORK） | 模型（model） | 作品分群向下校准模型 v0.1（Segmented Downward Calibration v0.1，`M2-WORK-SEG01`） | `M2-current-segmented-downward-calibration-v0.1`、`current v0.1`、`segmented calibration` | 已拒绝开发候选（`rejected_development_candidate`） | 前序 `M2-WORK-B4`；后续 `M2-WORK-HRC02` |
| 作品点预测（WORK） | 模型（model） | 作品层级稳健校准模型 v0.2（Hierarchical Robust Calibration v0.2，`M2-WORK-HRC02`） | `M2-current-hierarchical-robust-calibration-v0.2`、`current v0.2`、`reliable candidate v0.2` | 已拒绝开发候选（`rejected_development_candidate`） | 前序 `M2-WORK-SEG01`；后续 `M2-WORK-OA03` |
| 作品点预测（WORK） | 模型（model） | 作品发生-金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | `M2-current-occurrence-amount-calibration-v0.3`、`exact v0.3`、`exact-v0.3`、`current v0.3` | 现行运行回退（`operational_work_fallback`） | 前序 `M2-WORK-HRC02`；无后续 |
| 作品点预测（WORK） | 模型（model） | 全局门槛广义线性模型（Global Regularized Hurdle GLM，`M2-WORK-GHG01`） | `regularized_hurdle_glm`、`global hurdle GLM`、`hurdle GLM` | 已执行失败研究候选（`failed_research_candidate`） | 前序 `M2-WORK-OA03`；后续 `M2-WORK-GDE04` |
| 作品点预测（WORK） | 模型（model） | 全局 Tweedie 提升树桩模型（Tweedie Boosted Stumps，`M2-WORK-TWD01`） | `tweedie_gradient_boosted_stumps`、`Tweedie boosted stumps`、`Tweedie boosting` | 已执行失败研究候选（`failed_research_candidate`） | 前序 `M2-WORK-OA03`；后续 `M2-WORK-GDE04` |
| 作品点预测（WORK） | 模型（model） | 门槛梯度提升树桩模型（Hurdle Gradient-Boosted Stumps，`M2-WORK-HGB01`） | `hurdle_gradient_boosted_stumps`、`hurdle GBM`、`hurdle boosted stumps` | 已执行失败研究候选（`failed_research_candidate`） | 前序 `M2-WORK-OA03`；后续 `M2-WORK-GDE04` |
| 作品点预测（WORK） | 选定管线（model_pipeline） | 全局分布组合安全回退管线 v0.4（Global Distributional Ensemble Safe-Fallback Pipeline v0.4，`M2-WORK-GDE04`） | `M2-current-global-distributional-ensemble-v0.4`、`current v0.4`、`global distributional ensemble` | 已拒绝且安全回退的管线（`rejected_pipeline_safe_fallback`） | 前序 `M2-WORK-OA03`、`M2-WORK-GHG01`、`M2-WORK-TWD01`、`M2-WORK-HGB01`；无后续 |
| 组合预测（PORT） | 模型（model） | 组合现金 ETS/Holt-Winters 模型（Portfolio ETS/Holt-Winters，`M2-PORT-ETS01`） | `as_of_aggregate_additive_holt_winters_ensemble`、`M2-current-multi-resolution-revenue-service-v0.5`、`portfolio ETS`、`portfolio Holt-Winters`、`v0.5 portfolio` | 组合级参考（`portfolio_reference`） | 无前序；无后续 |
| 研究基线族（BASE） | 模型族（model_family） | 经典时间序列比较基线族（Classic Time-Series Baseline Family，`M2-BASE-CLASSIC01`） | `zero`、`seasonal_naive`、`Croston`、`SBA`、`TSB`、`ADIDA`、`recent_mean_3`、`seasonal_median_2`、`ewma_0_5`、`simple baselines`、`classic intermittent baselines` | 回归比较基线族（`regression_baseline_family`） | 无前序；无后续 |
| 作品点预测（WORK） | 模型（model） | 历史状态校准模型（Historical-State Calibration，`M2-WORK-HSC01`） | `M2-current-history-regime-recalibration-v0.7`、`real-bill recalibration`、`history regime v0.7` | 已拒绝后验诊断（`rejected_posthoc_diagnostic`） | 前序 `M2-BASE-CLASSIC01`；无后续 |
| 作品点预测（WORK） | 模型（model） | 人工渠道规则模型（Manual Channel Rule，`M2-WORK-MCR01`） | `M2-current-manual-channel-prior-v0.8`、`manualFaithful_v0.8`、`manual channel v0.8`、`manual channel rule` | 已拒绝比较模型（`rejected_comparator`） | 无前序；后续 `M2-WORK-MAN01`、`M2-WORK-LG01` |
| 作品点预测（WORK） | 模型（model） | 统一渠道曲线模型（Canonical Channel Curve，`M2-WORK-CCR01`） | `M2-current-canonical-channel-hierarchical-v0.9`、`canonical channel v0.9`、`canonical channel curve` | 已拒绝开发候选（`rejected_development_candidate`） | 前序 `M2-WORK-OA03`；后续 `M2-CHAN-SCL01` |
| 作品点预测（WORK） | 模型（model） | 人工锚定忠实公式（Human-Anchored Manual-Faithful Formula，`M2-WORK-MAN01`） | `manualFaithful`、`manual faithful`、`human anchored manual` | 人工公式比较模型（`human_formula_comparator`） | 前序 `M2-WORK-MCR01`；后续 `M2-WORK-LG01` |
| 作品点预测（WORK） | 模型（model） | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | `core revenue manual rule`、`core-revenue manual baseline` | 登记角色（`preregistered_development_candidate`） | 前序 `M2-WORK-MAN01`；无后续 |
| 作品点预测（WORK） | 模型（model） | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | `learnedGlobal`、`learnedGlobal + common reversal`、`frozen_learnedGlobal_plus_common_reversal`、`learned global`、`learnedGlobal common reversal`、`G0 frozen baseline` | 研究比较基线（`research_work_baseline`） | 前序 `M2-WORK-MAN01`；后续 `M2-WORK-HP01`、`M2-WORK-OR01`、`M2-WORK-TSB01`、`M2-WORK-LC01`、`M2-CHAN-SCL01`、`M2-CHAN-GEN02` |
| 作品点预测（WORK） | 模型（model） | 人工锚定层级正金额专家模型（Human-Anchored Hierarchical Positive-Amount Experts，`M2-WORK-HP01`） | `hierarchicalPositive`、`four experts`、`hierarchical positive` | 已拒绝嵌套层（`rejected_nested_layer`） | 前序 `M2-WORK-LG01`；后续 `M2-WORK-OR01` |
| 作品点预测（WORK） | 模型（model） | 人工锚定发生与冲销模型（Human-Anchored Occurrence and Reversal，`M2-WORK-OR01`） | `occurrenceAndReversal`、`occurrence reversal layer`、`human anchored occurrence and reversal` | 已拒绝嵌套层（`rejected_nested_layer`） | 前序 `M2-WORK-HP01`；后续 `M2-WORK-TSB01` |
| 作品点预测（WORK） | 模型（model） | TSB 间歇发生模型（TSB Occurrence Model，`M2-WORK-TSB01`） | `raw TSB`、`M2-current-human-anchored-tsb-occurrence-challenger-v0.1/raw`、`raw tsb occurrence`、`TSB occurrence raw` | 已执行失败候选（`failed_development_candidate`） | 前序 `M2-WORK-LG01`；后续 `M2-WORK-TSBB01` |
| 作品点预测（WORK） | 模型（model） | TSB 与全局模型混合候选（TSB and Learned-Global Blend，`M2-WORK-TSBB01`） | `TSB blend`、`M2-current-human-anchored-tsb-occurrence-challenger-v0.1/blend`、`blend candidate` | 已执行失败候选（`failed_development_candidate`） | 前序 `M2-WORK-TSB01`、`M2-WORK-LG01`；无后续 |
| 作品点预测（WORK） | 模型（model） | 生命周期五状态模型（Lifecycle-Aware Five-State Model，`M2-WORK-LC01`） | `M2-lifecycle-aware-revenue-forecast-challenger-v0.1`、`lifecycle-aware v0.1`、`five-state lifecycle` | 已执行失败候选（`failed_development_candidate`） | 前序 `M2-WORK-LG01`；无后续 |
| 渠道预测（CHAN） | 模型（model） | 渠道倍率专家模型（Channel Scalar Experts v0.1，`M2-CHAN-SCL01`） | `M2-current-channel-mechanism-hierarchical-challenger-v0.1`、`channelExperts v0.1`、`channel scalar experts` | 已执行失败渠道模型（`failed_channel_development_model`） | 前序 `M2-WORK-LG01`；后续 `M2-CHAN-GEN02` |
| 渠道预测（CHAN） | 模型族（model_family） | 渠道时间生成模型 v0.2——独立渠道月度发生—条件金额核心（Channel Generative v0.2 — Independent Monthly Occurrence × Conditional Amount Core，`M2-CHAN-GEN02`） | `M2-current-channel-generative-v0.2`、`channelGenerative v0.2`、`channel generative core` | 阻断且无候选结果（`blocked_model_family_no_candidate_outcome`） | 前序 `M2-WORK-LG01`、`M2-CHAN-SCL01`；后续 `M2-CHAN-PSC01` |
| 渠道预测（CHAN） | 登记实体（model_revision） | 出版行业适配的渠道月度发生—条件金额核心（Publishing-Scale Channel Monthly Occurrence × Conditional Amount Core，`M2-CHAN-PSC01`） | `M2-current-publishing-scale-channel-v0.1`、`publishing-scale channel core`、`publishing scale occurrence amount core` | 实现阻断且无候选结果（`implementation_blocked_no_candidate_outcome`） | 前序 `M2-CHAN-GEN02`；无后续 |
| 作品点预测（WORK） | 模型（model） | C1 透明组合模型（C1 Transparent Ensemble，`M2-WORK-C1TE01`） | `C1`、`C1 transparent ensemble` | 仅历史审计且已失败（`archive_only_failed_model`） | 前序 `M2-WORK-B4`；无后续 |
| 作品点预测（WORK） | 模型（model） | 旧买断收入路由模型（Legacy C2-R Revenue Route，`M2-WORK-C2R01`） | `legacy C2-R`、`C2-R`、`legacy C2R` | 仅历史审计且已失败（`archive_only_failed_model`） | 无前序；后续 `M2-WORK-C2R101` |
| 作品点预测（WORK） | 模型（model） | 正式现金路由分治模型（Formal-Cash Route-Specific Model C2-R.1，`M2-WORK-C2R101`） | `C2-R.1`、`C2R1`、`formal cash C2R1` | 仅历史审计且已失败（`archive_only_failed_model`） | 前序 `M2-WORK-C2R01`；后续 `M2-WORK-C2IM01` |
| 作品点预测（WORK） | 模型（model） | C2 活跃度与间歇模型组合（C2 Activity and Intermittent Model Mix，`M2-WORK-C2IM01`） | `C2`、`C2 intermittent mix` | 仅历史审计且已失败（`archive_only_failed_model`） | 前序 `M2-WORK-C2R101`；后续 `M2-WORK-C3IR01` |
| 作品点预测（WORK） | 模型（model） | C3 内部特征残差校正模型（C3 Internal-Feature Residual Correction，`M2-WORK-C3IR01`） | `C3`、`C3-A`、`C3 residual`、`C3 internal features` | 仅历史审计且已失败（`archive_only_failed_model`） | 前序 `M2-WORK-C2IM01`；无后续 |

## 实验、实验臂与检查点

实验 ID 只组织评价活动；实验臂、消融和检查点不是新的模型身份。

| 实验（英文原名、稳定 ID） | 已登记实验臂（完整作用域、机器状态） |
|---|---|
| 作品分群校准 v0.1（Current Segmented Calibration v0.1，`M2-EXP-CURRENT-CALIBRATION-01`） | 旧公式比较臂 / B4（`M2-EXP-CURRENT-CALIBRATION-01/B4`；`EXECUTED`）；分群校准候选臂 / SEG01（`M2-EXP-CURRENT-CALIBRATION-01/SEG01`；`EXECUTED_REJECTED`） |
| R0–R5 多层评价与全局候选活动（R0-R5 Evaluation and Global Candidate Campaign，`M2-EXP-R0-R5-01`） | 目标与数据合同阶段 / R0（`M2-EXP-R0-R5-01/R0`；`EXECUTED`）；评价器阶段 / R1（`M2-EXP-R0-R5-01/R1`；`EXECUTED`）；强基线阶段 / R2（`M2-EXP-R0-R5-01/R2`；`EXECUTED`）；复合候选阶段 / R3（`M2-EXP-R0-R5-01/R3`；`EXECUTED_ALL_CANDIDATES_REJECTED`）；概率与层级协调阶段 / R4（`M2-EXP-R0-R5-01/R4`；`EXECUTED_REJECTED`）；风险覆盖、业务损失与 FVA 阶段 / R5（`M2-EXP-R0-R5-01/R5`；`EXECUTED`） |
| 组合现金 ETS/Holt-Winters 复验（Portfolio ETS/Holt-Winters Evaluation，`M2-EXP-PORTFOLIO-ETS-01`） | 组合 ETS/Holt-Winters 候选 / ETS（`M2-EXP-PORTFOLIO-ETS-01/ETS`；`EXECUTED_GATE_FAIL`）；组合季节朴素比较臂 / SNAIVE（`M2-EXP-PORTFOLIO-ETS-01/SNAIVE`；`EXECUTED`） |
| 历史状态后验校准（Historical-Regime Post-hoc Calibration，`M2-EXP-HISTORY-REGIME-01`） | 历史状态候选 / HSC（`M2-EXP-HISTORY-REGIME-01/HSC`；`EXECUTED_REJECTED`） |
| 人工渠道规则比较（Manual Channel Rule Comparator，`M2-EXP-MANUAL-CHANNEL-01`） | 人工渠道忠实规则 / MANUAL（`M2-EXP-MANUAL-CHANNEL-01/MANUAL`；`EXECUTED_REJECTED`） |
| 统一渠道曲线候选（Canonical Channel Curve Challenger，`M2-EXP-CANONICAL-CHANNEL-01`） | exact v0.3 比较臂 / BASE（`M2-EXP-CANONICAL-CHANNEL-01/BASE`；`EXECUTED`）；统一渠道曲线候选臂 / CCR（`M2-EXP-CANONICAL-CHANNEL-01/CCR`；`EXECUTED_REJECTED`） |
| 人工锚定层级概率开发（Human-Anchored Hierarchical Probabilistic Development，`M2-EXP-HUMAN-ANCHORED-10`） | 人工忠实公式 / MANUAL（`M2-EXP-HUMAN-ANCHORED-10/MANUAL`；`EXECUTED`）；可学习全局模型 / GLOBAL（`M2-EXP-HUMAN-ANCHORED-10/GLOBAL`；`EXECUTED_RETAINED_AS_RESEARCH_BASELINE`）；层级正金额专家 / HIERARCHY（`M2-EXP-HUMAN-ANCHORED-10/HIERARCHY`；`EXECUTED_REJECTED`）；发生与冲销候选 / OCCURRENCE（`M2-EXP-HUMAN-ANCHORED-10/OCCURRENCE`；`EXECUTED_REJECTED`） |
| 核心收入人工规则基线开发评价（Core-Revenue Manual Rule Baseline Development Evaluation，`M2-EXP-CORE-REVENUE-MANUAL-01`） | 核心收入人工规则原始候选 / MANUAL_RULE（`M2-EXP-CORE-REVENUE-MANUAL-01/MANUAL_RULE`；`PUBLIC_CONTRACT_PREREGISTERED_PRIVATE_EVALUATION_NOT_EXECUTED`）；冻结人工锚定可学习全局比较基线 / RESEARCH_BASELINE（`M2-EXP-CORE-REVENUE-MANUAL-01/RESEARCH_BASELINE`；`FROZEN_COMPARATOR_NOT_REEXECUTED`）；冻结作品发生—金额运行回退比较基线 / OPERATIONAL_FALLBACK（`M2-EXP-CORE-REVENUE-MANUAL-01/OPERATIONAL_FALLBACK`；`FROZEN_COMPARATOR_NOT_REEXECUTED`） |
| TSB 间歇发生候选（TSB Occurrence Challenger，`M2-EXP-TSB-OCCURRENCE-01`） | 冻结 learnedGlobal 比较臂 / BASE（`M2-EXP-TSB-OCCURRENCE-01/BASE`；`EXECUTED`）；原始 TSB 候选 / RAW（`M2-EXP-TSB-OCCURRENCE-01/RAW`；`EXECUTED_FAILED`）；TSB 混合候选 / BLEND（`M2-EXP-TSB-OCCURRENCE-01/BLEND`；`EXECUTED_FAILED`） |
| 生命周期五状态候选（Lifecycle-Aware Five-State Challenger，`M2-EXP-LIFECYCLE-AWARE-01`） | 冻结 learnedGlobal 比较臂 / BASE（`M2-EXP-LIFECYCLE-AWARE-01/BASE`；`EXECUTED`）；五状态原始候选 / RAW（`M2-EXP-LIFECYCLE-AWARE-01/RAW`；`EXECUTED_FAILED`）；仅复苏状态后验诊断 / REVIVAL_ONLY（`M2-EXP-LIFECYCLE-AWARE-01/REVIVAL_ONLY`；`EXECUTED_TRIVIAL_POSTHOC_GAIN`） |
| 渠道倍率专家 v0.1（Channel Scalar Experts v0.1，`M2-EXP-CHANNEL-EXPERTS-01`） | learnedGlobal 作品基线 / A0（`M2-EXP-CHANNEL-EXPERTS-01/A0`；`EXECUTED`）；渠道守恒分解重组 / A1（`M2-EXP-CHANNEL-EXPERTS-01/A1`；`EXECUTED_EQUIVALENT`）；原始机制倍率专家 / A2（`M2-EXP-CHANNEL-EXPERTS-01/A2`；`EXECUTED`）；机制校准倍率专家 / A3（`M2-EXP-CHANNEL-EXPERTS-01/A3`；`EXECUTED`）；五平台部分池化 / A4（`M2-EXP-CHANNEL-EXPERTS-01/A4`；`EXECUTED`）；平台与内在品类 taxonomy 倍率 / A5（`M2-EXP-CHANNEL-EXPERTS-01/A5`；`EXECUTED_FAILED`）；nested 层级 shrinkage 选择 / A6（`M2-EXP-CHANNEL-EXPERTS-01/A6`；`EXECUTED_FAILED`） |
| 渠道时间生成 v0.2（Channel Generative v0.2，`M2-EXP-CHANNEL-GENERATIVE-02`） | 冻结 learnedGlobal 渠道基线 / G0（`M2-EXP-CHANNEL-GENERATIVE-02/G0`；`SEMANTIC_EQUIVALENCE_PASS_COMPARATOR_ONLY`）；独立渠道发生-条件金额生成器 / G1（`M2-EXP-CHANNEL-GENERATIVE-02/G1`；`EXECUTION_STARTED_BLOCKED_INNER_ELIGIBILITY_NO_CANDIDATE_OUTCOME`）；带层级收缩的渠道生成器 / G2（`M2-EXP-CHANNEL-GENERATIVE-02/G2`；`NOT_EXECUTED_NOT_AUTHORIZED`）；预注册核心选择管线 / G3（`M2-EXP-CHANNEL-GENERATIVE-02/G3`；`NOT_EXECUTED_NOT_AUTHORIZED`）；平台层 / G4（`M2-EXP-CHANNEL-GENERATIVE-02/G4`；`NOT_AUTHORIZED`）；taxonomy 层 / G5（`M2-EXP-CHANNEL-GENERATIVE-02/G5`；`NOT_AUTHORIZED`）；组合层 / G6（`M2-EXP-CHANNEL-GENERATIVE-02/G6`；`NOT_AUTHORIZED`） |
| 出版行业规模适配渠道核心开发（Publishing-Scale Channel Core Development，`M2-EXP-PUBLISHING-SCALE-CHANNEL-01`） | 历史渠道时间生成核心审计参照 / HISTORICAL_REFERENCE（`M2-EXP-PUBLISHING-SCALE-CHANNEL-01/HISTORICAL_REFERENCE`；`HISTORICAL_BLOCKED_REFERENCE_ONLY`）；出版行业适配的渠道月度发生—条件金额核心 / CORE（`M2-EXP-PUBLISHING-SCALE-CHANNEL-01/CORE`；`PRIVATE_MATERIALIZATION_FAILED_CLOSED_BEFORE_CANDIDATE_FIT_NO_RETRY_AUTHORIZED`） |
| C1–C3 历史冻结开发活动（Archived C1-C3 Development Campaign，`M2-EXP-ARCHIVE-C1-C3`） | 透明组合开发 / C1（`M2-EXP-ARCHIVE-C1-C3/C1`；`ARCHIVE_DEVELOPMENT_FAIL`）；旧买断收入路由 / C2-R（`M2-EXP-ARCHIVE-C1-C3/C2-R`；`ARCHIVE_DEVELOPMENT_FAIL`）；正式现金路由分治 / C2-R.1（`M2-EXP-ARCHIVE-C1-C3/C2-R.1`；`ARCHIVE_DEVELOPMENT_FAIL`）；活跃度与间歇模型组合 / C2（`M2-EXP-ARCHIVE-C1-C3/C2`；`ARCHIVE_DEVELOPMENT_FAIL`）；内部特征残差校正 / C3（`M2-EXP-ARCHIVE-C1-C3/C3`；`ARCHIVE_DEVELOPMENT_FAIL`） |

## 成绩人口与可比组

成绩只在同一可比组内解释；不同目标、现金权威、人口、horizon、粒度、
as-of/label maturity、实际值定义或评价族不得直接排名。

| 可比组 | 可比等级（机器状态） | 目标 / 现金权威 | 人口 / 粒度 / horizon | as-of / actual / 评价族 |
|---|---|---|---|---|
| `CG-WORK-SS-CURRENT-7083` | 同案例可比（`SAME_CASE_COMPARABLE`） | `future_sales_share_cash` / `user_reviewed_sales_share_workbook_membership` | `current-human-authority-served-758w-7083c` / `work_origin_horizon` / 3、6、12、18、24 | `frozen_sparse_origins` / `sales_share_cash_actual_only` / `current_served_sparse` |
| `CG-WORK-FORMAL-LEGACY-7851` | 复用开发窗口（`REUSED_DEVELOPMENT_WINDOW`） | `future_bill_cash` / `formal_cash_pre_manual_partition` | `legacy-machine-route-824w-7851c` / `work_origin_horizon` / 3、6、12、18、24 | `legacy_frozen_outer_origins` / `formal_cash_actual_pre_manual_partition` / `current_calibration_legacy` |
| `CG-WORK-R0R5-GLOBAL-7851` | 复用开发窗口（`REUSED_DEVELOPMENT_WINDOW`） | `future_bill_cash` / `formal_cash_pre_manual_partition` | `legacy-machine-route-824w-7851c` / `work_origin_horizon` / 3、6、12、18、24 | `strictly_earlier_nested_selection` / `formal_cash_actual_pre_manual_partition` / `R0_R5_global_candidates` |
| `CG-PORT-SS-30CELLS` | 粒度不同，不可直接比较（`DIFFERENT_GRAIN_NOT_COMPARABLE`） | `future_sales_share_cash` / `user_reviewed_sales_share_workbook_membership` | `portfolio-12origins-30cells` / `portfolio_origin_horizon` / 3、6、12 | `portfolio_earlier_origin_selection` / `aggregated_sales_share_cash_actual` / `portfolio_reconstruction` |
| `CG-WORK-SS-DENSE-44301` | 复用开发窗口（`REUSED_DEVELOPMENT_WINDOW`） | `future_sales_share_cash` / `user_reviewed_sales_share_workbook_membership` | `dense-monthly-824w-44301c` / `work_origin_horizon` / 3、6、12 | `25_monthly_origins_label_mature` / `sales_share_cash_actual_only` / `dense_monthly_diagnostic` |
| `CG-WORK-SS-MANUAL-379-H36` | 仅独立展示（`STANDALONE_ONLY`） | `future_sales_share_cash` / `user_reviewed_sales_share_workbook_membership` | `manual-channel-safe-214w-379c` / `work_origin_horizon` / 36 | `three_safe_origins` / `sales_share_cash_actual_only` / `manual_channel_comparator` |
| `CG-WORK-SS-HA-PRIMARY-12039-H36` | 复用开发窗口（`REUSED_DEVELOPMENT_WINDOW`） | `future_sales_share_cash` / `user_reviewed_sales_share_workbook_membership` | `human-anchored-primary-1125w-12039c` / `work_origin_horizon` / 36 | `cross_work_outer_folds_2021_2025` / `sales_share_cash_actual_only` / `human_anchored_primary` |
| `CG-WORK-SS-HA-STRICT-74320` | 复用开发窗口（`REUSED_DEVELOPMENT_WINDOW`） | `future_sales_share_cash` / `user_reviewed_sales_share_workbook_membership` | `human-anchored-strict-2650w-74320c` / `work_origin_horizon` / 3、6、12、18、24 | `strict_rolling_mature_earlier_labels` / `sales_share_cash_actual_only` / `human_anchored_strict` |
| `CG-WORK-SS-OVERLAP-5203-H36` | 仅相同案例交集可比（`SAME_INTERSECTION_COMPARABLE`） | `future_sales_share_cash` / `user_reviewed_sales_share_workbook_membership` | `human-anchored-exact-v03-intersection-5203c` / `work_origin_horizon` / 36 | `same_work_fold_selection_reused_without_outer_metric_tuning` / `sales_share_cash_actual_only` / `same_case_overlap_diagnostic` |
| `CG-G1-BLOCKED-NO-CANDIDATE-OUTCOME` | 仅独立展示（`STANDALONE_ONLY`） | `future_sales_share_development_modelable_cash` / `user_reviewed_sales_share_workbook_membership` | `G1-primary-outer0-inner-eligibility-no-candidate-output` / `work_origin_horizon_channel_month` / 36 | `primary_outer_fold_0_inner_selection_before_candidate_prediction` / `M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01` / `G1_inner_selection_eligibility_block` |
| `CG-PSC01-IMPLEMENTATION-BLOCK-NO-CANDIDATE-OUTCOME` | 仅独立展示（`STANDALONE_ONLY`） | `future_sales_share_development_modelable_cash` / `user_reviewed_sales_share_workbook_membership` | `publishing-scale-private-materialization-blocked-before-candidate-fit` / `work_origin_horizon_channel_month` / 3、6、12、18、24、36 | `K7C_exact_head_ci_then_one_time_K7D_private_materialization_attempt` / `M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01` / `publishing_scale_K7D_implementation_block_before_candidate_fit` |
| `CG-WORK-HISTORICAL-C1` | 目标不同，不可直接比较（`DIFFERENT_TARGET_NOT_COMPARABLE`） | `historical_target` / `historical_target_authority` | `historical-C1-population` / `work_origin_horizon` / 3、6、12、18、24 | `historical_frozen` / `historical_target_actual` / `archive_C1` |
| `CG-WORK-LEGACY-BUYOUT-C2R` | 目标不同，不可直接比较（`DIFFERENT_TARGET_NOT_COMPARABLE`） | `legacy_buyout_target` / `legacy_buyout_target` | `historical-C2R-population` / `work_origin_horizon` / 无 | `historical_frozen` / `legacy_buyout_target_actual` / `archive_C2R` |
| `CG-WORK-ARCHIVE-FORMAL-7851` | 复用开发窗口（`REUSED_DEVELOPMENT_WINDOW`） | `formal_cash` / `formal_cash_pre_manual_partition` | `legacy-machine-route-824w-7851c` / `work_origin_horizon` / 3、6、12、18、24 | `historical_frozen` / `formal_cash_actual_pre_manual_partition` / `archive_C2_C3` |

## 成绩总账

| 可比组 | 模型（稳定 ID） | cases / works / origins | WAPE | signed bias | 结果（机器状态） |
|---|---|---:|---:|---:|---|
| `CG-WORK-SS-CURRENT-7083` | 旧现金生命周期公式（`M2-WORK-B4`） | 7083 / 758 / 5 | 0.54929375 | 0.18322698 | 登记结果（`COMPARATOR_ONLY`） |
| `CG-WORK-SS-CURRENT-7083` | 作品发生-金额校准模型 v0.3（`M2-WORK-OA03`） | 7083 / 758 / 5 | 0.49075894 | 0.07378107 | 已执行但未通过（`DEVELOPMENT_FAIL_RETAIN_FALLBACK`） |
| `CG-WORK-SS-CURRENT-7083` | 统一渠道曲线模型（`M2-WORK-CCR01`） | 7083 / 758 / 5 | 0.49070110 | 0.07705278 | 已执行但未通过（`DEVELOPMENT_REJECTED_BELOW_MATERIALITY`） |
| `CG-WORK-FORMAL-LEGACY-7851` | 旧现金生命周期公式（`M2-WORK-B4`） | 7851 / 824 / 5 | 0.55648454 | 0.08910997 | 登记结果（`ARCHIVE_DEVELOPMENT_COMPARATOR`） |
| `CG-WORK-FORMAL-LEGACY-7851` | 作品分群向下校准模型 v0.1（`M2-WORK-SEG01`） | 7851 / 824 / 5 | 0.53184893 | 0.03680632 | 登记结果（`PARTIAL_PASS_NOT_ACCEPTED`） |
| `CG-WORK-FORMAL-LEGACY-7851` | 作品层级稳健校准模型 v0.2（`M2-WORK-HRC02`） | 7851 / 824 / 5 | 0.51114966 | -0.00586227 | 登记结果（`PARTIAL_PASS_NOT_ACCEPTED`） |
| `CG-WORK-FORMAL-LEGACY-7851` | 全局分布组合安全回退管线 v0.4（`M2-WORK-GDE04`） | 7851 / 824 / 5 | 0.50557140 | -0.01198958 | 已执行但未通过（`DEVELOPMENT_FAIL_SAFE_FALLBACK`） |
| `CG-WORK-R0R5-GLOBAL-7851` | 全局门槛广义线性模型（`M2-WORK-GHG01`） | 7851 / 824 / 5 | 1.14324252 | 0.14962976 | 已执行但未通过（`DEVELOPMENT_FAIL`） |
| `CG-WORK-R0R5-GLOBAL-7851` | 全局 Tweedie 提升树桩模型（`M2-WORK-TWD01`） | 7851 / 824 / 5 | 3.01164614 | 2.47005885 | 已执行但未通过（`DEVELOPMENT_FAIL`） |
| `CG-WORK-R0R5-GLOBAL-7851` | 门槛梯度提升树桩模型（`M2-WORK-HGB01`） | 7851 / 824 / 5 | 0.86512643 | -0.73304615 | 已执行但未通过（`DEVELOPMENT_FAIL`） |
| `CG-PORT-SS-30CELLS` | 组合现金 ETS/Holt-Winters 模型（`M2-PORT-ETS01`） | 30 / — / 12 | 0.12794956 | 0.10048252 | 已执行但未通过（`DEVELOPMENT_GATE_FAIL`） |
| `CG-WORK-SS-DENSE-44301` | 经典时间序列比较基线族（`M2-BASE-CLASSIC01`） | 44301 / 824 / 25 | 0.46274198 | 0.06837072 | 登记结果（`COMPARATOR_ONLY`） |
| `CG-WORK-SS-DENSE-44301` | 历史状态校准模型（`M2-WORK-HSC01`） | 44301 / 824 / 25 | 0.58623406 | -0.12927560 | 已执行但未通过（`POSTHOC_DEVELOPMENT_REJECTED`） |
| `CG-WORK-SS-DENSE-44301` | 统一渠道曲线模型（`M2-WORK-CCR01`） | 44301 / 824 / 25 | 0.46506585 | 0.06843736 | 已执行但未通过（`DEVELOPMENT_FAIL`） |
| `CG-WORK-SS-MANUAL-379-H36` | 人工渠道规则模型（`M2-WORK-MCR01`） | 379 / 214 / 3 | 0.70444680 | -0.29098286 | 已执行但未通过（`DEVELOPMENT_REJECTED`） |
| `CG-WORK-SS-HA-PRIMARY-12039-H36` | 人工锚定忠实公式（`M2-WORK-MAN01`） | 12039 / 1125 / 13 | 0.53141021 | -0.40552340 | 登记结果（`DEVELOPMENT_COMPARATOR`） |
| `CG-WORK-SS-HA-PRIMARY-12039-H36` | 人工锚定可学习全局模型（`M2-WORK-LG01`） | 12039 / 1125 / 13 | 0.44022495 | -0.12377106 | 登记结果（`FROZEN_RESEARCH_BASELINE`） |
| `CG-WORK-SS-HA-PRIMARY-12039-H36` | 人工锚定可学习全局模型（`M2-WORK-LG01`） | 12039 / 1125 / 13 | 0.44022707 | -0.12366598 | 登记结果（`HISTORICAL_REPORT_REVISION_PRESERVED`） |
| `CG-WORK-SS-HA-PRIMARY-12039-H36` | 人工锚定层级正金额专家模型（`M2-WORK-HP01`） | 12039 / 1125 / 13 | 0.45540455 | -0.02684314 | 已执行但未通过（`RAW_CANDIDATE_REJECTED`） |
| `CG-WORK-SS-HA-PRIMARY-12039-H36` | 人工锚定发生与冲销模型（`M2-WORK-OR01`） | 12039 / 1125 / 13 | 0.44126080 | -0.14574128 | 已执行但未通过（`RAW_CANDIDATE_REJECTED`） |
| `CG-WORK-SS-HA-PRIMARY-12039-H36` | TSB 间歇发生模型（`M2-WORK-TSB01`） | 12039 / 1125 / 13 | 0.54346231 | 0.22068122 | 已执行但未通过（`DEVELOPMENT_FAIL`） |
| `CG-WORK-SS-HA-PRIMARY-12039-H36` | TSB 与全局模型混合候选（`M2-WORK-TSBB01`） | 12039 / 1125 / 13 | 0.45348237 | 0.03777402 | 已执行但未通过（`DEVELOPMENT_FAIL`） |
| `CG-WORK-SS-HA-PRIMARY-12039-H36` | 生命周期五状态模型（`M2-WORK-LC01`） | 12039 / 1125 / 13 | 0.50139298 | 未登记（null） | 已执行但未通过（`DEVELOPMENT_FAIL`） |
| `CG-WORK-SS-HA-PRIMARY-12039-H36` | 渠道倍率专家模型（`M2-CHAN-SCL01`） | 12039 / 1125 / 13 | 0.53776683 | 未登记（null） | 已执行但未通过（`DEVELOPMENT_FAIL`） |
| `CG-WORK-SS-HA-PRIMARY-12039-H36` | 渠道时间生成模型 v0.2——独立渠道月度发生—条件金额核心（`M2-CHAN-GEN02`） | 12039 / 1125 / 13 | 0.44022495 | -0.12377106 | 登记结果（`G0_SEMANTIC_EQUIVALENCE_PASS_NOT_CANDIDATE_SCORE`） |
| `CG-WORK-SS-HA-STRICT-74320` | 人工锚定可学习全局模型（`M2-WORK-LG01`） | 74320 / 2650 / 11 | 0.41191878 | -0.03847401 | 登记结果（`STRICT_ROLLING_DEVELOPMENT_BASELINE`） |
| `CG-WORK-SS-HA-STRICT-74320` | TSB 间歇发生模型（`M2-WORK-TSB01`） | 74320 / 2650 / 11 | 0.50802197 | 0.20751052 | 已执行但未通过（`DEVELOPMENT_FAIL`） |
| `CG-WORK-SS-HA-STRICT-74320` | TSB 与全局模型混合候选（`M2-WORK-TSBB01`） | 74320 / 2650 / 11 | 0.44487050 | 未登记（null） | 已执行但未通过（`DEVELOPMENT_FAIL`） |
| `CG-WORK-SS-HA-STRICT-74320` | 生命周期五状态模型（`M2-WORK-LC01`） | 74320 / 2650 / 11 | 0.62275977 | 未登记（null） | 已执行但未通过（`DEVELOPMENT_FAIL`） |
| `CG-WORK-SS-HA-STRICT-74320` | 渠道倍率专家模型（`M2-CHAN-SCL01`） | 74320 / 2650 / 11 | 0.65865324 | 未登记（null） | 已执行但未通过（`DEVELOPMENT_FAIL`） |
| `CG-WORK-SS-OVERLAP-5203-H36` | 作品发生-金额校准模型 v0.3（`M2-WORK-OA03`） | 5203 / — / 13 | 0.37610234 | 0.09727286 | 登记结果（`SAME_INTERSECTION_DEVELOPMENT_ONLY`） |
| `CG-WORK-SS-OVERLAP-5203-H36` | 人工锚定可学习全局模型（`M2-WORK-LG01`） | 5203 / — / 13 | 0.27723899 | -0.12220206 | 登记结果（`SAME_INTERSECTION_DEVELOPMENT_ONLY`） |
| `CG-WORK-SS-OVERLAP-5203-H36` | TSB 与全局模型混合候选（`M2-WORK-TSBB01`） | 5203 / — / 13 | 0.26352433 | 0.00222693 | 登记结果（`SAME_INTERSECTION_DIAGNOSTIC_ONLY`） |
| `CG-WORK-SS-OVERLAP-5203-H36` | 生命周期五状态模型（`M2-WORK-LC01`） | 5203 / — / 13 | 0.27458711 | 未登记（null） | 登记结果（`SAME_INTERSECTION_DIAGNOSTIC_ONLY`） |
| `CG-G1-BLOCKED-NO-CANDIDATE-OUTCOME` | 渠道时间生成模型 v0.2——独立渠道月度发生—条件金额核心（`M2-CHAN-GEN02`） | 0 / 0 / 0 | 未产生（null） | 未产生（null） | 因前置条件不满足而阻断（`M2_CHANNEL_GENERATIVE_G1_CORE_BLOCKED`） |
| `CG-PSC01-IMPLEMENTATION-BLOCK-NO-CANDIDATE-OUTCOME` | 出版行业适配的渠道月度发生—条件金额核心（`M2-CHAN-PSC01`） | 0 / 0 / 0 | 未产生（null） | 未产生（null） | 实现阻断且无候选结果（`M2_PUBLISHING_SCALE_IMPLEMENTATION_BLOCKED`） |
| `CG-WORK-HISTORICAL-C1` | C1 透明组合模型（`M2-WORK-C1TE01`） | — / — / 5 | 3.85015700 | 3.51137000 | 已执行但未通过（`ARCHIVE_DEVELOPMENT_FAIL`） |
| `CG-WORK-LEGACY-BUYOUT-C2R` | 旧买断收入路由模型（`M2-WORK-C2R01`） | — / — / — | 1.17960000 | 0.79260000 | 已执行但未通过（`ARCHIVE_DEVELOPMENT_FAIL`） |
| `CG-WORK-ARCHIVE-FORMAL-7851` | 正式现金路由分治模型（`M2-WORK-C2R101`） | 7851 / 824 / 5 | 0.58382400 | 0.02933800 | 已执行但未通过（`ARCHIVE_DEVELOPMENT_FAIL`） |
| `CG-WORK-ARCHIVE-FORMAL-7851` | C2 活跃度与间歇模型组合（`M2-WORK-C2IM01`） | 7851 / 824 / 5 | 0.55695500 | 0.09289100 | 已执行但未通过（`ARCHIVE_DEVELOPMENT_FAIL`） |
| `CG-WORK-ARCHIVE-FORMAL-7851` | C3 内部特征残差校正模型（`M2-WORK-C3IR01`） | 7851 / 824 / 5 | 0.55394517 | 0.08273913 | 已执行但未通过（`ARCHIVE_DEVELOPMENT_FAIL`） |

## 查询

```bash
npm run m2:model -- status
npm run m2:model -- list
npm run m2:model -- show M2-WORK-OA03
npm run m2:model -- aliases exact-v0.3
npm run m2:model -- experiment M2-EXP-CHANNEL-GENERATIVE-02
npm run m2:model -- explain G1
npm run m2:model -- compare M2-WORK-OA03 M2-WORK-LG01
```

查询命令只读取公开登记表，不执行模型、训练、私有评价或生产写入。
