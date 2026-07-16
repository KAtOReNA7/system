# M2 C1 失败根因工程审计

结论：未发现可证明的 C1 工程实现错误；不执行修复或重跑。C1 最终冻结为 `FAIL`，全部结果继续 `not_for_formal_decision`。

## 根因

预注册 fallback 将仅使用正收入月的 `robust_positive_median` 与保留零月的 `trailing_mean_12` 各取 50%。前者在稀疏和沉寂序列上把偶发正收入复制到未来每个月，形成持续月收入幻觉。前两个 outer origin 缺少预注册的 inner 支持，后三个 origin 的 148 个候选均没有通过 bias guard，因此五个 origin 依法使用同一个冻结 fallback；这属于候选/回退设计失败，不是 selector 或排序代码错误。

## 逐项工程核验

| 检查 | 结论 |
|---|---|
| 组件单位 | 月路径只汇总一次为 horizon 点值，无二次乘 horizon |
| 权重 | 非负、和为 1、只应用一次 |
| trailing mean 12 | 使用零填充的 12 个完整月月均 |
| 渠道汇总 | 渠道预测之和与作品点值严格对账 |
| truth 汇总 | 渠道 actual 之和与作品 actual 严格对账 |
| selector | 先执行 bias guard，再按目标函数升序取最小值 |
| bias penalty | 已进入目标函数；无可行候选时按冻结规则回退，不放宽 gate |
| 重复聚合/双计 | 未发现 |

## 总体归因指标

| 指标 | 结果 |
|---|---:|
| C1 WAPE | 3.8502 |
| C1 signed bias | +351.14% |
| C1 / actual 聚合比 | 4.5114 |
| C1 / B4 聚合比 | 2.0543 |
| C1 / B1 聚合比 | 1.8195 |

分 horizon、dense/sparse/dormant 与收入模式的完整脱敏聚合指标见同名 JSON。小样本使用主格与互补格抑制。

## 边界

未改变组件、候选、gate、eligibility、scoreability 或 case keys；未打开 final holdout、embargo shadow 或 60-month deferred labels。公开产物不含作品、作者、真实渠道、private 路径、原始收入行或内部 PI endpoints。
