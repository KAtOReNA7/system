# M2 成熟度复核与多粒度收入预测重构 v0.6

> 历史检查点：本报告记录 2026-07-24 的旧 formal-cash 目标。当前目标已由
> `M2-sales-share-only-target-decision-v0.1.md` 改为纯分成收入；当前状态请
> 以 `M2-v2-current-state-index-v0.12.md` 和 v0.6/v0.7 JSON 证据为准。

日期：2026-07-24
状态：`PORTFOLIO_DEVELOPMENT_BACKTEST_PASS_WORK_LEVEL_BLOCKED`
决策性质：development evidence；不是 final holdout、release 或生产授权

## 技术摘要

本轮结论不是“M2 已成熟”。更准确的判断是：

1. 作品级未来现金预测仍不成熟。冻结 7,851 个 case 的 WAPE 为
   `0.50557140`，高于 `0.30` 门槛；intermittent 与 dormant 分别约为
   `0.9073` 与 `1.0002`。
2. 旧模型在 5 个半年 origin 汇总后得到 `0.08397490` 的
   origin×horizon 组合 WAPE，但扩展到 25 个逐月 origin 后，旧 rolling
   champion 的组合 WAPE 为 `0.32846914`，bias 为 `-0.30206335`。因此
   8.4% 是稀疏回测中的局部结果，不是成熟度证据。
3. 新增的 v0.5 组合模型使用 strictly as-of 的加总 additive
   Holt–Winters ensemble。在 2022-01 之后 12 个逐月 origin、30 个
   origin×horizon development cell 上，WAPE/bias 为
   `0.11681934 / -0.04876300`；seasonal naive 为
   `0.21217335 / -0.19566080`，Forecast Value Added 为 `44.94%`。
4. 该结果可支持“组合预算层已有高准确度 development backtest”，但不能支持
   “完整 M2 已成熟”。本轮窗口参与了模型设计，final holdout 仍 sealed，
   全库/Top10 cash observability 仍只有 `73.96% / 75.94%`。

## 关键发现

| 分辨率 / 模型 | 样本 | WAPE | bias | 结论 |
|---|---:|---:|---:|---|
| v0.3/v0.4 作品 case | 7,851 case | 0.50557140 | -0.01198958 | FAIL |
| v0.3/v0.4 稀疏 origin×horizon | 5 origin / 19 cell | 0.08397490 | -0.01198972 | 局部通过，不足以证明逐月稳定 |
| 旧逐月 champion 作品 case | 47,611 served case | 0.66335800 | -0.30206120 | FAIL |
| 旧逐月 champion origin×horizon | 69 cell | 0.32846914 | -0.30206335 | FAIL |
| seasonal naive portfolio | 12 origin / 30 cell | 0.21217335 | -0.19566080 | comparator |
| v0.5 portfolio | 12 origin / 30 cell | 0.11681934 | -0.04876300 | development PASS |

v0.5 的 horizon WAPE：

| horizon | cell 数 | WAPE | bias |
|---:|---:|---:|---:|
| 3 月 | 12 | 0.15577303 | -0.08927676 |
| 6 月 | 12 | 0.13852980 | -0.04799515 |
| 12 月 | 6 | 0.07297631 | -0.02777407 |

30 个 portfolio cell 的绝对百分比误差中位数为 `0.12832459`，p90 为
`0.28366167`，最大值为 `0.31742820`；`96.67%` 的 cell 不超过 30%。
这表明加权总体误差已经显著下降，但单月 origin 的局部不稳定仍存在。

按 origin 聚类、2,000 次确定性 bootstrap 后，v0.5 WAPE 的 95% CI 为
`[0.08500048, 0.13717581]`，bias 的 95% CI 为
`[-0.09940077, 0.02145806]`。区间整体通过预注册的 WAPE 15% 和绝对 bias
10% development 门槛；它降低了偶然抽样解释的风险，但不能替代独立 holdout。

## 为什么上一步外部案例没有直接重构成功

上一步指令方向上并非完全错误：引入强基线、rolling origin、概率评价、层级一致性、
FVA 和自动门禁都是必要的。错误在于执行顺序和问题抽象：

1. **先指定算法家族，后验证信息与决策粒度。** LightGBM、Tweedie、hurdle、
   MinT 等名称被当成解决方案，而没有先证明当前输入能识别作品级突发现金，也没有
   先确定业务究竟在作品、月度组合还是年度组合上做决策。
2. **本地实现不是成熟行业实现的等价物。** v0.4 的 boosted stumps 是轻量
   自研近似，不是成熟 LightGBM/CatBoost/XGBoost；训练数据只有少量汇总特征和
   5 个外层半年 origin，无法复现 M5 的大规模 panel、交叉学习和丰富协变量条件。
3. **外部行业的数据条件没有迁移。** M5 的头部方案依赖大量相关序列以及价格、
   日历、促销等 cutoff 时已知解释变量。当前本地数据主要是历史现金、route 和
   segment；高额收入由极少数突发 case 主导，而合同、可售、渠道、发布时间和
   commitment snapshot 尚不完整。
4. **间歇需求方法的目标错位。** Croston、SBA、TSB、ADIDA 主要服务库存和
   间歇需求率，不会自动解决重尾作品现金的金额分配。本地 positive-amount WAPE
   与整体 WAPE 接近，说明主要瓶颈不是“会不会发生”，而是“发生时金额多大”。
5. **层级 reconciliation 不能创造信号。** MinT 能让上下层预测一致，却不能
   从不存在的 cutoff 信息中恢复作品级突发事件。
6. **单一 WAPE 掩盖了聚合抵消。** 作品之间的高估和低估在组合层抵消，导致
   5-origin 汇总看似准确；若不同时报告逐月 origin 和作品级结果，就会把组合
   预算能力误写成作品级能力。

外部证据也支持这一修正：M5 结果指出，顶级 LightGBM 方法的优势来自大量相关序列
与解释变量，并同时强调约 92.5% 的参赛方案未胜过简单强基线；复杂模型本身不保证
改进。[M5 结果论文](https://www.sciencedirect.com/science/article/pii/S0169207021001874)
全局模型的理论优势来自跨序列共享和受控复杂度，而不是把一个简单 stump 实现命名为
“global model”。[Global forecasting principles](https://arxiv.org/abs/2008.00444)
MinT 的作用是最小方差 reconciliation，不是补足缺失预测信息。
[MinT 论文](https://robjhyndman.com/papers/MinT.pdf)

## 数据与预测目标

正式目标保持不变：

\[
Y_{i,o,h}=
\text{future realised sales cash}_{i,o,h}
+\text{strict cutoff commitment}_{i,o,h}
\]

未承诺 future buyout、历史买断摊销和 `buyoutMonthlyEquivalent` 不进入预测。
pure-buyout 无 strict cutoff commitment 时继续 `null abstain`。

本轮新增的是决策分辨率，而不是更改现金定义：

\[
Y_{o,h}^{portfolio}=\sum_{i\in E_o}Y_{i,o,h}
\]

其中 \(E_o\) 是 origin \(o\) 时已满足 route、历史与可服务边界的作品集合。
eligibility、served coverage 与 full-library cash observability 继续分开报告。

## v0.5 数学模型

对每个 origin 先将当时可服务作品的历史现金按日历月相加，得到组合序列 \(y_t\)。
对候选参数使用 additive Holt–Winters：

\[
\ell_t=\alpha(y_t-s_{t-m})
 +(1-\alpha)(\ell_{t-1}+\phi b_{t-1})
\]

\[
b_t=\beta(\ell_t-\ell_{t-1})
 +(1-\beta)\phi b_{t-1}
\]

\[
s_t=\gamma(y_t-\ell_t)+(1-\gamma)s_{t-m}
\]

\[
\hat y_{t+k}=\max\left(
0,\ell_t+\sum_{j=1}^{k}\phi^j b_t+s_{t-m+k}
\right)
\]

\[
\hat Y_{o,h}
=c\sum_{k=1}^{h}\hat y_{o+k}
\]

季节长度 \(m=12\)。候选网格同时包含 damped Holt 与 additive
Holt–Winters，共 244 组；只使用 `2022-01` 时已经成熟的 21 个组合 cell 按
training WAPE 选择前三个模型，等权平均，并用带 5 个先验 cell 的收缩比例 \(c\)
校准。2022-01 及之后的预测真值不参与模型选择。

这一模型比作品级 global stumps 更适合当前可识别信息：它直接建模业务实际使用的
组合现金、显式处理趋势与年度季节性，并让每个 origin 的作品集合严格冻结在当时。

## 验证设计与稳健性

- 所有 history 只到当前 origin；origin 月被包含，未来月份不被读取。
- 模型选择只使用 `labelAvailableAsOf <= 2022-01` 的 cell。
- 评价使用 `origin >= 2022-01` 的 12 个逐月 origin；因 12 月 horizon 的
  right censoring，最终为 30 个成熟 cell。
- comparator 是同一人口、同一 origin、同一 horizon 的 seasonal naive。
- final holdout、embargo shadow 与 deferred labels 均未打开。
- 120 部人工预估完全跳过，没有重建、重放或替代样本。

主要限制：

1. 这是 development backtest；本轮开发已观察该窗口，不是独立确认。
2. 只有 12 个逐月 origin，仍不足以证明跨年度 regime 稳定性。
3. 组合模型不能产生可靠的作品级分配；禁止把组合总额按旧权重下放后宣称作品预测。
4. 组合只覆盖 origin 时可服务人口，不等于全库现金覆盖；observability 仍未达标。
5. 作品级突发现金高度集中，仍需要真实 as-of commitment、渠道、合同和可售状态。

## 成熟度结论

`matureDataPredictionCapability=false`。

允许的结论：

- 已建立可复现的组合层数学模型；
- 已在 development rolling-origin 窗口取得 WAPE 11.68%、bias -4.88%；
- 相对 seasonal naive 的 FVA 为 44.94%；
- 可进入独立组合验证准备。

禁止的结论：

- M2 已具备成熟作品级预测；
- 已完成独立 holdout；
- 已可自动化、Canary/full160 或 release；
- 已覆盖全部 3,053 部作品或全部未来现金。

## 后续修改方向

1. **冻结 v0.5。** 当前 2022 development 窗口不得继续用于同类调参；保留
   exact replay。
2. **独立组合验证。** 优先使用未参与本轮选择的 later-origin 数据；若需 final
   holdout，必须单独授权，并预先冻结 WAPE ≤ 0.15、|bias| ≤ 0.10、
   p90 cell APE ≤ 0.30 与 FVA ≥ 0.20。
3. **作品级信号工程。** 只接收 cutoff 时真实可得、可审计、可版本化的
   commitment、合同、可售、渠道和发布时间 snapshot；建立
   work×origin coverage 与 freshness ledger。
4. **成熟库实现的进入条件。** 只有在上述新特征覆盖足够、月度 panel 数量足够后，
   才引入成熟 LightGBM/CatBoost/Tweedie 库，并使用 grouped nested
   rolling-origin 验证；不得再实现名字相似的简化 stump。
5. **服务合同分层。** portfolio forecast、work allocation/ranking 和
   abstention 必须是三个独立 capability；组合通过不能自动授权后两者。
6. **保持现有边界。** 120 部人工预估继续取消；人工只做 post-gate QA。
   provider、数据库、final holdout、release 和 M3 formal 继续未授权。

## 可复现证据

- `config/m2-current.v0.5.json`
- `src/domain/m2Current/portfolio.js`
- `docs/analysis/m2-current/M2-current-multi-resolution-candidate-v0.5.json`
- `docs/analysis/m2-current/M2-current-automated-evaluation-v0.3.json`
- `docs/analysis/m2-current/M2-current-public-diagnostic-v0.6.json`

公开诊断不读取 private 文件：

```bash
npm run verify:m2:current
```

在具备本地 authority capability 且获授权时重放 development：

```bash
npm run doctor:capability -- m2-algorithm-authoritative-input
npm run develop:m2:current:candidate
npm run diagnose:m2:current
npm run verify:m2:current
```
