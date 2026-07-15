# M2 基线身份与 comparator 修正

结论：旧 v1.1 的合法重放身份是 Model E selector 的无泄漏、路由化重放；此前名为 B0b 的生命周期稳健单公式已改名 B4。所有结果仍为 `not_for_formal_decision`。

## 开发集基线

| 模型 | all-scoreable WAPE | signed bias | served WAPE | 高价值 WAPE | 内部 80% coverage |
|---|---:|---:|---:|---:|---:|
| B0b | 1.6996 | 1.1024 | — | 0.5546 | 0.8378 |
| B1 | 1.9022 | 1.4794 | — | 0.8027 | 0.8360 |
| B2 | 1.8640 | 1.4497 | — | 0.7587 | 0.8295 |
| B3 | 1.6995 | 1.2348 | — | 0.5316 | 0.8374 |
| B4 | 1.6666 | 1.1961 | — | 0.5214 | 0.8337 |

## 冻结选择

- 经验 WAPE leader：`B4`。
- primary performance comparator：`B4`。
- 严格实用等价集合：`B4`。
- 固定伴随比较器：B1、B3、faithful B0b；B0a 只作历史审计。

严格等价必须同时满足 WAPE 相对差不超过 1%、相对差 bootstrap 95% CI 完全落在 ±1%、bias 差不超过 2 个百分点，以及 top10 与每个核心 horizon 回退不超过 2%。

内部区间只用于 coverage/WIS 审计；公开输出仍只有单点值、年度拆分、confidence 和 limitation。
