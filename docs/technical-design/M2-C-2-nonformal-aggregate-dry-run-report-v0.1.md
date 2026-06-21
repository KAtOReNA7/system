# M2-C-2 真实聚合输入非正式 dry-run 与校准结果验证报告 v0.1

## 结论

本轮已执行 `non_formal_aggregate_dry_run`。输入来自用户提供的真实清洗账单、数字版权台账、运营确认/映射材料，但输出仅为聚合统计，不包含原始账单行、真实作品名、作者名、渠道名或单作品收入明细。

本轮未调整 `calibratedParameters.js`。原因：dry-run 确认 C-0 生命周期阈值、预测参数、评级阈值均被使用，且 C-1 `calibrated_non_formal` profile 隔离边界未被破坏；当前差异主要来自 dry-run 对风险、建议和剩余版权期预测的聚合应用，不足以支持直接改参数。

## 数据读取与安全边界

- 读取真实清洗账单：是
- 读取数字版权台账：是
- 读取运营确认/映射材料：是
- 读取 `data/**`：是
- 输出原始明细：否
- 提交原始数据：否
- 连接数据库：否
- 执行 Docker：否
- 修改 migration：否
- 激活 mapping_version：否
- 调用 switch_mapping_version：否
- 执行 formal evaluation：否
- 新增产品 API 的 local_dry_run mode：否

## 数据规模聚合摘要

- raw bill rows read：192872
- valid calibration rows：192872
- complete rows used：192869
- evaluated works：3054
- latest complete month：2026-04
- excluded incomplete months：2026-05
- copyright date conflict works：2

## Lifecycle 分布

| 项目 | 数量 |
|---|---:|
| `growth` | 540 |
| `stable` | 872 |
| `declining` | 394 |
| `long_tail` | 132 |
| `inactive` | 800 |
| `rebound` | 270 |
| `insufficient_history` | 46 |

## Rating 分布

| 项目 | 数量 |
|---|---:|
| `S+` | 25 |
| `S` | 97 |
| `A` | 248 |
| `B` | 483 |
| `C` | 695 |
| `D` | 395 |
| `E` | 1111 |

## Forecast 聚合分布

- count：3054
- min：0.0
- p25：0.0
- median：4.83
- p75：287.73
- p95：11146.9
- p99：89975.07
- max：10798040.03
- total：29078355.23

## Risk 分布

| 项目 | 数量 |
|---|---:|
| `abnormal_spike` | 382 |
| `business_form_mixed` | 474 |
| `buyout_or_oneoff_income` | 328 |
| `channel_concentration` | 2003 |
| `copyright_expiry` | 363 |
| `data_readiness` | 2207 |
| `inactive_tail` | 932 |
| `incomplete_month_boundary` | 1 |
| `insufficient_history` | 46 |
| `revenue_decline` | 394 |

## Suggestion 分布

| 项目 | 数量 |
|---|---:|
| `downlist_or_suspend` | 744 |
| `maintain` | 634 |
| `manual_review_required` | 2609 |
| `observe_only` | 83 |
| `pricing_or_channel_adjustment` | 76 |
| `promote` | 250 |
| `reduce_investment` | 252 |
| `renewal_review` | 209 |
| `repackage` | 1078 |

## C-0 / C-1 对齐验证

- C-0 生命周期阈值被使用：True
- C-0 forecast 参数被使用：True
- C-0 rating 阈值被使用：True
- C-1 `calibrated_non_formal` profile 保持隔离：True
- 发现明显不合理阈值：False
- 本轮是否调整参数：否

## 仍不可作为正式业务结论

本轮结果是开发期非正式 dry-run，仅用于算法校准验证。不得用于正式评估、生产发布、数据库写入、mapping_version 激活或运营自动决策。

## 下一步建议

进入 M2-C-3：在继续保持聚合输出和非正式边界的前提下，做参数迭代候选与 bounded local validation。重点验证：

1. `manual_review_required` 是否过宽；
2. `channel_concentration` 是否对渠道天然集中作品过敏；
3. 剩余版权月缺失时 12 个月 forecast fallback 是否需要分层；
4. S+/S 分布与 C-0 population split 是否需要更严格的运营解释。
