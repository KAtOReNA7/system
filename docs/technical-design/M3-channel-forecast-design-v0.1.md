# M3 channel forecast design v0.1

生成日期：2026-06-28

状态：M3-1 fixture/prototype design。本文只定义点值预测结构，不实现 formal forecast。

## 1. 预测原则

M3 新品评估必须按渠道分别预测，再将所有渠道收入预测相加。预测主输出是高概率命中的 point estimate，不输出区间。

## 2. 输出结构

必须输出：

- `channelForecasts[]`；
- `totalForecast = sum(channelForecasts)`；
- `firstYearForecast`；
- `year1To5Breakdown`；
- `fiveYearTotal`；
- `confidence`；
- `limitations`。

不得输出：

- optimistic；
- pessimistic；
- high/base/low；
- forecast range；
- 是否建议开发；
- 资源投入等级。

## 3. channelForecasts[]

每个目标渠道必须有独立预测：

| 字段 | 说明 |
|---|---|
| channelId | synthetic 渠道 ID |
| channelName | synthetic 渠道名 |
| firstYearForecast | 首年点值 |
| year1To5Breakdown | 第 1-5 年点值拆分 |
| fiveYearTotal | 五年点值合计 |
| confidence | 置信说明，不是区间 |
| limitations | 限制说明 |

## 4. 聚合规则

`totalForecast.firstYearForecast` 等于所有渠道 `firstYearForecast` 求和。

`totalForecast.fiveYearTotal` 等于所有渠道 `fiveYearTotal` 求和。

每个年份的 `totalForecast.year1To5Breakdown[n].forecast` 等于所有渠道对应年份求和。

## 5. M2 follow-up

用户已明确 M2 老品评估后续也应弱化或删除预测区间。本轮只记录为 M2 follow-up，不修改 M2。
