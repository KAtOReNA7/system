# 2020–2025 Core80 全模型参赛资格审计 v0.1

> 英文活动：M2 Core80 Cross-Model Real-Business Evaluation v0.1；稳定活动 ID：`M2-CMX01`；机器状态码：`M2_CMX01_ELIGIBILITY_FROZEN_BEFORE_NEW_OUTCOME_READ`。

## 审计结论

结果打开前已逐项遍历 Model Registry 的 37 个登记项，登记项与裁决一一对应（`registryEntryParity=true`）。其中正式历史排名资格 14 项；仅回溯诊断 3 项；本活动不合法重放 20 项。单个模型不合格不会阻断其他模型。

这里的“正式排名资格”只表示可以在本次历史同案横评中进入主榜，不表示 active candidate、automation、production、release 或 final holdout 授权。模型家族成员、实验臂与登记模型保持不同对象身份；例如经典基线族的成员必须带父模型 ID，核心老品分周期金额模型的局部臂不得裸写。

## 逐项裁决

| 稳定模型 ID | 中文名 | 对象类型 | 原始预测粒度 | 资格状态 | 正式排名 | 回溯诊断 | 结果前原因码 |
|---|---|---|---|---|---:|---:|---|
| `M2-WORK-B4` | 旧现金生命周期公式 | model | work_origin_horizon | `EXCLUDED_NO_REPLAYABLE_IMPLEMENTATION` | 否 | 否 | `ALIGNMENT_ONLY_ENTRYPOINT_NO_STANDALONE_PREDICTION_GENERATOR` |
| `M2-WORK-SEG01` | 作品分群向下校准模型 v0.1 | model | work_origin_horizon | `EXCLUDED_NO_REPLAYABLE_IMPLEMENTATION` | 否 | 否 | `LEGACY_FUTURE_BILL_CASH_TARGET_NOT_CURRENT_ACTUAL_DEFINITION` |
| `M2-WORK-HRC02` | 作品层级稳健校准模型 v0.2 | model | work_origin_horizon | `EXCLUDED_NO_REPLAYABLE_IMPLEMENTATION` | 否 | 否 | `LEGACY_FUTURE_BILL_CASH_TARGET_NOT_CURRENT_ACTUAL_DEFINITION` |
| `M2-WORK-OA03` | 作品发生-金额校准模型 v0.3 | model | work_origin_horizon | `EXCLUDED_NO_REPLAYABLE_IMPLEMENTATION` | 否 | 否 | `DEPENDS_ON_NONREPLAYABLE_B4_BASE_PREDICTIONS_OUTSIDE_FROZEN_SPARSE_CASES` |
| `M2-WORK-GHG01` | 全局门槛广义线性模型 | model | work_origin_horizon | `EXCLUDED_NO_REPLAYABLE_IMPLEMENTATION` | 否 | 否 | `LEGACY_FUTURE_BILL_CASH_TARGET_AND_FROZEN_OUTER_ORIGINS` |
| `M2-WORK-TWD01` | 全局 Tweedie 提升树桩模型 | model | work_origin_horizon | `EXCLUDED_NO_REPLAYABLE_IMPLEMENTATION` | 否 | 否 | `LEGACY_FUTURE_BILL_CASH_TARGET_AND_FROZEN_OUTER_ORIGINS` |
| `M2-WORK-HGB01` | 门槛梯度提升树桩模型 | model | work_origin_horizon | `EXCLUDED_NO_REPLAYABLE_IMPLEMENTATION` | 否 | 否 | `LEGACY_FUTURE_BILL_CASH_TARGET_AND_FROZEN_OUTER_ORIGINS` |
| `M2-WORK-GDE04` | 全局分布组合安全回退管线 v0.4 | model_pipeline | work_origin_horizon | `ALIAS_OR_DUPLICATE_NOT_INDEPENDENT_MODEL` | 否 | 否 | `SELECTED_PIPELINE_RETURNS_EXISTING_FALLBACK_AND_CANNOT_COUNT_AS_INDEPENDENT_RAW_MODEL` |
| `M2-PORT-ETS01` | 组合现金 ETS/Holt-Winters 模型 | model | portfolio_origin_horizon | `EXCLUDED_NO_REPLAYABLE_IMPLEMENTATION` | 否 | 否 | `PORTFOLIO_GRAIN_CANNOT_BE_ALLOCATED_BACK_TO_WORKS` |
| `M2-BASE-CLASSIC01` | 经典时间序列比较基线族 | model_family | work_origin_horizon_or_portfolio_origin_horizon | `ELIGIBLE_NATIVE_WORK_TOTAL` | 是 | 是 | `ORIGIN_VISIBLE_CASH_ONLY_REGISTERED_BASELINE_FAMILY` |
| `M2-WORK-HSC01` | 历史状态校准模型 | model | work_origin_horizon | `EXCLUDED_DATA_LEAKAGE_OR_ORIGIN_UNSAFE` | 否 | 否 | `POST_HOC_HISTORICAL_STATUS_CALIBRATION_WITH_UNPROVEN_AS_OF_STATE` |
| `M2-WORK-MCR01` | 人工渠道规则模型 | model | work_origin_horizon | `ELIGIBLE_NATIVE_WORK_TOTAL` | 是 | 是 | `DETERMINISTIC_ORIGIN_HISTORY_MANUAL_CHANNEL_RULE_H36_ONLY` |
| `M2-WORK-CCR01` | 统一渠道曲线模型 | model | work_origin_horizon | `ELIGIBLE_NATIVE_WORK_TOTAL` | 是 | 是 | `NESTED_ORIGIN_BOUNDED_CANONICAL_CHANNEL_CHALLENGER` |
| `M2-WORK-MAN01` | 人工锚定忠实公式 | model | work_origin_horizon | `ELIGIBLE_NATIVE_WORK_TOTAL` | 是 | 是 | `FAITHFUL_FIXED_FORMULA_WITH_ORIGIN_VISIBLE_CASH_HISTORY` |
| `M2-WORK-CRMR01` | 核心收入人工规则基线 v0.1 | model | work_origin_horizon_channel | `ELIGIBLE_NATIVE_WORK_CHANNEL` | 是 | 是 | `PREREGISTERED_DETERMINISTIC_WORK_CHANNEL_FORMULA_WITH_ORIGIN_BOUNDED_FALLBACK` |
| `M2-PORT-LRC01` | 分层收入组合模型 v0.1 | model | portfolio_origin_horizon_component | `EXCLUDED_NO_REPLAYABLE_IMPLEMENTATION` | 否 | 否 | `PORTFOLIO_COMPONENT_GRAIN_CANNOT_BE_ALLOCATED_BACK_TO_WORKS` |
| `M2-WORK-LG01` | 人工锚定可学习全局模型 | model | work_origin_horizon | `ELIGIBLE_NATIVE_WORK_TOTAL` | 是 | 是 | `ORIGINAL_ALGORITHM_SUPPORTS_STRICT_ORIGIN_BOUNDED_FITTING` |
| `M2-WORK-HP01` | 人工锚定层级正金额专家模型 | model | work_origin_horizon | `ELIGIBLE_NATIVE_WORK_TOTAL` | 是 | 是 | `RAW_HIERARCHICAL_LAYER_MUST_REMAIN_VISIBLE_SEPARATE_FROM_SELECTED_FALLBACK` |
| `M2-WORK-OR01` | 人工锚定发生与冲销模型 | model | work_origin_horizon | `ELIGIBLE_NATIVE_WORK_TOTAL` | 是 | 是 | `RAW_OCCURRENCE_REVERSAL_LAYER_MUST_REMAIN_VISIBLE_SEPARATE_FROM_SELECTED_FALLBACK` |
| `M2-WORK-TSB01` | TSB 间歇发生模型 | model | work_origin_horizon | `ELIGIBLE_NATIVE_WORK_TOTAL` | 是 | 是 | `ORIGINAL_STRICT_ROLLING_ORIGIN_BOUNDED_IMPLEMENTATION_AVAILABLE` |
| `M2-WORK-TSBB01` | TSB 与全局模型混合候选 | model | work_origin_horizon | `ELIGIBLE_REGISTERED_COMPOSITE` | 是 | 是 | `REGISTERED_TSB_LG01_BLEND_WITH_RAW_RESULT_PRESERVED` |
| `M2-WORK-LC01` | 生命周期五状态模型 | model | work_origin_horizon | `EXCLUDED_DATA_LEAKAGE_OR_ORIGIN_UNSAFE` | 否 | 是 | `REVIVAL_STATE_ROUTING_IS_POST_HOC_FROM_COMPLETED_PRIOR_EXPERIMENT` |
| `M2-CHAN-SCL01` | 渠道倍率专家模型 | model | work_origin_horizon_with_channel_decomposition | `ELIGIBLE_NATIVE_WORK_CHANNEL` | 是 | 是 | `NATIVE_ORIGIN_OBSERVED_CHANNEL_OUTPUT_WITH_PREREGISTERED_STATIC_MECHANISM_AUTHORITY` |
| `M2-CHAN-GEN02` | 渠道时间生成模型 v0.2——独立渠道月度发生—条件金额核心 | model_family | work_origin_horizon_channel_month | `EXCLUDED_NO_CANDIDATE_OUTPUT` | 否 | 否 | `BLOCKED_BEFORE_FIRST_CANDIDATE_PREDICTION` |
| `M2-CHAN-PSC01` | 出版行业适配的渠道月度发生—条件金额核心 | model_revision | work_origin_horizon_channel_month | `ELIGIBLE_NATIVE_WORK_CHANNEL` | 是 | 是 | `FROZEN_ORIGINAL_ALGORITHM_REPLAYABLE_WITH_TAXONOMY_REPORT_ONLY_AND_RAW_RESULT_REQUIRED` |
| `M2-CHAN-PSC02` | 出版行业渠道起点可见现金锚金额模型 v0.1 | model_revision | work_origin_horizon_channel_month | `EXCLUDED_NO_CANDIDATE_OUTPUT` | 否 | 否 | `REAL_RUNNER_INCOMPLETE_AND_NO_CANDIDATE_RESULT` |
| `M2-CHAN-PSC03` | 出版行业渠道直接现金尺度条件金额模型 v0.1 | model_revision | work_origin_horizon_channel_month | `FORENSIC_ONLY_INVALID_CONTRACT` | 否 | 否 | `FROZEN_RAW_AUTHENTIC_BUT_IMPLEMENTATION_CONTRACT_MISMATCH_NO_RERUN` |
| `M2-WORK-C1TE01` | C1 透明组合模型 | model | work_origin_horizon | `EXCLUDED_NO_REPLAYABLE_IMPLEMENTATION` | 否 | 否 | `ARCHIVE_HISTORICAL_TARGET_NOT_CURRENT_CASH_TARGET` |
| `M2-WORK-C2R01` | 旧买断收入路由模型 | model | work_origin_horizon | `EXCLUDED_NO_REPLAYABLE_IMPLEMENTATION` | 否 | 否 | `ARCHIVE_BUYOUT_TARGET_OUTSIDE_M2_SCOPE` |
| `M2-WORK-C2R101` | 正式现金路由分治模型 | model | work_origin_horizon | `EXCLUDED_NO_REPLAYABLE_IMPLEMENTATION` | 否 | 否 | `ARCHIVE_FORMAL_CASH_TARGET_DIFFERS_FROM_CURRENT_SALES_SHARE_ACTUAL` |
| `M2-WORK-C2IM01` | C2 活跃度与间歇模型组合 | model | work_origin_horizon | `EXCLUDED_NO_REPLAYABLE_IMPLEMENTATION` | 否 | 否 | `ARCHIVE_FORMAL_CASH_TARGET_DIFFERS_FROM_CURRENT_SALES_SHARE_ACTUAL` |
| `M2-WORK-C3IR01` | C3 内部特征残差校正模型 | model | work_origin_horizon | `EXCLUDED_NO_REPLAYABLE_IMPLEMENTATION` | 否 | 否 | `ARCHIVE_FORMAL_CASH_TARGET_DIFFERS_FROM_CURRENT_SALES_SHARE_ACTUAL` |
| `M2-WORK-HR01` | 按预测周期滚动模型路由器 v0.1 | model_pipeline | work_origin_horizon | `ELIGIBLE_REGISTERED_COMPOSITE` | 是 | 是 | `REGISTERED_ORIGIN_SAFE_ROLLING_HORIZON_ROUTER_WITH_RAW_INPUT_MODELS_RETAINED` |
| `M2-WORK-CHAM01` | 核心老品分周期金额模型 v0.1 | model | work_origin_horizon | `ELIGIBLE_NATIVE_WORK_TOTAL` | 是 | 是 | `ORIGINAL_HORIZON_SPECIFIC_ORIGIN_BOUNDED_FIT_REAUTHORIZED_FOR_HISTORICAL_CROSS_EVALUATION` |
| `M2-WORK-HCRC01` | LG01 头部现金残差校准模型 v0.1 | model | work_origin_horizon | `EXCLUDED_DATA_LEAKAGE_OR_ORIGIN_UNSAFE` | 否 | 是 | `POST_HOC_HEAD_RESIDUAL_DESIGN_AND_FROZEN_DEVELOPMENT_SELECTION` |
| `M2-WORK-HPSR01` | LG01 头部保护分段路由模型 v0.1 | model | work_origin_horizon | `EXCLUDED_DATA_LEAKAGE_OR_ORIGIN_UNSAFE` | 否 | 是 | `FROZEN_BOUNDS_DERIVED_FROM_LATER_OPENED_DEVELOPMENT_ROWS_RETROSPECTIVE_ONLY` |
| `M2-WORK-HPSR02` | LG01 头部保护尾段修正模型 v0.2 | model | work_origin_horizon | `EXCLUDED_NO_REPLAYABLE_IMPLEMENTATION` | 否 | 否 | `UNIQUE_2026_03_INDEPENDENT_EVALUATION_FROZEN_CASH_ONLY_RESEARCH_ENDED_NO_RERUN` |

## 重点冻结边界

- 出版行业渠道起点可见现金锚金额模型 v0.1（`M2-CHAN-PSC02`）：没有候选输出（`EXCLUDED_NO_CANDIDATE_OUTPUT`）。
- 出版行业渠道直接现金尺度条件金额模型 v0.1（`M2-CHAN-PSC03`）：冻结 raw 真实，但实现合同不一致，只进 forensic appendix（`FORENSIC_ONLY_INVALID_CONTRACT`），不得重跑。
- LG01 头部保护尾段修正模型 v0.2（`M2-WORK-HPSR02`）：唯一 2026-03 独立评价原样保留在近期共同窗口附录；现金-only 研究已结束，不重跑。
- 生命周期五状态模型（`M2-WORK-LC01`）、LG01 头部现金残差校准模型 v0.1（`M2-WORK-HCRC01`）和 LG01 头部保护分段路由模型 v0.1（`M2-WORK-HPSR01`）含事后选择或后来冻结边界，只能回溯诊断（`EXCLUDED_DATA_LEAKAGE_OR_ORIGIN_UNSAFE`），不得进入正式历史冠军裁决。
- 两个组合模型（`M2-PORT-ETS01`、`M2-PORT-LRC01`）粒度为 portfolio，禁止分配回作品并与作品模型混榜。
- 作品发生—金额校准模型 v0.3（`M2-WORK-OA03`）依赖没有独立生成入口的旧基础预测；冻结稀疏行仍保留，但无法合法扩展到本次完整月度网格。

## 可复现性账本

机器可读 JSON 对每项保存当前代码/config SHA-256、首次加入 Git 的提交、原始 horizon、拟合边界、origin 安全状态和冻结复现差异占位。所有差异在结果前均为 `NOT_MEASURED_PRE_OUTCOME`，不得预填或用旧结果冒充新横评。

- Model Registry SHA-256：`c3be0ae2745b25495f4a4700e76b2886c82ab812a20c2ee15c30633e010a4048`
- canonical payload SHA-256：`fdfa8a3235d19e5e20e78029e664e9b92ce159c5d712bc6a9e503752c1d3e83f`
