# M2 评价合同 v2.1

状态：开发评价用途已激活
（`ACTIVE_FOR_DEVELOPMENT_EVALUATION_ONLY`）。

生效条件：本文件所在 exact Git HEAD 必须同时通过 Linux 与 Windows CI。若任一门禁
失败，状态自动回到 `DRAFT_V2_1_REVISION_INCOMPLETE`。这里的“激活”只表示评价
口径可用于开发期冻结证据，不代表模型运行、训练、选择、晋升、自动化、Canary、
release 或 production 获得授权。

机器权威为 `config/m2-evaluation-contract.v2.1.json`。历史评价合同 v2 提案和冻结
重评分文件保持不可变，只用于说明 v2.1 修订来源。

## 1. 目标与现金边界

评价对象只包含未来分成收入现金（`future_sales_share_cash`）：

- 分成账单成员关系是实际值的唯一现金权威；
- 买断和其他非分成现金不得进入特征、标签、点预测、区间或指标；
- pure-buyout 必须返回 `null abstain`，原因固定为
  `buyout_outside_m2_forecast_scope`；
- eligibility、目标分类、served coverage 与公司现金经济范围分别报告；
- 不得把弃权或缺失预测填成 0。

作品点预测、发生概率、条件金额、排序、风险区间和组合预算是不同能力，不进入同一
排行榜。

## 2. 评价身份与可比性

每个评价结果必须绑定以下身份：

- metric definition ID 与版本；
- target、cash authority 与 actual definition；
- as-of contract、grain、population 与 horizon contract；
- evaluation family；
- 冻结 artifact ID 与 SHA-256。

比较时 target、现金权威、actual、as-of、粒度、人口、horizon 和评价家族必须全部
一致；否则只能报告差异。明确的 same-case intersection 可以独立登记，但不得将
交集结论外推到原人口。

raw candidate、pre-selection、selected pipeline 与 operational fallback 保持不同
variant identity。selected pipeline 不是新 stable model，也不能覆盖 raw failure。

## 3. 作品点预测

逐 horizon 报告：

- WAPE 与 signed bias；
- MAE、中位绝对误差；
- 绝对误差 p50/p75/p90/p95/p99。

跨 horizon 池化结果只作诊断，除非业务在看结果前冻结 horizon 权重。候选与回退的
FVA 必须使用完全相同的 case key 和 actual，并同时报告：

- 平均/中位配对绝对误差改善；
- absolute WAPE FVA；
- relative WAPE FVA。

actual 绝对值分母为 0 时返回
`UNDEFINED_ZERO_ACTUAL_DENOMINATOR`，不得造数。MASE 只有严格 origin 前 scale
存在时才可计算；本次冻结工件缺少该 scale，明确返回
`NOT_COMPUTABLE_PRE_ORIGIN_SCALE_MISSING`。

## 4. 未来 actual 的后验归因

top 1%/5%/10% 必须同时提供：

- origin×horizon cell 内的 case 级归因；
- 全局聚合作品级归因；
- actual cash share、absolute error share 与头部外 WAPE。

该视图显式标记为
`POSTHOC_FUTURE_ACTUAL_ATTRIBUTION_ONLY`。未来 actual 只能解释误差集中度，不得
用于特征、分层拟合、选择、门禁或 prospective forecastability 声明。禁止创建任何
future-actual scale band。

## 5. 收入发生

发生事实使用冻结字段 `actualPositive` 是否严格大于 0，独立于最终 net actual 的
符号；预测使用已保存的 `occurrenceProbability`。

报告 prevalence、Brier、log loss、PR-AUC、辅助 ROC-AUC、十个等宽 reliability
bins。0.5 阈值的 confusion matrix 只作诊断，不是 gate。

发生能力的 baseline 必须是训练窗口内冻结 prevalence。若工件未保存该值，skill
一律返回
`NOT_COMPUTABLE_FROZEN_TRAINING_BASE_RATE_MISSING`。评价窗口 prevalence 的常数
预测只作 oracle 描述，不能冒充可用 baseline。

## 6. 条件正金额与冲销

条件金额只在 `actualPositiveAmount > 0` 的行上，将模型明确保存的
`conditionalAmountPrediction` 与 `actualPositiveAmount` 比较，报告 WAPE、
signed bias、MAE 和 log-MAE。

每行还必须有独立的 reversal component。最终 point estimate、发生概率乘条件金额
或其他模型输出均不得替代条件金额输出。

## 7. 排序

排序只允许 candidate 与 fallback 在相同 origin×horizon 完整 case 集上配对。每个
cell 计算 Spearman、Kendall tau-b 和 top 1%/5%/10% actual-cash capture，再以
cell 等权汇总。

必须并列报告 candidate、fallback、配对差、cell/case/work 数和权重，并以作品
cluster 与 origin/time cluster 分别给出区间。缺少回退、配对或两个 cluster 区间，
或区间不能确认正向 Spearman 差异时，状态为
`UNCONFIRMED_RANKING_SIGNAL`。

排序证据不能覆盖点预测失败，也不授权实际资源分配。

## 8. 风险区间

只评价冻结工件真实输出的原生分位网格：

`0.05/0.10/0.20/0.50/0.80/0.90/0.95`。

报告 central 90%/80%/60% 的 coverage 与 mean width，以及 WIS 和 CRPS 近似；按
horizon 和相邻 monthly origin 的最大连通 time block 分层。没有同人口冻结区间
reference 时，只能使用
`PROMISING_DEVELOPMENT_INTERVAL_EVIDENCE`，不得宣称相对区间优势。

## 9. 组合预算

组合现金 ETS/Holt-Winters（`M2-PORT-ETS01`）只与同一
origin×horizon 的 seasonal naive 配对。3/6/12 月分别报告 origin 数、FVA、origin
cluster 区间和小样本警告。组合结果不得分配回作品，也不得替代作品点预测。

## 10. 不确定性、时间与隐私

- 作品评价以作品为 bootstrap cluster；
- 组合评价以 origin 为 bootstrap cluster；
- 时间块是相邻 calendar origin 的最大连通分量；
- 随机种子为 `20260728`，bootstrap 为 200 次确定性重采样；
- 公共 cell 至少 30 cases 且 20 works；
- 组合 horizon 至少 5 origins；
- 未达阈值返回 `SUPPRESSED_PRIVACY_THRESHOLD`。

公共结果不得包含作品 ID、channel ID、行级 actual/prediction、private path 或
private receipt path。

## 11. 激活与授权

合同激活要求：语义完整、单元测试通过、冻结工件复现通过、连续两次输出逐字节
相同、公共工件通过隐私检查，并且 exact HEAD 的 Linux/Windows CI 全部成功。

本合同不改变：

- 现行运行 fallback：作品发生-金额校准模型 v0.3（`M2-WORK-OA03`）；
- 研究基线：人工锚定可学习全局模型（`M2-WORK-LG01`）；
- 组合参考：组合现金 ETS/Holt-Winters（`M2-PORT-ETS01`）；
- `activeCandidate=null`；
- `approvedForAutomation=null`。

历史 raw TSB、生命周期和渠道倍率点预测失败继续成立。
