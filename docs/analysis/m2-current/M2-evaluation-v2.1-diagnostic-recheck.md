# M2 评价合同 v2.1 冻结诊断复核

## 结论

复核状态为
`M2_EVALUATION_CONTRACT_V2_1_ACTIVE_FOR_DEVELOPMENT_ONLY`，生效范围仅限开发
评价。

六份任务前已存在、Git ignored 的冻结工件共 716,801 行，摘要与预注册完全匹配。
本轮只读取冻结输出并重算指标；模型执行、训练、拟合、调参、选择、预测生成、预测
修改和 production 变更均为 0。相同输入连续运行两次得到逐字节一致的私有回执。

v2.1 改变的是解释精度，不是历史结果：

- raw TSB、生命周期和渠道倍率候选的现金点预测仍失败；
- 渠道倍率存在配对排序信号，但不能掩盖点预测失败；
- 生命周期 occurrence 在 strict population 有区分/校准证据；
- TSB 的高 PR-AUC 不能在缺少 frozen training prevalence 时转化为 skill 声明；
- 原始区间 coverage 接近 nominal，但无同人口冻结 reference；
- 组合 ETS 的 3 月证据较强，6/12 月区间跨 0，且 12 月只有 6 origins；
- top-revenue 只作 future-actual 后验误差归因。

严格 origin 前 MASE scale 与 origin-visible revenue scale band 未保存在冻结工件，
状态分别为 `NOT_COMPUTABLE_PRE_ORIGIN_SCALE_MISSING` 与
`NOT_COMPUTABLE_ORIGIN_VISIBLE_SCALE_BAND_MISSING`。人工锚定层级正金额专家模型
（Human-Anchored Hierarchical Positive-Amount Experts，`M2-WORK-HP01`）仍无可识别
raw 行，保持 `NOT_RESCORABLE_RAW_ROWS_UNAVAILABLE`，没有从聚合分数逆向补造。

机器可读聚合值见
`docs/analysis/m2-current/M2-evaluation-v2.1-diagnostic-recheck.json`。

## 发生概率复核

| 实验/对象 | 人口 | cases | prevalence | Brier | PR-AUC | 辅助 ROC-AUC | 0.5 specificity |
|---|---:|---:|---:|---:|---:|---:|---:|
| 生命周期感知收入预测（`M2-EXP-LIFECYCLE-AWARE-01`）raw occurrence / primary | primary | 12,039 | 0.96985 | 0.03478 | 0.98312 | 0.64619 | 0.10468 |
| 生命周期感知收入预测（`M2-EXP-LIFECYCLE-AWARE-01`）raw occurrence / strict | strict | 74,320 | 0.89887 | 0.06122 | 0.97938 | 0.86457 | 0.38531 |
| TSB 收入发生实验（`M2-EXP-TSB-OCCURRENCE-01`）raw occurrence / primary | primary | 12,039 | 0.96985 | 0.02951 | 0.98950 | 0.67396 | 0 |
| TSB 收入发生实验（`M2-EXP-TSB-OCCURRENCE-01`）raw occurrence / strict | strict | 74,320 | 0.89887 | 0.06784 | 0.99318 | 0.94380 | 0.20370 |

primary 人口发生率约 97%，所以 PR-AUC 天然很高。TSB primary 的 Brier
`0.02951` 还略差于评价 prevalence oracle 的 `0.02924`，log loss 也明显更差；
0.5 阈值把全部案例判为发生，specificity 为 0。strict population 的 TSB
PR-AUC/ROC-AUC 显示区分信号，Brier `0.06784` 低于评价 oracle 的 `0.09090`；
但 oracle 使用未来评价 prevalence，不是部署时可得 baseline。

所有四组都缺少冻结 training prevalence，skill 统一为
`NOT_COMPUTABLE_FROZEN_TRAINING_BASE_RATE_MISSING`。因此本轮不声明 TSB 或生命周期
occurrence 相对可用训练基线的 skill。

## 渠道排序复核

渠道倍率专家实验（Channel Experts，`M2-EXP-CHANNEL-EXPERTS-01`）A6 消融臂与研究
fallback `M2-WORK-LG01` 做严格同案例配对：

| 人口 | cases / works / cells | Spearman candidate | fallback | 差值 | work-cluster 95% | origin/time 95% |
|---|---:|---:|---:|---:|---:|---:|
| primary | 12,039 / 1,125 / 13 | 0.83433 | 0.81563 | +0.01870 | [0.01276, 0.02411] | [0.01253, 0.02285] |
| strict | 74,320 / 2,650 / 39 | 0.90558 | 0.90199 | +0.00358 | [0.00225, 0.00509] | [0.00230, 0.00536] |

两个人口的 Kendall tau-b 差分别为 `+0.02026` 与 `+0.00474`。top 1%/5%/10%
cash capture 差异很小但为正。Spearman 的 origin×horizon 胜率均为 `0.92308`；
primary cell 差分的 min/p50/max 为
`-0.00054/0.02387/0.02835`，strict 为
`-0.00240/0.00331/0.00916`。机器 JSON 同时给出 Spearman/Kendall 的
min/p10/p50/p90/max 和 top-k 胜率。v2.1 将它登记为已估计的配对排序信号，不登记为
现金点预测成功。

同一渠道消融臂的 absolute WAPE FVA 在 primary 为 `-0.09754`，strict 为
`-0.24673`，所以历史“渠道点预测失败”不变，也不产生资源分配授权。

## 区间复核

人工锚定原始可学习全局模型
（Human-Anchored Learned Global historical original，
`M2-WORK-LG01::historical_original`）在 12,039 cases / 1,125 works 上：

| 区间 | nominal | observed | mean width |
|---|---:|---:|---:|
| central 90% | 0.90 | 0.89850 | 58,651.82 |
| central 80% | 0.80 | 0.80090 | 16,158.80 |
| central 60% | 0.60 | 0.59947 | 4,457.67 |

WIS 为 `15311.36295`，CRPS 近似为 `15311.36295`。覆盖率接近 nominal，但没有
同人口冻结 interval reference，所以状态只能是
`PROMISING_DEVELOPMENT_INTERVAL_EVIDENCE`，不能声明相对优势或 production readiness。

## 组合复核

组合现金 ETS/Holt-Winters（`M2-PORT-ETS01`）与 seasonal naive 的逐 horizon
配对结果：

| horizon | origins | absolute WAPE FVA | relative WAPE FVA | origin-cluster 95% |
|---:|---:|---:|---:|---:|
| 3 月 | 12 | +0.11261 | +0.46844 | [0.00307, 0.21489] |
| 6 月 | 12 | +0.05653 | +0.27914 | [-0.05534, 0.16403] |
| 12 月 | 6 | -0.02459 | -0.28999 | [-0.12911, 0.06137] |

3 月区间保持正向；6 月与 12 月跨 0，12 月点估计反向且只有 6 origins。三者都属于
小样本开发证据，不能合并为统一组合冠军，也不能分配回作品。

## top-revenue 后验归因

现行运行 fallback `M2-WORK-OA03` 的全局作品归因显示：

| top works | works | actual cash share | absolute error share |
|---:|---:|---:|---:|
| 1% | 8 | 0.55975 | 0.26397 |
| 5% | 38 | 0.83603 | 0.66520 |
| 10% | 76 | 0.92548 | 0.79788 |

runner 也生成每个 origin×horizon cell 内的 case 级 1%/5%/10% 聚合，并执行
30-case/20-work 隐私阈值。两类视图都使用未来 actual，状态固定为
`POSTHOC_FUTURE_ACTUAL_ATTRIBUTION_ONLY`，不得用于训练、选择或门禁。

## raw 点预测失败保持

与各自回退严格配对的 absolute WAPE FVA：

- TSB 收入发生实验 raw point：primary `-0.10324`，strict `-0.09610`；
- 生命周期感知收入预测 raw point：primary `-0.06117`，strict `-0.21084`；
- 渠道倍率专家 A6 raw point：primary `-0.09754`，strict `-0.24673`。

负值表示比回退更差。v2.1 的发生、排序或区间结果不改写这些失败。

## 模型与业务状态

模型角色保持：

- 现行运行 fallback：`M2-WORK-OA03`；
- 研究基线：`M2-WORK-LG01`；
- 组合参考：`M2-PORT-ETS01`；
- 活动候选：无；
- 自动化批准：无。

production、provider、数据库、final holdout、Canary/full160、release 与 M3 formal
继续 sealed。
