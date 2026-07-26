# M2 learnedGlobal + TSB occurrence development v0.1

## 结论

- 候选：`M2-current-human-anchored-tsb-occurrence-challenger-v0.1`
- development 决策：`TSB_OCCURRENCE_DEVELOPMENT_FAIL`
- 该结果不是独立 later-origin 验证，不得替换 exact v0.3。
- exact v0.3、`CANARY_FAIL`、`AUTOMATION_BLOCKED` 与 release 封印保持不变。

## 单变量合同

冻结 learnedGlobal 人工公式及原参数空间，关闭四专家与 hierarchy 层。唯一新增量是
canonical TSB 的逐月发生概率和正向金额过程；零发生月更新概率，正向金额只在
正向分成现金发生时更新。冲销在 comparator 与 candidate 间使用同一训练折状态。

## 主要指标

| 视图 | WAPE | bias | MAE | business loss |
|---|---:|---:|---:|---:|
| pre-fallback blend | 0.45348237 | 0.03777402 | 16999.30491508 | 20895.13054500 |
| selected pipeline | 0.44022495 | -0.12377106 | 16502.33534983 | 21787.84407908 |
| learnedGlobal + common reversal | 0.44022495 | -0.12377106 | 16502.33534983 | — |

## FVA 语义

| 层 | absolute WAPE FVA | relative WAPE |
|---|---:|---:|
| raw TSB candidate | -0.10323736 | 23.4510% |
| pre-fallback blend candidate | -0.01325742 | 3.0115% |
| selected pipeline | 0.00000000 | 0.0000% |

候选被拒绝时 selected pipeline 会恢复 `lambda=0`，因此 selected FVA 可以为 0；
raw/blend FVA 始终保留回退前真实变化，不能用 selected FVA 冒充候选无变化。

## 预注册门禁

| 门禁 | 结果 |
|---|---|
| rawCandidateFvaStrictlyPositive | FAIL |
| blendCandidateFvaStrictlyPositive | FAIL |
| overallWapeImproved | FAIL |
| overallBusinessLossImproved | PASS |
| strictAuxiliaryWapeImproved | FAIL |
| biasNotMateriallyWorse | PASS |
| intermittentMateriallyImproved | PASS |
| activeNotUnacceptablyDegraded | FAIL |
| dormantSystematicMissGuardPassed | PASS |
| workClusterBootstrapStable | FAIL |
| enoughTimeBlocks | PASS |
| timeBlockMajorityImproved | FAIL |
| improvementNotSingleBlockOnly | PASS |
| lambdaZeroFallbackRecoverable | PASS |

## 时间与权限边界

- 相邻 calendar origin 只算一个时间证据块；作品数和 case 数不能替代时间块数。
- 2023-01 至 2023-04 连续 later-origin 块未打开、未拆分。
- 最早可能独立 origin 仍为 2026-01，需要完整标签到 2029-01，并恢复原始 frozen v1 state。
- provider、数据库、final holdout、Canary/full160、release 与 M3 formal 均未授权。
