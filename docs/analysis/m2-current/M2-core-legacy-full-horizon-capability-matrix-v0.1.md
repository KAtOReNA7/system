# M2 核心老品全周期模型能力矩阵 v0.1

## 结论

本检查点属于实验“M2 核心老品全周期同案例证据补齐、按周期模型路由与已有渠道分配验证 v0.1”
（M2 Core Legacy Full-Horizon Same-Case Evidence Completion, Horizon Router and Observed-Channel Allocation Validation v0.1，`M2-EXP-CORE-LEGACY-HORIZON-ROUTER-01`）的
能力合同阶段（`K0_CAPABILITY_MATRIX_AND_FROZEN_REPLAY_CONTRACT_COMPLETE`）。48 个
“模型 × 评价族 × horizon × 粒度”单元均已显式分类；缺失输出没有填零，
也没有执行模型训练、参数复制或 private evaluation。

- 作品发生—金额校准模型 v0.3
  （Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）只有
  Primary rolling 的 3/6/12 个月作品总额冻结行；Strict rolling 的原始 fold
  证据不足，36 个月及作品×渠道粒度不属于其模型合同。
- 人工锚定可学习全局模型
  （Human-Anchored Learned Global，`M2-WORK-LG01`）已有 Primary 36 个月
  与 Strict 3/6/12 个月冻结行。把 Primary 36 个月选出的参数用于
  Primary 3/6/12 个月会构成被禁止的跨 horizon 参数复制；Strict 36 个月没有
  冻结窗口内成熟的选择起点，因此均记为不可重建（`NOT_RECONSTRUCTABLE`）。
- 核心收入人工规则基线 v0.1
  （Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`）已有
  Primary 全 horizon 与 Strict 3/6/12 个月两种粒度冻结行；Strict 36 个月
  缺少成熟评价起点。

## 完整矩阵

| 模型 | 评价族 | horizon（月） | 粒度 | 当前状态 | 原因 | 缓存丢失时 |
| --- | --- | ---: | --- | --- | --- | --- |
| 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 主滚动评价 (`PRIMARY_ROLLING`) | 3 | 作品总额 (`WORK_TOTAL`) | `FROZEN_AVAILABLE` | `VERIFIED_PRIVATE_FROZEN_ROW_CACHE_PRESENT` | `DETERMINISTIC_FROZEN_REPLAY_AVAILABLE` |
| 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 主滚动评价 (`PRIMARY_ROLLING`) | 3 | 作品×渠道 (`WORK_CHANNEL`) | `UNSUPPORTED_BY_MODEL_CONTRACT` | `PREDICTION_GRAIN_NOT_SUPPORTED` | — |
| 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 主滚动评价 (`PRIMARY_ROLLING`) | 6 | 作品总额 (`WORK_TOTAL`) | `FROZEN_AVAILABLE` | `VERIFIED_PRIVATE_FROZEN_ROW_CACHE_PRESENT` | `DETERMINISTIC_FROZEN_REPLAY_AVAILABLE` |
| 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 主滚动评价 (`PRIMARY_ROLLING`) | 6 | 作品×渠道 (`WORK_CHANNEL`) | `UNSUPPORTED_BY_MODEL_CONTRACT` | `PREDICTION_GRAIN_NOT_SUPPORTED` | — |
| 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 主滚动评价 (`PRIMARY_ROLLING`) | 12 | 作品总额 (`WORK_TOTAL`) | `FROZEN_AVAILABLE` | `VERIFIED_PRIVATE_FROZEN_ROW_CACHE_PRESENT` | `DETERMINISTIC_FROZEN_REPLAY_AVAILABLE` |
| 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 主滚动评价 (`PRIMARY_ROLLING`) | 12 | 作品×渠道 (`WORK_CHANNEL`) | `UNSUPPORTED_BY_MODEL_CONTRACT` | `PREDICTION_GRAIN_NOT_SUPPORTED` | — |
| 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 主滚动评价 (`PRIMARY_ROLLING`) | 36 | 作品总额 (`WORK_TOTAL`) | `UNSUPPORTED_BY_MODEL_CONTRACT` | `HORIZON_NOT_SUPPORTED` | — |
| 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 主滚动评价 (`PRIMARY_ROLLING`) | 36 | 作品×渠道 (`WORK_CHANNEL`) | `UNSUPPORTED_BY_MODEL_CONTRACT` | `PREDICTION_GRAIN_NOT_SUPPORTED` | — |
| 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 严格滚动评价 (`STRICT_ROLLING`) | 3 | 作品总额 (`WORK_TOTAL`) | `NOT_RECONSTRUCTABLE` | `ORIGINAL_STRICT_ROLLING_FOLD_PARAMETERS_AND_PREDICTION_ROWS_ABSENT` | — |
| 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 严格滚动评价 (`STRICT_ROLLING`) | 3 | 作品×渠道 (`WORK_CHANNEL`) | `UNSUPPORTED_BY_MODEL_CONTRACT` | `PREDICTION_GRAIN_NOT_SUPPORTED` | — |
| 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 严格滚动评价 (`STRICT_ROLLING`) | 6 | 作品总额 (`WORK_TOTAL`) | `NOT_RECONSTRUCTABLE` | `ORIGINAL_STRICT_ROLLING_FOLD_PARAMETERS_AND_PREDICTION_ROWS_ABSENT` | — |
| 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 严格滚动评价 (`STRICT_ROLLING`) | 6 | 作品×渠道 (`WORK_CHANNEL`) | `UNSUPPORTED_BY_MODEL_CONTRACT` | `PREDICTION_GRAIN_NOT_SUPPORTED` | — |
| 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 严格滚动评价 (`STRICT_ROLLING`) | 12 | 作品总额 (`WORK_TOTAL`) | `NOT_RECONSTRUCTABLE` | `ORIGINAL_STRICT_ROLLING_FOLD_PARAMETERS_AND_PREDICTION_ROWS_ABSENT` | — |
| 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 严格滚动评价 (`STRICT_ROLLING`) | 12 | 作品×渠道 (`WORK_CHANNEL`) | `UNSUPPORTED_BY_MODEL_CONTRACT` | `PREDICTION_GRAIN_NOT_SUPPORTED` | — |
| 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 严格滚动评价 (`STRICT_ROLLING`) | 36 | 作品总额 (`WORK_TOTAL`) | `UNSUPPORTED_BY_MODEL_CONTRACT` | `HORIZON_NOT_SUPPORTED` | — |
| 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 严格滚动评价 (`STRICT_ROLLING`) | 36 | 作品×渠道 (`WORK_CHANNEL`) | `UNSUPPORTED_BY_MODEL_CONTRACT` | `PREDICTION_GRAIN_NOT_SUPPORTED` | — |
| 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 主滚动评价 (`PRIMARY_ROLLING`) | 3 | 作品总额 (`WORK_TOTAL`) | `NOT_RECONSTRUCTABLE` | `PRIMARY_PARAMETERS_SELECTED_ONLY_ON_H36_COPYING_ACROSS_HORIZONS_FORBIDDEN` | — |
| 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 主滚动评价 (`PRIMARY_ROLLING`) | 3 | 作品×渠道 (`WORK_CHANNEL`) | `NOT_RECONSTRUCTABLE` | `PRIMARY_PARAMETERS_SELECTED_ONLY_ON_H36_COPYING_ACROSS_HORIZONS_FORBIDDEN` | — |
| 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 主滚动评价 (`PRIMARY_ROLLING`) | 6 | 作品总额 (`WORK_TOTAL`) | `NOT_RECONSTRUCTABLE` | `PRIMARY_PARAMETERS_SELECTED_ONLY_ON_H36_COPYING_ACROSS_HORIZONS_FORBIDDEN` | — |
| 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 主滚动评价 (`PRIMARY_ROLLING`) | 6 | 作品×渠道 (`WORK_CHANNEL`) | `NOT_RECONSTRUCTABLE` | `PRIMARY_PARAMETERS_SELECTED_ONLY_ON_H36_COPYING_ACROSS_HORIZONS_FORBIDDEN` | — |
| 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 主滚动评价 (`PRIMARY_ROLLING`) | 12 | 作品总额 (`WORK_TOTAL`) | `NOT_RECONSTRUCTABLE` | `PRIMARY_PARAMETERS_SELECTED_ONLY_ON_H36_COPYING_ACROSS_HORIZONS_FORBIDDEN` | — |
| 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 主滚动评价 (`PRIMARY_ROLLING`) | 12 | 作品×渠道 (`WORK_CHANNEL`) | `NOT_RECONSTRUCTABLE` | `PRIMARY_PARAMETERS_SELECTED_ONLY_ON_H36_COPYING_ACROSS_HORIZONS_FORBIDDEN` | — |
| 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 主滚动评价 (`PRIMARY_ROLLING`) | 36 | 作品总额 (`WORK_TOTAL`) | `FROZEN_AVAILABLE` | `VERIFIED_PRIVATE_FROZEN_ROW_CACHE_PRESENT` | `DETERMINISTIC_FROZEN_REPLAY_AVAILABLE` |
| 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 主滚动评价 (`PRIMARY_ROLLING`) | 36 | 作品×渠道 (`WORK_CHANNEL`) | `FROZEN_AVAILABLE` | `VERIFIED_PRIVATE_FROZEN_ROW_CACHE_PRESENT` | `DETERMINISTIC_FROZEN_REPLAY_AVAILABLE` |
| 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 严格滚动评价 (`STRICT_ROLLING`) | 3 | 作品总额 (`WORK_TOTAL`) | `FROZEN_AVAILABLE` | `VERIFIED_PRIVATE_FROZEN_ROW_CACHE_PRESENT` | `DETERMINISTIC_FROZEN_REPLAY_AVAILABLE` |
| 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 严格滚动评价 (`STRICT_ROLLING`) | 3 | 作品×渠道 (`WORK_CHANNEL`) | `FROZEN_AVAILABLE` | `VERIFIED_PRIVATE_FROZEN_ROW_CACHE_PRESENT` | `DETERMINISTIC_FROZEN_REPLAY_AVAILABLE` |
| 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 严格滚动评价 (`STRICT_ROLLING`) | 6 | 作品总额 (`WORK_TOTAL`) | `FROZEN_AVAILABLE` | `VERIFIED_PRIVATE_FROZEN_ROW_CACHE_PRESENT` | `DETERMINISTIC_FROZEN_REPLAY_AVAILABLE` |
| 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 严格滚动评价 (`STRICT_ROLLING`) | 6 | 作品×渠道 (`WORK_CHANNEL`) | `FROZEN_AVAILABLE` | `VERIFIED_PRIVATE_FROZEN_ROW_CACHE_PRESENT` | `DETERMINISTIC_FROZEN_REPLAY_AVAILABLE` |
| 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 严格滚动评价 (`STRICT_ROLLING`) | 12 | 作品总额 (`WORK_TOTAL`) | `FROZEN_AVAILABLE` | `VERIFIED_PRIVATE_FROZEN_ROW_CACHE_PRESENT` | `DETERMINISTIC_FROZEN_REPLAY_AVAILABLE` |
| 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 严格滚动评价 (`STRICT_ROLLING`) | 12 | 作品×渠道 (`WORK_CHANNEL`) | `FROZEN_AVAILABLE` | `VERIFIED_PRIVATE_FROZEN_ROW_CACHE_PRESENT` | `DETERMINISTIC_FROZEN_REPLAY_AVAILABLE` |
| 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 严格滚动评价 (`STRICT_ROLLING`) | 36 | 作品总额 (`WORK_TOTAL`) | `NOT_RECONSTRUCTABLE` | `NO_MATURE_STRICT_H36_SELECTION_ORIGINS_WITHIN_FROZEN_AUTHORITY_WINDOW` | — |
| 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 严格滚动评价 (`STRICT_ROLLING`) | 36 | 作品×渠道 (`WORK_CHANNEL`) | `NOT_RECONSTRUCTABLE` | `NO_MATURE_STRICT_H36_SELECTION_ORIGINS_WITHIN_FROZEN_AUTHORITY_WINDOW` | — |
| 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 主滚动评价 (`PRIMARY_ROLLING`) | 3 | 作品总额 (`WORK_TOTAL`) | `FROZEN_AVAILABLE` | `VERIFIED_PRIVATE_FROZEN_ROW_CACHE_PRESENT` | `DETERMINISTIC_FROZEN_REPLAY_AVAILABLE` |
| 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 主滚动评价 (`PRIMARY_ROLLING`) | 3 | 作品×渠道 (`WORK_CHANNEL`) | `FROZEN_AVAILABLE` | `VERIFIED_PRIVATE_FROZEN_ROW_CACHE_PRESENT` | `DETERMINISTIC_FROZEN_REPLAY_AVAILABLE` |
| 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 主滚动评价 (`PRIMARY_ROLLING`) | 6 | 作品总额 (`WORK_TOTAL`) | `FROZEN_AVAILABLE` | `VERIFIED_PRIVATE_FROZEN_ROW_CACHE_PRESENT` | `DETERMINISTIC_FROZEN_REPLAY_AVAILABLE` |
| 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 主滚动评价 (`PRIMARY_ROLLING`) | 6 | 作品×渠道 (`WORK_CHANNEL`) | `FROZEN_AVAILABLE` | `VERIFIED_PRIVATE_FROZEN_ROW_CACHE_PRESENT` | `DETERMINISTIC_FROZEN_REPLAY_AVAILABLE` |
| 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 主滚动评价 (`PRIMARY_ROLLING`) | 12 | 作品总额 (`WORK_TOTAL`) | `FROZEN_AVAILABLE` | `VERIFIED_PRIVATE_FROZEN_ROW_CACHE_PRESENT` | `DETERMINISTIC_FROZEN_REPLAY_AVAILABLE` |
| 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 主滚动评价 (`PRIMARY_ROLLING`) | 12 | 作品×渠道 (`WORK_CHANNEL`) | `FROZEN_AVAILABLE` | `VERIFIED_PRIVATE_FROZEN_ROW_CACHE_PRESENT` | `DETERMINISTIC_FROZEN_REPLAY_AVAILABLE` |
| 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 主滚动评价 (`PRIMARY_ROLLING`) | 36 | 作品总额 (`WORK_TOTAL`) | `FROZEN_AVAILABLE` | `VERIFIED_PRIVATE_FROZEN_ROW_CACHE_PRESENT` | `DETERMINISTIC_FROZEN_REPLAY_AVAILABLE` |
| 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 主滚动评价 (`PRIMARY_ROLLING`) | 36 | 作品×渠道 (`WORK_CHANNEL`) | `FROZEN_AVAILABLE` | `VERIFIED_PRIVATE_FROZEN_ROW_CACHE_PRESENT` | `DETERMINISTIC_FROZEN_REPLAY_AVAILABLE` |
| 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 严格滚动评价 (`STRICT_ROLLING`) | 3 | 作品总额 (`WORK_TOTAL`) | `FROZEN_AVAILABLE` | `VERIFIED_PRIVATE_FROZEN_ROW_CACHE_PRESENT` | `DETERMINISTIC_FROZEN_REPLAY_AVAILABLE` |
| 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 严格滚动评价 (`STRICT_ROLLING`) | 3 | 作品×渠道 (`WORK_CHANNEL`) | `FROZEN_AVAILABLE` | `VERIFIED_PRIVATE_FROZEN_ROW_CACHE_PRESENT` | `DETERMINISTIC_FROZEN_REPLAY_AVAILABLE` |
| 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 严格滚动评价 (`STRICT_ROLLING`) | 6 | 作品总额 (`WORK_TOTAL`) | `FROZEN_AVAILABLE` | `VERIFIED_PRIVATE_FROZEN_ROW_CACHE_PRESENT` | `DETERMINISTIC_FROZEN_REPLAY_AVAILABLE` |
| 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 严格滚动评价 (`STRICT_ROLLING`) | 6 | 作品×渠道 (`WORK_CHANNEL`) | `FROZEN_AVAILABLE` | `VERIFIED_PRIVATE_FROZEN_ROW_CACHE_PRESENT` | `DETERMINISTIC_FROZEN_REPLAY_AVAILABLE` |
| 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 严格滚动评价 (`STRICT_ROLLING`) | 12 | 作品总额 (`WORK_TOTAL`) | `FROZEN_AVAILABLE` | `VERIFIED_PRIVATE_FROZEN_ROW_CACHE_PRESENT` | `DETERMINISTIC_FROZEN_REPLAY_AVAILABLE` |
| 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 严格滚动评价 (`STRICT_ROLLING`) | 12 | 作品×渠道 (`WORK_CHANNEL`) | `FROZEN_AVAILABLE` | `VERIFIED_PRIVATE_FROZEN_ROW_CACHE_PRESENT` | `DETERMINISTIC_FROZEN_REPLAY_AVAILABLE` |
| 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 严格滚动评价 (`STRICT_ROLLING`) | 36 | 作品总额 (`WORK_TOTAL`) | `NOT_RECONSTRUCTABLE` | `NO_MATURE_STRICT_H36_EVALUATION_ORIGINS_WITHIN_FROZEN_AUTHORITY_WINDOW` | — |
| 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 严格滚动评价 (`STRICT_ROLLING`) | 36 | 作品×渠道 (`WORK_CHANNEL`) | `NOT_RECONSTRUCTABLE` | `NO_MATURE_STRICT_H36_EVALUATION_ORIGINS_WITHIN_FROZEN_AUTHORITY_WINDOW` | — |

## HEAD 身份

- 首次有效 private evaluation 的代码身份（`evaluationHead`）尚未赋值；
  它必须是本检查点提交并通过 Linux/Windows exact-head CI 后的远端 HEAD。
- 最终文档身份（`finalDocumentationHead`）尚未赋值；它必须是包含最终报告、
  Model Registry、中文目录和新状态索引的最终远端 HEAD。
- 两者不得互相冒充，也不得预先写死到长期合同。

## 边界

当前模型角色不变：现行运行回退仍为作品发生—金额校准模型 v0.3
（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`），研究比较基线仍为
人工锚定可学习全局模型（Human-Anchored Learned Global，
`M2-WORK-LG01`）；活动候选（`activeCandidate`）和自动化批准
（`approvedForAutomation`）均为空。
