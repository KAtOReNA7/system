# M2 当前状态索引 v0.53

截至 2026-07-31，LG01 头部保护分段路由模型 v0.1
（`M2-WORK-HPSR01`）的原始冻结合同结论继续是
`M2_HPSR01_RETROSPECTIVE_DEVELOPMENT_UNSUPPORTED_STOP_BEFORE_K2`：
2025-11 单起点回溯中，绝对偏差恶化 2.0358 个百分点，超过预冻结的 2 个百分点
门限，因此机械合同判为不支持并在独立评价前停止。原报告、机器 JSON、成绩、人口、
比较组和审计摘要均未改写。

新增的科学解释状态是
`M2_HPSR01_CONTRACT_UNSUPPORTED_SCIENTIFICALLY_INCONCLUSIVE`。它不是把原结果改成
通过，而是说明：单起点、57 部作品、配对改善很小、bootstrap 区间跨 0，并且三个
现金带方向不同，现有证据不足以宣称整个头部保护分段方向已经失效。

LG01 头部保护尾段修正模型 v0.2（`M2-WORK-HPSR02`）已经在任何独立 outcome
打开前完成前瞻预注册。它由回溯诊断启发，明确标记为
`POST_HOC_INSPIRED_PROSPECTIVELY_PREREGISTERED`；当前只有 canonical function
和公开 synthetic 不变量验证，没有真实预测、真实评价、bootstrap 或模型成绩。

本轮完成状态是
`M2_HPSR01_INTERPRETATION_AMENDED_HPSR02_PREREGISTERED_AWAITING_INDEPENDENT_DATA`。

## 首页结论

| 问题 | 当前答案 |
|---|---|
| HPSR01 原合同结果是否保留？ | 是；原不支持判定、冻结指标和历史成绩完全保留 |
| HPSR01 科学解释 | 原机械合同判定正确，但单起点证据在科学上不足，不能判定整个方向失败 |
| HPSR01 是否重跑？ | 否；模型、预测、评价和 bootstrap 均未重跑 |
| HPSR02 身份 | 事后诊断启发、独立结果前预注册的唯一主候选结构；尚未执行独立评价，也不是活动候选 |
| HPSR02 唯一结构 | H50、M30 逐行精确使用冻结 LG01；仅 L20 使用 HPSR01 既有冻结有界残差修正 |
| 是否读取新实际值或 private 行？ | 否 |
| 是否训练、拟合、调参、搜索 alpha 或重估边界？ | 否 |
| 独立评价检查点 | 未授权、未执行；动态首个独立起点仍缺 2026-05 与 2026-06 完整账单 |
| prospective final holdout | 动态预留起点当前估计为 2026-06，outcome 未打开 |
| 当前活动候选 / 自动化批准 | `null` / `null` |
| production ready / final holdout opened | `false` / `false` |

## HPSR01 冻结结果与修订解释

回溯评价仍只包含三个月 horizon、2025-11 一个预测起点、动态 Core80 的 57 部
作品和 57 个同案例键。冻结同案例结果不变：

| 实验臂 | WAPE | signed bias | absolute bias | 绝对误差总和 | 相对 R0 paired FVA |
|---|---:|---:|---:|---:|---:|
| R0 冻结 LG01 同案例基线 | 14.3234% | -6.6974% | 6.6974% | 445,283.5517 | — |
| R1 HPSR01 原始候选 | 14.2019% | -8.7333% | 8.7333% | 441,508.8272 | 0.8477% |

R1 相对 R0 的 2,000 次作品聚类 bootstrap FVA 95% 区间仍为
[-18.3441%, 20.0303%]。绝对偏差恶化 2.0358 个百分点，确实越过 v0.1 的
预冻结机械门限；这项计算和原不支持状态没有错误。

科学解释不能只看门限的二元输出。证据只有一个时间块，样本为 57 部作品，配对
FVA 仅 0.8477%，区间跨 0，且现金带方向明显异质。因此原结果足以拒绝 HPSR01
v0.1 按原合同继续进入独立评价，却不足以证明“所有头部保护分段修正都无效”。

## 公开聚合现金带归因

下表仅使用已经提交的脱敏聚合绝对误差，未读取 private 行，也没有生成新预测：

| 现金带 | R0 绝对误差总和 | R1 绝对误差总和 | R1 − R0 | 方向 |
|---|---:|---:|---:|---|
| H50 头部 50% 现金带 | 160,126.9131 | 160,126.9131 | 0.0000 | 架构上逐行相等 |
| M30 中部 30% 现金带 | 178,009.6385 | 200,603.5488 | +22,593.9103 | 变差 |
| L20 尾部 20% 现金带 | 107,147.0000 | 80,778.3653 | -26,368.6348 | 改善 |
| 合计 | 445,283.5517 | 441,508.8272 | -3,774.7244 | 小幅净改善 |

若只做“保留 H50/M30 的 R0 聚合误差、采用 L20 的 R1 聚合误差”的确定性加减，
得到诊断绝对误差总和 418,914.9169、WAPE 13.4752%、paired FVA 5.9218%、
signed bias -7.2016%。这些数字的身份固定为
`POST_HOC_AGGREGATE_ARITHMETIC_NOT_MODEL_EVIDENCE`：它们不是行级重评分，不是
HPSR02 模型成绩，不进入历史排行榜，也不能证明新结构已通过。

## HPSR02 冻结预注册

稳定模型 ID 为 `M2-WORK-HPSR02`，稳定实验 ID 为
`M2-EXP-LG01-HEAD-PROTECTED-TAIL-BAND-CORRECTION-02`。独立评价的三个臂已经在
outcome 前冻结：

| 实验臂 | 中文含义 | 当前状态 |
|---|---|---|
| R0 | 冻结 LG01 同案例基线 | 已预注册，未执行 |
| R1 | 冻结 HPSR01 v0.1 历史结构对照 | 已预注册，未执行 |
| R2 | HPSR02 v0.2 唯一主候选 | 已预注册，未执行 |

人口继续是每个预测起点用当时可见 trailing-12 分成现金动态重算的 Core80 成熟
老作品，只评价三个月作品总金额。H50 与 M30 必须逐行精确等于 R0；L20 固定
`alpha=1`，只复用 HPSR01 已冻结的 positive base floor 和 q05/q95 残差边界。
禁止 global alpha、alpha 搜索、边界重估、跨现金带依赖、作品级选择和结果后
fallback。

未来一次独立检查点必须在同一动态人口、同一案例键和同一 checkpoint 上比较
R2 vs R0，并同时报告 R1 vs R0。主要指标、2,000 次作品聚类配对 bootstrap、
现金带误差、单作品误差集中度和结构守恒均已冻结。

支持、证据混合和不支持的门限详见机器配置。距离任何硬阈值不超过 0.25 个百分点
时必须报告 `THRESHOLD_SENSITIVE`；若没有同时发生结构失败，则归为证据混合，
不能据此永久停止整个方向。即使独立检查点未来获得支持，也不能自动授予活动候选、
自动化、production、final holdout 或发布权限。

## 独立数据与最终留出集

当前公开预注册只保存动态日期的“当前估计”，实际执行前必须重新从运行时 metadata
计算，不能写死为长期执行条件：

- 任务前已打开实际值的最大起点当前估计为 `2026-02`；
- 首个独立后期起点当前估计为 `2026-03`；
- 三个月标签要求权威账单完整到 `2026-06`；
- 当前权威账单只完整到 `2026-04`；
- 仍缺 `2026-05` 与 `2026-06`；
- prospective final holdout 起点当前估计为 `2026-06`，需账单完整到
  `2026-09`，outcome 仍未打开。

HPSR02 的独立评价检查点当前没有用户授权。未来只有在账单完整、私有权威源可用、
R0/R1/R2 合同仍冻结、final holdout 未打开、公共门禁通过且用户另行明确授权时，
才可执行一次。

## 实现、验证、授权与发布

| 层次 | 当前状态 |
|---|---|
| 已实现 | HPSR02 canonical pure function、公共 synthetic fixture 和合同测试已实现 |
| 已验证 | 公开 synthetic 只验证人口、现金带、H50/M30 精确保护、L20 修正、有限值与零 outcome 消费 |
| 已授权 | 仅本轮解释修订、预注册和公开合成验证；没有真实独立评价授权 |
| 可发布 | 否；活动候选、自动化批准、production 与 release 均为空或未授权 |

本轮执行计数：

| 活动 | 次数 |
|---|---:|
| 新实际值读取 | 0 |
| HPSR01 重跑 | 0 |
| HPSR02 真实预测 | 0 |
| 真实模型评价 | 0 |
| 真实 bootstrap | 0 |
| 模型训练或拟合 | 0 |
| 超参数或 alpha 搜索 | 0 |
| residual bound 重估 | 0 |
| 独立评价检查点 | 0 |
| prospective final holdout 打开 | 0 |
| production surface 修改 | 0 |

Git 起点、执行 HEAD 和 exact-head CI 均由运行时解析并记录在 PR #35，不写入本机
路径或预先抄录的活动提交 SHA。PR #35 保持 Draft / Open / Unmerged。

## 当前权威证据

- `docs/analysis/m2-current/M2-head-protected-segmented-router-retrospective-development-v0.1.json`
- `docs/analysis/m2-current/M2-head-protected-segmented-router-interpretation-amendment-v0.1.json`
- `docs/analysis/m2-current/M2-head-protected-segmented-router-interpretation-amendment-v0.1.md`
- `docs/analysis/m2-current/M2-head-protected-tail-band-correction-cash-band-attribution-v0.1.md`
- `config/m2-current-head-protected-tail-band-correction.v0.2.json`
- `docs/analysis/m2-current/M2-head-protected-tail-band-correction-preregistration-v0.2.md`
- `config/m2-model-registry.v1.json`

本索引取代 v0.52 作为当前阅读入口，但不改写 v0.52、HPSR01 v0.1 原报告、
机器 JSON、receipt、digest、预测、评价或历史 ID。本轮没有执行 6/12/36 个月
评价、新作品、未来首次渠道、公司收入、provider、数据库、Canary/full160、
release、M3 formal、PR 合并或下一模型开发。
