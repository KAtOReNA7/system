# M2 LG01 头部现金残差校准开发评价 v0.1

LG01 头部现金残差校准模型 v0.1（LG01 Head-Cash Residual Calibration Model v0.1，`M2-WORK-HCRC01`）最终机器状态为 `M2_LG01_HEAD_CASH_RESIDUAL_FAIL`。这是阅读既有 CHAM01 结果后形成的探索性开发证据，不是独立确认，不改变现行运行回退。

## 一页结论

1. 三个月小幅信号：冻结 CHAM01 B3 诊断参考仍保留 2.66% 的点估计信号，但 95% bootstrap 区间跨 0，且两个新候选均没有形成任何合格原始输出；因此该历史信号没有转化为新候选证据。
2. H50 头部现金：未能证明得到保护。两个新候选的原始 H50 案例数均为 0；冻结参考的 H50 只有 9 部作品，按隐私合同不公开误差金额，不能据此宣称通过。
3. 系统性低估：未消除。冻结 CHAM01 B3 诊断参考的 signed bias 为 -0.0498485，比冻结 LG01 的 -0.0269017 更负；两个新候选没有原始 bias。
4. Primary/Core90 极端外推：不能认定已彻底避免。冻结 CHAM01 B3 诊断参考仍有 396 / 396 个数值失败案例；两个有界候选因没有合格原始输出而没有传播极端值，但“全量回退”不是数值通过证据。
5. 证据等级：开发失败（`M2_LG01_HEAD_CASH_RESIDUAL_FAIL`）。
6. 下一步：停止在同一现金特征和同一评价窗内继续做残差微调。

## 实验臂

| 实验臂（experiment arm） | 中文名称 | 作用 |
|---|---|---|
| `M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C0` | 冻结 LG01 三个月同案例基线（Frozen LG01 Three-Month Same-Case Baseline） | 冻结研究比较基线 |
| `M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C1` | 冻结 CHAM01 B3 三个月原始诊断参考（Frozen CHAM01 B3 Three-Month Raw Diagnostic Reference） | 冻结诊断参考 |
| `M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C2` | 全局有界残差混合（Global Bounded Residual Blend） | 原始探索性候选 |
| `M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C3` | 头部现金带保护的有界残差混合（Head-Cash-Band Protected Bounded Residual Blend） | 原始探索性候选 |

## Strict Core80 三个月主评价

| 实验臂 | 结果版本 | cases | WAPE | signed bias | MAE | median AE | 配对 FVA | bootstrap 95% | time-block 改善 | 数值状态 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 冻结 LG01 三个月同案例基线（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C0`） | 原始候选（raw） | 577 | 0.258167 | -0.0269017 | 14827.2 | 5165.81 | 0.00% | [0.00%, 0.00%] | 0.00% | `NUMERIC_STABILITY_PASS` |
| 冻结 LG01 三个月同案例基线（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C0`） | 回退后管线（selected） | 577 | 0.258167 | -0.0269017 | 14827.2 | 5165.81 | 0.00% | [0.00%, 0.00%] | 0.00% | `NUMERIC_STABILITY_PASS` |
| 冻结 CHAM01 B3 三个月原始诊断参考（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C1`） | 原始候选（raw） | 577 | 0.251288 | -0.0498485 | 14432.1 | 4234.98 | 2.66% | [-15.32%, 21.41%] | 54.55% | `NUMERIC_STABILITY_PASS` |
| 冻结 CHAM01 B3 三个月原始诊断参考（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C1`） | 回退后管线（selected） | 577 | 0.251288 | -0.0498485 | 14432.1 | 4234.98 | 2.66% | [-17.27%, 21.63%] | 54.55% | `NUMERIC_STABILITY_PASS` |
| 全局有界残差混合（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C2`） | 原始候选（raw） | 0 | — | — | — | — | — | [—, —] | — | 无原始候选；`NUMERIC_STABILITY_PASS` 只表示没有传播非有限值，不构成候选通过 |
| 全局有界残差混合（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C2`） | 回退后管线（selected） | 577 | 0.258167 | -0.0269017 | 14827.2 | 5165.81 | 0.00% | [0.00%, 0.00%] | 0.00% | `NUMERIC_STABILITY_PASS`（全部回退冻结 LG01） |
| 头部现金带保护的有界残差混合（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C3`） | 原始候选（raw） | 0 | — | — | — | — | — | [—, —] | — | 无原始候选；`NUMERIC_STABILITY_PASS` 只表示没有传播非有限值，不构成候选通过 |
| 头部现金带保护的有界残差混合（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C3`） | 回退后管线（selected） | 577 | 0.258167 | -0.0269017 | 14827.2 | 5165.81 | 0.00% | [0.00%, 0.00%] | 0.00% | `NUMERIC_STABILITY_PASS`（全部回退冻结 LG01） |

## Strict Core90 三个月敏感性

| 实验臂 | 结果版本 | cases | WAPE | signed bias | 配对 FVA | fallback | 非有限/稳定性失败 | 数值状态 |
|---|---|---:|---:|---:|---:|---:|---:|---|
| 冻结 LG01 三个月同案例基线（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C0`） | 原始候选（raw） | 1288 | 0.280318 | -0.0424386 | 0.00% | 0 | 0/0 | `NUMERIC_STABILITY_PASS` |
| 冻结 LG01 三个月同案例基线（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C0`） | 回退后管线（selected） | 1288 | 0.280318 | -0.0424386 | 0.00% | 0 | 0/0 | `NUMERIC_STABILITY_PASS` |
| 冻结 CHAM01 B3 三个月原始诊断参考（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C1`） | 原始候选（raw） | 1288 | 0.267361 | -0.0607260 | 4.62% | 0 | 0/0 | `NUMERIC_STABILITY_PASS` |
| 冻结 CHAM01 B3 三个月原始诊断参考（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C1`） | 回退后管线（selected） | 1288 | 0.267361 | -0.0607260 | 4.62% | 0 | 0/0 | `NUMERIC_STABILITY_PASS` |
| 全局有界残差混合（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C2`） | 原始候选（raw） | 0 | — | — | — | 1288 | 0/0 | 无原始候选；`NUMERIC_STABILITY_PASS` 只表示没有传播非有限值，不构成候选通过 |
| 全局有界残差混合（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C2`） | 回退后管线（selected） | 1288 | 0.280318 | -0.0424386 | 0.00% | 1288 | 0/0 | `NUMERIC_STABILITY_PASS`（全部回退冻结 LG01） |
| 头部现金带保护的有界残差混合（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C3`） | 原始候选（raw） | 0 | — | — | — | 1288 | 0/0 | 无原始候选；`NUMERIC_STABILITY_PASS` 只表示没有传播非有限值，不构成候选通过 |
| 头部现金带保护的有界残差混合（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C3`） | 回退后管线（selected） | 1288 | 0.280318 | -0.0424386 | 0.00% | 1288 | 0/0 | `NUMERIC_STABILITY_PASS`（全部回退冻结 LG01） |

## Primary/Core90 原始数值稳定性诊断

Primary/Core90 只用于数值诊断，比较状态保持 `NOT_COMPARABLE`；没有合法同案例参考时不计算或补造配对 FVA。

| 实验臂 | raw cases | WAPE | signed bias | prediction/base max | fallback | 数值失败 | 解释后的数值状态 |
|---|---:|---:|---:|---:|---:|---:|---|
| 冻结 LG01 三个月同案例基线（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C0`） | 396 | 0.312766 | -0.203467 | 1.00000 | 0 | 0 | `NUMERIC_STABILITY_PASS` |
| 冻结 CHAM01 B3 三个月原始诊断参考（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C1`） | 396 | 1.50560e+52 | 1.50560e+52 | 1.69024e+55 | 0 | 396 | 有限极端外推数值失败（`NUMERIC_STABILITY_FAIL_FINITE_EXTREME_EXTRAPOLATION`；冻结聚合字段为 `NUMERIC_STABILITY_PASS`，但不能覆盖 396 个失败案例） |
| 全局有界残差混合（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C2`） | 0 | — | — | — | 396 | 0 | 无原始候选；`NUMERIC_STABILITY_PASS` 只表示没有传播非有限值，不构成候选通过 |
| 头部现金带保护的有界残差混合（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C3`） | 0 | — | — | — | 396 | 0 | 无原始候选；`NUMERIC_STABILITY_PASS` 只表示没有传播非有限值，不构成候选通过 |

## 起点可见现金带

| 实验臂 / 现金带 | cases / works | 起点现金覆盖 | WAPE | signed bias | 绝对误差 | 相对 LG01 改善 | 隐私状态 |
|---|---:|---:|---:|---:|---:|---:|---|
| 冻结 LG01 三个月同案例基线（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C0`） / H50 | 60 / 9 | 51.76% | — | — | — | — | SUPPRESSED_PRIVACY_THRESHOLD |
| 冻结 LG01 三个月同案例基线（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C0`） / M30 | 196 / 44 | 28.65% | 0.321739 | 0.0871283 | 2.63748e+6 | 0.00% | PUBLISHED_ABOVE_THRESHOLD |
| 冻结 LG01 三个月同案例基线（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C0`） / L20 | 321 / 70 | 19.59% | 0.343500 | -0.189888 | 2.65684e+6 | 0.00% | PUBLISHED_ABOVE_THRESHOLD |
| 冻结 CHAM01 B3 三个月原始诊断参考（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C1`） / H50 | 60 / 9 | 51.76% | — | — | — | — | SUPPRESSED_PRIVACY_THRESHOLD |
| 冻结 CHAM01 B3 三个月原始诊断参考（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C1`） / M30 | 196 / 44 | 28.65% | 0.253164 | 0.0784116 | 2.07534e+6 | 21.31% | PUBLISHED_ABOVE_THRESHOLD |
| 冻结 CHAM01 B3 三个月原始诊断参考（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C1`） / L20 | 321 / 70 | 19.59% | 0.291560 | -0.135567 | 2.25510e+6 | 15.12% | PUBLISHED_ABOVE_THRESHOLD |
| 全局有界残差混合（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C2`） / H50 | 0 / 0 | — | — | — | — | — | SUPPRESSED_PRIVACY_THRESHOLD |
| 全局有界残差混合（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C2`） / M30 | 0 / 0 | — | — | — | — | — | SUPPRESSED_PRIVACY_THRESHOLD |
| 全局有界残差混合（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C2`） / L20 | 0 / 0 | — | — | — | — | — | SUPPRESSED_PRIVACY_THRESHOLD |
| 头部现金带保护的有界残差混合（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C3`） / H50 | 0 / 0 | — | — | — | — | — | SUPPRESSED_PRIVACY_THRESHOLD |
| 头部现金带保护的有界残差混合（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C3`） / M30 | 0 / 0 | — | — | — | — | — | SUPPRESSED_PRIVACY_THRESHOLD |
| 头部现金带保护的有界残差混合（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C3`） / L20 | 0 / 0 | — | — | — | — | — | SUPPRESSED_PRIVACY_THRESHOLD |

## 关键护栏

- 冻结 CHAM01 B3 诊断参考的作品聚类 bootstrap（2,000 次）：[-15.32%, 21.41%]，跨 0。
- 冻结 CHAM01 B3 诊断参考的独立时间块：6 胜 / 5 负或平，改善占比 54.55%。
- 最大单作品误差占比：冻结 CHAM01 B3 为 23.48%，冻结 LG01 为 14.24%，明显恶化。
- top 10 作品误差集中度：冻结 CHAM01 B3 为 65.34%，冻结 LG01 为 58.65%，明显恶化。
- 冻结 CHAM01 B3 的 Core90 配对 FVA 为 4.62%；两个新候选的 Core90 原始案例数均为 0。

## 原始候选与回退后结果

原始候选（raw candidate）决定是否通过；回退后结果（selected pipeline）只说明运行时如何回到冻结 LG01。任何回退都不能覆盖原始数值失败，也不能创造通过。全部 16 个外层选择单元都没有合格 alpha，所以 C2/C3 的 raw 版本在三个评价人口均为 0 个案例，而 selected 版本全部等于 C0。上表分别列出 raw 与 selected，二者未混合。

## 私有能力与边界

- 权威源：`SOURCE_AUTHORITY_AVAILABLE`；派生缓存起始状态：`CACHE_MISS_REBUILDABLE`；历史收据状态：`PROVENANCE_AVAILABLE`。
- 冻结输入缓存：`CACHE_MISS_REBUILT_AND_FROZEN`；冻结 B3 三个月公开聚合核对：`EXACT_FROZEN_H3_B3_AGGREGATE_RECONCILIATION`。
- 首个完整结果已先写入冻结私有 manifest；公开报告随后因 bootstrap 方法元数据误触防泄漏守卫而中止。当前报告只从逐文件摘要核验通过的冻结聚合与选择行恢复（`POST_OUTCOME_PUBLIC_REPORT_RECOVERED_NO_REEVALUATION`），没有重新运行模型或 bootstrap。
- 行级作品、actual、预测、选择、bootstrap 和运行收据只写入 Git ignored capability 目录；公开报告只含达到合同要求的聚合。
- 未执行 6/12/36 个月新候选、新作品、未来首次渠道、渠道分配、taxonomy、production、provider、数据库、later-origin、final holdout、Canary/full160、release、M3 formal 或 PR 合并。
