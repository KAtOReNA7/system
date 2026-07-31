# M2 LG01 头部保护分段路由与独立 later-origin 验证预注册 v0.1

## 当前判定

LG01 头部保护分段路由模型 v0.1（LG01 Head-Protected Segmented Router
Model v0.1，`M2-WORK-HPSR01`）及其实验
`M2-EXP-LG01-HEAD-PROTECTED-SEGMENTED-ROUTER-01` 已完成 K0 科学合同冻结，
当前机器状态为
`M2_HEAD_PROTECTED_SEGMENTED_ROUTER_IMPLEMENTED_AWAITING_LATER_ORIGIN_DATA`。

这表示“canonical implementation 与公开 synthetic/fixture 验证已经完成，但没有
成熟独立 later-origin”，不是模型失败或通过。opened 语义修订和 residual bound
来源冻结已经完成；尚未拟合或评价真实 later-origin。R0、D1、R1 均没有真实
later-origin 预测或成绩。现行运行回退、研究基线与自动化状态均不改变。

## 固定身份

| 实验内身份 | 中文含义 | 角色 |
|---|---|---|
| `M2-EXP-LG01-HEAD-PROTECTED-SEGMENTED-ROUTER-01/R0` | 冻结 LG01 later-origin 同案例基线 | 研究比较基线，不具备本轮晋升资格 |
| `M2-EXP-LG01-HEAD-PROTECTED-SEGMENTED-ROUTER-01/D1` | 冻结公式 CHAM01 B3 原始诊断 | 只观察数值外推，禁止直接服务 |
| `M2-EXP-LG01-HEAD-PROTECTED-SEGMENTED-ROUTER-01/R1` | LG01 头部保护分段路由 | 唯一研究候选；已实现并通过公开合成验证，真实评价未执行 |

不得增加 R2/R3、临时 alpha、事后实验臂或逐作品模型选择。

## later-origin 与 final holdout

- `maxAvailabilityInspectedOrigin = 2026-02`。
- `maxActualValueOpenedOrigin = 2026-02`。
- `availabilityInspectedThrough = actualValueOpenedThrough = 2026-05`，但两者
  语义不同：前者只表示检查过月份，后者由历史完成评价收据与冻结 feature 工件证明。
- 权威分成账单只完整到 `2026-04`，`2026-05` 不完整。
- 候选 origin 必须严格晚于最大 actual-opened origin，其未来三个月必须全部完整，
  并且 origin 自身从未用于设计、选参、阈值或报告结论。
- 因此最早独立起点是 `2026-03`，需要完整账单 `2026-04` 至 `2026-06`。
- 历史三个月 final holdout `2025-06`、`2025-12` 的合同保持不可变，但其 untouched
  隔离已与后续缓存冲突，不能复用为本实验 holdout。
- prospective final holdout 按
  `addMonths(firstIndependentLaterOrigin, 3)` 动态预留；当前为 `2026-06`，
  窗口 `2026-07` 至 `2026-09`。它可以尚未成熟，但不得读取结果或根据未来金额更换。

当前没有成熟 origin，所以 K2 私有评价关闭。K1 canonical implementation 与公开
synthetic/fixture 验证已经完成；日期级未来保留不是 K2 执行授权，后续必须重新
盘点 opened-origin semantics ledger 并取得新的 capability-scoped 用户授权。

## 人口、目标与拟合

目标仅为预测起点时已成熟老作品、已有成熟 canonical 渠道构成的未来三个月分成
现金作品总额。Strict rolling 动态 Core80 是主评价，Strict rolling Core90 是
敏感性，Primary Core80/Core90 只作数值诊断。

Core80/Core90 每个 origin 只按当时可见分成现金重算。未来 TopN、买断、公司收入、
新作品、未来首次渠道、Core 外尾部、渠道分配、taxonomy、平台机制以及 6/12/36
个月均不属于本轮。

如果未来取得合法 origin，LG01 和 CHAM01 B3 只能沿用 canonical 公式与超参数，
训练截止该 origin；不得读取 origin 后账单、分类修改、排序或 actual，也不得根据
later-origin outcome 改 signed-log、Huber、L2、权重或 B3 结构。

## 起点可见现金带

每个 origin 在动态 Core80 内，按 trailing-12 分成现金降序和稳定内部作品键并列
打破规则划分：

- H50：累计约前 50% 起点可见现金；
- M30：随后约 30%，累计到约 80%；
- L20：Core80 内剩余部分。

边界作品整体进入较高现金带。不得用 future actual 划带，也不得要求每带达到固定
50 或 100 部作品；5—10 部头部作品可以是出版行业真实结构。

## R1 固定公式

令 `base = LG01 prediction`，`raw = CHAM01 B3 prediction`。

- H50：`prediction = base`。这是 raw architecture 的固定组成，不是 fallback 或
  abstain；必须与 R0 逐行、按当前权威货币精度完全相等。
- M30/L20：
  `residual = raw - base`；
  `scale = max(abs(base), frozenDevelopmentPositiveBaseFloor)`；
  `normalizedResidual = residual / scale`；
  用旧 development rows 预先冻结的 q05/q95 截断 normalized residual；
  `prediction = base + scale × boundedNormalizedResidual`。

M30、L20 各自固定 `alpha=1.00`，互不依赖，也不依赖 global alpha。禁止重新选
0.25/0.50/0.75、逐作品选模型或在 outcome 后改参。

positive base floor、q05、q95 的计算规则已冻结为现有 HCRC01 的 q10/q05/q95
线性分位数定义，来源只能是此前已打开的旧 development rows。三个 private 数值
已由 Strict rolling Core80、三个月、冻结 CHAM01 B3 与冻结 LG01 的 577 条旧开发
行物化在 Git ignored 派生缓存；来源 origin 为 `2023-03` 至 `2025-09`。公开 config
只披露公式、角色、范围和冻结状态，不披露数值。

## 数值安全与 raw/fallback

- 有限但极端的 B3 原值保留在 D1 并登记数值失败；R1 必须先做 normalized-residual
  截断，极端值不得直接进入最终预测。
- base、raw、scale 或 residual 非有限时，仅该 M30/L20 行临时回退 LG01，登记
  `NUMERIC_INPUT_INVALID_FALLBACK_LG01`；禁止用 0、均值、其他作品或其他 horizon
  替代。
- R1 完整输出是 raw candidate；H50 固定 LG01 不是 selected fallback。只有上述
  M30/L20 非有限输入行计为 fallback。
- 若执行，必须分别报告完整 R1、corrected-only 与 fallback-only 子集，且保留 D1
  原始诊断。selected pipeline 不得覆盖 raw 结果。

所有最终 R1 预测必须有限、处于冻结安全范围，不得复现 Primary/Core90 的已知
数量级爆炸；金额与 exact same-case key 必须守恒，任何 future leakage 都使结果
失效。

## 评价与状态

主指标为 Core80 绝对现金误差总和、WAPE、相对 R0 的配对 FVA；跨 origin 聚合按
现金误差正确加权，不平均各 origin WAPE。偏差、H50 严格相等、M30/L20 至少一带
改善且另一带不恶化超过 1%、Core90 FVA 不低于 -1%、数值安全均为硬护栏。

最大单作品误差占比、top5/top10 集中度、MAE、median AE、作品误差分布与 bootstrap
区间宽度只作诊断，不再独立否决。若合法执行，作品 cluster bootstrap 固定 2,000
次，并同时报告 origin/time-block 证据、窗口重叠与同作品跨 origin 相关性。

预注册状态只有：

- 多窗口 later-origin 通过：
  `M2_HEAD_PROTECTED_SEGMENTED_ROUTER_LATER_ORIGIN_PASS`；
- 单 origin 方向性：
  `M2_HEAD_PROTECTED_SEGMENTED_ROUTER_SINGLE_ORIGIN_DIRECTIONAL_ONLY`；
- 不确定等待账单：
  `M2_HEAD_PROTECTED_SEGMENTED_ROUTER_INCONCLUSIVE_WAIT_FOR_MORE_BILLS`；
- later-origin 失败并停止 cash-only：
  `M2_HEAD_PROTECTED_SEGMENTED_ROUTER_LATER_ORIGIN_FAIL_STOP_CASH_ONLY`；
- 当前无独立 origin：
  `M2_HEAD_PROTECTED_SEGMENTED_ROUTER_IMPLEMENTED_AWAITING_LATER_ORIGIN_DATA`；
- 日期已成熟但尚未取得独立授权：
  `M2_HEAD_PROTECTED_SEGMENTED_ROUTER_READY_FOR_SEPARATE_LATER_ORIGIN_AUTHORIZATION`。

当前适用“已实现、等待 later-origin 数据”。没有任何成绩可用于通过、晋升、
production、automation 或 release；prospective final holdout 只预留日期，未读取
outcome。

## 工程与权限边界

仓库根、Git 起点和执行 HEAD 必须在运行时解析；长期合同不写本机绝对路径或固定
执行 SHA。权威源缺失才可阻断；opened-origin ledger、预测/评价行等派生缓存缺失
必须自动重建，历史 receipt 缺失只告警且不得伪造。

日期盘点、合同冻结、K1 canonical implementation 与公开 synthetic/fixture 验证
已经完成。本任务没有创建 K2 授权；模型训练、模型选择、真实 bootstrap、
later-origin outcome、K2、final holdout、provider、数据库、Canary/full160、
production、release、M3 formal、PR 合并均未打开。
