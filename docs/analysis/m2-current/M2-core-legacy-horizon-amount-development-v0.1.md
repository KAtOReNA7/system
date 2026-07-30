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

## 角色与授权

- `M2-WORK-OA03` 继续只是兼容性现行运行回退；运行路由没有改变。
- 本结果只属于 development candidate 评价；`activeCandidate=null`，
  `approvedForAutomation=null`。
- 没有执行渠道分配、36 个月、later/final holdout、production、Canary/full160、
  release、M3 formal、数据库连接或 PR merge。
- private 行、作品身份、真实逐行金额、缓存、收据和凭据均未进入 Git。
