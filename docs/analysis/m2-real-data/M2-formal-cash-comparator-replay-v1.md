# M2 正式现金 comparator replay v1

## 技术结论

正式现金 comparator 已在相同 18615 个 development case、12223 个 statistically scoreable case 上重新播放。模型质量人口严格为 `statisticallyScoreable && modelPredictionAvailable && !routeAbstained`，共 7851 个 case、824 部作品。新的 primary comparator 为 **B4**。

无承诺纯买断仍保留在冻结 case universe 中，但 raw/served 均为 null，未按 0 进入 WAPE。B0a 和旧目标指标只作历史审计，未参与本次选择。

## comparator 结果

| comparator | 模型人口 case | WAPE | signed bias | MAE | SMAPE | 内部 80% coverage | WIS |
|---|---:|---:|---:|---:|---:|---:|---:|
| B0b | 7851 | 0.5898 | -0.0055 | 5983.07 | 0.8483 | 0.8517 | 5499.48 |
| B1 | 7851 | 0.7942 | +0.3750 | 8055.87 | 0.9013 | 0.8520 | 7441.05 |
| B3 | 7851 | 0.5897 | +0.1281 | 5981.40 | 0.8606 | 0.8544 | 5490.45 |
| B4 | 7851 | 0.5565 | +0.0891 | 5644.66 | 0.8935 | 0.8493 | 5083.94 |

## 范围与口径

- 实际值：`forecastableCashActual`。
- 产品数值：未来实销现金加 cutoff 已确认应收；当前历史承诺角色为 0。
- pure-buyout 无承诺：`rawModelPrediction=null`、`servedPrediction=null`、`routeAbstained=true`。
- served 指标只使用 business serving eligible 且有有限点值的模型人口。
- source 与 lifecycle 仅为 post-hoc 切片，不是历史特征。

## 方法与稳健性

四个 comparator 都重新经过 as-of predictor；formal route projection 创建第二个 prediction/state lock，随后才连接三套 actual。case keys、model-population keys、B4 sales-only factor 边界、old→new bridge、逐 case/聚合守恒和 future perturbation 均通过。内部 80% 区间只用于 coverage/WIS/过度自信审计，公开报告不含端点。

## 限制与下一步

本报告仍为 `not_for_formal_decision`。它只冻结 C2-R.1 的 comparator，不授权 final holdout、release、C2/C3 或 M3。精确表格比图形更适合本轮人口与守恒审计，因此未添加图表。
