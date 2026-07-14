# M2 最终上线预测算法校准决策记录 v1

- 决策日期：2026-07-14
- 状态：`FROZEN_FOR_LOCAL_CALIBRATION`
- 候选决策状态：`not_for_formal_decision`

## 1. 决策边界与优先级

本记录固化 M2 最终上线预测算法校准与候选选择的最新业务决定。它只授权在最终权威本地数据和隔离本地环境中进行校准、回测与候选比较，不批准任何候选成为正式算法，不批准 release，也不进入 M3。

本轮仍以 3053 部标准作品和 192872 条收入事实为权威范围，不重建、不覆盖用户已经确认的作者、版权期限、作品状态、音频版权状态、分类、标签和 238 条业务复核决定。

发生冲突时，适用顺序为：

1. 本记录和在打开 final holdout 前提交的 machine-readable `src/domain/oldProductEvaluation/calibrationSpec.v1.json`（`calibration-spec-v1`）；
2. 已同步更新的 M2 PRD；
3. 旧 v1.1、早期 candidate、fixture/prototype 和历史阶段记录，仅作审计证据。

旧 v1.1 conditional 已被用户拒绝。旧 prepared export 不可发布，旧状态不得改写或重新包装为批准结果。

## 2. 唯一外部预测合同

产品、页面、API、Excel 和正式导出对每部作品只允许输出：

- 一个点值预测；
- 与该点值严格对账的年度拆分；
- `confidence`；
- `limitation`。

内部可以计算 80% prediction interval，但只用于 coverage 和 weighted interval score（`WIS`）校准。作品级区间上下界不得进入产品、页面、API、Excel 或正式导出。当前外部合同禁止 `optimistic`、`pessimistic`、`high`、`base`、`low`，也禁止用 `confidence` 或 `limitation` 暗中承载三情景值或区间端点。

渠道级点值只作为内部模型分量；外部仍只输出对账后的作品级单点总值及年度拆分。超过 24 个月且没有合格 36/60 月长期证据的预测必须在 `limitation` 中标记 `extrapolated`。

## 3. 预注册、final holdout 与比较角色

打开 final holdout 前，必须把以下内容完整写入并提交 machine-readable `src/domain/oldProductEvaluation/calibrationSpec.v1.json`（`calibration-spec-v1`）：

- 全部模型、模型参数和允许的训练数据窗口；
- B0-B3 基线和 C1/C2-R/C2/C3 候选的完整定义；
- revenue-model/channel 路由；
- forecastability eligibility；
- 分层定义、置信度规则、spike 候选与分类规则；
- 随机 seed、origin、horizon、case key；
- comparator、bootstrap、指标和全部 gate。

最后两个合格 origin 是 final holdout，不得用于模型、参数、路由、阈值、forecastability、分层、置信度、区间或 gate 选择。打开 holdout 后如需修改上述任一内容，必须产生新的 spec 版本并建立新的未触碰 holdout；不得在看到结果后人为放宽 gate。

基线角色固定为：

| 标识 | 角色 | 是否参加公平比较 |
|---|---|---:|
| `B0a` | 旧 v1.1 已记录指标，只保留作历史审计 | 否 |
| `B0b` | 在统一、无泄漏 `predict_as_of` 内核中 replay 的 v1.1 | 是 |
| `B1` | cutoff 前最近 12 个完整月的 trailing mean baseline | 是 |
| `B2` | pre-registered seasonal naive baseline | 是 |
| `B3` | 沉寂归零加简单 intermittent baseline | 是 |

所有可比较基线和候选必须使用完全一致的 case keys。`B0a` 不得因历史指标较好而进入候选排名或验收判定。

2026-07-14 pre-holdout 参数来源审计进一步确认：旧 v1.1 的部分 lifecycle 阈值和系数曾使用全期结果形成，不能原样进入 `B0b` 的公平比较。该问题在任何新 replay 结果和 final holdout 被读取前发现。`B0b` 因此只保留旧公式结构；阈值改为预注册语义常量，lifecycle 系数只能使用跨 horizon purge 后、target end 不晚于 2023-06 的 development cases 做确定性离散拟合。拟合数值、development case fingerprint 和 spec digest 必须写入无私有标识的 machine-readable fitted-parameter artifact 并提交；该 artifact 未提交或不匹配时，`B0b` 不具备公平比较资格，也不得打开 final holdout。旧全期阈值和系数只留在 spec 的 audit-only 字段中。

## 4. 无泄漏内核与先行完整性证明

历史回测和未来预测必须共用唯一 `predict_as_of` 语义。任一 cutoff 的特征、路由、eligibility、分层输入、参数和预测只能读取该 cutoff 当时及以前可用的信息。

在训练候选前必须完成并报告：

1. future-perturbation invariance tests：扰动 cutoff 之后的数据，不得改变 cutoff 时点的特征、路由、eligibility、预测或 case key；
2. B0-B3 replay；
3. baseline/candidate comparison frame 的 case keys 完全一致证明；
4. 数据范围、金额、cutoff、origin 和 horizon 的严格对账。

只有上述证据确认无泄漏且 case keys 一致后，才能按顺序训练候选。

## 5. Revenue-model 与 channel 路由

禁止用同一个时间序列模型覆盖所有收入模式。路由固定为：

- `pure_sales_share`：各合格渠道独立生成点值预测，再求和并对账为作品级点值；
- `pure_buyout`：依据 cutoff 前历史买断周期和月均等效口径处理；
- `buyout_plus_sales`：未来只预测实销，不预测任何未来买断收入；
- 未解析的 revenue model 不得静默映射到上述任一路由，必须按预注册 eligibility 或 `limitation` 处理。

revenue model、渠道存在性和历史周期必须按 cutoff 重建，不能把全期结果注入历史回测。

## 6. Horizon 与长期外推

核心滚动回测 horizon 固定为 3、6、12、18、24 月。对历史长度和可用 origin 达到预注册条件的 cohort，增加 36、60 月长期审计；36/60 月只作长期稳定性证据，不参与 final holdout 的模型或阈值选择。

任何超过 24 月、但所属 cohort 没有合格 36/60 月证据的预测，都必须标记 `extrapolated`。不得用扩大区间、提高 confidence 或隐藏 limitation 替代该标记。

## 7. Spike 候选与分类

spike 规则只能先生成候选，不能直接触发衰减。候选定义使用 cutoff 前 trailing-24 信息：单月收入占比至少 50%，或 robust z-score 大于 6。

候选必须区分：

- 买断；
- 首发爆发（`launch_burst`）；
- 批次均分（`batch_proration`）；
- 结算滞后（`settlement_lag`）；
- 真实异常（`true_anomaly`）。

类型未确认前不得自动衰减。确认信息在历史 cutoff 当时不可得时，只能用于 post-hoc 审计，不能回填成历史模型特征。

## 8. 分层标准与时点边界

所有可用于训练、路由、eligibility 或 gate 的分层都必须按 cutoff 重算：

| 分层 | 冻结口径 |
|---|---|
| 高价值 | cutoff 前 trailing-12 收入排序的 top 1%、next 4%、next 5%；合并 top 10% 为高价值总体 |
| 沉寂 | 最近 6 个完整月收入为 0，且更早历史存在正收入 |
| 稀疏收入 | 非沉寂，最近 12 个完整月正收入月份不超过 3 |
| 长尾 | 非沉寂、非稀疏，最近 12 月有正收入且至少 4 个正收入月，并处于正收入作品收入后 50% |
| 异常峰值 | 仅生成第 7 节所述 spike candidate，不能直接判为可衰减异常 |
| 版权期限类型 | `exact_date`、`perpetual`、`relative_term`、`year_only`、`expired_unknown_date` 分开报告，不伪造 date-only 值 |

重要分层至少包括：

- `source`；
- revenue model；
- shelf status；
- rights status 和版权期限类型；
- 高价值；
- horizon。

如历史 cutoff 没有当时的 shelf/rights 状态快照，当前状态只能作为明确标注的 post-hoc 切片，不得进入历史特征、路由、eligibility、模型/阈值选择或 gate 调整。其他当前字段也不得在缺少 as-of 证据时冒充历史输入。

## 9. 指标、signed aggregate bias 与 gate

signed aggregate bias 公式固定为：

```text
(sum(pred)-sum(actual))/sum(actual)
```

仅当切片 `sum(actual) > 0` 时计算；实际收入为 0 的切片必须单列，不能记为通过。

| Gate | 冻结要求 |
|---|---|
| 数据与 case 完整性 | 权威范围、金额、hash、cutoff、origin、horizon 对账通过；所有公平比较对象 case keys 完全一致；future perturbation invariance 通过 |
| Overall point accuracy | final holdout WAPE 不高于 `min(0.60, 0.95 * best leakage-free baseline WAPE)`，并以第 11 节的相关性 bootstrap 证明改善 |
| Signed aggregate bias | overall、forecastable、高价值均在 +/-10%；每个核心 horizon 均在 +/-15% |
| Horizon non-regression | 3/6/12 月分别较最佳无泄漏基线改善至少 3%；18/24 月不得回退超过 2% |
| High-value accuracy | top 10% WAPE 改善至少 5%；top 1% 和 top 5% 均不得回退超过 5% |
| Important strata | case 不少于 200 且实际收入占比不少于 1% 的重要层，WAPE 回退不超过 5%，且 signed aggregate bias 绝对值不超过 20% |
| Internal 80% PI | 总体 coverage 为 75%-85%，重要 horizon/层为 70%-90%；WIS 改善至少 5%，标准化宽度不得扩大超过 10%；PI 不得外部输出 |
| Origin stability | 至少 70% 的 outer origins 优于锁定 comparator；不得连续 3 个 origin 回退超过 5% |
| Issue severity | P0=0、P1=0；P2 只作事实型复核提示审计，不能冒充精度指标，并且不得包含运营动作 |

## 10. Forecastability eligibility

forecastability eligibility 必须在结果可见前冻结。旧 v1.1 的 77.88% forecastable revenue share 和 20.38% true-blocked revenue share 只作历史非回归参考，不是新 gate；不得为了接近这些比例移动标签、阈值或路由。

top 10% 高价值作品的 forecastable revenue coverage gate 固定为至少 90%。总体 forecastable/blocked 分布按冻结 eligibility 如实报告，不以结果反推 eligibility。

## 11. 相关性 bootstrap

模型差异的置信证据必须使用 paired block/bootstrap，并同时保留 `standard_work_id` 与 origin 维度的相关性。重叠 horizon、同一作品和同一 origin 产生的 case 不能被当作相互独立的单条样本抽样。

bootstrap 具体算法、block 构造、重复次数、seed、比较统计量和置信区间规则必须在 final holdout 前写入 machine-readable spec。不得看到结果后改用更有利的抽样单位或单侧检验。

## 12. 执行顺序与最终选择

执行顺序固定为：

1. 完成 calibration spec、无泄漏内核、future-perturbation invariance tests 和 B0-B3 replay；
2. 先报告 baseline 结果，确认无泄漏且 case keys 完全一致；
3. 依次训练 `C1`、`C2-R`、`C2`、`C3`，不得并行查看 final holdout 后再挑路线；
4. 在全部冻结 gate 上选择最简单且全部通过的候选。

任何候选即使通过全部 gate，也必须保持 `not_for_formal_decision`。下一步只能是中文业务验证表抽检和脱敏聚合报告复核；只有用户明确批准后，才能另行讨论正式决策或 release。

## 13. 中文验证与脱敏报告

中文业务验证表属于 Git 忽略的 private 本地输出，不得提交作品名、作者、渠道明细、原始账单行或逐作品收入。可提交报告只允许使用脱敏聚合层，至少说明：

- 数据版本、spec 版本、代码版本和 cutoff；
- B0a 审计值与 B0b-B3 公平 replay 的角色差异；
- 各 horizon、source、revenue model、shelf/rights、高价值及稀疏/沉寂/长尾/spike 类型的聚合指标；
- signed aggregate bias、WAPE、内部 80% PI coverage/WIS、bootstrap 置信证据；
- eligibility 覆盖、`extrapolated` 数量、limitation 分布和事实型复核提示；
- 所有失败 gate、未验证项和候选的 `not_for_formal_decision` 状态。

报告不得包含自动运营建议或资源投入动作，也不得把内部 PI 改名包装为三情景输出。
