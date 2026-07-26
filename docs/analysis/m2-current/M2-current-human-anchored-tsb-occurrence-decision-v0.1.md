# M2 learnedGlobal + TSB occurrence 决策 v0.1

日期：2026-07-26

候选：`M2-current-human-anchored-tsb-occurrence-challenger-v0.1`

结论：`TSB_OCCURRENCE_DEVELOPMENT_FAIL`

## 决策摘要

本轮在公开预注册提交 `8557080` 后，使用本机受控 private capability 完成唯一一个
`learnedGlobal + TSB occurrence/positive-amount` 候选。learnedGlobal 人工公式、
参数名称与原网格保持冻结，四专家和 hierarchy 层关闭；TSB 只使用预注册的
`3 × 3 × 3 = 27` 个组合，并只在 inner earlier-origin folds 选择。

候选在 36 个月主 development 上改善了 business loss，也明显改善 intermittent，
但总体 WAPE、raw/blend FVA、active、dormant、作品聚类 bootstrap、严格短周期
rolling-origin 和时间块多数性均失败。因此恢复 `lambda=0`，selected pipeline
继续使用 learnedGlobal common-reversal fallback。

## 数据与执行完整性

| 项目 | 结果 |
|---|---:|
| 权威作品 | 3,053 |
| 2021—2025 有分成事实作品 | 2,682 |
| 现代窗口分成事实 | 167,972 行 |
| 36 个月主评估 | 1,125 部 / 12,039 case |
| 严格短周期评估 | 2,650 部 / 74,320 case |
| exact v0.3 重叠 | 5,203 case |
| mapping coverage | 100% |
| 金额守恒差 | 0 |
| 未成熟标签零填充 | 0 |
| 买断现金进入模型 | false |
| 未观察月份零填充 | false |

零发生月只在作品已有分成观察后按月进入 TSB occurrence 更新；正向金额只在
正向分成现金月份更新。负数冲销保持独立，并在 comparator 与 candidate 间使用
同一训练折 reversal 状态。

## 主评估

| 视图 | WAPE | bias | MAE | business loss |
|---|---:|---:|---:|---:|
| learnedGlobal + common reversal | 0.44022495 | -0.12377106 | 16,502.34 | 21,787.84 |
| raw TSB | 0.54346231 | 0.22068122 | 20,372.31 | — |
| pre-fallback blend | 0.45348237 | 0.03777402 | 16,999.30 | 20,895.13 |
| selected pipeline | 0.44022495 | -0.12377106 | 16,502.34 | 21,787.84 |

pre-fallback blend 的 business loss 改善 `4.10%`，但 WAPE 相对 learnedGlobal
恶化 `3.01%`。中央 80% 区间覆盖为 `0.79774068`；作品 case、origin 组合和
origin×horizon 组合 WAPE 分别为 `0.45348237 / 0.06858755 / 0.06858755`。

## FVA

| 层 | absolute WAPE FVA | 相对 WAPE |
|---|---:|---:|
| raw TSB candidate | -0.10323736 | +23.4510% |
| pre-fallback blend candidate | -0.01325742 | +3.0115% |
| selected pipeline | 0.00000000 | 0.0000% |

selected FVA 为 0 只表示失败后安全回退，不能替代 raw/blend candidate 的负 FVA。

## 生命周期归因

| 分群 | learnedGlobal WAPE | blend WAPE | 相对变化 | blend bias |
|---|---:|---:|---:|---:|
| active | 0.36836955 | 0.40697875 | +10.48% | 0.13086970 |
| intermittent | 0.82752663 | 0.70411859 | -14.91% | -0.46402357 |
| dormant | 1.00000000 | 1.82646345 | +82.65% | -0.12830012 |

intermittent 的相对改善是真实的，但 active 明显退化；dormant 虽不再系统性全漏报，
绝对误差反而大幅恶化，不能用 bias 改善替代质量门禁。

组件归因：

- occurrence Brier / log loss：`0.02951497 / 0.66099129`；
- 正向金额条件 WAPE / bias：`0.54127579 / 0.21852003`；
- reversal WAPE / bias：`1.00794961 / -0.89110354`。

主要问题是 TSB 正向金额层高估、冲销层仍严重低估，以及这种组合在 active/dormant
上的误差转移；不是账单分区、买断隔离或未成熟标签零填充问题。

## 严格 rolling-origin 与时间证据

严格短周期 74,320 case 上：

- learnedGlobal common-reversal WAPE：`0.41191878`；
- blend WAPE：`0.44487050`，相对恶化 `8.00%`；
- raw/blend FVA：`-0.09610318 / -0.03295172`；
- origin 组合 WAPE：`0.09729408`；
- origin×horizon 组合 WAPE：`0.11405848`；
- 中央 80% 区间覆盖：`0.84783369`。

11 个非相邻季度 origin 各算一个时间证据块，只有 3 个块改善；作品和 case 数没有
被用来替代时间块数量。

作品聚类 bootstrap 的 blend 相对 learnedGlobal WAPE 95% 区间为
`[-2.85%, 9.26%]`，上界大于 0，改善不稳定。

## exact v0.3 重叠

在 5,203 个 exact-overlap case 上，使用与主评估相同 work fold 的 inner selection，
未根据 overlap 指标重新选参：

| 模型 | WAPE |
|---|---:|
| exact v0.3 | 0.37610234 |
| learnedGlobal common reversal | 0.27723899 |
| pre-fallback blend | 0.26352433 |
| raw TSB | 0.29889452 |

blend 相对 exact v0.3 改善 `29.93%`，但这仍是同窗 development 子集，不能覆盖
总体、active/dormant、bootstrap 和时间块失败，也不是独立 later-origin。

## 冻结决定

- 冻结本轮 TSB smoothing、blend 网格、公式和失败结论；
- 不开发第二候选，不扩大网格，不切换其他模型家族；
- 不修改冻结 v1.0，不替换 exact v0.3；
- 保持 `currentDecision=CANARY_FAIL`；
- 保持 `automationDecision=AUTOMATION_BLOCKED`；
- 2023-01 至 2023-04 连续 later-origin 块继续禁止打开或拆分；
- 最早可能独立 origin 仍为 2026-01，需完整标签到 2029-01，并恢复原始 frozen
  v1 state；
- final holdout、provider、数据库、Canary/full160、release 与 M3 formal 未授权。

代码合并只表示受控开发实现与失败证据进入仓库，不等于模型发布。
