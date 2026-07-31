# M2 HPSR01 前瞻 final holdout 规则 v0.1

历史三个月 final holdout `2025-06`、`2025-12` 保持不可变审计记录，但已经与后续
缓存发生 untouched 隔离冲突，不能用于 HPSR01。

新的前瞻规则不要求从当前唯一成熟窗口中扣留一个已经完整的 origin，而是按以下
固定公式动态预留：

1. `firstIndependentLaterOrigin = addMonths(maxActualValueOpenedOrigin, 1)`；
2. `prospectiveFinalHoldoutOrigin = addMonths(firstIndependentLaterOrigin, 3)`；
3. 两个三个月未来窗口必须不重叠；
4. holdout 即使尚未成熟也可登记，但不得读取金额、标签、指标或模型表现；
5. future actual 金额不得改变已由日期公式选定的 holdout。

当前 `maxActualValueOpenedOrigin=2026-02`，所以：

- first independent later-origin 为 `2026-03`，评价窗口为 `2026-04` 至
  `2026-06`；
- prospective final holdout 为 `2026-06`，窗口为 `2026-07` 至 `2026-09`。

两者窗口不重叠。当前只完整到 `2026-04`，二者都没有被消费；本规则不构成 K2、
final holdout 或任何真实评价授权。
