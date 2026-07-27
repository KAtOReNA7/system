# M2 评价合同第二版冻结预测重计分（M2 Evaluation Contract v2 frozen rescore）

## 一句话结论

五个当前目标可比组（comparability group）已用任务开始前存在的冻结预测完成受控
重计分，第一版 WAPE/bias 均在 `1e-8` 绝对容差内复现。第二版指标确实揭示了总量
WAPE/bias 没有充分表达的误差偏态、头部掩盖长尾、发生分类和排序信号，但没有推翻
任何历史真实失败结论，也没有产生模型晋升依据。

最终机器状态：
`M2_EVALUATION_V2_FROZEN_RESCORE_COMPLETE_NO_MODEL_CHANGE`。

评价合同第二版建议保持“已验证、需修订、未激活”的草案
（`DRAFT_VALIDATED_REVISION_REQUIRED`）。

## 真正完成重计分的可比组

| 可比组稳定 ID | 冻结案例/cell | 已重计分的稳定模型与变体 | 结论 |
|---|---:|---|---|
| `CG-WORK-SS-CURRENT-7083` | 7,083 | 作品发生-金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）；统一渠道曲线模型（Canonical Channel Curve，`M2-WORK-CCR01`）raw candidate | 候选相对 WAPE 改善仅 `0.0118%`，作品聚类区间跨 0，失败结论不变 |
| `CG-WORK-SS-HA-PRIMARY-12039-H36` | 12,039 | 人工公式（`M2-WORK-MAN01`）、研究基线（`M2-WORK-LG01`）、发生与冲销（`M2-WORK-OR01`）、TSB raw/blend/selected（`M2-WORK-TSB01`/`M2-WORK-TSBB01`）、生命周期 raw/selected（`M2-WORK-LC01`）、渠道倍率 full stack（`M2-CHAN-SCL01`） | raw TSB、生命周期、渠道倍率的点预测仍显著恶化；selected pipeline 仍只是回退或微小后验路由 |
| `CG-WORK-SS-HA-STRICT-74320` | 74,320 | 研究基线及上述 TSB、生命周期、渠道倍率可用变体 | raw 候选 5 个 horizon 均未胜出；11 个连续时间块中 raw TSB、生命周期、渠道倍率均为 `0/11` |
| `CG-WORK-SS-OVERLAP-5203-H36` | 5,203 | exact v0.3（`M2-WORK-OA03`）、研究基线（`M2-WORK-LG01`）、生命周期 raw/selected（`M2-WORK-LC01`） | 同窗交集仍显示较低 WAPE，但作品聚类区间跨 0，且不具独立性 |
| `CG-PORT-SS-30CELLS` | 30 | 组合现金 ETS/Holt-Winters（Portfolio ETS/Holt-Winters，`M2-PORT-ETS01`）；组合 ETS 复验（`M2-EXP-PORTFOLIO-ETS-01`）中的季节朴素比较臂 `SNAIVE`（模型 `M2-BASE-CLASSIC01`） | ETS 在 3/6 月胜、12 月负；组合结果不得分配回作品 |

不同可比组没有统一排名。跨 horizon 池化 WAPE 只作为诊断。

## 第一版成绩复现

复现状态为 `PASS`。代表性结果：

- 当前人工权威 7,083 案例：`M2-WORK-OA03` WAPE/bias =
  `0.4907589423671863 / 0.0737810668178361`；
- 人工锚定主评估：`M2-WORK-LG01` =
  `0.4402249501995911 / -0.1237710583135561`；
- strict rolling：`M2-WORK-LG01` =
  `0.4119187843120132 / -0.0384740094930625`；
- 同案例交集：`M2-WORK-OA03` =
  `0.3761023431817450 / 0.0972728605452381`；
- 组合：`M2-PORT-ETS01` =
  `0.1279495570962878 / 0.1004825195634307`。

冻结来源绑定、case key、actual 与现行 Model Registry 登记一致。本轮没有改写历史
成绩，只增加并行第二版验证证据。

## 第二版指标新增发现

### 1. 误差高度右偏

当前人工权威 fallback 的 MAE 为 `5,061.45`，但中位绝对误差只有 `243.89`；
人工锚定主评估研究基线为 `16,502.34` 对 `760.28`；strict rolling 为
`2,775.11` 对 `26.82`。因此平均和 WAPE 被少数大额误差强烈支配，典型作品误差
与现金加权总误差必须并列报告。

### 2. 头部收入掩盖长尾风险

在当前人工权威组，收入 top 1% 的作品占实际现金 `55.97%`，却只占 operational
fallback 绝对误差 `26.40%`；去掉收入 top 10% 后，fallback WAPE 为 `1.3311`，
远高于池化 `0.4908`。该 top-revenue 使用未来 actual，只是后验归因
（`POSTHOC_ATTRIBUTION_ONLY`），不得用于选模。

### 3. 排序信号不能等同点预测成功

渠道倍率专家模型（Channel Scalar Experts v0.1，`M2-CHAN-SCL01`）在人工锚定
主评估/strict rolling 的平均 Spearman 诊断为 `0.8343 / 0.9056`，其中部分高于
研究基线；但 raw WAPE 分别为 `0.5378 / 0.6587`，相对研究基线恶化
`22.16% / 59.90%`，作品聚类区间也确认恶化。排序信号可作为未来独立能力假设
保留，不能复活失败点预测模型或成为当前门禁。

### 4. 发生与条件金额仍不足

TSB 间歇发生模型（TSB Occurrence Model，`M2-WORK-TSB01`）在 strict rolling
的 PR-AUC 为 `0.9932`，但 base rate 已达 `0.8989`，阈值 0.5 的 specificity
只有 `0.2037`，同时 raw 点预测 WAPE 为 `0.5080`。

生命周期五状态模型（Lifecycle-Aware Five-State Model，`M2-WORK-LC01`）在
strict rolling 的 Brier/log loss 为 `0.0612 / 0.2253`，specificity 为
`0.3853`；但条件金额 WAPE 为 `0.6537`，raw 点预测 WAPE 为 `0.6228`。这说明
发生分类的局部信号没有转化为合格现金预测。

### 5. 冻结区间存在可复用但未独立验证的证据

人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`）原始
冻结分位的中央 90%/80%/60% 覆盖率为
`0.8985 / 0.8009 / 0.5995`，与 nominal 接近。这是独立于点预测的风险能力资产，
值得保留实现和证据；但它仍来自复用 development 窗口，没有合格 later-origin，
不得接入 production 或宣称区间成熟。

### 6. 组合结论依赖 horizon

`M2-PORT-ETS01` 相对季节朴素比较臂的池化相对 WAPE 改善为 `22.24%`，但只在
3 月和 6 月胜出，12 月 WAPE `0.1094` 反而劣于比较臂 `0.0848`。该结果支持
逐 horizon 报告，也说明没有业务 horizon 权重时不得产生统一冠军。

## 未能计算

- 人工锚定层级正金额专家模型（Human-Anchored Hierarchical Positive-Amount
  Experts，`M2-WORK-HP01`）没有可识别 raw 行；现有字段是 selected fallback，
  状态为 `UNAVAILABLE_RAW_ROWS_SELECTED_FALLBACK_ONLY`。
- origin 时已知收入规模带未保存：
  `CAPABILITY_GAP_NO_ORIGIN_VISIBLE_REVENUE_SCALE_BAND`。
- 严格 origin 前 MASE scale 未保存：
  `CAPABILITY_GAP_NO_STRICT_ORIGIN_PRIOR_MASE_SCALE`。
- 除人工锚定原始分位外，多数模型没有真实冻结区间/分布输出：
  `CAPABILITY_GAP_NO_FROZEN_DISTRIBUTION_FOR_MOST_MODELS`。

没有用其他 horizon、平均值、fallback 或相邻模型补缺。

## 失败结论和角色

历史真实失败结论全部保持：

- TSB 发生实验失败（`TSB_OCCURRENCE_DEVELOPMENT_FAIL`）；
- 生命周期实验失败且后验收益不实质
  （`LIFECYCLE_AWARE_DEVELOPMENT_FAIL_TRIVIAL_POSTHOC_GAIN`）；
- 渠道倍率专家开发失败并保留现有 fallback
  （`CHANNEL_EXPERT_DEVELOPMENT_FAIL_KEEP_LEARNEDGLOBAL_AND_EXACT_V0_3`）。

现行运行 fallback 仍为 `M2-WORK-OA03`，研究基线仍为 `M2-WORK-LG01`，组合参考
仍为 `M2-PORT-ETS01`；`activeCandidate=null`、
`approvedForAutomation=null`。没有模型晋升或评价 gate 变更。

## 执行边界

最终私有回执包含 716,801 条已核验源行的聚合重计分；公开文件没有作品 ID、渠道
ID、行级 actual 或 prediction。模型执行、训练、拟合、调参、选择、预测生成、
预测修改和 production 变更次数均为 0。

受控评价命令在实现期共调用 6 次：2 次因显式 schema/零分母保护安全失败，4 次
完成用于字段修正与确定性复验；最终结果只取最后一次受控回执。每次都只读冻结
预测，没有重新运行模型。该实现期调用历史不等于模型执行。

production、exact v0.3 预测路径、provider、数据库、final holdout、
Canary/full160、release 与 M3 formal 均保持 sealed。
