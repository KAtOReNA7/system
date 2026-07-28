# M2 评价合同 v2 草案

状态：仅供审议（Evaluation Contract v2 Proposal，`DRAFT_NOT_ACTIVE`）。

本草案不修改或启用现有 evaluator、gate、阈值、模型角色或历史成绩。启用前需要
独立授权、冻结预测数据合同校验和业务损失权重确认。

## 1. 先定义决策，再定义指标

M2 的能力不能放进一个统一排行榜。评价必须先声明业务决策：

| 决策能力 | 决策对象 | 评价问题 | 禁止替代 |
|---|---|---|---|
| 作品级现金点预测 | 作品×预测起点×horizon | 每部作品未来分成现金的点预测是否可用 | 组合准确不能替代作品准确 |
| 收入发生 | 作品×预测窗口 | 是否发生正向分成收入，概率是否可信 | accuracy 不能替代校准或区分 |
| 组合级预算 | origin×horizon 的公司分成现金 | 总预算是否准确且稳定 | 不得把组合预测分配回作品 |
| 排序与资源分配 | 同一决策时点的合格作品集合 | 排名是否改善有限资源配置 | 排序不能替代现金校准 |
| 风险与区间 | 实际输出分位数或分布的案例 | 不确定性是否校准且足够尖锐 | 无区间输出不得伪造评价 |
| 非对称业务损失 | 有明确成本定义的预测决策 | 高估、低估和弃权的真实成本 | 未授权成本比不得变成固定门禁 |

预测目标继续只包含未来分成收入现金（future sales-share cash）。买断及其他现金
不进入特征、标签、指标、点预测或区间。

## 2. 指标角色

每个可比组必须把指标分成五类，不得用诊断指标替代门禁：

1. 主决策指标（primary decision metric）：与该能力实际决策损失最接近的指标。
2. 校准护栏（calibration guardrail）：防止总体高估或低估被绝对误差掩盖。
3. 分群护栏（segment guardrails）：防止总体数字掩盖困难人群。
4. 稳定性/独立证据门（stability/independent-evidence gate）：限制时间漂移、
   作品聚类不稳定和开发窗口复用。
5. 仅诊断指标（diagnostic-only metrics）：解释误差，不单独触发晋升。

任何比较都必须携带目标、现金权威、人口、粒度、horizon、as-of/标签成熟度、
实际值定义、evaluation family 和 metric definition/version。

## 3. 作品级现金点预测

### 3.1 主指标候选

主指标候选是按 horizon 分层的现金加权绝对百分比误差
（horizon-stratified cash WAPE，`work_cash_wape_by_horizon_v2`）：

```text
WAPE_h = Σ_i |ŷ_i,h - y_i,h| / Σ_i |y_i,h|
```

必须逐 horizon 报告并逐 horizon 过门。若业务希望形成单一排序目标，horizon
权重必须在看结果前由业务授权；未授权时只能做等权或候选权重的敏感性分析，不能
宣布统一冠军。跨 horizon 直接池化的 WAPE 只作诊断，因为长 horizon 的现金规模
和重叠月份会自然获得更大权重。

候选模型与现行运行回退模型必须在相同案例交集上报告配对 WAPE/FVA；不得只报告
候选自身的绝对 WAPE。

### 3.2 指标分工

| 指标 | 角色 | 说明 |
|---|---|---|
| horizon WAPE | 主决策指标 | 衡量每一业务 horizon 的绝对现金误差占现金规模比例 |
| MAE | 仅诊断/业务量纲 | 给出每案例平均人民币误差，不跨规模人口直接比较 |
| MASE 或严格 as-of 尺度化绝对误差 | 分群护栏 | 降低头部作品支配；scale 必须由 origin 前历史计算，零 scale 不得填造 |
| signed bias | 校准护栏 | `Σ(ŷ-y)/Σ|y|`，保留高估/低估方向 |
| absolute bias | 校准门 | `abs(signed bias)`，用于门禁但不能替代方向报告 |
| 中位绝对误差与误差分位数 | 仅诊断 | 显示典型作品及长尾，不替代现金加权指标 |

### 3.3 强制分层

至少按以下维度分别报告 case 数、现金分母、WAPE、signed bias 和 MAE/尺度化误差：

- horizon；
- 收入规模带；
- 生命周期；
- dense、intermittent、dormant 等间歇状态；
- origin 和连续 time block；
- 模型路由、served/abstained 状态。

收入规模带只能由预测起点可得的历史信息定义；不得用未来 actual 划分用于选模的
segment。按未来 actual 排序的 top-revenue 视图只能是 post-hoc error attribution。

### 3.4 头部误差与稳定性

报告 top 1%/5%/10% 作品的：

- 绝对实际现金占比；
- 绝对误差贡献占比；
- 候选与回退的同案例绝对误差差；
- 头部之外人口的相同指标。

稳定性至少包括独立作品聚类 bootstrap 和连续时间块结果。相邻 calendar origins
不得伪装成多个独立证据块。开发窗口 bootstrap 不能替代独立 later-origin。

## 4. 收入发生与条件金额

### 4.1 收入发生

只有模型输出 occurrence probability 时才评价：

- Brier score；
- log loss；
- reliability bins、calibration intercept/slope 和 expected calibration error；
- PR-AUC 作为类别极不平衡时的主要区分指标；
- ROC-AUC 作为辅助区分指标；
- 在预注册阈值下的 precision、recall、specificity 和 confusion matrix。

accuracy 在大量零发生案例中可由“永远不发生”获得虚假高分，不能作为主指标。
阈值指标必须同时给出 base rate 和阈值来源。

### 4.2 条件金额

条件金额只在实际正向收入发生的行上，以模型明确输出的
`conditionalAmountPrediction` 对比 `actualPositiveAmount`。报告条件金额
WAPE、signed bias、MAE 和 log-MAE。

最终期望现金 `occurrenceProbability × conditionalAmountPrediction` 的误差不是
条件金额误差。冲销 component 也必须单独保存；不得用最终 net point 代替条件金额
输出。

## 5. 组合级预算

组合级主指标候选为逐 origin×horizon 的组合 WAPE，配套：

- 组合 signed bias/absolute bias；
- 按 horizon 与 origin 的误差；
- origin/time-block bootstrap 区间；
- 单元格绝对百分比误差分布；
- 与预注册组合基线的配对 FVA。

作品级抵消必须并列报告：组合误差小而作品误差大表示 aggregation cancellation，
不是作品模型成功。组合结果不得按比例、排名或任何规则分配回作品。

## 6. 排序与资源分配

只有业务确实基于模型排名分配资源时才启用该能力。可选指标：

- Spearman 或 Kendall rank correlation；
- top-k actual cash capture；
- NDCG@k；
- 在明确预算、动作和成本下的 decision utility/uplift。

评价人口必须是同一时点完整合格集合，并记录 k、预算、ties 和弃权。排序指标只回答
相对顺序，不回答现金金额是否校准，不能替代 WAPE 或 bias。

## 7. 风险与区间

只有模型实际冻结输出分位数或分布时才使用：

- nominal coverage 与 observed coverage；
- interval score 和 weighted interval score（WIS）；
- 区间宽度/尖锐度；
- 按 horizon、收入规模、生命周期和 time block 的条件 coverage；
- risk–coverage 曲线，同时报告 case coverage 与 actual-cash coverage。

只有点预测的模型登记为风险区间能力缺口
（`CAPABILITY_GAP_NO_INTERVAL_OUTPUT`）。不得从历史 WAPE、残差摘要或其他模型的
区间拼出该模型的区间评价。

## 8. 业务损失

基础公式为：

```text
L = c_under * max(y-ŷ, 0)
  + c_over  * max(ŷ-y, 0)
  + c_abstain * I(abstain) * |y|
```

高估可能导致预算虚高、资源误配和现金缺口；低估可能导致预算保守、错失投放或
版权运营机会。具体成本取决于真实决策流程。

在 `c_under`、`c_over`、`c_abstain` 没有业务授权前，只报告二维/三维敏感性分析，
不得固定 1.5:1:2 或其他比例作为选模与晋升门禁。业务授权必须说明货币单位、决策
周期、预算约束、弃权动作和成本证据。

## 9. 评价流程与停止规则

1. 冻结目标、人口、案例键、horizon、实际值和 metric definition。
2. 验证候选与回退的案例/actual parity。
3. 验证模型实际输出哪些能力；没有输出的能力登记 gap。
4. 先计算 raw candidate，再计算 selected pipeline 和 operational fallback。
5. 按主指标、校准护栏、分群护栏和稳定性门依次判断。
6. 不同 comparability group 只并列展示，不排名。
7. 没有独立证据时不得宣布成熟或自动化批准。

本草案的启用、阈值、horizon 权重、业务损失权重和受控重计分均需后续单独授权。

## 10. 出版行业统计支持引用

新的出版行业适配模型修订必须引用
`M2-PUBLISHING-SCALE-SUPPORT-01`。训练资格不再由单一 `50/100` 作品门控制，
而由 `DIRECT_FIT`、`SHRUNK_FIT`、`POOLED_PARENT`、`REPORT_ONLY` 四级状态、
作品有效样本量、现金集中度、时间正确的 training-side stability 和 as-of
authority 共同决定。

该引用不改写历史渠道时间生成模型 v0.2 的 eligibility、报告或阻断，也不改变本
评价合同的 1% materiality、6/11 time block、4/6 horizon、top-revenue harm
和 2,000 次 standard-work cluster bootstrap。支持合同只能决定新版本是否以及
如何拟合；模型晋升仍须通过本评价合同的 outer 门禁。
