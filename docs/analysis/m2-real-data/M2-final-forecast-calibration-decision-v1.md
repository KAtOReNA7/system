# M2 最终上线预测算法校准决策记录 v1

> 2026-07-15 继承说明：本文的输出边界、路由、origin、seed、封存和 release/M3 边界继续有效；此前将生命周期稳健单公式称为 B0b 的身份与 comparator 规则已由 `calibration-spec-v1.2-amendment` 取代，该公式现名 B4，faithful B0b 为旧 Model E selector 的合法无泄漏重放。

- 决策日期：2026-07-14
- 状态：`FROZEN_FOR_LOCAL_CALIBRATION`
- 候选决策状态：`not_for_formal_decision`
- pre-holdout 修订：revision 5；在读取任何 private 拟合、replay 或 final holdout 结果前，以严格 target-available forward validation 替代会使用未来标签的 origin leave-one-out，并补齐 interval-only warmup residual cold-start 与 as-of rights serving 合同

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

渠道级点值只作为内部模型分量；外部仍只输出对账后的作品级单点总值及年度拆分。精确到期日按剩余月数预测；无限期采用 60 个月规划口径并标记 `perpetual_rights_60_month_planning_horizon`；relative term 只有在 `rights_start_month` 与正整数 `relative_term_months` 成对可得时才推导结束月，两者均缺失时采用 24 个月并标记 `rights_horizon_not_exact`，只缺一个则完整性失败；year-only 最多预测至该年 12 月且上限 24 个月，并保留同一 limitation；`expired_unknown_date` 固定为 0 个月、0 点值和空年度拆分并标记 `rights_expired_unknown_date`，不得静默变成 24 个月。serving 输入必须是规范化 snapshot 序列：所有 `available_as_of` 均须为 `YYYY-MM`，先筛选不晚于 origin 的记录，再选最大 `available_as_of`；同一最新月份的完全相同 payload 可去重，存在不同 payload、无合格记录、未知可用时间或非法期限字段时必须 fail closed。调用方不得任意传入 serving horizon。历史固定-horizon 回测继续使用预注册 H；没有历史 rights snapshot 时，当前 rights 只能 post-hoc 切片。候选只拟合 3/6/12/18/24 月：24 月内的非核心 horizon 使用不小于 H 的最小核心锚点并按 `H/anchor` 缩放，超过 24 月按 24 月点值乘 `H/24`；36/60 月真实标签不得拟合该适配器。超过 24 个月且没有合格长期证据时仍必须标记 `extrapolated`。

## 3. 预注册、final holdout 与比较角色

打开 final holdout 前，必须把以下内容完整写入并提交 machine-readable `src/domain/oldProductEvaluation/calibrationSpec.v1.json`（`calibration-spec-v1`）：

- 全部模型、模型参数和允许的训练数据窗口；
- B0a 审计、faithful B0b/B1/B2/B3/B4 基线和当前仅获授权的 C1 候选定义；C2-R/C2/C3 的历史定义不构成本轮授权；
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

2026-07-15 v1.2 身份修正后，本段所述 lifecycle-robust 公式和 7-stage 全局向量只属于 `B4_formula_switched_legacy_variant`，不得再称 faithful B0b。faithful `B0b_v1_1_leakage_free_replay` 是旧 Model E A/B/C/D selector 的 cutoff-as-of、route-aware 重放，使用 origin-as-of quantiles/priors、neutral historical rating 和独立 serving state，不拟合上述 lifecycle 向量。两者均不得读取长期 audit label 拟合；36 月仅审计，60 月仍封存。

公平计分不使用 leave-one-origin-out，因为早期 origin 由此会看到更晚 origin 的已实现结果。revision 5 固定采用严格 expanding-origin forward folds：warm-up origins 为 `2019-06`、`2019-12`、`2020-06`；score origins 为 `2020-12`、`2021-06`、`2021-12`、`2022-06`、`2022-12`。每个 fold 只能用 `origin < score_origin` 且 `target_end <= score_origin` 的训练 case；同一 score origin 当时可评分的所有 horizon 必须一起留出。faithful B0b 的 selector context 与 B4 的 fold factors 都只能由相应 origin 当时可得的历史形成；只有 B4 使用 full-development lifecycle 向量作后续冻结预测。预测、forward 指标、case/prediction fingerprints、warm-up counts、truth-join 前锁定证明和 spec digest 必须写入脱敏 machine-readable artifact；任一绑定不匹配都失去公平比较资格。C1 也必须记录同样的 prior-only 选择、warm-up fingerprint 和未使用 warm-up outcome label 证明。

Warm-up 不进入 comparator、点值 gate、bootstrap 或 point-model/hyperparameter 拟合，只为已经冻结的内部区间方法提供 strict-forward residual。每个 warm-up 点值必须先于 truth join 物化并锁 fingerprint：faithful B0b 使用 origin-as-of selector context，B4 才使用相应 frozen parameter role，B1/B2/B3 使用固定公式；Gate A 通过后 C1 仅使用 v1.2 预注册 fallback 和自己的 prior out-of-fold residual。C2-R/C2/C3 未授权，不能读取 warm-up 或生成预测。纯买断始终使用固定 cycle route。最早 score origin `2020-12` 可用的 warm-up label blocks 严格固定为 `2019-06:[3,6,12,18]`、`2019-12:[3,6,12]`、`2020-06:[3,6]`，共 9 个；仍须逐 case 满足 `target_end <= score_origin` 且 `label_available_as_of <= score_origin`。

本轮基线阶段只允许 development forward replay。最后两个 origin 在基线报告后仍保持关闭；只有用户确认无泄漏和 case-key parity、明确授权候选训练、四个候选依次完成，并在 development forward gates 上选出最简单的通过者、把唯一 `selectedCandidateId` 写入候选 fitted-parameter artifact 提交且通过冻结字节校验后，才可另行讨论打开 final holdout。final 只确认这一预先锁定的候选与 comparator；失败后不得换用更复杂候选，除非重新版本化 spec 并建立新的未触碰 holdout。

## 4. 无泄漏内核与先行完整性证明

历史回测和未来预测必须共用唯一 `predict_as_of` 语义。任一 cutoff 的特征、路由、eligibility、分层输入、参数和预测只能读取该 cutoff 当时及以前可用的信息。

在训练候选前必须完成并报告：

1. future-perturbation invariance tests：扰动 cutoff 之后的数据，不得改变 cutoff 时点的特征、路由、eligibility、预测或 case key；
2. B0a 审计及 faithful B0b/B1/B2/B3/B4 replay；
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

任何超过 24 月、但所属 cohort 没有合格 36/60 月证据的预测，都必须标记 `extrapolated`。不得用扩大区间、提高 confidence 或隐藏 limitation 替代该标记。source 是当前基础表的 post-hoc 切片，不能决定长期证据资格；36/60 月 development 审计只可打开 `target_end <= 2023-06` 的标签，其余长期标签继续关闭。

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

作品只在第一条可观察收入源记录不晚于 origin 时进入该 origin 的 case universe；未来才出现的作品在更早 origin 中应当不存在，不能伪造成 blocked-zero。如历史 cutoff 没有当时的 shelf/rights 状态快照，当前状态只能作为明确标注的 post-hoc 报告切片，不得进入历史特征、路由、eligibility、模型/阈值选择、gate 调整或 acceptance failure。其他当前字段也不得在缺少 as-of 证据时冒充历史输入。

## 9. 指标、signed aggregate bias 与 gate

signed aggregate bias 公式固定为：

```text
(sum(pred)-sum(actual))/sum(actual)
```

仅当切片 `sum(actual) > 0` 时计算；实际收入为 0 的切片必须单列，不能记为通过。

指标人口按 v1.2 四状态契约冻结：所有 statistically-scoreable case 都必须保留 numeric `rawModelPrediction`，模型 WAPE、高价值、horizon、comparator 和 bootstrap 全部使用 raw；business-serving-ineligible 的 `servedPrediction=null` 且必须给出 abstentionReason。任何 null→0 都被禁止，旧 coverage-aware null→0 量只能作为历史业务损失审计，不能命名为模型 WAPE。不得通过取交集或 complete-case drop 掩盖缺失；任何 scoreable raw 缺失都是完整性失败。

baseline ID 只在严格 forward 的 forecastable population 上锁定一次。之后每个 overall、horizon、高价值或重要 as-of 分层 gate，都必须把同一个 locked comparator 在该 gate 的完全相同人口上重新计分；不得按 gate 改选更弱的 comparator。source 和缺少历史快照的 shelf/rights 仍必须出现在聚合报告中，但只能 report-only，不能导致候选失败。

80% PI 的内部残差必须来自在各残差 case 自己 origin 上、按 revision 5 warm-up/score 角色协议生成并在 truth join 前锁定的 strict forward 预测，不能使用 in-sample residual；在目标 score origin 校准时还必须满足 `residual_case_origin < score_origin`、`target_end <= score_origin` 且 `label_available_as_of <= score_origin`。Warm-up residual 只校准已经冻结的区间，不得进入 comparator 或点值指标。有限样本分位数固定为：残差升序后 `k=min(n,ceil((n+1)*0.8))`，取第 k 个值且不插值；非法、缺失、非有限或负 residual 必须完整性失败，不能静默丢弃。单个中央区间的 `WIS=(0.5*abs(actual-point)+0.1*IS_0.2)/1.5`；标准化宽度为 `sum(upper-lower)/sum(abs(actual))`。PI 人口先固定为从 `2020-12` 开始的全部 model-delta keys，无 burn-in 排除，再要求双方每个 key 都有区间；不得做 complete-case 筛选，所需区间缺失不能通过 gate。

| Gate | 冻结要求 |
|---|---|
| 数据与 case 完整性 | 权威范围、金额、hash、cutoff、origin、horizon 对账通过；所有公平比较对象 case keys 完全一致；future perturbation invariance 通过 |
| Overall point accuracy | development-forward 选择与 final confirmation 两种 role 都必须在各自冻结人口上独立满足 WAPE 不高于 `min(0.60, 0.95 * locked leakage-free comparator WAPE)`，并以第 11 节的相关性 bootstrap 证明改善；前者用于锁定 `selectedCandidateId`，后者只确认、不得改选 |
| Signed aggregate bias | overall、forecastable、高价值均在 +/-10%；每个核心 horizon 均在 +/-15% |
| Horizon non-regression | 3/6/12 月分别较最佳无泄漏基线改善至少 3%；18/24 月不得回退超过 2% |
| High-value accuracy | top 10% WAPE 改善至少 5%；top 1% 和 top 5% 均不得回退超过 5% |
| Important strata | case 不少于 200 且实际收入占比不少于 1% 的重要层，WAPE 回退不超过 5%，且 signed aggregate bias 绝对值不超过 20% |
| Internal 80% PI | 总体 coverage 为 75%-85%，重要 horizon/层为 70%-90%；WIS 改善至少 5%，标准化宽度不得扩大超过 10%；PI 不得外部输出 |
| Origin stability | 至少 70% 的 outer origins 优于锁定 comparator；不得连续 3 个 origin 回退超过 5% |
| Issue severity | P0=0、P1=0；P2 只作事实型复核提示审计，不能冒充精度指标，并且不得包含运营动作 |

## 10. Forecastability eligibility

forecastability eligibility 必须在结果可见前冻结。旧 v1.1 的 77.88% forecastable revenue share 和 20.38% true-blocked revenue share 只作历史非回归参考，不是新 gate；不得为了接近这些比例移动标签、阈值或路由。

旧 top10 served-revenue coverage ≥90% 仅保留在原重叠 scoreable-case 分母上的历史非回归审计，不是 v1.2 Gate A、C1 训练或验收条件，也不得套用到完整 3053 收入桶。v1.2 完整 3053 top1/top5/top10 只作 post-hoc population disclosure；eligibility 仍不得为达到任何比例而移动。

## 11. 相关性 bootstrap

模型差异的置信证据必须使用 paired two-way pigeonhole cluster bootstrap：`standard_work_id` 和 origin 两个 cluster universe 分别有放回抽样，每条配对 case 的权重是两个 multiplicity 的乘积，同一 work-origin 下全部 horizon 始终一起保留。重叠 horizon、同一作品和同一 origin 产生的 case 不能被当作相互独立的单条样本抽样。

重复次数固定 2000、seed 固定 20260714，随机数生成器固定为 PCG64；cluster 分别按标准作品标识和 origin 稳定排序，每个 replicate 先抽作品、再抽 origin，抽样数等于各自 unique cluster 数。v1.2 baseline practical-equivalence 与 C1 superiority 均使用预注册的相对 WAPE delta；前者要求双侧 95% CI 完整落入 `[-1%,+1%]`，后者要求相对 primary comparator 的 95% CI 上界严格小于 0。95% 区间使用经验 nearest-rank 的第 `ceil(0.025R)` 与 `ceil(0.975R)` 个排序值；任一 replicate 分母无效即为整体 bootstrap 完整性失败。不得看到结果后改用更有利的抽样单位、人口或单侧检验。spec、模型定义、特征、forward protocol 与 case/prediction fingerprints 一律使用冻结的 UTF-8 canonical serialization 和 SHA-256。

## 12. 执行顺序与最终选择

执行顺序固定为：

1. 完成 calibration-spec-v1.2、无泄漏内核、future-perturbation invariance tests 和 B0a/B0b/B1/B2/B3/B4 replay；
2. 先报告 baseline 结果，确认无泄漏且 case keys 完全一致；
3. 仅当 Gate A 全部通过时训练并验证 `C1`，随后无论 PASS/FAIL 都停止；C2-R/C2/C3、final holdout、release 和 M3 均需未来单独授权；
4. 在全部冻结 gate 上选择最简单且全部通过的候选。

任何候选即使通过全部 gate，也必须保持 `not_for_formal_decision`。下一步只能是中文业务验证表抽检和脱敏聚合报告复核；只有用户明确批准后，才能另行讨论正式决策或 release。

## 13. 中文验证与脱敏报告

中文业务验证表属于 Git 忽略的 private 本地输出，不得提交作品名、作者、渠道明细、原始账单行或逐作品收入。可提交报告只允许使用脱敏聚合层，至少说明：

抽检表只在某一候选通过全部技术 gate 后生成，候选状态仍为 `not_for_formal_decision`。抽检固定为 80 个去重的 work-origin-horizon case：依次覆盖最大绝对误差、最大正/负 signed error、未确认 spike、低/不可用 confidence、三类 revenue route、unknown/blocked、重要价值/收入模式/版权期限层，最后按 seed 20260714 随机补足。private 表可为业务复核展示作品标识、作品名、作者和逐 case 证据，但整个文件必须留在 Git 忽略目录；它只收集“预测是否合理、路由是否正确、limitation 是否清晰、事实是否有误”和备注，不提供运营动作选项。

- 数据版本、spec 版本、代码版本和 cutoff；
- B0a 审计值与 B0b-B3 公平 replay 的角色差异；
- 各 horizon、source、revenue model、shelf/rights、高价值及稀疏/沉寂/长尾/spike 类型的聚合指标；
- signed aggregate bias、WAPE、内部 80% PI coverage/WIS、bootstrap 置信证据；
- eligibility 覆盖、`extrapolated` 数量、limitation 分布和事实型复核提示；
- 所有失败 gate、未验证项和候选的 `not_for_formal_decision` 状态。

脱敏聚合报告的 cell count 小于 10 时必须抑制指标值，只能输出 `<10` 并在存在预注册父层时上卷。报告不得包含自动运营建议或资源投入动作，也不得把内部 PI 改名包装为三情景输出。
