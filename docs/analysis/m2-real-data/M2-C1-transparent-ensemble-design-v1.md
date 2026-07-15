# M2 C1 transparent ensemble 预注册设计

C1 只在 Gate A 全部通过后执行。它是低复杂度、透明的点预测组合，不使用 final holdout，不改变 eligibility，也不进入 C2-R。

## 冻结组件

- `trailing_mean_3`
- `trailing_mean_6`
- `trailing_mean_12`
- `seasonal_naive_12`
- `robust_positive_median`
- `winsorized_recent_trend`
- `damped_linear_trend`
- `recency_weighted_mean`

最多 3 个非零组件；权重格为 [0.25, 0.5, 0.75]。选择采用 expanding-origin inner evidence，固定 seed，并按组件数、参数数、候选 ID 依次打破平局。

pure sales 按渠道组合后求和；pure buyout 保持历史周期月均等效；buyout+sales 只预测未来实销。内部 80% 区间只用于 calibration 审计，不公开端点。
