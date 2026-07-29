# M2 尾部干扰受控训练消融 v0.1

> 实验：M2 核心老品—已有渠道范围纠偏、冻结重评分与尾部干扰验证 v0.1（M2 Core Legacy Work–Observed Channel Scope Correction, Frozen Rescore and Tail Interference Test v0.1，`M2-EXP-CORE-LEGACY-POPULATION-01`）
>
> 阶段状态：受控训练人口消融完成（`K2_CONTROLLED_TRAINING_POPULATION_ABLATION_COMPLETE`）；尾部干扰判定为“尾部干扰未确认”（`TAIL_INTERFERENCE_NOT_CONFIRMED`）。

## 结论先行

本阶段只改变人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`）的训练人口。原始全量训练（Full-population training）、动态 Core90 训练（Dynamic Core90 training）和动态 Core80 训练（Dynamic Core80 training）使用相同特征、公式、参数网格、优化方法、训练标签成熟规则、滚动评价起点与正确 actual。只报告原始可学习全局层（raw learnedGlobal）；未启用后备选择。

收入加权全量训练臂（Revenue-weighted full-population arm，`M2-EXP-CORE-LEGACY-POPULATION-01/T3_REVENUE_WEIGHTED_FULL`）没有执行，因为当前训练器不原生支持样本权重（`NOT_EXECUTED_REQUIRES_MODEL_CHANGE`）。没有为了补齐该臂修改模型。

本轮共有 6 个共享滚动评价起点。所有训练标签均在对应外层起点前成熟，Core 成员资格在每一个训练 pseudo-origin 独立重算；没有使用 validation 起点名单、未来 actual 或今天的固定 Core 名单回看历史。

## 预注册判定

| 训练臂 | 对应评价人口 | 3个月相对 WAPE 改善 | 6个月相对 WAPE 改善 | 3个月 bootstrap 支持 | 6个月 bootstrap 支持 | 改善时间块占比 |
|---|---|---:|---:|---|---|---:|
| 动态 Core90 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T1_CORE90`） | CORE90 | 0.03% | 0.25% | 否 | 否 | 33.33% |
| 动态 Core80 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T2_CORE80`） | CORE80 | -4.46% | -4.70% | 否 | 否 | 0.00% |

“确认尾部干扰”要求同一 Core 训练臂在对应作品总额人口上同时满足：3个月和6个月相对 WAPE 至少改善 1%、绝对 bias 不实质恶化、2,000 次作品聚类配对 bootstrap 下界大于 0、多数独立时间块改善，并且没有 fallback。机器判定严格按该规则生成。

## 完整核心人口结果

| 训练臂 | 人口 | 粒度 | horizon（月） | cases | works | WAPE | signed bias |
|---|---|---|---:|---:|---:|---:|---:|
| 原始全量训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T0_FULL`） | CORE80 | 作品×渠道（`WORK_CHANNEL`） | 12 | 1007 | 66 | 0.364772 | -0.269323 |
| 原始全量训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T0_FULL`） | CORE80 | 作品×渠道（`WORK_CHANNEL`） | 3 | 1007 | 66 | 0.394988 | -0.351839 |
| 原始全量训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T0_FULL`） | CORE80 | 作品×渠道（`WORK_CHANNEL`） | 36 | 1007 | 66 | 0.386216 | -0.120058 |
| 原始全量训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T0_FULL`） | CORE80 | 作品×渠道（`WORK_CHANNEL`） | 6 | 1007 | 66 | 0.385634 | -0.328334 |
| 原始全量训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T0_FULL`） | CORE80 | 作品总额（`WORK_TOTAL`） | 12 | 246 | 66 | 0.340092 | -0.269323 |
| 原始全量训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T0_FULL`） | CORE80 | 作品总额（`WORK_TOTAL`） | 3 | 246 | 66 | 0.378171 | -0.351839 |
| 原始全量训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T0_FULL`） | CORE80 | 作品总额（`WORK_TOTAL`） | 36 | 246 | 66 | 0.338656 | -0.120058 |
| 原始全量训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T0_FULL`） | CORE80 | 作品总额（`WORK_TOTAL`） | 6 | 246 | 66 | 0.365917 | -0.328334 |
| 原始全量训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T0_FULL`） | CORE90 | 作品×渠道（`WORK_CHANNEL`） | 12 | 1805 | 149 | 0.390103 | -0.282391 |
| 原始全量训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T0_FULL`） | CORE90 | 作品×渠道（`WORK_CHANNEL`） | 3 | 1805 | 149 | 0.417427 | -0.368221 |
| 原始全量训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T0_FULL`） | CORE90 | 作品×渠道（`WORK_CHANNEL`） | 36 | 1805 | 149 | 0.415769 | -0.110379 |
| 原始全量训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T0_FULL`） | CORE90 | 作品×渠道（`WORK_CHANNEL`） | 6 | 1805 | 149 | 0.410758 | -0.346461 |
| 原始全量训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T0_FULL`） | CORE90 | 作品总额（`WORK_TOTAL`） | 12 | 519 | 149 | 0.364949 | -0.282391 |
| 原始全量训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T0_FULL`） | CORE90 | 作品总额（`WORK_TOTAL`） | 3 | 519 | 149 | 0.400193 | -0.368221 |
| 原始全量训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T0_FULL`） | CORE90 | 作品总额（`WORK_TOTAL`） | 36 | 519 | 149 | 0.368022 | -0.110379 |
| 原始全量训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T0_FULL`） | CORE90 | 作品总额（`WORK_TOTAL`） | 6 | 519 | 149 | 0.390883 | -0.346461 |
| 动态 Core90 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T1_CORE90`） | CORE80 | 作品×渠道（`WORK_CHANNEL`） | 12 | 1007 | 66 | 0.365797 | -0.266594 |
| 动态 Core90 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T1_CORE90`） | CORE80 | 作品×渠道（`WORK_CHANNEL`） | 3 | 1007 | 66 | 0.395839 | -0.349418 |
| 动态 Core90 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T1_CORE90`） | CORE80 | 作品×渠道（`WORK_CHANNEL`） | 36 | 1007 | 66 | 0.387738 | -0.116771 |
| 动态 Core90 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T1_CORE90`） | CORE80 | 作品×渠道（`WORK_CHANNEL`） | 6 | 1007 | 66 | 0.386484 | -0.325825 |
| 动态 Core90 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T1_CORE90`） | CORE80 | 作品总额（`WORK_TOTAL`） | 12 | 246 | 66 | 0.338564 | -0.266594 |
| 动态 Core90 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T1_CORE90`） | CORE80 | 作品总额（`WORK_TOTAL`） | 3 | 246 | 66 | 0.377484 | -0.349418 |
| 动态 Core90 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T1_CORE90`） | CORE80 | 作品总额（`WORK_TOTAL`） | 36 | 246 | 66 | 0.338122 | -0.116771 |
| 动态 Core90 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T1_CORE90`） | CORE80 | 作品总额（`WORK_TOTAL`） | 6 | 246 | 66 | 0.364242 | -0.325825 |
| 动态 Core90 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T1_CORE90`） | CORE90 | 作品×渠道（`WORK_CHANNEL`） | 12 | 1805 | 149 | 0.391613 | -0.279329 |
| 动态 Core90 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T1_CORE90`） | CORE90 | 作品×渠道（`WORK_CHANNEL`） | 3 | 1805 | 149 | 0.418727 | -0.365525 |
| 动态 Core90 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T1_CORE90`） | CORE90 | 作品×渠道（`WORK_CHANNEL`） | 36 | 1805 | 149 | 0.417935 | -0.106583 |
| 动态 Core90 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T1_CORE90`） | CORE90 | 作品×渠道（`WORK_CHANNEL`） | 6 | 1805 | 149 | 0.412081 | -0.343672 |
| 动态 Core90 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T1_CORE90`） | CORE90 | 作品总额（`WORK_TOTAL`） | 12 | 519 | 149 | 0.364049 | -0.279329 |
| 动态 Core90 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T1_CORE90`） | CORE90 | 作品总额（`WORK_TOTAL`） | 3 | 519 | 149 | 0.400060 | -0.365525 |
| 动态 Core90 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T1_CORE90`） | CORE90 | 作品总额（`WORK_TOTAL`） | 36 | 519 | 149 | 0.368279 | -0.106583 |
| 动态 Core90 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T1_CORE90`） | CORE90 | 作品总额（`WORK_TOTAL`） | 6 | 519 | 149 | 0.389917 | -0.343672 |
| 动态 Core80 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T2_CORE80`） | CORE80 | 作品×渠道（`WORK_CHANNEL`） | 12 | 1007 | 66 | 0.381280 | -0.293280 |
| 动态 Core80 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T2_CORE80`） | CORE80 | 作品×渠道（`WORK_CHANNEL`） | 3 | 1007 | 66 | 0.411390 | -0.373090 |
| 动态 Core80 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T2_CORE80`） | CORE80 | 作品×渠道（`WORK_CHANNEL`） | 36 | 1007 | 66 | 0.399608 | -0.148909 |
| 动态 Core80 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T2_CORE80`） | CORE80 | 作品×渠道（`WORK_CHANNEL`） | 6 | 1007 | 66 | 0.401446 | -0.350356 |
| 动态 Core80 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T2_CORE80`） | CORE80 | 作品总额（`WORK_TOTAL`） | 12 | 246 | 66 | 0.356732 | -0.293280 |
| 动态 Core80 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T2_CORE80`） | CORE80 | 作品总额（`WORK_TOTAL`） | 3 | 246 | 66 | 0.395021 | -0.373090 |
| 动态 Core80 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T2_CORE80`） | CORE80 | 作品总额（`WORK_TOTAL`） | 36 | 246 | 66 | 0.353622 | -0.148909 |
| 动态 Core80 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T2_CORE80`） | CORE80 | 作品总额（`WORK_TOTAL`） | 6 | 246 | 66 | 0.383132 | -0.350356 |
| 动态 Core80 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T2_CORE80`） | CORE90 | 作品×渠道（`WORK_CHANNEL`） | 12 | 1805 | 149 | 0.404421 | -0.305910 |
| 动态 Core80 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T2_CORE80`） | CORE90 | 作品×渠道（`WORK_CHANNEL`） | 3 | 1805 | 149 | 0.432225 | -0.388927 |
| 动态 Core80 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T2_CORE80`） | CORE90 | 作品×渠道（`WORK_CHANNEL`） | 36 | 1805 | 149 | 0.426271 | -0.139535 |
| 动态 Core80 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T2_CORE80`） | CORE90 | 作品×渠道（`WORK_CHANNEL`） | 6 | 1805 | 149 | 0.424952 | -0.367879 |
| 动态 Core80 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T2_CORE80`） | CORE90 | 作品总额（`WORK_TOTAL`） | 12 | 519 | 149 | 0.379529 | -0.305910 |
| 动态 Core80 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T2_CORE80`） | CORE90 | 作品总额（`WORK_TOTAL`） | 3 | 519 | 149 | 0.415532 | -0.388927 |
| 动态 Core80 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T2_CORE80`） | CORE90 | 作品总额（`WORK_TOTAL`） | 36 | 519 | 149 | 0.379921 | -0.139535 |
| 动态 Core80 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T2_CORE80`） | CORE90 | 作品总额（`WORK_TOTAL`） | 6 | 519 | 149 | 0.406397 | -0.367879 |

作品总额（work-total）与作品×渠道（work×channel）分别评分，渠道误差没有在作品内抵消后消失。3、6、12、36个月各自形成独立同案例比较，不跨 horizon 评选冠军。

## 相对全量训练的同案例比较

| Core训练臂 | 人口 | 粒度 | horizon（月） | 相对 WAPE 改善 | 绝对 bias 恶化 | 绝对 WAPE 改善95%区间 | 改善时间块占比 |
|---|---|---|---:|---:|---:|---|---:|
| 动态 Core90 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T1_CORE90`） | CORE80 | 作品×渠道 | 12 | -0.28% | -0.002729 | [-0.005304, -0.000993, 0.000886] | 0.00% |
| 动态 Core90 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T1_CORE90`） | CORE80 | 作品×渠道 | 3 | -0.22% | -0.002421 | [-0.004373, -0.000846, 0.000853] | 0.00% |
| 动态 Core90 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T1_CORE90`） | CORE80 | 作品×渠道 | 36 | -0.39% | -0.003286 | [-0.008062, -0.001563, 0.000843] | 0.00% |
| 动态 Core90 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T1_CORE90`） | CORE80 | 作品×渠道 | 6 | -0.22% | -0.002508 | [-0.004575, -0.000846, 0.000912] | 0.00% |
| 动态 Core90 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T1_CORE90`） | CORE80 | 作品总额 | 12 | 0.45% | -0.002729 | [-0.000063, 0.001486, 0.003018] | 33.33% |
| 动态 Core90 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T1_CORE90`） | CORE80 | 作品总额 | 3 | 0.18% | -0.002421 | [-0.000806, 0.000686, 0.001614] | 33.33% |
| 动态 Core90 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T1_CORE90`） | CORE80 | 作品总额 | 36 | 0.16% | -0.003286 | [-0.003030, 0.000599, 0.002095] | 33.33% |
| 动态 Core90 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T1_CORE90`） | CORE80 | 作品总额 | 6 | 0.46% | -0.002508 | [-0.000116, 0.001574, 0.003989] | 33.33% |
| 动态 Core90 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T1_CORE90`） | CORE90 | 作品×渠道 | 12 | -0.39% | -0.003062 | [-0.005225, -0.001550, 0.000485] | 0.00% |
| 动态 Core90 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T1_CORE90`） | CORE90 | 作品×渠道 | 3 | -0.31% | -0.002696 | [-0.004390, -0.001326, 0.000458] | 0.00% |
| 动态 Core90 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T1_CORE90`） | CORE90 | 作品×渠道 | 36 | -0.52% | -0.003796 | [-0.007959, -0.002275, 0.000388] | 0.00% |
| 动态 Core90 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T1_CORE90`） | CORE90 | 作品×渠道 | 6 | -0.32% | -0.002789 | [-0.004496, -0.001351, 0.000492] | 0.00% |
| 动态 Core90 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T1_CORE90`） | CORE90 | 作品总额 | 12 | 0.25% | -0.003062 | [-0.001028, 0.000916, 0.002347] | 33.33% |
| 动态 Core90 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T1_CORE90`） | CORE90 | 作品总额 | 3 | 0.03% | -0.002696 | [-0.001690, 0.000137, 0.001255] | 33.33% |
| 动态 Core90 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T1_CORE90`） | CORE90 | 作品总额 | 36 | -0.07% | -0.003796 | [-0.003941, -0.000212, 0.001513] | 0.00% |
| 动态 Core90 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T1_CORE90`） | CORE90 | 作品总额 | 6 | 0.25% | -0.002789 | [-0.001114, 0.000903, 0.002788] | 33.33% |
| 动态 Core80 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T2_CORE80`） | CORE80 | 作品×渠道 | 12 | -4.53% | 0.023957 | [-0.024450, -0.016151, -0.004997] | 0.00% |
| 动态 Core80 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T2_CORE80`） | CORE80 | 作品×渠道 | 3 | -4.15% | 0.021251 | [-0.023596, -0.016042, -0.006976] | 0.00% |
| 动态 Core80 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T2_CORE80`） | CORE80 | 作品×渠道 | 36 | -3.47% | 0.028851 | [-0.022840, -0.012757, 0.006325] | 0.00% |
| 动态 Core80 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T2_CORE80`） | CORE80 | 作品×渠道 | 6 | -4.10% | 0.022022 | [-0.023611, -0.015485, -0.005219] | 0.00% |
| 动态 Core80 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T2_CORE80`） | CORE80 | 作品总额 | 12 | -4.89% | 0.023957 | [-0.024518, -0.016210, -0.004707] | 0.00% |
| 动态 Core80 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T2_CORE80`） | CORE80 | 作品总额 | 3 | -4.46% | 0.021251 | [-0.023833, -0.016499, -0.007151] | 0.00% |
| 动态 Core80 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T2_CORE80`） | CORE80 | 作品总额 | 36 | -4.42% | 0.028851 | [-0.023502, -0.014404, 0.003736] | 0.00% |
| 动态 Core80 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T2_CORE80`） | CORE80 | 作品总额 | 6 | -4.70% | 0.022022 | [-0.024363, -0.016830, -0.007259] | 0.00% |
| 动态 Core80 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T2_CORE80`） | CORE90 | 作品×渠道 | 12 | -3.67% | 0.023519 | [-0.022460, -0.014077, -0.003530] | 0.00% |
| 动态 Core80 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T2_CORE80`） | CORE90 | 作品×渠道 | 3 | -3.54% | 0.020706 | [-0.021813, -0.014517, -0.005991] | 0.00% |
| 动态 Core80 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T2_CORE80`） | CORE90 | 作品×渠道 | 36 | -2.53% | 0.029156 | [-0.020889, -0.010174, 0.008089] | 0.00% |
| 动态 Core80 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T2_CORE80`） | CORE90 | 作品×渠道 | 6 | -3.46% | 0.021419 | [-0.021827, -0.013925, -0.004606] | 0.00% |
| 动态 Core80 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T2_CORE80`） | CORE90 | 作品总额 | 12 | -4.00% | 0.023519 | [-0.022677, -0.014299, -0.003605] | 0.00% |
| 动态 Core80 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T2_CORE80`） | CORE90 | 作品总额 | 3 | -3.83% | 0.020706 | [-0.022242, -0.015050, -0.006463] | 0.00% |
| 动态 Core80 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T2_CORE80`） | CORE90 | 作品总额 | 36 | -3.23% | 0.029156 | [-0.021512, -0.011527, 0.006308] | 0.00% |
| 动态 Core80 训练（`M2-EXP-CORE-LEGACY-POPULATION-01/T2_CORE80`） | CORE90 | 作品总额 | 6 | -3.97% | 0.021419 | [-0.022638, -0.015196, -0.006657] | 0.00% |

每个单元均在完全相同的作品、起点、horizon、粒度与 actual 上比较。机器结果 JSON 同时保留 Top20、Top50、时间块、匿名渠道、年份、结算机制、匿名二级/三级分类切片以及极端作品贡献集中度。

## 均值回归与头部高点替代解释

| 人口 | origin×work | 独立作品 | 当前距历史峰值平均缺口 | 最近6月标准化趋势中位数 | YTD/上年同期均值 | 距峰值月数中位数 | 连续下降月均值 | 单月异常占比 | 接近峰值占比 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| CORE80 | 246 | 66 | 54.10% | -0.023314 | 14.072199 | 9.00 | 1.48 | 3.66% | 9.76% |
| CORE90 | 519 | 149 | 58.32% | -0.036509 | 36.055327 | 8.00 | 1.57 | 4.82% | 9.25% |
| TOP20 | 120 | 40 | 52.92% | -0.038826 | 6.049629 | 7.00 | 1.68 | 4.17% | 9.17% |
| TOP50 | 300 | 86 | 53.59% | -0.020873 | 35.692546 | 8.00 | 1.50 | 5.00% | 10.67% |

上述字段只用于结果诊断，没有加入特征或参与训练。机器结果进一步把“接近历史高点/低于高点”“最近6月下降/非下降”“单月异常/非异常”分组比较，以判断改善是否可能主要来自均值回归或高点选择。

## 治理边界

- 本轮有效训练评价只执行一次（`validTrainingEvaluationCount=1`），未在见到结果后调参。
- 动态 Core80/Core90 是训练和评价人口，不是公司组合分量；Core 外尾部没有以预测为 0、长尾池或公司补差重新加入误差。
- 三级分类仍只作报告诊断，不改变 Core 资格，也不直接修正金额。
- 分层收入组合模型 v0.1（Layered Revenue Composition Model v0.1，`M2-PORT-LRC01`）和组合参考模型（Portfolio ETS Reference，`M2-PORT-ETS01`）没有进入本轮排名。
- 本轮不改变运行回退、研究基线、活动候选或自动化批准，不进入 production、独立 later-origin、final holdout、Canary/full160、release 或 M3 formal。
