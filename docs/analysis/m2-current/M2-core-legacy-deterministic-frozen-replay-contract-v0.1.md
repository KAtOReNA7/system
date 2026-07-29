# M2 核心老品冻结预测确定性重建合同 v0.1

## 合同身份

本合同的稳定 ID 为 `M2-FROZEN-REPLAY-CORE-LEGACY-HORIZON-01`，服务于实验
“M2 核心老品全周期同案例证据补齐、按周期模型路由与已有渠道分配验证 v0.1”
（M2 Core Legacy Full-Horizon Same-Case Evidence Completion, Horizon Router and Observed-Channel Allocation Validation v0.1，`M2-EXP-CORE-LEGACY-HORIZON-ROUTER-01`）。
它只允许恢复冻结预测缓存，不授予训练、调参、新模型或 production 权限。

## 允许

- 仅使用原冻结公式（`original_frozen_formula`）
- 仅使用原冻结参数网格（`original_parameter_grid`）
- 仅使用原滚动训练合同（`original_rolling_training_contract`）
- 每个 fold 只读取当时可见训练行（`training_rows_visible_at_each_original_fold_as_of`）
- 只为恢复缓存执行原 fold 拟合（`original_fold_refit_to_restore_missing_cache_rows`）

## 禁止

- 修改参数（`parameter_change`）
- 扩大参数网格（`parameter_grid_expansion`）
- 新增特征（`new_feature`）
- 修改 fallback（`fallback_change`）
- 根据本轮结果选择参数（`post_result_parameter_selection`）
- 跨 horizon 复制参数（`cross_horizon_parameter_copy`）
- 从公开汇总反推行级预测（`row_level_prediction_inference_from_public_aggregate`）

## 完整性判定

重放身份由模型、评价族、origin、horizon、作品、渠道与 fold as-of 共同绑定；
冻结行与重放行的最大允许数值差为 `0`。
Git ignored 派生缓存缺失不是阻断，历史 receipt 缺失也不是阻断；只有权威账单、
作品映射或 canonical 渠道主表缺失才可阻断所属能力。

缺少原 horizon 的 fold 参数、成熟选择起点或模型粒度支持时，必须分别报告
`NOT_RECONSTRUCTABLE` 或 `UNSUPPORTED_BY_MODEL_CONTRACT`，不得用 0、公开汇总
反推值或其他 horizon 参数代替。
