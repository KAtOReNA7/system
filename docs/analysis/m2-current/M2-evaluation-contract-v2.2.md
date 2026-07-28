# M2 评价合同 v2.2

当前状态：因未解决冲销残差而阻断
（`M2_EVALUATION_V2_2_BLOCKED_UNRESOLVED_REVERSAL`）。

冲销权威、整数现金守恒、2,000 次完整 bootstrap、冻结标签重评分、重复执行确定性
和公共隐私已经验证；但 final restated 视图存在非零未分配冲销残差。只有三时间视图、
零残差以及当前执行提交的 Linux/Windows CI 等全部条件同时通过后，状态才允许变为
`ACTIVE_FOR_DEVELOPMENT_EVALUATION_ONLY`。

本合同不授权模型执行、训练、拟合、调参、选择、晋升、预测生成或修改、later
origin、final holdout、production、Canary 或 release。

## 1. actual definition 与可比性

v2.2 同时保存两个评价家族：

- 原入账口径：`M2-ACTUAL-POSTING-TIME-01`；
- 冲销重述口径：`M2-ACTUAL-REVERSAL-RESTATEMENT-01`。

两者必须使用不同 `comparabilityGroupId`。允许报告同一冻结预测、同一 case 在两种
标签定义下的配对影响，但不得跨 actual definition 评冠军，也不得把差异解释为重新
训练后的模型改善或退化。

旧预测面对新标签的状态固定为
`FROZEN_PREDICTION_LABEL_ONLY_RESCORE`。v2.1、其冻结数字和历史 raw failure 不被
覆盖。

## 2. 统计修正

### 2.1 Bootstrap 与排序

- 固定种子 `20260728`；
- 至少 2,000 次重采样；
- 作品排序以完整作品 cluster 重采样，同一作品跨 cell 整体出现；
- candidate 与 fallback 使用同一组重采样权重；
- 每次重采样在每个 origin×horizon cell 重新计算 rank、Spearman、Kendall tau-b
  和 top 1%/5%/10% capture；
- 禁止把固定全样本 rank contribution 的重采样称为 full bootstrap。

相邻月 origin 组成最大相邻 time block。独立 block 不足时返回
`NOT_COMPUTABLE_INSUFFICIENT_INDEPENDENT_TIME_BLOCKS`；逐 origin 只作描述，不提供
伪造的独立时间置信区间。渠道排序此时只能解释为
`WORK_CLUSTER_RANKING_SIGNAL_TIME_INDEPENDENCE_UNCONFIRMED`。

### 2.2 组合评价

3/6/12 月继续分开。2,000 次 origin resampling 只作小样本敏感性分析，并增加
leave-one-origin-out 和连续时间块诊断。6 或 12 个 origins 不构成独立外部验证，
不建立 router。

### 2.3 发生、条件金额与冲销

收入发生同时报告 prevalence、Brier、log loss、梯形积分
`PR_AUC_trapezoidal`、Average Precision、辅助 ROC-AUC 和 reliability。v2.1 的
历史 PR-AUC 数字保留，但明确改名为梯形 PR-AUC，不静默解释为 Average Precision。

条件正金额必须实际比较 `conditionalAmountPrediction` 与
`actualPositiveAmount`，报告 WAPE、signed bias、MAE 和 log-MAE。

冲销事件独立比较 posting-time reversal actual 与冻结 reversal output。存在 amount
输出时报告 amount WAPE、bias 和 MAE；只有独立 occurrence probability 时才报告
occurrence 与 calibration。缺少 actual 时准确返回
`NOT_COMPUTABLE_REVERSAL_ACTUAL_MISSING`，字段存在不等于评价通过。

### 2.4 top revenue

未来 actual 后验归因拆成：

- 正收入：`max(actual, 0)`；
- 绝对现金规模：`abs(actual)`；
- 冲销规模：冲销绝对值。

三者都保持 `POSTHOC_FUTURE_ACTUAL_ATTRIBUTION_ONLY`，不得用于拟合、选择或 gate。

## 3. 内容摘要激活

跨电脑激活不绑定盘符、绝对路径或预先抄录的提交 SHA。权威绑定包括：

- contract schema/version 和 tracked contract artifact digest；
- evaluator implementation digest；
- test contract digest；
- frozen input artifact set digest；
- 当前执行提交的 Linux/Windows CI。

exact HEAD 是每次执行回执中的审计信息，不是永久合同条件。后续 descendant commit
只有在上述内容摘要未变化且公共门禁和当前 CI 继续通过时，才可继承开发评价状态。

## 4. 模型与业务角色

v2.2 不改变模型 stable ID 或角色：

- 作品现行运行回退仍为 `M2-WORK-OA03`；
- 研究基线仍为 `M2-WORK-LG01`；
- 组合参考仍为 `M2-PORT-ETS01`；
- `activeCandidate=null`；
- `approvedForAutomation=null`。

生产、自动化、later-origin、holdout、Canary 和 release 继续 sealed。
