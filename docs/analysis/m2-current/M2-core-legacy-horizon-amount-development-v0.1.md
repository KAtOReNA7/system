# M2 核心老品分周期金额模型开发评价 v0.1

总结状态：`M2_CORE_HORIZON_AMOUNT_DEVELOPMENT_FAIL`。

本轮真实训练并评价了核心老品分周期金额模型 v0.1
（Core Legacy Horizon-Specific Amount Model v0.1，`M2-WORK-CHAM01`）。
3、6、12 月分别拟合独立参数，B0–B3 规格在 outer outcome 读取前冻结，首个
完整 raw 结果已冻结。

## Strict Core80 主决策

| 周期 | 最佳 raw arm | 候选 WAPE / bias | LG01 WAPE / bias | FVA | bootstrap 95% | 时间块改善 | 通过 |
|---|---|---:|---:|---:|---:|---:|---|
| 3 月 | B3 | 0.251288 / -0.049848 | 0.258167 / -0.026902 | 2.66% | [-15.99%, 21.64%] | 54.55% | 否 |
| 6 月 | B3 | 0.281704 / -0.068682 | 0.275076 / 0.009543 | -2.41% | [-28.43%, 22.56%] | 50.00% | 否 |
| 12 月 | B3 | 0.391820 / -0.138431 | 0.315749 / 0.064270 | -24.09% | [-78.55%, 23.67%] | 33.33% | 否 |

## Primary/Core90 数值稳定性补充披露

原始冻结 JSON 未改写、未重跑。原文件中的 `COMPUTED` 只表示算术完成且 JSON
数值有限，不代表通过数值稳定性门。以下五个 Primary rolling / Core90 单元存在
有限但数量级失控的正向外推：

| 周期 | 核心老品分周期金额实验臂 | cases / works / origins | WAPE | signed bias | 最大单作品绝对误差占比 | 数值状态 |
|---|---|---:|---:|---:|---:|---|
| 3 月 | 等作品权重直接金额臂（`M2-EXP-CORE-HORIZON-AMOUNT-01/B1`） | 396 / 155 / 5 | `5.494429874592189e+33` | `5.494429874592189e+33` | 100% | 数值稳定性失败（`NUMERIC_STABILITY_FAIL_FINITE_EXTREME_EXTRAPOLATION`） |
| 3 月 | 起点收入秩权重直接金额臂（`M2-EXP-CORE-HORIZON-AMOUNT-01/B2`） | 396 / 155 / 5 | `2.739672113752189e+61` | `2.739672113752189e+61` | 100% | 数值稳定性失败（`NUMERIC_STABILITY_FAIL_FINITE_EXTREME_EXTRAPOLATION`） |
| 3 月 | 冻结 LG01 输入稳健金额臂（`M2-EXP-CORE-HORIZON-AMOUNT-01/B3`） | 396 / 155 / 5 | `1.5056004952219026e+52` | `1.5056004952219026e+52` | 100% | 数值稳定性失败（`NUMERIC_STABILITY_FAIL_FINITE_EXTREME_EXTRAPOLATION`） |
| 6 月 | 等作品权重直接金额臂（`M2-EXP-CORE-HORIZON-AMOUNT-01/B1`） | 396 / 155 / 5 | `9366475296846.143` | `9366475296845.537` | `99.99999999999616%` | 数值稳定性失败（`NUMERIC_STABILITY_FAIL_FINITE_EXTREME_EXTRAPOLATION`） |
| 6 月 | 起点收入秩权重直接金额臂（`M2-EXP-CORE-HORIZON-AMOUNT-01/B2`） | 396 / 155 / 5 | `8.271113970865827e+28` | `8.271113970865827e+28` | 100% | 数值稳定性失败（`NUMERIC_STABILITY_FAIL_FINITE_EXTREME_EXTRAPOLATION`） |

这些单元的中位绝对误差仍分别只有约 1,986、2,160、2,119、4,598 和 4,717，
而几乎全部绝对误差由单一作品贡献。实现审计表明，根因是训练支持外的 transformed
space 外推，经无金额上界的 signed-`expm1` 逆变换放大；fold 内标准化没有 outer
support 或 prediction/base 比率保护。它不是空支持、非有限值传播或序列化错误。
在缺少冻结私有模型状态时不能把责任进一步归到某一个特征，但机制级结论明确。

性能失败（`M2_CORE_HORIZON_AMOUNT_DEVELOPMENT_FAIL`）与数值稳定性失败
（`M2_CHAM01_PRIMARY_CORE90_NUMERIC_STABILITY_FAIL_FINITE_EXTREME_EXTRAPOLATION`）
分别登记。该补充不改变 3、6、12 月均失败、不得重跑或晋升的既有结论。机器可读
明细见 `M2-core-legacy-horizon-amount-numeric-stability-disclosure-v0.1.json`。

## 角色与授权

- `M2-WORK-OA03` 继续只是兼容性现行运行回退；运行路由没有改变。
- 本结果只属于 development candidate 评价；`activeCandidate=null`，
  `approvedForAutomation=null`。
- 没有执行渠道分配、36 个月、later/final holdout、production、Canary/full160、
  release、M3 formal、数据库连接或 PR merge。
- private 行、作品身份、真实逐行金额、缓存、收据和凭据均未进入 Git。
