# M2-C-3 聚合 dry-run 参数迭代与 bounded local validation 报告 v0.1

## 结论

本轮已读取用户授权的本地真实清洗账单、数字版权台账、运营确认/映射材料和 `data/**` 目录，执行聚合级非正式 dry-run 参数变体验证。输出仅包含聚合统计和规则说明，不包含原始账单行、作品名、作者、渠道名、金额明细或运营确认明细。

推荐采用 `candidate-a` 作为 M2-C-3 非正式校准候选。原因：该变体将 `data_readiness` 拆分为可解释子类，将人工复核区分为阻断与提示，降低低价值/低风险样本的阻断噪声，同时保留高价值版权缺口、版权冲突、异常峰值和一次性收入的阻断复核。

本轮结果仍然 `notForFormalDecision=true`，不得用于正式评估、数据库写入、mapping_version 激活或运营自动决策。

## 安全边界

- 真实清洗账单读取：是，仅本地读取。
- 数字版权台账读取：是，仅本地读取。
- 运营确认/映射材料读取：是，仅本地读取。
- 原始明细输出：否。
- 数据库连接：否。
- Docker 执行：否。
- `db/migrations/` 修改：否。
- `mapping_version` 激活：否。
- `switch_mapping_version` 调用：否。
- 新增 formal/write/export/task/local_dry_run 产品能力：否。

## 变体对比

| 变体 | 评估作品数 | 阻断复核数 | 提示复核数 | 渠道集中数 | 渠道结构阻断数 | 版权缺失 fallback 数 | promote 数 | 下架/暂停建议数 |
|---|---|---|---|---|---|---|---|---|
| baseline | 3054 | 2609 | 0 | 2003 | 0 | 2207 | 146 | 744 |
| candidate-a | 3054 | 513 | 2331 | 1944 | 2 | 2207 | 442 | 744 |
| candidate-b | 3054 | 85 | 2759 | 1944 | 2 | 2207 | 557 | 744 |

## 推荐变体相对 baseline 差异

| 项目 | 数量 |
|---|---|
| manualReviewRequiredCount | -2096 |
| channelConcentrationCount | -59 |
| promoteCount | 296 |
| downlistOrSuspendCount | 0 |

## 推荐变体分布

### 生命周期分布

| 项目 | 数量 |
|---|---|
| growth | 540 |
| stable | 872 |
| declining | 394 |
| long_tail | 132 |
| inactive | 800 |
| rebound | 270 |
| insufficient_history | 46 |

### 评级分布

| 项目 | 数量 |
|---|---|
| S+ | 7 |
| S | 30 |
| A | 160 |
| B | 647 |
| C | 704 |
| D | 395 |
| E | 1111 |

### 风险分布

| 项目 | 数量 |
|---|---|
| abnormal_spike | 382 |
| aggregate_projection_gap | 2207 |
| business_form_mixed | 474 |
| buyout_or_oneoff_income | 328 |
| channel_concentration | 64 |
| channel_concentration_advisory | 1880 |
| copyright_expiry | 363 |
| inactive_tail | 932 |
| incomplete_month_boundary | 1 |
| insufficient_history | 46 |
| insufficient_revenue_history | 46 |
| missing_basic_info | 2207 |
| missing_copyright_end | 2207 |
| revenue_decline | 394 |

### 建议分布

| 项目 | 数量 |
|---|---|
| downlist_or_suspend | 744 |
| maintain | 707 |
| manual_review_required | 513 |
| observe_only | 429 |
| pricing_or_channel_adjustment | 402 |
| promote | 442 |
| reduce_investment | 252 |
| renewal_review | 209 |
| repackage | 509 |

## 人工复核拆分

阻断复核只用于后续正式化前的人工确认队列；提示复核仅作为分析备注，不应阻断 dry-run 聚合评估。

### 阻断原因

| 项目 | 数量 |
|---|---|
| mapping_uncertainty | 0 |
| copyright_missing | 0 |
| copyright_conflict | 0 |
| abnormal_spike | 7 |
| buyout_or_oneoff_income | 2 |
| high_value_with_expiry | 60 |
| high_value_with_data_gap | 444 |
| insufficient_history | 6 |
| channel_structure_unclear | 2 |

### 提示原因

| 项目 | 数量 |
|---|---|
| mapping_uncertainty | 0 |
| copyright_missing | 1763 |
| copyright_conflict | 0 |
| abnormal_spike | 375 |
| buyout_or_oneoff_income | 326 |
| high_value_with_expiry | 303 |
| high_value_with_data_gap | 0 |
| insufficient_history | 40 |
| channel_structure_unclear | 1942 |

## data_readiness 拆分

| 项目 | 数量 |
|---|---|
| missing_copyright_end | 2207 |
| copyright_date_conflict | 0 |
| mapping_uncertainty | 0 |
| missing_basic_info | 2207 |
| incomplete_month_boundary | 1 |
| insufficient_revenue_history | 46 |
| aggregate_projection_gap | 2207 |

## 版权 fallback 验证

- fallback 使用数量：2207
- fallback 评级分布：`{"A": 0, "B": 443, "C": 494, "D": 336, "E": 934, "S": 0, "S+": 0}`
- fallback 生命周期分布：`{"declining": 291, "growth": 339, "inactive": 645, "insufficient_history": 29, "long_tail": 110, "rebound": 224, "stable": 569}`

候选规则：缺失版权到期日时，不再统一使用 12 个月 fallback。推荐按生命周期分层：growth/stable/rebound 为 12 个月，declining 为 9 个月，long_tail/inactive/insufficient_history 为 6 个月；高价值缺失版权继续进入阻断复核，低价值缺失版权作为提示复核。

## 参数文件调整

`src/domain/oldProductEvaluation/calibratedParameters.js` 已保留 `nonFormalCalibration=true`、`realDataAggregated=true`、`notForFormalDecision=true`，并记录 M2-C-3 非正式聚合校准候选：

- data_readiness 子类；
- 人工复核阻断/提示分层；
- 渠道集中 balanced 规则；
- 生命周期分层 fallback；
- 风险评级 cap。

这些参数仍为非正式聚合校准候选，不是正式业务规则。
