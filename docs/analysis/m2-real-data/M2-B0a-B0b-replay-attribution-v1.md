# M2 B0a → B0b 重放差异归因

- Stage 1 是旧历史聚合锚点，没有相同 case fingerprint；其到 Stage 2 的差异不可作因果归因。
- Stage 2–7 使用完全一致的 statistically-scoreable case keys 与 actual fingerprint。
- 本报告仅作审计，不参与 comparator 或候选选择。

| 阶段 | case count | all-scoreable WAPE | signed bias | served revenue coverage | top10 coverage | 高价值 served WAPE | 高价值 bias |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1 B0a旧历史最终聚合锚点 | 65845 | 未定义 | 未定义 | 未定义 | 未定义 | 未定义 | 未定义 |
| 2 旧模型+development-purge历史代理+固定B0b可计分case keys | 12223 | 0.5840 | -0.0548 | 0.9701 | 0.9944 | 0.4229 | -0.0485 |
| 3 旧模型+cutoff-as-of quantiles/priors | 12223 | 0.5838 | -0.0551 | 0.9701 | 0.9944 | 0.4229 | -0.0485 |
| 4 旧模型+as-of-safe features | 12223 | 0.5749 | -0.0406 | 0.9701 | 0.9944 | 0.4183 | -0.0310 |
| 5 旧模型+新business eligibility | 12223 | 0.5749 | -0.0406 | 1.0000 | 1.0000 | 0.4721 | 0.0249 |
| 6 旧模型+新abstention scoring | 12223 | 0.5749 | -0.0406 | 1.0000 | 1.0000 | 0.4721 | 0.0249 |
| 7 完整B0b无泄漏内核 | 12223 | 1.6666 | 1.1961 | 1.0000 | 1.0000 | 0.5214 | 0.1804 |

## 差异主因

- 旧约 132% 数值为 `1.3167`，其 null evaluation value 为 0，只能称业务覆盖混合量，不能称模型 WAPE。
- Stage 2→4 的 as-of 量化/先验/特征合计变化：`-0.0091`。
- Stage 4→6 的 eligibility 与 abstention raw 模型 WAPE 变化：`0.0000`。
- Stage 6→7 从旧 selector 到完整 B0b 公式的变化：`1.0917`，是固定 keys 后的主要来源。

## 解释边界

- quantile/prior、历史不可得 rating/risk、eligibility、abstention scoring 与最终 B0b 公式分别逐层切换。
- 不把约 64% 到约 132% 的全部变化归因于去泄漏；Stage 1→2 首先包含不可重建的人口与历史实现差异。
- 没有作品、渠道、private 路径、原始行或 PI endpoints。
