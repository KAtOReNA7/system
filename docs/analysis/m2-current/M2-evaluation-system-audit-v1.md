# M2 评价体系审计 v1

状态：审计完成且未改动指标（M2 Evaluation System Audit，
`M2_EVALUATION_SYSTEM_AUDIT_COMPLETE_NO_METRIC_CHANGE`）。

## 1. 结论先行

本轮基于已提交公开代码、Model Registry 和公开聚合证据完成只读审计。模型执行、
模型训练、候选选择、private evaluation row 读取、历史成绩修改和 production 变更
均为 0。

结论可共享但必须携带限制（Share with Caveats，`SHARE_WITH_CAVEATS`）：

1. 当前 JavaScript 作品级加权绝对百分比误差（Weighted Absolute Percentage
   Error，`work_cash_wape_current_v1`）和有方向的总量偏差（signed bias，
   `work_cash_signed_bias_current_v1`）实现正确，均使用绝对实际现金分母。
2. 历史脚本存在不同指标语义：历史 Python `signedAggregateBias` 使用净实际总额
   作分母；历史内部特征残差校正的一个 forensic 分组 helper 还使用过
   `abs(sum(actual))` 作为 WAPE 分母。它们不能和当前指标不加版本地混用。
3. 当前 WAPE 与 signed bias 只足以回答“指定人口和窗口内，总体现金绝对误差占实际
   现金规模多少、总体偏差方向是什么”。它们不足以独立判断作品均衡表现、收入发生、
   条件金额、组合预算、排序/资源分配、风险区间、时间稳定性和业务损失。
4. 已登记实验既包含真实失败，也包含安全回退、次级能力、不同目标/人口，以及前置
   条件阻断而未执行的实验。不能把它们统一解释成“模型理论失败”或“总体成功”。
5. 当前没有证据选出“总体最佳 M2 模型”
   （`NO_SINGLE_WINNER_ACROSS_CAPABILITIES_AND_NO_INDEPENDENT_EVIDENCE`）。
   现行运行回退、研究基线和组合参考是不同角色，不是一个跨能力排行榜。
6. 建议采用以业务决策为起点的多能力评价合同 v2 草案
   （Evaluation Contract v2 Proposal，`DRAFT_NOT_ACTIVE`）。该草案本轮未启用，
   也未改变 evaluator、gate、阈值、模型角色或历史成绩。

审计置信度：对当前公开代码公式、Model Registry 的 40 条评价记录和 13 个可比组为
高；对无法从公开聚合反推的行级误差、排序、校准、区间和新指标明确记为
`NOT_COMPUTABLE_FROM_PUBLIC_AGGREGATES`，不作数值猜测。

## 2. 范围、权威与执行边界

当前唯一模型身份、别名、角色、成绩人口和可比组权威为
`config/m2-model-registry.v1.json`。本审计还读取：

- 当前核心评价实现：`src/domain/m2Current/metrics.js`；
- 组合评价实现：`src/domain/m2Current/portfolio.js`；
- 生命周期专用分解评价：`src/domain/m2Current/lifecycleAware.js`；
- 风险覆盖与业务损失实现：`src/domain/m2Current/automation.js`；
- 历史公开评价脚本及 Model Registry 所引用的已提交聚合报告。

没有读取 `data/private-input/**`、`data/private-output/**`、provider、数据库或 final
holdout；没有执行任何候选模型。渠道时间生成 v0.2
（Channel Generative v0.2，`M2-EXP-CHANNEL-GENERATIVE-02`）仍是阻断且未执行
（`GENERATIVE_V02_CORE_EXECUTION_BLOCKED`）。

## 3. 公式与实现审计

### 3.1 当前作品级 WAPE

当前实现：

```text
WAPE = sum(abs(pointEstimate - actual)) / sum(abs(actual))
```

判定：对当前声明定义实现正确
（`IMPLEMENTATION_CORRECT_FOR_DECLARED_DEFINITION`）。

- 分母：逐行 `abs(actual)` 后求和，不是 `abs(sum(actual))`。
- 聚合顺序：先逐行形成绝对误差和绝对实际值，再对指定行集分别求和并相除。
- 零值：`actual=0` 的行不增加分母，但非零预测仍增加误差分子；没有把零实际值填成
  正数，也没有静默删除该误差。
- 全零人口：分母为零时关闭失败
  （`m2_current_actual_denominator_zero`），不返回伪造分数。
- 负数/冲销：负实际值以绝对值进入分母，预测误差仍按预测减实际计算后取绝对值。
- horizon：实现既能按 horizon 分组，也能跨 horizon 池化。池化值会按各 horizon
  的实际现金规模自然加权；累计 horizon 重复覆盖月份，因此池化值只能作诊断，
  不能在没有预先授权 horizon 权重时充当唯一排行。

合成算例只用于验证公式，不是模型执行：实际值 `[100,-20,0]`、预测值
`[80,-10,5]` 时，分子为 35、分母为 120，WAPE 为 `35/120`。

### 3.2 当前作品级 signed bias

当前实现：

```text
signedBias = sum(pointEstimate - actual) / sum(abs(actual))
```

判定：对当前声明定义实现正确
（`IMPLEMENTATION_CORRECT_FOR_DECLARED_DEFINITION`）。该指标保留总体高估/低估方向；
同一算例中误差和为 -5，signed bias 为 `-5/120`。

但它允许不同作品、origin 和 horizon 的正负误差相互抵消。因此 signed bias 小只表示
总量方向接近零，不表示逐作品误差小。门禁应同时使用 absolute bias 和绝对误差指标。

### 3.3 历史定义差异

| 位置 | 指标定义 | 审计判定 |
|---|---|---|
| `src/domain/m2Current/metrics.js` | `sum(abs(pred-actual))/sum(abs(actual))`；`sum(pred-actual)/sum(abs(actual))` | 当前定义正确（`CURRENT_FORMULAS_CORRECT`） |
| `scripts/m2-real-data/m2_calibration_v1.py` | WAPE 与当前一致；`signedAggregateBias=(sum(pred)-sum(actual))/sum(actual)` | 历史 bias 是另一指标（`HISTORICAL_METRIC_DEFINITION_MISMATCH`） |
| `scripts/m2-real-data/run_m2_c3_development_validation.py` 的 forensic 分组 helper | WAPE 分母使用 `abs(sum(actual))`；主点指标仍使用 `sum(abs(actual))` | 局部历史视图不可与当前 WAPE 混用（`HISTORICAL_FORENSIC_WAPE_VARIANT`） |

历史 artifact、ID、digest 和冻结结果必须保持不变。解决办法不是改写历史，而是未来
每条评价显式携带 `metricDefinitionId`。

### 3.4 发生、条件金额与最终点预测

通用评价器的 `positiveAmount` 当前执行以下逻辑：

```text
筛选 actual > 0 的行
在子集上比较最终 pointEstimate 与 actual
```

它没有读取 `conditionalAmountPrediction`，所以不是条件金额能力。该问题登记为
误标的部分能力（`MISLABELED_PARTIAL_CAPABILITY`），本轮不改 evaluator。

生命周期专用实现分别保存：

- 收入发生：`actualPositive` 与 `occurrenceProbability`，可计算 Brier、log loss、
  precision 和 recall；
- 条件金额：正发生行上的 `conditionalPositiveAmount` 与 `actualPositive`，可计算
  WAPE、bias 和 log-MAE；
- 最终净现金：发生、条件金额和共同冲销 component 合成后的最终 point。

因此未来合同必须把三者分开。不能用“正实际值子集上的最终点预测”冒充条件金额，
也不能用最终净现金误差反推 occurrence 是否校准。

### 3.5 组合聚合与 candidate/fallback

组合评价先对作品预测和实际值求和，再计算 origin×horizon、origin 或 horizon 粒度
的 WAPE/bias。这样能回答组合预算问题，但会发生 aggregation cancellation。

例如两部作品实际值均为 100，预测分别为 50 和 150：作品级 WAPE 为 0.5，组合级
WAPE 为 0。组合结果不能分配回作品，也不能证明作品预测成功。

评价报告必须分别保存：

- 原始候选（raw candidate）；
- 选择前候选或混合（pre-selection candidate/blend）；
- 选择后管线（selected pipeline）；
- 现行运行回退（operational fallback）。

选择后回退到 baseline 而得到 FVA=0，只证明安全回退，没有证明 raw candidate 成功。

## 4. WAPE 与 signed bias 能回答什么

### 4.1 能回答

在目标、现金权威、人口、粒度、horizon、as-of 合同、实际值定义、评价窗口和指标定义
完全相同的前提下：

- WAPE 衡量总绝对现金误差相对于总绝对实际现金规模的比例；
- signed bias 衡量聚合后的高估/低估方向及相对规模；
- 配对误差或 FVA 可比较候选与 fallback 在同一行集上的绝对误差差异。

### 4.2 不能单独回答

| 风险 | 原因 | 必需补充 |
|---|---|---|
| 头部作品支配 | 现金规模大的作品同时支配分母和绝对误差 | MAE/尺度化误差、收入规模分层、top 1%/5%/10% 误差贡献 |
| 正负误差抵消 | signed bias 汇总有方向误差 | WAPE、absolute bias、误差分位数 |
| 零收入发生 | WAPE 不区分“是否发生”和“发生后金额” | Brier、log loss、校准曲线、PR-AUC、独立条件金额指标 |
| 作品均衡性 | 总量指标不代表典型作品 | MAE、中位绝对误差、作品聚类 bootstrap |
| 排序/资源分配 | 现金校准不等于相对顺序 | 仅在业务使用时加入 rank correlation、top-k capture、NDCG/utility |
| 风险/区间 | 点误差不能证明区间覆盖与尖锐度 | 模型实际输出区间时使用 coverage、interval score/WIS |
| 时间稳定性 | 汇总分数可掩盖 origin 漂移 | origin、连续 time block、独立 later-origin |
| horizon 公平性 | 长 horizon 现金更大且累计窗口重叠 | 按 horizon 主报告；业务预先授权权重 |
| 跨人口比较 | 不同人口难度和现金结构不同 | 只在相同 `comparabilityGroupId` 内比较 |

结论：WAPE 和 signed bias 是必要但不充分的作品现金评价组件
（`WAPE_AND_SIGNED_BIAS_NOT_SUFFICIENT`）。

## 5. 当前指标覆盖矩阵

Model Registry 当前登记 27 个模型、12 个实验、13 个可比组和 40 条评价记录。

| 指标/证据 | 登记覆盖 | 能力解释 | 主要缺口 |
|---|---:|---|---|
| WAPE | 39/40 | 作品或组合总体绝对现金误差 | 唯一无值记录是未执行候选；缺 metric definition ID |
| signed bias | 33/40 | 聚合高估/低估方向 | 允许抵消；部分实验没有登记 |
| relative WAPE/FVA | 24/40 | 同组配对相对变化 | safe fallback 的 0 不等于 raw 成功 |
| by-horizon/segment/origin | 多个公开报告，非全部 registry 行 | 诊断异质性 | 格式和覆盖不统一 |
| MAE/MASE/RMSSE/RMSE | 主要见全局分布管线和 TSB 报告 | 作品均衡/尺度化误差 | 不是全部可比组的 canonical 字段 |
| occurrence Brier/log loss | 生命周期与部分概率报告 | 发生校准 | 可靠性 bins、PR-AUC、统一输出合同缺失 |
| coverage/WIS/CRPS | 部分概率模型 | 区间风险 | 只适用于实际输出区间的模型 |
| risk–coverage/business loss | 风险自动化诊断 | 弃权与非对称成本 | 业务损失权重未授权 |
| rank correlation/top-k/NDCG | 0 个 canonical 评价 | 排序/分配 | 能力目前未建立 |
| independent evidence | 0/40 | 时间独立性 | 当前没有独立 later-origin 评价 |

## 6. 已登记实验逐项分类

| 实验 | 证据分类 | 结论 |
|---|---|---|
| 作品分群校准 v0.1（Current Segmented Calibration v0.1，`M2-EXP-CURRENT-CALIBRATION-01`） | 已执行、局部信号、历史目标（`EXECUTED_PARTIAL_SIGNAL_HISTORICAL_TARGET`） | 人工账单分区前目标上的改善不能成为当前目标总体胜利。 |
| 多层评价与全局候选活动（R0-R5 Evaluation and Global Candidate Campaign，`M2-EXP-R0-R5-01`） | raw 失败与安全回退混合（`MIXED_RAW_FAILURE_AND_SAFE_FALLBACK`） | raw 候选失败；selected fallback 无恶化不证明候选成功。 |
| 组合现金 ETS/Holt-Winters 复验（Portfolio ETS/Holt-Winters Evaluation，`M2-EXP-PORTFOLIO-ETS-01`） | 次级组合能力、总体门禁失败（`SECONDARY_PORTFOLIO_CAPABILITY_GATE_FAIL`） | 组合 WAPE/FVA 有信号，但 bias/区间门禁失败，且不可下放到作品。 |
| 历史状态后验校准（Historical-Regime Post-hoc Calibration，`M2-EXP-HISTORY-REGIME-01`） | 真实后验开发失败（`TRUE_POSTHOC_DEVELOPMENT_FAILURE`） | 同一密集人口恶化，属于已执行失败。 |
| 人工渠道规则比较（Manual Channel Rule Comparator，`M2-EXP-MANUAL-CHANNEL-01`） | 独立小人口真实失败（`TRUE_STANDALONE_FAILURE`） | 该比较组内质量失败；因人口/窗口不同不能跨组排名。 |
| 统一渠道曲线候选（Canonical Channel Curve Challenger，`M2-EXP-CANONICAL-CHANNEL-01`） | 低于 materiality 且密集窗恶化（`BELOW_MATERIALITY_AND_DENSE_REGRESSION`） | 当前人口微小变化低于 1%，25-origin 密集窗恶化。 |
| 人工锚定层级概率开发（Human-Anchored Hierarchical Probabilistic Development，`M2-EXP-HUMAN-ANCHORED-10`） | baseline 相对价值但绝对与稳定性失败（`RELATIVE_BASELINE_VALUE_WITH_ABSOLUTE_AND_STABILITY_FAILURE`） | 可学习全局模型相对人工公式改善；绝对质量、分群、bootstrap、独立证据仍失败，层级/发生 raw 层被拒绝。 |
| TSB 间歇发生候选（TSB Occurrence Challenger，`M2-EXP-TSB-OCCURRENCE-01`） | raw 与 blend 真实失败（`TRUE_RAW_AND_BLEND_FAILURE`） | 主窗和严格滚动窗均失败；重叠子集改善只是同窗诊断。 |
| 生命周期五状态候选（Lifecycle-Aware Five-State Challenger，`M2-EXP-LIFECYCLE-AWARE-01`） | raw 失败、后验收益微小（`TRUE_RAW_FAILURE_TRIVIAL_POSTHOC_GAIN`） | raw 候选失败；仅复苏路由不足 materiality，不能反称模型成功。 |
| 渠道倍率专家 v0.1（Channel Scalar Experts v0.1，`M2-EXP-CHANNEL-EXPERTS-01`） | 主窗和严格窗真实失败（`TRUE_PRIMARY_AND_STRICT_FAILURE`） | 两个核心可比窗均明显恶化。 |
| 渠道时间生成 v0.2（Channel Generative v0.2，`M2-EXP-CHANNEL-GENERATIVE-02`） | 前置条件阻断、未执行（`BLOCKED_NOT_EXECUTED_NO_MODEL_CONCLUSION`） | 只能判定未执行，不能判定候选优劣。 |
| 历史冻结开发活动（Archived C1-C3 Development Campaign，`M2-EXP-ARCHIVE-C1-C3`） | 历史目标失败（`ARCHIVED_HISTORICAL_TARGET_FAILURES`） | 保留追溯；不同目标/权威，不能与当前分成现金直接排名。 |

“无法提高总体 WAPE/bias”因此至少有四种不同含义：

- 真失败：同人口核心目标的 raw 候选恶化或未过预注册门禁；
- 次级能力：例如组合预算可能有相对价值，但不能被作品总体 WAPE完整表达；
- 选择语义：selected fallback 的安全结果不能替代 raw candidate 结果；
- 无结论：未执行或目标/人口不同的证据不支持当前目标优劣判断。

## 7. 同组可比较模型表

下表只展示 Model Registry 的组内登记值；行与行之间不得排名。`—` 表示无登记分数，
不是 0。

| 可比组 | 比较类别 | 组内模型与登记 WAPE |
|---|---|---|
| `CG-WORK-SS-CURRENT-7083` | 同案例可比（`SAME_CASE_COMPARABLE`） | 旧现金生命周期公式（Legacy Cash Lifecycle Formula，`M2-WORK-B4`）0.549294；作品发生-金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）0.490759；统一渠道曲线模型（Canonical Channel Curve，`M2-WORK-CCR01`）0.490701 |
| `CG-WORK-FORMAL-LEGACY-7851` | 复用开发窗（`REUSED_DEVELOPMENT_WINDOW`） | 旧现金生命周期公式（`M2-WORK-B4`）0.556485；作品分群向下校准模型 v0.1（Segmented Downward Calibration v0.1，`M2-WORK-SEG01`）0.531849；作品层级稳健校准模型 v0.2（Hierarchical Robust Calibration v0.2，`M2-WORK-HRC02`）0.511150；全局分布组合安全回退管线 v0.4（Global Distributional Ensemble Safe-Fallback Pipeline v0.4，`M2-WORK-GDE04`）0.505571 |
| `CG-WORK-R0R5-GLOBAL-7851` | 复用开发窗（`REUSED_DEVELOPMENT_WINDOW`） | 全局门槛广义线性模型（Global Regularized Hurdle GLM，`M2-WORK-GHG01`）1.143243；全局 Tweedie 提升树桩模型（Tweedie Boosted Stumps，`M2-WORK-TWD01`）3.011646；门槛梯度提升树桩模型（Hurdle Gradient-Boosted Stumps，`M2-WORK-HGB01`）0.865126 |
| `CG-PORT-SS-30CELLS` | 不同粒度（`DIFFERENT_GRAIN_NOT_COMPARABLE`） | 组合现金 ETS/Holt-Winters 模型（Portfolio ETS/Holt-Winters，`M2-PORT-ETS01`）0.127950 |
| `CG-WORK-SS-DENSE-44301` | 复用开发窗（`REUSED_DEVELOPMENT_WINDOW`） | 经典时间序列比较基线族（Classic Time-Series Baseline Family，`M2-BASE-CLASSIC01`）0.462742；历史状态校准模型（Historical-State Calibration，`M2-WORK-HSC01`）0.586234；统一渠道曲线模型（`M2-WORK-CCR01`）0.465066 |
| `CG-WORK-SS-MANUAL-379-H36` | 仅独立展示（`STANDALONE_ONLY`） | 人工渠道规则模型（Manual Channel Rule，`M2-WORK-MCR01`）0.704447 |
| `CG-WORK-SS-HA-PRIMARY-12039-H36` | 复用开发窗（`REUSED_DEVELOPMENT_WINDOW`） | 人工锚定忠实公式（Human-Anchored Manual-Faithful Formula，`M2-WORK-MAN01`）0.531410；人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`）0.440225/历史原报告 0.440227；人工锚定层级正金额专家模型（Human-Anchored Hierarchical Positive-Amount Experts，`M2-WORK-HP01`）0.455405；人工锚定发生与冲销模型（Human-Anchored Occurrence and Reversal，`M2-WORK-OR01`）0.441261；TSB 间歇发生模型（TSB Occurrence Model，`M2-WORK-TSB01`）0.543462；TSB 与全局模型混合候选（TSB and Learned-Global Blend，`M2-WORK-TSBB01`）0.453482；生命周期五状态模型（Lifecycle-Aware Five-State Model，`M2-WORK-LC01`）0.501393；渠道倍率专家模型（Channel Scalar Experts v0.1，`M2-CHAN-SCL01`）0.537767；渠道时间生成模型 v0.2（Channel Generative v0.2，`M2-CHAN-GEN02`）仅冻结基线语义重放 0.440225，候选未执行 |
| `CG-WORK-SS-HA-STRICT-74320` | 复用开发窗（`REUSED_DEVELOPMENT_WINDOW`） | 人工锚定可学习全局模型（`M2-WORK-LG01`）0.411919；TSB 间歇发生模型（`M2-WORK-TSB01`）0.508022；TSB 与全局模型混合候选（`M2-WORK-TSBB01`）0.444871；生命周期五状态模型（`M2-WORK-LC01`）0.622760；渠道倍率专家模型（`M2-CHAN-SCL01`）0.658653 |
| `CG-WORK-SS-OVERLAP-5203-H36` | 同交集可比（`SAME_INTERSECTION_COMPARABLE`） | 作品发生-金额校准模型 v0.3（`M2-WORK-OA03`）0.376102；人工锚定可学习全局模型（`M2-WORK-LG01`）0.277239；TSB 与全局模型混合候选（`M2-WORK-TSBB01`）0.263524；生命周期五状态模型（`M2-WORK-LC01`）0.274587。该同窗交集仅为诊断。 |
| `CG-NOT-EXECUTED` | 仅独立展示（`STANDALONE_ONLY`） | 渠道时间生成模型 v0.2（`M2-CHAN-GEN02`）—（`NOT_EXECUTED_CONTRACT_SEMANTIC_BLOCKER`） |
| `CG-WORK-HISTORICAL-C1` | 不同目标（`DIFFERENT_TARGET_NOT_COMPARABLE`） | 透明组合模型（C1 Transparent Ensemble，`M2-WORK-C1TE01`）3.850157 |
| `CG-WORK-LEGACY-BUYOUT-C2R` | 不同目标（`DIFFERENT_TARGET_NOT_COMPARABLE`） | 旧买断收入路由模型（Legacy C2-R Revenue Route，`M2-WORK-C2R01`）1.179600 |
| `CG-WORK-ARCHIVE-FORMAL-7851` | 复用历史开发窗（`REUSED_DEVELOPMENT_WINDOW`） | 正式现金路由分治模型（Formal-Cash Route-Specific Model C2-R.1，`M2-WORK-C2R101`）0.583824；活跃度与间歇模型组合（C2 Activity and Intermittent Model Mix，`M2-WORK-C2IM01`）0.556955；内部特征残差校正模型（C3 Internal-Feature Residual Correction，`M2-WORK-C3IR01`）0.553945 |

尤其不能把组合粒度的 0.127950、36 月作品开发窗的 0.440225 和当前 served 人口的
0.490759 排成一个榜单。

## 8. 当前是否存在总体最佳模型

不存在。

| 能力 | 当前可以陈述的角色 | 不能陈述的结论 |
|---|---|---|
| 作品点预测 | 作品发生-金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）仍是现行运行回退（`operationalWorkFallback`） | 不能称为跨窗口、跨人口、跨能力或独立验证的总体冠军 |
| 研究比较 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`）仍是研究基线（`researchWorkBaseline`） | 不能因 36 月开发窗 WAPE 较低而替代现行回退 |
| 组合预测 | 组合现金 ETS/Holt-Winters 模型（Portfolio ETS/Holt-Winters，`M2-PORT-ETS01`）仍是组合参考（`portfolioReference`） | 不能下放为作品点预测；组合门禁也未通过 |
| 排序/分配 | 无 canonical 模型或评价 | 不能由 WAPE 推断排序能力 |
| 风险/区间 | 部分历史概率报告有 coverage/WIS/CRPS 和 risk–coverage | 没有统一同组、独立证据支持风险能力冠军 |

所有 40 条登记评价的 `independentEvidence=false`。活动候选和自动化批准模型仍为空
（`activeCandidate=null`、`approvedForAutomation=null`）。

## 9. 评价合同 v2 草案

完整草案见 `docs/analysis/m2-current/M2-evaluation-contract-v2-proposal.md`。

### 9.1 指标角色

- 主决策指标（primary decision metric）：最接近该能力实际决策损失的指标；
- 校准护栏（calibration guardrail）：阻止总体高估/低估被绝对误差掩盖；
- 分群护栏（segment guardrails）：阻止总体数字掩盖困难人口；
- 稳定性/独立证据门（stability/independent-evidence gate）：限制时间漂移、
  作品聚类不稳定和开发窗复用；
- 仅诊断指标（diagnostic-only metrics）：解释误差，不单独触发晋升。

### 9.2 多能力框架

1. 作品级现金点预测：以按 horizon 分层的现金 WAPE 为主指标候选；MAE/严格 as-of
   MASE 描述作品均衡误差；signed/absolute bias 作校准护栏；强制收入规模、
   生命周期、间歇状态、origin/time block 分层；报告 top 1%/5%/10% 的实际现金与
   误差贡献、作品聚类 bootstrap 和时间块稳定性。
2. 收入发生：只在模型实际输出 occurrence probability 时使用 Brier、log loss、
   calibration intercept/slope、reliability bins、PR-AUC；极不平衡时 accuracy
   可由“总不发生”获得虚假高分，不能作为主指标。条件金额必须只在正发生行上用
   独立 conditional amount 输出计算。
3. 组合预算：使用 origin×horizon 组合 WAPE、signed/absolute bias、按 origin/
   horizon 误差和时间块区间；始终并列作品误差以暴露抵消；禁止分配回作品。
4. 排序/资源分配：只有业务确实按排名采取行动才加入 Spearman/Kendall、
   top-k actual cash capture、NDCG@k 或明确成本下的 utility；不得替代现金校准。
5. 风险/区间：只有模型冻结输出分位数或分布时才评价 nominal/observed coverage、
   interval score/WIS、区间宽度和条件 coverage；无输出登记
   `CAPABILITY_GAP_NO_INTERVAL_OUTPUT`。
6. 业务损失：使用
   `c_under*max(actual-pred,0) + c_over*max(pred-actual,0) +
   c_abstain*I(abstain)*abs(actual)`。未获业务授权前只做成本权重敏感性分析，不把
   现有 1.5:1:2 或任何比例固定为选模门禁。

评价合同 v2 不是围绕现行运行回退反向选指标；它先区分决策能力，再定义每个能力的
损失、主指标和护栏。

## 10. 缺失指标与未来受控重计分

### 10.1 无需重新训练、但需要冻结行级预测

如果现有预测 artifact 已冻结且 digest 可核验，下列指标可通过受控重计分获得：

- 按 horizon 的 WAPE、MAE、signed/absolute bias；
- 误差分位数、收入规模分层和 top 1%/5%/10% 误差贡献；
- 候选与 fallback 同案例配对 FVA；
- origin/time block 稳定性和作品聚类 bootstrap；
- 完整合格集合上的排名诊断。

这一步仍需单独授权，因为本轮明确禁止重计分；不需要模型训练。

### 10.2 必须已有或新增模型输出

| 能力 | 所需冻结输出 | 缺少时的状态 |
|---|---|---|
| occurrence | `occurrenceProbability` | `CAPABILITY_GAP_NO_OCCURRENCE_OUTPUT` |
| 条件金额 | `conditionalAmountPrediction` 与独立 reversal component | `CAPABILITY_GAP_NO_CONDITIONAL_AMOUNT_OUTPUT` |
| 区间/分布 | 分位数、区间或 predictive distribution | `CAPABILITY_GAP_NO_INTERVAL_OUTPUT` |
| 独立验证 | 未参与选择的成熟 later-origin 标签 | `NO_INDEPENDENT_EVIDENCE` |
| 业务损失 | 经业务授权的成本、货币、周期、预算与弃权动作 | `BUSINESS_COST_WEIGHTS_NOT_AUTHORIZED` |

没有这些输出时不能从 WAPE/bias 反推。

### 10.3 最小冻结预测数据合同

未来受控重计分至少需要：

- 身份与完整性：`stableModelId`、`experimentId`、预测 artifact digest；
- 案例键：`standardWorkId`、`origin`、`horizonMonths`；
- 可比边界：target、cash authority、population ID、actual definition、as-of
  contract、metric definition/version；
- 数值：`actual`、raw `pointEstimate`、selected pipeline point、operational
  fallback point；
- 路由：eligibility、abstention reason、origin 时生命周期和收入规模带；
- 稳定性：`timeBlockId`；
- 仅在模型真实输出时附加 occurrence probability、conditional amount、reversal
  component、quantiles 或 distribution。

现有公开聚合不足以计算这些行级指标，状态为
`NOT_COMPUTABLE_FROM_PUBLIC_AGGREGATES`。

## 11. AGENTS 与注册表卫生

未发现根 `AGENTS.md`、`src/domain/m2Current/AGENTS.md` 与 Model Registry 的实质
角色冲突（`NO_BLOCKING_AUTHORITY_CONFLICT`）。本轮不修改这两个文件。

精确去冗余建议：

1. 根 `AGENTS.md` 中会随实验变化的具体分数、临时 blocker、已完成批次和当前状态
   应逐步迁移到最新状态索引，只保留长期边界和 authority 入口。
2. 根 `AGENTS.md` 的导航不应长期硬编码旧 latest state index；可改为一个稳定 current
   指针，或由 Model Registry 的 `currentRoles.latestStateIndex` 生成。
3. `src/domain/m2Current/AGENTS.md` 应引用 Model Registry 的
   `operationalWorkFallback` 角色键，而不是重复硬编码具体模型；未来经合法治理迁移
   角色时可避免漂移。

这些只是后续治理建议，不授权删除或改写历史证据。

## 12. 现行角色与下一步

角色保持不变：

- 现行运行回退：作品发生-金额校准模型 v0.3
  （Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）；
- 研究比较基线：人工锚定可学习全局模型
  （Human-Anchored Learned Global，`M2-WORK-LG01`）；
- 组合参考：组合现金 ETS/Holt-Winters 模型
  （Portfolio ETS/Holt-Winters，`M2-PORT-ETS01`）；
- 活动候选：无（`activeCandidate=null`）；
- 自动化批准：无（`approvedForAutomation=null`）。

如果要验证评价合同 v2，下一步需要单独授权“冻结预测受控重计分”
（`REQUEST_SEPARATE_FROZEN_PREDICTION_RESCORE_AUTHORIZATION_IF_V2_VALIDATION_IS_DESIRED`）。
该授权只允许对已有冻结预测按新合同重新计分，不自动授权训练、调参、候选执行、
选择、晋升、production、provider、数据库或 final holdout。

本轮无阻断项（`blockers=[]`）。
