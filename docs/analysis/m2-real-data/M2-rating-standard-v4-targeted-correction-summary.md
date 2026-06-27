# M2 rating-standard-v4 targeted correction summary

- 纯实销规则：保持不变。
- 纯买断规则：`buyoutEstimatedAmount / (3 * 12)` 得到买断折算月均实销；剩余版权期更短时封顶，最低 1 年。
- 买断+实销规则：`ratingBasis=current_sales_with_buyout_allocation`，当前评级叠加实销月均与买断月均；下一周期只预测实销。
- 下架/版权状态：版权台账高可信；尾部收入只作后续运营核查线索，不反向改写状态。
- M4 校准案例：由用户选择经典/关键作品，不自动沉淀本轮失败样本。
- 自动运营建议：仍不输出主列。

## v4 聚合变化

- 样本行：`25`
- 评级变化行：`19`
- 纯买断评级变化行：`5`
- 买断+实销评级变化行：`8`
- 评级分布：`{"S+": 3, "S": 14, "A": 0, "B": 3, "C": 1, "D": 0, "E": 4}`
- 评级依据分布：`{"current_sales": 6, "historical": 5, "current_sales_with_buyout_allocation": 8, "buyout_monthly_sales_equivalent": 6}`
- 状态置信度分布：`{"中": 9, "低": 11, "高": 5}`

v4 仍需用户复核；v1.1 conditional / rating-standard-v4 不是最终正式发布审批结果。本轮不进入 M3。