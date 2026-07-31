# M2 HPSR01 K1 实现就绪报告 v0.1

## 当前结论

LG01 头部保护分段路由模型 v0.1（LG01 Head-Protected Segmented Router
Model v0.1，`M2-WORK-HPSR01`）已经完成 canonical implementation 与公开
synthetic/fixture 验证。当前机器状态为
`M2_HEAD_PROTECTED_SEGMENTED_ROUTER_IMPLEMENTED_AWAITING_LATER_ORIGIN_DATA`。

这表示“已实现、已通过公共合成验证、尚未做独立真实评价”，不是模型通过或失败。
本轮没有读取任何新的 later-origin future actual 金额，没有计算真实 WAPE、bias、
FVA 或 bootstrap，也没有打开 prospective final holdout。

## 三个相互隔离的入口

| 入口 | 命令 | 当前边界 |
|---|---|---|
| readiness / inventory | `npm run check:m2:head-protected-segmented-router-dates` | 只检查日期、schema、行数、空值与 billMonth；不读新金额 |
| public synthetic / fixture | `npm run smoke:m2:current:head-protected-segmented-router` | 只读取 Git 跟踪的合成 fixture，完整执行动态 Core80、H50/M30/L20 与数值隔离 |
| future controlled execute | `npm run execute:m2:head-protected-segmented-router` | 当前因没有 K2 capability-scoped 授权而默认拒绝，且在任何 private 读取前停止 |

普通 test、doctor、smoke 与 CI 不会意外进入真实数据执行入口。未来即使账单日期成熟，
也必须由用户另行给出新的 K2 授权。

## canonical 路由验证

公开 fixture 使用 10 部合成作品；Core80 cutoff 同额并列全部纳入，不存在 50/100
作品门槛。稳定内部作品键划分得到 H50/M30/L20 为 5/3/2 部：

- H50 的 5 行逐行严格等于 LG01，且 fallback 行数为 0；
- M30 与 L20 均固定 `alpha=1`，不读取 global alpha，也不相互依赖；
- 4 行完成有界残差修正，1 行 nonfinite raw B3 回退 LG01；
- 2 行 finite extreme raw B3 被冻结边界 clip，最终 R1 全部有限；
- D1 原始 B3 诊断与 R1 raw router 分开保存，fallback 与成功修正覆盖率分开报告。

这些是合成结构验证，不是模型成绩。

## residual bound 来源

三个私有参数已经由此前打开的 Strict rolling Core80、三个月、CHAM01 B3 与冻结
LG01 的 577 条 development 行确定性重建并冻结，来源 origin 为 `2023-03` 至
`2025-09`。推导没有读取 actual 字段，没有使用 `2026-03` later-origin 或
`2026-06` prospective final holdout 的 outcome；具体参数值只保存在 Git ignored
的 `PRIVATE_DERIVED_CACHE`，不发布到公共 config，也不把 private digest 当作
跨电脑门禁。

## 日期与停止点

- `maxActualValueOpenedOrigin = 2026-02`；
- 动态最早独立起点为 `2026-03`；
- 它需要完整账单 `2026-04`、`2026-05`、`2026-06`；
- 当前权威账单只完整到 `2026-04`，因此 K2 不可执行；
- prospective final holdout 按
  `addMonths(firstIndependentLaterOrigin, 3)` 动态预留为 `2026-06`，
  其窗口为 `2026-07` 至 `2026-09`，当前未打开。

## 已实现、已验证、已授权、可发布

| 层次 | 状态 | 说明 |
|---|---|---|
| 已实现 | 是 | canonical 模块、三个入口与 fixture 已完成 |
| 已验证 | 公共 K1 是 | 合成路由、数值隔离、可移植性和 fail-closed 边界已验证；独立真实评价未执行 |
| 已授权 | 仅本轮 K1 | K2、真实评分、bootstrap、final holdout、production 与合并均未授权 |
| 可发布 | 否 | 没有独立 outcome，活动候选与自动化批准仍为 `null` |

production loader、route 与 API 的改动数为 0。完成公共与精确 HEAD 双平台 CI 后，
本任务在 K1 停止，等待账单完整并由用户另行授权 K2。
