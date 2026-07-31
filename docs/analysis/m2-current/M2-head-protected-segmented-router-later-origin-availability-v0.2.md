# M2 HPSR01 later-origin 可用性 v0.2

## 当前答案

LG01 头部保护分段路由模型 v0.1（`M2-WORK-HPSR01`）目前仍没有可评价的独立
later-origin：

当前机器状态为
`M2_HEAD_PROTECTED_SEGMENTED_ROUTER_WAITING_FOR_NEW_BILLS`。

- 最大 actual 值已打开起点：`2026-02`；
- 最早独立起点：`2026-03`；
- 所需未来账单：`2026-04` 至 `2026-06`；
- 权威账单只完整到 `2026-04`；
- `2026-05` 只有 3 条事实，仍不完整。

本次只读取 billMonth、origin、horizon、label 日期键和 actual 是否为空，没有读取
新的 future actual 金额、模型指标或候选表现。

## 为什么不再是 `2026-05` 起点

availability metadata 与 actual value opened 已经分离。检查到某个月存在或字段非空
不会推进 actual-opened 起点；因此 first independent origin 只需严格晚于
`maxActualValueOpenedOrigin=2026-02`，动态得到 `2026-03`。

这并不使它现在可评价。其未来三个月必须全部完整，而 `2026-05`、`2026-06`
尚未满足当前完整性权威。

## 前瞻 holdout

历史 `2025-06`、`2025-12` 隔离冲突保持不变，不得复用。新的规则从
first independent origin 动态计算：

- development later-origin：`2026-03`，窗口 `2026-04` 至 `2026-06`；
- prospective final holdout：`2026-06`，窗口 `2026-07` 至 `2026-09`。

holdout 可以尚未成熟；现在只登记公式和日期，不读取其金额，也不根据未来金额更换。

## 当前停止点

HPSR01 的 opened 语义与 residual-bound 来源合同可以继续完成，K1 canonical
implementation 可以继续完成；K2、真实评分、bootstrap 和 final holdout 仍关闭。
