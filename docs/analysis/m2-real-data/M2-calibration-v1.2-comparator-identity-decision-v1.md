# M2 calibration v1.2 comparator 身份决策

- 冻结日期：2026-07-15
- 状态：`NOT_FOR_FORMAL_DECISION`
- 适用范围：B0b/B4 身份、practical equivalence、comparator bundle、3053 人口覆盖、Gate A 与 C1 预注册
- 不授权：final holdout、embargo shadow、60-month deferred labels、C2-R/C2/C3、release、M3

## 1. 冲突与优先级

旧 v1.1 历史实现、calibration-spec-v1、v1.1 scoring amendment 与当前报告存在两项实质冲突：

1. 旧 v1.1 的点预测引擎是 Model E selector（内部含 A/B/C/D），历史 backtest 对 conservative 行再切换 Model D，而 forward serving 对所有可服务行仍使用 Model E。历史实现本身没有单一的 backtest/forward 身份。
2. 此前称为 B0b 的新内核是单一 lifecycle-robust 公式，不含 Model E selector；旧 OR 等价规则又把“CI 包含 0”误当成“已证明等价”，据此锁定 B1。

依据用户最新明确决定，v1.2 对上述主题优先。旧文档继续保留为历史证据，不再控制当前身份和 comparator。

## 2. faithful B0b 与 B4

`B0b_v1_1_leakage_free_replay` 冻结为：

- canonical point identity：Model E selector；
- 历史 rating 快照不可得，统一使用中性 C；data-gap/risk/current state 不进入历史特征；
- quantile、prior、route、selector state 均只读 cutoff 当时及以前；
- pure sales 按渠道运行旧 A/B/C/D 公式后求和；pure buyout 使用历史周期月均等效；buyout+sales 只预测未来实销；
- 业务 serving 独立于模型 raw point；abstained 的 served 为 null；
- 不重放 target-20%-coverage 边界、current-state gate、blocked-null-to-zero、未确认 spike 自动衰减或不合法的重叠 residual。

历史 conservative→D 与 forward E-for-all 无法同时忠实，因此 v1.2 选择 Model E 作为统一 raw point 身份，把 historical gate/post-processing 冲突写入 machine-readable formula-difference manifest。这个选择是合法、可复现的 canonicalization，不声称 bit-for-bit 重建旧系统的两个矛盾出口。

此前称为 B0b 的生命周期稳健单公式改名为 `B4_formula_switched_legacy_variant`。它仍是无泄漏、同 case-key 的合法基线，但不是 v1.1 identity。

## 3. strict practical equivalence

以 development all-scoreable raw WAPE 的合法经验 leader 为直接参照；每个模型必须同时满足：

1. WAPE 相对差绝对值不超过 1%；
2. paired work×origin block-bootstrap 的相对 WAPE delta 95% CI 完全位于 `[-1%, +1%]`；
3. signed bias 差不超过 2 个百分点；
4. top10 和每个 3/6/12/18/24 月 WAPE 均不得回退超过 2%。

缺失指标、非法分母或任一条件失败都不是等价。只有严格等价集合内才按 `B1 < B2 < B3 < B0b < B4` 选择更简单结构，不允许非传递 chaining。

## 4. baseline 最终冻结

development-forward 的 18615 个 expected case/model 与 12223 个 scoreable case/model 已由独立 case-universe 枚举复核，不再只做模型间交集。

| 模型 | all-scoreable WAPE | signed bias |
|---|---:|---:|
| faithful B0b | 1.6996 | +110.24% |
| B1 | 1.9022 | +147.94% |
| B2 | 1.8640 | +144.97% |
| B3 | 1.6995 | +123.48% |
| B4 | 1.6666 | +119.61% |

B4 是经验 WAPE leader。严格等价集合只有 B4，因此 `primaryPerformanceComparator=B4`。固定 bundle 同时保留：B1 naive、B3 business-aware、faithful B0b。B0a 只作历史审计。

所有 baseline 的 bias 都未达到候选绝对门槛；这不改变 comparator 身份，也不能用于放宽 C1 gate。

## 5. 完整 3053 人口

- scoreable works：1044 / 3053（34.20%）；
- unscoreable works：2009；其中 1610 部在冻结 development origin 均尚不可观察，399 部在所有可用 origin 均不足 12 个月历史；
- scoreable works 覆盖截至 2026-04 完整月历史收入的 73.23%；
- served works 与 served 收入覆盖：因 scoreable/served 的互补作品数小于 10，公开结果只给安全范围并对精确值做互补抑制；不得用 1044 减去公开 served 数反推小格；
- 完整 3053 收入桶的 scoreable coverage：top1 80.28%、top5 75.64%、top10 74.26%；served coverage 与互补小格一起抑制。

这里的“完整全库覆盖”是事后人口描述，不是 origin-level top10 模型 gate；不进入模型、threshold、comparator 或 C1 参数选择。192872 条权威事实继续全部对账；覆盖分母只使用截至 2026-04 的 192869 条完整月事实，3 条未完整月事实不进入预测或收入覆盖。

v1.1 决策记录曾把“top10 served revenue coverage 至少 90%”列为 pre-C1 gate，但它使用重叠 backtest case actual 和 scoreable 内部分母；若改套完整 3053 收入桶，则历史 scoreability 上限本身只有 74.26%，候选又不得移动 eligibility，因此该条件会在任何候选训练前形成不可解 gate。最新任务把完整 3053 覆盖改为事后人口披露，并给出穷尽的 Gate A 条件清单，其中不含覆盖率目标。按规则优先级，v1.2 明确取代旧 gate，而不是把 90% 数值调低；90% 继续保留为旧口径非回归审计证据，不参与 C1 授权、训练或阈值选择。

## 6. Gate A 与 C1

Gate A 的内容条件、全量验证和 Phase A commit/push 分开证明。tracked Gate A 文件记录内容与验证；commit SHA 不能自我写入同一 commit，因此推送后另由 Git-ignored runtime receipt 验证 `HEAD == upstream`、工作区 clean、private 未跟踪及全部条件为 true。

只有该 runtime receipt 全部为 true 时才允许开始 C1。C1 的组件、有限参数格、inner-origin 选择、seed、routing 和绝对验收门槛均已在 v1.2 spec 与设计报告中预注册。C1 无论 PASS/FAIL 都不得打开 final holdout，不得开始 C2-R/C2/C3。
