# M2 当前模型结构分析与 lifecycle-aware challenger proposal v0.1

日期：2026-07-26
状态：`ALGORITHM DEVELOPMENT EXECUTED — DEVELOPMENT FAIL — NOT PRODUCTION`

## 1. 结论

当前 M2 已经正确隔离分成正向现金、冲销和买断，但作品级模型的两阶段结构仍然过于
粗糙：

- exact v0.3 的 occurrence–amount 只是对旧候选按 `segment × origin` 乘一个
  常数，没有读取作品自身的状态变化。
- v0.4 的 global hurdle 已使用 logistic 与 `log1p(amount)`，但特征仍围绕
  `dense/intermittent/dormant` 静态分群，且不是当前 human-anchored 主线。
- v1.0 的 occurrence 是 `segment × horizon` 平滑发生率；conditional positive
  amount 仍来自人工主力/边缘渠道公式，不是长尾条件金额回归。
- TSB challenger 的发生和金额都由单序列指数平滑驱动，无法区分稳定、下滑、失活后
  复苏等不同状态；它使 active WAPE 恶化 10.48%、dormant WAPE 恶化 82.65%。

因此下一步不再调 learnedGlobal 或 TSB，而是新增一个隔离的
`M2-lifecycle-aware-revenue-forecast-challenger-v0.1`：

```text
as-of sales-share history
  -> lifecycle(active/stable/decline/dormant/revival)
  -> P(future positive sales-share cash | lifecycle, history)
  -> E(positive cash | occurrence, lifecycle, history) on log1p scale
  -> subtract existing independently modeled reversal
  -> net future sales-share cash
```

该候选只用于 development 实验，不进入 production loader、route、forecast API，
不替换 exact v0.3，也不改变人工账单权威或 cash boundary。

## 2. 当前代码结构

### 2.1 Revenue forecast pipeline

当前受控 human-anchored 路线为：

1. `materialize_human_anchored_cases.py`
   - 从人工确认的分成账单和 canonical 渠道映射构造 2021—2025 月序列；
   - 正向现金与冲销分开；
   - 只从作品首次真实分成观察后补齐 observed-zero 月；
   - 生成 primary 36 个月 case 与 auxiliary 3/6/12/18/24 个月 case。
2. `run_m2_human_anchored_development.mjs`
   - 校验 materialization manifest 与摘要；
   - join case 与 origin 当时的 history；
   - 执行按作品外五折 primary evaluation；
   - 执行 `origin < outer && labelAvailableAsOf <= outer` 的 strict rolling。
3. `humanAnchored.js`
   - 拟合人工公式参数、专家层、occurrence/reversal 与残差分位数；
   - 外层全局 FVA 不通过时回退 learnedGlobal。
4. `humanAnchoredTsb.js`
   - 在相同 runner 中增加 TSB mode；
   - 复用 learnedGlobal 和 reversal，只替换正向发生/金额过程；
   - 失败后 `lambda=0` 回退。
5. `metrics.js`、`portfolio.js`、`automation.js`
   - 计算作品 case、origin 组合、origin×horizon 组合、概率和业务损失指标。

旧 current v0.3/v0.4 路线仍由 `run_m2_current_candidate.mjs` 重放：

```text
B4 comparator
 -> v0.2 group/reliable scale
 -> v0.3 occurrence-amount scale
 -> v0.4 global model bakeoff / ensemble / hierarchy / conformal
```

它是历史 exact fallback 与审计入口，不是本轮修改目标。

### 2.2 Feature generation

当前存在三套特征语义：

| 路线 | 输入特征 | 局限 |
|---|---|---|
| exact v0.3 | `segment`、origin、旧候选 point | two-part 只形成 segment 级缩放 |
| v0.4 global | trailing 3/6/12/24、occurrence、months-since-positive、route | 只有 dense/intermittent/dormant；未进入当前 human-anchored 主线 |
| v1.0/TSB | 12 月渠道收入、最近月、累计收入、年龄、单序列 positive/reversal | 生命周期只作为人工比例或旧三分群，不表达状态转移 |

现有 materializer 已提供满足本轮需要的严格 history：

- `positiveSeries`
- `reversalSeries`
- `startsAt`
- `through = origin`
- `observedZeroMonthsIncluded=true`
- `unobservedMonthsZeroFilled=false`

新候选不使用静态渠道角色、收入模式或品类作预测特征，因为这些属性尚无历史
`effectiveAt/availableAt`。

### 2.3 Training/evaluation split

| 评估 | 当前实现 | 可回答的问题 | 不能回答的问题 |
|---|---|---|---|
| primary cross-work | deterministic 5-fold；验证作品不进入本折训练 | 换一批作品的同窗 development 表现 | 时间独立性 |
| strict auxiliary | 只读更早 origin 且标签已在 outer origin 成熟的行 | earlier-label rolling 稳定性 | 独立 36 月 later-origin |
| exact v0.3 overlap | 相同 work fold 后筛选重叠 case | 同窗配对诊断 | champion/release |

2023-01—2023-04 later-origin 连续块已被资格审计拒绝；本轮不读取该块、不拆月、
不打开 final holdout。

### 2.4 Lifecycle handling

当前 human-anchored materializer 只生成：

```text
active: last 12 months have >3 positive months
intermittent: last 12 months have 1—3 positive months
dormant: last 12 months positive cash is zero but history曾发生
```

这些是稀疏度分群，不是生命周期状态。它不能区分：

- 持续稳定收入；
- 明显下滑；
- 活跃增长或不规则活跃；
- 长期失活；
- 失活后近期复苏。

TSB 虽然逐月更新发生概率，但同一平滑公式同时处理上述状态，导致 intermittent
改善时把误差转移到 active 和 dormant。

### 2.5 Amount prediction

| 模型 | conditional amount 方法 | 已知问题 |
|---|---|---|
| exact v0.3 | 正收入 case 的实际/旧 point 总额比例 | 只有 segment 常数 |
| v0.4 regularized hurdle | positives 上 `log1p` ridge | 与当前主线脱节，未表达五状态 |
| v1.0 learnedGlobal | 人工主力/边缘渠道生命周期公式 | 36 月 WAPE 0.4402，仍低估长尾 |
| TSB | positive 月指数平滑 level × horizon | conditional amount WAPE 0.5413、bias +0.2185 |

目标分布中 P99 约 168,564、变异系数约 10.10；直接平方误差或原值均值容易被极少数
作品支配，纯 log median 又容易系统性低估总现金。因此新 amount 层同时使用
`log1p`、Huber 鲁棒损失、有限 revenue weight 与 lifecycle 收缩校准。

## 3. 新模型设计

### 3.1 Lifecycle classifier

分类只读取 origin 当时的正向分成月序列，规则固定且互斥：

1. `revival`：最近 3 月再次发生正收入，之前至少 9 月无正收入，且更早历史曾发生。
2. `dormant`：最近 12 月无正收入，但更早历史曾发生。
3. `decline`：最近 3 月均值不超过之前 9 月的 60%，或最近 12 月
   `log1p(revenue)` 趋势斜率不高于 -0.08。
4. `stable`：最近 12 月至少 8 个正收入月，最近/之前均值比在 0.75—1.25。
5. `active`：其余仍活跃或增长、不规则活跃状态。

该分类不是用未来标签训练的分类器；它是 as-of state encoder。

### 3.2 Occurrence

对作品 \(w\)、origin \(o\)、horizon \(h\)：

\[
Z_{woh}=\mathbf 1(S_{woh}>0)
\]

\[
P(Z_{woh}=1\mid x_{wo},L_{wo},h)
=\operatorname{logit}^{-1}(\beta_0+\beta^\top x)
\]

其中 \(x\) 包含：

- trailing 1/3/6/12/24 正收入的 `log1p`；
- 3/6/12/24 月发生率；
- 正金额均值/中位数；
- 距上次正收入月数；
- recent/prior log ratio；
- 12 月 log trend；
- history age、horizon；
- lifecycle one-hot 与 lifecycle×horizon。

logistic 使用 ridge；随后按 lifecycle 对 observed/predicted log-odds 差做有限样本
收缩校准。外层 validation 指标不改变配置。

### 3.3 Conditional positive amount（初始 proposal）

只在 \(S_{woh}>0\) 的训练行上拟合：

\[
\log(1+S_{woh})=\alpha_0+\alpha^\top x+\epsilon
\]

损失为 Huber，样本权重为：

\[
w_i=\min\left(5,\max\left(1,
\left(\frac{S_i}{\operatorname{median}(S)}\right)^{0.25}\right)\right)
\]

这保留 log 长尾稳健性，同时让高收入作品对 WAPE 目标具有更高影响。初始 proposal
还计划把 conditional amount 按 lifecycle 向 global ratio 收缩，并用训练正收入
P99×3 限制不稳定外推。快速实验随后证明这个 cap 会破坏头部现金尺度，最终 raw
challenger 改为不截断的 lifecycle log-ratio；所有中间配置和结果均保留在 public
JSON 的 `completedRapidExperiments`。

最终正收入点预测为：

\[
\hat S_{woh}=\hat P(Z_{woh}=1)\times
\widehat{E}(S_{woh}\mid Z_{woh}=1)
\]

### 3.4 Reversal 与 net cash

本轮不改变 reversal：

\[
\hat Y_{woh}=\hat S_{woh}-\hat R_{woh}
=\hat S_{woh}(1-\hat r_{\text{legacy segment},h})
\]

其中 \(\hat r\) 复用 `fitM2HumanAnchoredReversal`。这保证本轮唯一主要结构变化是
lifecycle-aware occurrence 与 positive amount，不把冲销、买断或现金权威混入
非负金额模型。

## 4. 实验合同

固定记录：

| 字段 | 值 |
|---|---|
| dataset version | `M2-human-anchored-sales-share-development-2021-2025-v0.1` |
| 初始 feature version | `M2-lifecycle-history-only-features-v0.1` |
| 最终 raw feature version | `M2-lifecycle-revival-selected-state-log-ratio-features-v0.5` |
| baseline | frozen learnedGlobal + common reversal |
| challenger | lifecycle-aware logistic occurrence + Huber log amount |
| primary split | deterministic cross-work 5-fold |
| auxiliary split | strict earlier-origin/earlier-label rolling |
| outer metric selection | raw challenger 禁止；revival-only 仅作明确标记的 post-hoc 诊断 |
| later-origin/final holdout | 不打开 |

每个 experiment 在 public JSON 中保存：

- `datasetVersion`
- `featureVersion`
- 完整 `modelConfig`
- primary 与 strict rolling `evaluation`

逐作品预测和误差只保存在 Git ignored private evaluation artifact。

## 5. 新增评价

### 5.1 Revenue-weighted WAPE

明确把 canonical WAPE 记录为 revenue-weighted MAE：

\[
\operatorname{RW\text{-}WAPE}
=\frac{\sum_i|\hat y_i-y_i|}{\sum_i|y_i|}
\]

它不是每个作品等权的 MAPE。报告同时保留 signed bias。

### 5.2 Lifecycle segment metrics

对五个状态分别报告：

- case 数；
- challenger/baseline WAPE；
- 相对 WAPE；
- signed bias；
- occurrence Brier/log loss/precision/recall；
- positive amount conditional WAPE、bias、log1p MAE。

### 5.3 Top-revenue work error

先按作品聚合所有评估 case 的 `actualPositive`，再报告累计 top 1%/5%/10%：

- 正收入占比；
- challenger 与 baseline WAPE；
- 相对 WAPE；
- 绝对误差占全部误差的比例。

公开 artifact 不包含作品 ID；逐作品明细只在 ignored private artifact。

## 6. 实现隔离

| 范围 | 实现 |
|---|---|
| canonical challenger core | `src/domain/m2Current/lifecycleAware.js` |
| 固定配置 | `config/m2-current-lifecycle-aware.v0.1.json` |
| runner | 复用 `run_m2_human_anchored_development.mjs` 的 lifecycle-aware mode |
| public synthetic | `diagnose:m2:lifecycle-aware` |
| private experiment | `develop:m2:current:lifecycle-aware` |

明确未修改：

- `src/domain/m2Current/loader.js`
- `src/domain/m2Current/route.js`
- exact v0.3 config/core/artifact
- revenue-share fact 与人工账单成员权威
- buyout/pure-buyout boundary
- production API 与启动 composition

## 7. 决策边界

本轮结果无论改善或恶化，都只回答“该固定 challenger 在当前 development 数据上
是否比 frozen learnedGlobal baseline 更好”。它不授权：

- exact v0.3 替换；
- champion selection；
- independent later-origin 或 final holdout；
- provider、数据库、Canary/full160；
- release 或 M3 formal。

当前 `CANARY_FAIL` 与 `AUTOMATION_BLOCKED` 保持不变。

## 8. Baseline、快速实验与最终决定

基准始终是同一数据、同一折、同一 reversal 层上的 frozen
`learnedGlobal + common reversal`。五轮实验均记录 dataset version、feature
version、完整配置和 primary/strict evaluation：

| 实验 | amount / routing | primary WAPE | 相对 baseline | strict WAPE | 相对 baseline |
|---|---|---:|---:|---:|---:|
| 01 | 直接高维 Huber log | 0.75589798 | +71.71% | 0.70375953 | +70.85% |
| 02 | baseline-offset 高维 Huber log | 0.69860444 | +58.69% | 0.61937716 | +50.36% |
| 03 | state log-ratio + P99×3 cap | 0.71085206 | +61.47% | 0.68796569 | +67.01% |
| 04 | 不截断 state log-ratio raw challenger | 0.50139298 | +13.89% | 0.62275977 | +51.19% |
| 05 | 仅 revival 使用 challenger，其余回退 baseline | 0.44016120 | -0.0145% | 0.41189883 | -0.0048% |
| baseline | learnedGlobal + common reversal | 0.44022495 | — | 0.41191878 | — |

实验 04 是可以独立解释的 raw lifecycle-aware challenger，primary 与 strict 均明显
失败。它改善了 primary bias（-0.06749 对 -0.12377），但以 WAPE 明显恶化为代价；
dormant raw WAPE 达到 1.75625，说明仅靠历史现金形态不能可靠区分“长期无收入”
与“即将恢复收入”。

实验 05 只用于检查实验 04 中唯一同时在 primary 和 strict 改善的 `revival` 状态。
它的路由来自已看见的 development 指标，状态样本仅 15 个 primary case，因此不是
预注册或独立选择。其 primary/strict 相对 WAPE 改善只有 0.0145%/0.0048%，均低于
1% materiality；top 1%/5%/10% 收入作品 WAPE 与 baseline 完全相同。不能把该
微小 post-hoc 数值变化解释为模型升级。

在 5,203 个 exact v0.3 overlap case 上，raw lifecycle、selected、learnedGlobal
和 exact v0.3 WAPE 分别为 0.27458711、0.27723899、0.27723899 和 0.37610234。
这只说明同一旧 development 子集上的相对结果；exact v0.3 点值未进入 lifecycle
拟合或 state-routing 选择，但该子集也不是独立 later-origin，不能覆盖总体和 strict
失败。

最终决定：

- `LIFECYCLE_AWARE_DEVELOPMENT_FAIL_TRIVIAL_POSTHOC_GAIN`
- `modelUpgradeSupported=false`
- `exactV03ReplacementSupported=false`
- exact v0.3 fallback、人工账单权威、sales-share cash boundary 和 production
  路径保持不变。

这轮实验支持的下一步不是继续调五状态阈值，而是等待具有 historical
`effectiveAt/availableAt` 的真实可售状态、上线状态或其他可审计状态信号；仅凭
收入序列构造 lifecycle，无法为高收入作品带来可测的 WAPE 改善。
