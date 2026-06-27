# M2 rating-standard-v4.2 targeted correction summary

- 纯实销规则：保持不变。
- 纯买断规则：`buyoutEstimatedAmount / (3 * 12)` 得到买断折算月均实销；剩余版权期更短时封顶，最低 1 年。
- 买断+实销规则：`ratingBasis=current_sales_with_buyout_allocation`，当前评级叠加实销月均与买断月均；下一周期只预测实销。
- 下架/版权状态：版权台账高可信；尾部收入只作后续运营核查线索，不反向改写状态。
- M4 校准案例：由用户选择经典/关键作品，不自动沉淀本轮失败样本。
- 自动运营建议：仍不输出主列。

## v4.2 聚合变化

- 样本行：`25`
- 评级变化行：`21`
- 纯买断评级变化行：`8`
- 买断+实销评级变化行：`11`
- 评级分布：`{"S+": 3, "S": 18, "A": 0, "B": 3, "C": 0, "D": 0, "E": 1}`
- 评级依据分布：`{"current_sales": 3, "current_sales_with_buyout_allocation": 11, "buyout_monthly_sales_equivalent": 9, "historical": 2}`
- 状态置信度分布：`{"中": 14, "低": 6, "高": 5}`

v4.2 仍需用户复核；v1.1 conditional / rating-standard-v4.2 不是最终正式发布审批结果。本轮不进入 M3。