# M2 Channel Generative v0.2 Forecastability/Oracle Diagnostic 合同 v0.1

日期：2026-07-27

检查点：K0

状态：

```text
FORECASTABILITY_ORACLE_DIAGNOSTIC_CONTRACT_FROZEN_NO_OUTCOME_READ
```

## 1. 使用边界

本合同在读取 v0.2 outcome 前冻结。diagnostic 只能在 G0/G1/G2/G3 candidate
输出冻结后执行，并且：

```text
participatesInTraining=false
participatesInInnerSelection=false
participatesInOuterSelection=false
participatesInGate=false
participatesInRouting=false
canAuthorizeG4G5G6=false
```

本合同不改变预注册主 gate，也不能成为 G4–G6 授权证据。

## 2. 当前可达范围

primary、strict 必须分别报告：

- total actual positive cash；
- observed-at-origin channel actual positive cash；
- future-first-seen actual positive cash 与 share；
- reversal actual；
- G0 work-total WAPE；
- G0 work-channel WAPE。

future-first-seen share 只表示当前“零新渠道进入”边界下观察到的结构性不可达正
现金，不能直接声称是完整 work-total Bayes-error floor。

## 3. ORACLE_ENTRY

定义：

- observed-at-origin channel 仍使用 G0；
- future-first-seen channel 使用未来实际 positive cash；
- common reversal 保持可比较口径。

报告 work-channel/work-total AE 与 WAPE、相对 G0 最大可消除误差、top
1%/5%/10% 与各 horizon 影响。

固定标记：

```text
deployable=false
selectionEligible=false
futureInformationUsed=true
```

它只是 retrospective upper-bound diagnostic。

## 4. ORACLE_OCCURRENCE

对 G0、G1、G2 分别计算：

```text
candidate conditional positive amount
× actual monthly positive-occurrence indicator
```

其他口径不变。必须报告原 candidate AE、oracle-occurrence AE、最大可消除的
occurrence uncertainty、剩余 conditional-amount AE，以及 mechanism、horizon、
top-revenue 分解。

该结果只表示“若 occurrence 完美已知”的回顾性上界，不可部署，也不参与选择。

## 5. Amount、head 与 horizon shape

在 actual occurrence 条件下，报告：

- conditional amount WAPE/AE/bias；
- top 1%/5%/10% 对 conditional-amount AE 的贡献；
- prediction mass 与 actual mass；
- smearing factor 分布；
- log residual 的公开聚合分位数；
- mechanism/horizon 尺度偏差。

对同一 work-channel-origin 的重叠 horizon，报告：

- actual、G0、G1、G2 cumulative ratio；
- residual direction change rate；
- monotonicity；
- 每 horizon AE；
- 3→6、6→12、12→18、18→24 incremental cash error。

## 6. 目标用途诊断

primary、strict 分开报告：

- work-level WAPE；
- origin×horizon portfolio WAPE/bias；
- predicted top-decile 对 actual top-decile positive cash 的 capture rate；
- work revenue rank Spearman；
- top 10% work 的 AE share。

这些指标只用于判断未来是否应继续作品级点预测、组合预算、排序优先级或
区间/人工决策支持。非主指标不能宣布 core pass。

## 7. 误差分解解释

固定诊断量：

- entry gap：G0 AE 与 ORACLE_ENTRY AE 之差；
- occurrence gap：candidate AE 与 ORACLE_OCCURRENCE AE 之差；
- amount gap：使用 actual occurrence 后仍剩余的 AE；
- head contribution：top revenue work 承担的 AE；
- shape gap：累计 horizon ratio 与增量现金误差。

这些 retrospective upper bound 可能重叠，不得相加后冒充因果误差份额。

## 8. 公开与 private 边界

公共产物只含聚合结果，不含：

- work ID；
- channel UID；
- taxonomy value；
- 账单明细；
- 凭据；
- 本地机器路径。

private row output 必须位于 capability-scoped、Git-ignored 目录；manifest
只公开记录路径角色、SHA-256 和 row count，不能提交 row data。

## 9. 允许与禁止的结论

最终只允许报告：

- observed structural unreachable mass；
- retrospective oracle gap；
- current model-family residual gap；
- missing historically available drivers。

禁止声称：

- proven irreducible error；
- Bayes error 已测得；
- theoretical maximum 已确定；
- forecasting impossible。

截至本合同：

```text
outcomeRead=false
safeToRunBeforeCandidateFreeze=false
safeToStartPlatform=false
safeToStartTaxonomy=false
safeToStartComposition=false
```
