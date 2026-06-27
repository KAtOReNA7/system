# M2 版权到期缺口 readiness 分析 v1

生成日期：2026-06-27

本报告只分析 610 个版权到期缺口的 readiness 影响。不写正式主数据，不进入 M3，不包含真实作品名、作者名、渠道名或原始明细。

## 总结

610 个版权到期缺口仍是 M2 formal readiness 的硬阻断。它们覆盖约 20.88% 的聚合收入，且当前 limited staging 中没有可直接应用的版权到期候选值。

| 指标 | 数值 |
|---|---:|
| 全库作品数 | 3054 |
| 缺版权到期作品数 | 610 |
| 缺口聚合收入 | 26935391.02 |
| 全库聚合收入 | 129023545.30 |
| 缺口收入占比 | 20.88% |

## 来源 cohort 分布

| cohort | 缺口数量 | 聚合收入 |
|---|---:|---:|
| publication_cohort | 318 | 15509803.57 |
| web_original_cohort | 208 | 7553466.51 |
| mixed_or_uncertain_cohort | 1 | 26760.19 |
| unmatched | 83 | 3845360.75 |

注：该分布由本地 staging candidate-source 覆盖情况聚合推断，不包含行级明细。

## 高收入覆盖影响

| 范围 | 缺口数量 | 缺口收入 | 占该范围收入 | 占全库收入 |
|---|---:|---:|---:|---:|
| 收入 Top 1% | 11 | 13971535.66 | 20.30% | 10.83% |
| 收入 Top 5% | 36 | 22232668.49 | 21.20% | 17.23% |
| 收入 Top 10% | 61 | 23808242.84 | 20.76% | 18.45% |

高收入区间中仍有明显版权到期缺口，不能用“低影响缺口”处理。

## 当前候选覆盖

| 项目 | 数量 |
|---|---:|
| limited staging 已接受版权到期候选 | 2444 |
| 610 缺口中仍有已接受版权到期候选 | 0 |
| 610 缺口中有版权开始候选 | 526 |
| 610 缺口中有作者候选 | 337 |
| 610 缺口中当前无任何候选 | 83 |

当前 limited staging 已应用的 2444 个版权到期候选主要来自两个来源：原始库与版权台账。剩余 610 个不能仅靠当前 staging 直接补齐，需要重新进入候选提取、人工确认或 formal waiver 流程。

## 对 M2 预测的影响

| 项目 | 数量 | 影响 |
|---|---:|---|
| operating_window_forecast_pending_expiry | 610 | 版权期预测和剩余版权月数不可完整落地 |
| 缺口中仍可保守数值预测 | 464 | 可用于本地候选观察，但不是 formal complete |
| 缺口中仅观察/无数值预测 | 146 | 更适合进入 readiness 缺口队列 |

## 按收入模式分布

| 收入模式 | 数量 |
|---|---:|
| pure_sales_share | 488 |
| buyout_plus_sales | 47 |
| pure_buyout | 74 |
| unknown_revenue_model | 1 |

版权到期缺口并不集中于买断样本，大部分仍是实销口径作品，因此不能通过买断周期规则绕开。

## 处理建议

1. 优先处理 Top 1% / Top 5% 收入区间中的缺版权到期样本。
2. 对 publication_cohort 和 web_original_cohort 分别走版权部确认路径，避免混用来源。
3. 对 83 个 unmatched 样本先做身份匹配，不应直接补版权到期。
4. 对低收入且仅观察的样本可以设计 formal waiver，但需要用户明确授权。
5. 在版权到期闭环前，不建议进入 M3。

## 证据路径

- `docs/analysis/m2-real-data/M2-business-readiness-after-dual-source-staging-v1.json`
- `docs/analysis/m2-real-data/M2-forecast-output-type-after-dual-source-staging-v2.json`
- `docs/analysis/m1-master-data/M1-dual-source-limited-staging-apply-result-v1.json`
- `docs/analysis/m1-master-data/M1-dual-source-masterdata-backfill-dry-run-v2.json`
- `docs/analysis/m1-master-data/M1-dual-source-auto-apply-rule-v2.json`

