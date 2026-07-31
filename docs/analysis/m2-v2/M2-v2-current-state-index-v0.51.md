# M2 当前状态索引 v0.51

截至 2026-07-31，LG01 头部保护分段路由模型 v0.1（LG01 Head-Protected
Segmented Router Model v0.1，`M2-WORK-HPSR01`）已经完成 canonical
implementation 与公开 synthetic/fixture 验证。当前机器状态为
`M2_HEAD_PROTECTED_SEGMENTED_ROUTER_IMPLEMENTED_AWAITING_LATER_ORIGIN_DATA`。

该状态不是模型通过或失败：本轮没有读取独立 later-origin future actual 金额，
没有真实 WAPE、bias、FVA 或 bootstrap，也没有打开 prospective final holdout。
模型角色为 `implemented_awaiting_independent_evaluation`，活动候选与自动化批准
继续为 `null`。

## 首页结论

| 问题 | 当前答案 |
|---|---|
| 是否完成 canonical implementation？ | 是；动态 Core80、H50/M30/L20、有界残差、数值回退与三个隔离入口均已实现 |
| opened metadata 与 opened actual 是否分离？ | 是；availability metadata、actual value opened 与权威账单完整性分别登记 |
| `maxActualValueOpenedOrigin` | `2026-02` |
| 最早独立 later-origin | 运行时从 ledger 动态得到 `2026-03` |
| 所需完整账单 | `2026-04`、`2026-05`、`2026-06` |
| 当前完整到哪个月？ | `2026-04`；因此真实评价仍不可执行 |
| prospective final holdout | `addMonths(firstIndependentLaterOrigin, 3)`；当前为 `2026-06`，窗口 `2026-07` 至 `2026-09`，未打开 |
| H50 是否逐行等于 LG01？ | 公开合成验证为是，5/5 行严格相等且 fallback 为 0；真实 later-origin 尚未评价 |
| M30/L20 是否依赖 global alpha？ | 否；两带分别固定 `alpha=1`，互不依赖 |
| B3 finite extreme 是否隔离？ | 公开合成验证为是；2 行被 clip 后最终预测有限 |
| residual bound 来源 | 已证明只来自此前打开的旧 development 行；私有数值不公开 |
| 当前 K2 权限 | 未授权；即使日期成熟也必须取得新的 capability-scoped 用户授权 |

## opened-origin 语义修订

本轮将以下边界明确分开：

- `availabilityInspectedThrough`：只检查月份、schema、行数或空值；
- `actualValueOpenedThrough`：确实读取过 future actual 金额、标签、聚合指标或模型表现；
- `completeAuthoritativeBillMonthThrough`：权威分成账单完整闭合到哪个月；
- 失败尝试是否只触及 metadata，与是否已经打开 outcome 分开记录。

历史完成评价证据继续证明最大 actual-opened origin 为 `2026-02`，future label
日期边界为 `2026-05`。账单 availability 也检查到 `2026-05`，但权威完整性只到
`2026-04`。metadata 检查本身不推进 actual-opened 边界，因此动态最早独立起点从
旧解释的 `2026-05` 修正为 `2026-03`；其未来三个月尚未全部完整。

审计没有改写历史 receipt，也没有读取任何新 future actual 金额。

## K1 canonical implementation

HPSR01 只登记三个实验内身份：

- 冻结 LG01 later-origin 同案例基线
  （`M2-EXP-LG01-HEAD-PROTECTED-SEGMENTED-ROUTER-01/R0`）；
- 冻结公式 CHAM01 B3 原始诊断
  （`M2-EXP-LG01-HEAD-PROTECTED-SEGMENTED-ROUTER-01/D1`）；
- LG01 头部保护分段路由唯一候选
  （`M2-EXP-LG01-HEAD-PROTECTED-SEGMENTED-ROUTER-01/R1`）。

每个 forecast origin 只使用当时可见的 trailing-12 分成现金动态构造 Core80。
Core80 内按现金降序、稳定内部作品键升序划分 H50/M30/L20；边界作品整体进入较高
现金带，不拆分作品，也不要求 50 或 100 部作品。

- H50：`prediction = LG01 prediction`，是固定架构组成，不是 fallback；
- M30/L20：分别使用 `alpha=1` 的 CHAM01 B3 相对 LG01 残差；
- scale 为 `max(abs(base), frozenDevelopmentPositiveBaseFloor)`；
- normalized residual 由冻结 development q05/q95 clip；
- global alpha、跨带依赖、逐作品选择和 alpha 搜索均不存在。

## 公开 synthetic/fixture 验证

公开 fixture 使用 10 部同额合成作品；Core80 cutoff tie 全部纳入，得到 H50/M30/L20
为 5/3/2 部。验证结果：

- H50 5 行逐行严格等于 LG01，fallback 行数为 0；
- M30/L20 共 4 行完成有界残差修正；
- 2 行 finite extreme B3 被 clip，最终 R1 有限；
- 1 行 nonfinite raw B3 回退 LG01；
- D1 raw B3 与 R1 raw router 分开保存；
- corrected 与 fallback 覆盖率分开报告；
- 所有最终合成 R1 预测有限；
- 没有读取 private、真实标签或真实评价指标。

这些是实现与数值安全测试，不是模型成绩。

## residual bound 与可移植性

`frozenDevelopmentPositiveBaseFloor`、`frozenDevelopmentQ05` 和
`frozenDevelopmentQ95` 由此前已经打开的 Strict rolling Core80、三个月、CHAM01
B3 与冻结 LG01 的 577 条 development 行确定性重建并冻结，来源 origin 为
`2023-03` 至 `2025-09`。

推导不消费 actual 字段，不包含候选 later-origin 或 prospective final holdout。
具体数值只进入 Git ignored 的 `PRIVATE_DERIVED_CACHE`；公共 config 只记录公式、
来源角色、范围与冻结状态。缓存缺失可自动重建，历史 receipt 缺失只告警，private
digest 与旧电脑路径均不是跨电脑门禁。

## 三个隔离入口

| 入口 | 当前行为 |
|---|---|
| readiness / inventory | 只检查账单月份、opened 语义、最早独立起点与 holdout 预留，不训练或评价 |
| public synthetic / fixture | 只用 Git 跟踪的合成数据完整运行 H50/M30/L20 与数值隔离 |
| future controlled execute | 当前在任何 private outcome 读取前因 K2 未授权而 fail-closed |

普通 test、doctor、smoke 和 CI 不会意外执行真实数据入口。production loader、
route 与 API 的改动数为 0。

## 当前模型角色

| 对象 | 当前状态 | 中文解释 |
|---|---|---|
| HPSR01 模型 | `implemented_awaiting_independent_evaluation` | 已实现并通过公共合成验证，尚无独立真实结果 |
| HPSR01 实验 | `M2_HEAD_PROTECTED_SEGMENTED_ROUTER_IMPLEMENTED_AWAITING_LATER_ORIGIN_DATA` | K1 完成，K2 未授权且账单未成熟 |
| HCRC01 历史结果 | `M2_LG01_HEAD_CASH_RESIDUAL_FAIL` | 首个完整失败结果继续冻结，不重跑、不改写 |
| 现行运行回退 | `M2-WORK-OA03` | 兼容性现行运行回退不变 |
| 研究比较基线 | `M2-WORK-LG01` | Core 老品研究比较基线不变 |
| 活动候选 | `null` | 没有模型晋升 |
| 自动化批准 | `null` | 没有 production、automation 或 release 权限 |

## 已实现、已验证、已授权、可发布

| 层次 | 状态 | 说明 |
|---|---|---|
| 已实现 | 是 | canonical 模块、三个入口、fixture 与 fail-closed gate 已完成 |
| 已验证 | 公共 K1 是 | 聚焦测试与公共 synthetic 验证通过；独立真实评价未执行 |
| 已授权 | 仅 K1 | 本轮授权已用于实现与合成验证；K2、真实评分和 final holdout 未授权 |
| 可发布 | 否 | 没有独立 outcome，不能宣称通过、失败、晋升或 production ready |

## K2 的未来前置条件

只有同时满足以下条件，用户才可另行授权一次 K2 later-origin 评价：

1. fresh metadata-only audit 仍证明 `maxActualValueOpenedOrigin` 边界合法；
2. `2026-03` 对应的 `2026-04` 至 `2026-06` 权威账单全部完整，或运行时动态规则
   得到另一个合法 first independent origin；
3. 动态 prospective final holdout 与 development 窗口不重叠且 outcome 未触碰；
4. residual bound 来源证明仍有效；
5. 用户提供新的 capability-scoped K2 明确授权；
6. 执行前 exact HEAD Linux/Windows CI 与完整公共门禁通过。

日期成熟本身不授予执行权。

## 当前权威证据

- `config/m2-current-head-protected-segmented-router.v0.1.json`
- `docs/analysis/m2-current/M2-head-protected-segmented-router-opened-origin-semantics-v0.2.json`
- `docs/analysis/m2-current/M2-head-protected-segmented-router-later-origin-availability-v0.2.json`
- `docs/analysis/m2-current/M2-head-protected-segmented-router-residual-bound-provenance-v0.1.json`
- `docs/analysis/m2-current/M2-head-protected-segmented-router-k1-implementation-readiness-v0.1.json`
- `docs/analysis/m2-current/M2-head-protected-segmented-router-preregistration-v0.1.md`
- `config/m2-model-registry.v1.json`

本索引取代 v0.50 作为当前阅读入口，但不改写 v0.50、HCRC01/CHAM01 冻结结果、
历史 ID、schema、digest、预测或评价。Draft PR 的 exact HEAD 与 Linux/Windows
CI 由 PR 动态记录；本文不预写尚未产生的 run id 或活动提交 SHA。

本轮没有执行 K2、模型训练、模型选择、真实评价、真实 bootstrap、final holdout、
6/12/36 个月、新作品、未来首次渠道、公司收入、渠道分配、taxonomy、production、
provider、数据库、Canary/full160、release、M3 formal、PR 合并或下一模型。
