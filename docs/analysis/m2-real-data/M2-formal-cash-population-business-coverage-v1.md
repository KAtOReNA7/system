# M2 正式现金完整人口与业务覆盖 v1

## 技术结论

完整人口按 3053 部作品和 192869 条完整月账单事实做非重叠 post-hoc 聚合。forecastable cash / ledger cash 为 **73.96%**，top10 forecastable cash coverage 为 **75.94%**。

## 现金覆盖

| 指标 | 结果 |
|---|---:|
| forecastable cash | 93783254.66 |
| classifier surprise exposure | 33011383.51 |
| total ledger cash | 126794638.17 |
| forecastable share | 73.9647% |
| surprise exposure share | 26.0353% |

## 观察门槛

- forecastable cash share 建议门槛 90%：未通过。
- top10 forecastable cash coverage 门槛 90%：未通过。
- 即使观察门槛通过，也不构成 formal approval；若未通过，则最多只能 conditional。

## 限制

当前 route、source 和高价值切片只用于 post-hoc 业务覆盖描述，不进入历史特征或 eligibility。`endToEndBusinessGap` 与 surprise exposure 不得命名为模型 WAPE。
