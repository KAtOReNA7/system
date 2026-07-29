# M2 核心收入人工规则基线 v0.1 业务合同

英文名称：Core-Revenue Manual Rule Baseline v0.1
稳定模型 ID：`M2-WORK-CRMR01`
实验 ID：`M2-EXP-CORE-REVENUE-MANUAL-01`
状态：公开 canonical 实现已完成，私有滚动评价尚未执行。

## 1. 目的与边界

本模型把已确认的人工收入估算经验冻结成可复现、可证伪的开发评价基线。真实历史
账单可以证明它有效、部分有效或无效；不得为了证明规则正确而更改人口、公式、指标、
预测起点或回退方式。

目标是未来 `billMonth` 的分成入账金额，采用当前已激活的 M2 评价合同 v2.2 和
开发可建模冲销重述实际值
（`M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01`）。买断及其他非分成现金
不进入特征、标签、预测或指标。预测粒度为作品 ID × canonical 平台/渠道；向
作品级基线比较时，必须先按相同作品、起点和 horizon 聚合。

本任务只授权公开实现和一次首个有效的私有开发回测。它不授权修改作品发生—金额
校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）的运行
回退角色，不授权修改人工锚定可学习全局模型
（Human-Anchored Learned Global，`M2-WORK-LG01`）的冻结参数，也不授权
production、automation、later-origin、final holdout、provider、数据库、
Canary/full160、release 或 M3 formal。

## 2. 与历史人工公式的身份区分

历史人工锚定忠实公式（Human-Anchored Manual-Faithful Formula，
`M2-WORK-MAN01`）使用主渠道、边缘渠道和生命周期贡献比例形成 36 个月作品级
比较结果。当前核心收入人工规则基线 `M2-WORK-CRMR01` 是不同模型：它在每个
预测起点按收入选择 Core80/Core90，在作品 × 渠道粒度使用最新月、6/12/24 月
现金窗口和线性斜率，并对长尾做组合池预测。两者不得复用模型 ID 或历史成绩。

## 3. 数据权威与可迁移性

私有数据分为三类：

1. 权威源：人工拆分后的总账、分成账、买断账，M1 作品映射权威，以及人工确认的
   canonical 渠道主表。
2. 可重建缓存：冲销分配、开发可建模重述、月度密集矩阵、候选行、比较基线行、
   评价行和聚合索引。缺失时必须从权威源和当前公开冻结代码确定性重建。
3. 历史溯源：旧 receipt、旧 digest、旧机器路径和旧摘要。缺失只能告警，不得阻断
   公开实现或本次回测。

行级账单、作品/渠道身份、预测和评价行始终留在 Git ignored capability 目录。
公开仓库只保存合同、配置、代码、synthetic 测试、脱敏计数、聚合指标和中文报告。

## 4. 预测起点与人口

预测按月滚动。起点 `T` 是当时可见的最后一个完整 `billMonth`；特征和 Core 人口
选择只能读取 `T` 及以前，目标窗口从 `T+1` 开始。当前不完整月不得充当完整月。

在每个起点先把所有渠道的可见分成现金聚合到作品：

- 自然年已有至少 3 个完整月时，参考窗口是当年 1 月至 `T`；
- 自然年只有 1—2 个完整月时，向前跨年补足最近 6 个完整月；
- 同比窗口是上一年度完全对应月份，只用于诊断。

按参考窗口作品收入降序、稳定作品 ID 升序确定并列顺序，分别取得累计达到 80% 和
90% 参考收入的最小集合（Core80、Core90）。不得用未来实际收入选择核心人口或
Top20/Top50；未来实际 TopN 只能作为后验 oracle 诊断。

作品 × 渠道只有从 `firstRevenueMonth`（第一笔非零分成入账月）起至少具有 3 个
完整月才合格。从未在该渠道产生账单的作品不得预测新渠道收入。首次收入后的缺月
按结构性 0 进入密集月序列；分类、授权或其他作品的收入不能制造新渠道进入。

## 5. 冻结人工公式

对每个合格作品 × 渠道，在起点 `T` 定义：

- `M1`：`T` 月收入；
- `S6`：最近最多 6 个完整月收入之和；
- `S12`：最近 12 个完整月收入之和，首次收入前按 0 对齐；
- `P12`：`S12` 之前连续 12 个完整月收入之和；
- `b6`：最近最多 6 个、至少 3 个原始月金额对月份序号的普通最小二乘斜率。

冻结预测为：

```text
F3 = M1 × 3
F6 = S6
b6 > 0: F12 = max(S12, M1 × 12)
b6 < 0: F12 = min(S12, M1 × 12)
b6 = 0: F12 = S12
```

禁止对数变换、斜率显著性阈值、未来月份、分类金额倍率和平台趋势倍率。

## 6. 长期系数与层级回退

有连续完整的两个起点前 12 月窗口且 `P12 > 0` 时，
`k_direct = S12 / P12`。否则依次使用：

1. 同渠道 × 二级分类核心作品可计算 `k_direct` 的中位数；
2. 同渠道核心作品可计算 `k_direct` 的中位数；
3. `k = 1.0`。

每个回退记录来源层级、`supportCount` 和适用人口。不设置固定作品数门槛，不做
hard clamp，不根据外层结果修改 `k`。

```text
Y1 = F12
Y2 = Y1 × k
Y3 = Y2 × k
F36 = Y1 + Y2 + Y3
```

必须分别保存 Y1、Y2、Y3 和 F36，并报告极端 `k`、复合爆炸、过度衰减及其误差
贡献。

## 7. 长尾与完整组合

在每个起点固定 Core80/Core90 之外的合格作品 × 渠道，将历史现金按月聚合成一个
长尾组合序列并应用同一冻结公式。分别保留：

- 原始核心候选；
- Core80/Core90；
- 长尾池；
- core-only（长尾预测为 0，仅作覆盖不足诊断）；
- core + pooled tail（完整组合候选）。

不得把 core-only 冒充完整组合，也不得对长尾继续逐作品拟合复杂模型。

## 8. 对照与评价

在相同起点、目标、实际值定义、horizon 和 same-case 人口上比较：

- 核心收入人工规则基线 v0.1（`M2-WORK-CRMR01`）；
- 人工锚定可学习全局模型（`M2-WORK-LG01`）；
- 作品发生—金额校准模型 v0.3（`M2-WORK-OA03`）。

派生比较行缺失时允许从权威源和当前冻结公开代码确定性重建，但不得修改既有模型
公式、参数或角色。无法重建或匹配时标为 `NOT_COMPARABLE`，仍报告候选绝对成绩。

评价至少包含 Core80/Core90 捕获率及 WAPE、signed bias、MAE、median absolute
error，Top20/Top50 捕获率与误差，core-only 与 core + pooled tail 的组合误差，
3/6/12/36 月和 Y1/Y2/Y3，各起点、年度、平台、主要结算机制、二级分类诊断及
`k` 来源。配对差异使用 2,000 次完整作品 cluster bootstrap；未来实际 TopN 和
二级分类不得用于选模或因果结论。

沿用 1% materiality。结论必须是：

- `M2_CORE_REVENUE_MANUAL_BASELINE_PASS`
- `M2_CORE_REVENUE_MANUAL_BASELINE_MIXED`
- `M2_CORE_REVENUE_MANUAL_BASELINE_FAIL`
- `M2_CORE_REVENUE_MANUAL_BASELINE_BLOCKED`

首个完整、有效、可解释的评价产生后立即停止公式修改和调参。无论结果为何，
`activeCandidate`、`approvedForAutomation` 与 production 均不改变，Draft PR
保持 Open/Unmerged。

## 9. 公开实现入口

- canonical 规则核心：`src/domain/m2Current/coreRevenueManual.js`
- 现有 runner 的模式接线：
  `scripts/m2-current/run_m2_human_anchored_development.mjs`
- capability-scoped 模式：
  `scripts/m2-current/core_revenue_manual_mode.mjs`
- 公开 synthetic 诊断：
  `docs/analysis/m2-current/M2-core-revenue-manual-public-diagnostic-v0.1.json`

公开实现不读取私有 artifact，不训练模型、不调参，也不使用未来实际值选择作品、
人口或参数。真实滚动成绩只能由下一阶段一次性私有评价产生。
