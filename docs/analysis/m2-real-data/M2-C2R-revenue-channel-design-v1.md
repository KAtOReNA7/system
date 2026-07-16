# M2 C2-R 收入模式与渠道路由预注册设计

结论：C2-R 冻结为 `revenue-model-aware + channel-aware transparent forecast`。本设计在任何 C2-R outer replay 前提交；不改变 case keys、actual、scoreability、eligibility、comparators、seed 或 gate，结果始终 `not_for_formal_decision`。

## 四类路由

| 路由 | 冻结处理 |
|---|---|
| pure_sales_share | 各渠道保留零月并独立预测，再严格求和 |
| pure_buyout | 使用 cutoff 可得的事件金额、事件间隔和有效周期；默认 36 个月、最低 12 个月；不假设未来续买断 |
| buyout_plus_sales | 删除 mixed 渠道中的买断事件月、排除买断专属渠道，只预测实销并标记 `excludesFutureBuyout=true` |
| unknown_revenue_model | 固定原始零值，业务层 abstain；不影响其他路由的选择 |

实销候选共 38 个：11 个单组件，以及以合法 B4 渠道点组件为锚、9 个伙伴和 3 档权重形成的 27 个双组件。所有位置统计保留零月，禁止正收入中位数。

## inner 选择

每个 outer origin、每条实销路由只读取严格更早且标签已可得的 development origins。先要求总体、高价值和各已定义 horizon 的 signed bias 合规，再按总体 WAPE、平均 horizon WAPE、高价值 WAPE、组件数、参数数和候选 ID 顺序选择。支持不足或无 bias-feasible 候选时固定使用单一 B4 渠道组件，不放宽 gate。

## 边界

产品只允许一个点值、年度拆分、confidence 和 limitation。内部 80% 区间仅用于 coverage、WIS 和宽度审计，不公开端点。final holdout、embargo shadow、60-month labels 保持封存；未授权 C2/C3、release 或 M3。
