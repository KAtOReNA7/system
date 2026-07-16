# M2 正式现金预测目标决策 v1

- 决策日期：2026-07-15
- 状态：`FROZEN_FOR_LOCAL_CALIBRATION`
- 候选状态：`not_for_formal_decision`
- 发布状态：未批准
- 适用范围：M2 正式预测目标、买断路由、历史回测实际值、指标人口和相关报告

## 1. 决策

M2 正式收入预测预测未来账单现金。买断月均等效值只用于评级和历史价值，不直接计入未来现金预测。未来未承诺买断受渠道采购政策、市场环境、谈判和预算影响，不建立发生概率模型，也不根据历史周期推测下一笔买断。

本决策优先于此前 C2-R / C2-R.1 及更早 calibration spec 中关于 future buyout、默认 36 个月周期、历史买断款未来摊销和 `buyoutMonthlyEquivalent` 现金预测的规则。旧结果继续作为历史目标口径审计，不得改写为 formal-cash 指标，也不得与后续 C2-R.1 formal-cash 结果直接比较。

用户原始“买断+实销”公式中的独立减号与三处控制性条款——正式预测包括 cutoff 已确认买断应收、纯买断按已确认金额计入、回测 forecastable actual 包括 cutoff 已确认买断应收——冲突。本决策按控制性条款冻结为加法：

```text
futureCashRevenueForecast
= salesCashForecast
+ cutoffConfirmedFutureReceivables
```

不得把已确认应收从未来现金中扣除。

## 2. 正式点值目标

正式点值只包含：

1. 未来实销现金；
2. cutoff 时已经签署或确认、且有可审计证据的未来买断应收；
3. cutoff 时已经确认金额和预计入账时间、且有可审计证据的其他现金。

明确排除：

- 尚未签署的未来买断；
- 通过历史周期猜测的下一次买断；
- 买断发生概率乘预计金额；
- 已到账买断金额的未来摊销；
- `buyoutMonthlyEquivalent`。

产品、API、Excel 和正式导出仍只允许一个点值、年度拆分、`confidence` 和 `limitation`。内部 80% PI 只用于 coverage、WIS 和过度自信审计，不得输出端点或三情景字段。

## 3. 收入路由

### pure_sales_share

各实销渠道独立生成点值后求和，再加入 cutoff 时已有可审计证据的全部未来确认应收。若其中存在已确认买断应收，现金仍须计入，同时生成事实型 route-review limitation；不得仅为维持旧 route 标签而漏掉已确认现金。

### pure_buyout

如果 cutoff 时存在可审计的已签署/已确认、且仍未结的未来买断应收，只按未结金额和预计入账月计入，不推测额外买断。承诺是否存在必须先于 horizon 分配判断；承诺预计在当前 horizon 之后入账时，该 horizon 的 raw point 为可解释的数值 0，而不是无承诺 abstention。

如果不存在：

- `futureCashRevenueForecast=null`；
- `rawModelPrediction=null`；
- `modelPredictionAvailable=false`；
- `routeAbstained=true`；
- `servedPrediction=null`；
- `abstentionReason=uncommitted_future_buyout_not_forecastable`。

不得以 0 冒充预测。

只有其他确认现金、但没有买断应收时，不能解除 pure-buyout abstention。

### buyout_plus_sales

未来现金点值为各实销渠道预测之和，加上 cutoff 时已确认且可审计的未来应收。没有确认应收时只预测实销，并设置 `excludesUncommittedFutureBuyout=true`。不预测未来是否再次买断。

## 4. 买断月均等效值边界

`buyoutMonthlyEquivalent` 继续保留，但必须同时标记：

- `ratingContextOnly=true`；
- `historicalValueOnly=true`；
- `notCashForecast=true`；
- `notIncludedInFutureCashRevenue=true`。

只允许用于历史价值、评级、买断作品之间的价值比较和评级说明。

## 5. 回测实际值与计分

每个冻结 case 构建三套实际值：

- `forecastableCashActual`：实销 actual，加 cutoff 时已确认的买断/其他现金 actual；用于主要 WAPE、MAE、SMAPE、signed bias、内部 PI 和候选 gate；
- `uncommittedBuyoutSurpriseActual`：cutoff 时未知、后来入账的买断；不进入主要模型 WAPE，单列数量、金额、占总账单现金比例和业务影响；
- `totalLedgerCashActual`：目标窗口全部账单现金；只用于 `endToEndBusinessGap`，不得称为模型 WAPE。

逐 case 必须满足：

```text
forecastableCashActual
+ uncommittedBuyoutSurpriseActual
= totalLedgerCashActual
```

历史数据没有签约/确认和证据可得时间戳时，后来发生的买断全部进入 surprise。不得使用账单发生、`businessForm`、买断分类器结果或 target-end 信息反向恢复 cutoff 承诺状态。只有在 prediction lock 之后，通过同作品、同 commitment、同现金类型、同 channel component、同入账月、同金额的唯一权威账单 fact link，才能把对应实际现金认定为 cutoff 已承诺；不同事件不得按聚合金额相互抵消。

## 6. 状态边界

既有 `statisticallyScoreable` 和 `businessServingEligible` 定义不变。纯买断无承诺属于 route abstention，不得通过改变 eligibility 从 case universe 消失。

主要 formal-cash 模型指标人口为：

```text
statisticallyScoreable
&& modelPredictionAvailable
&& !routeAbstained
```

预测字段使用 `rawModelPrediction`，实际字段固定为 `forecastableCashActual`。scoreable 但 route-abstained 的 case 进入 abstention 和端到端业务审计；null 不得按 0 计分。

## 7. 当前证据结论

当前 3053 部/192872 条权威输入、授权本地 cache、正式基础输入、收入事实和校准适配器均没有独立的 commitment snapshot、逐账单事实 registry 或 settlement link 角色。因此当前历史开发窗口中不存在可证明的 cutoff 已承诺未来买断；后来识别到的买断只能作为 classifier-derived surprise 诊断，不能称为合同已确认事实。

未来若需计入已确认应收，必须新增单独授权、可审计的 as-of commitment snapshot 数据角色，至少提供作品身份、commitment id、现金类型、签署/确认状态、未结应收状态、确认金额、未结金额、预计入账月、确认时间、证据可得时间和证据引用，并另行提供 truth-only 的唯一权威账单 fact registry 与 settlement link。不得从账单反推，也不得让 truth link 进入预测阶段。

## 8. 执行与停止边界

在任何 C2-R.1 重新训练或调参前，必须先完成：

1. formal cash target 与买断月均等效值拆分；
2. commitment as-of 审计；
3. 三套 actual 构建；
4. old target → new target bridge；
5. case-key 和金额守恒；
6. PRD、决策记录和 machine-readable spec 更新；
7. 自动测试。

完成这些基础设施不自动开始 C2-R.1。final holdout、embargo shadow 和 deferred 60-month labels 继续 sealed；不得进入 C2/C3、release 或 M3。
