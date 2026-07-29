# M2 当前状态索引 v0.41

截至 2026-07-29，M2 两条独立开发谱系已经在不改写冻结结果的前提下完成当前权威
收敛：

- 出版行业规模适配渠道核心开发
  （Publishing-Scale Channel Core Development，
  `M2-EXP-PUBLISHING-SCALE-CHANNEL-01`）；
- M2 核心老品全周期同案例证据补齐、按周期模型路由与已有渠道分配验证 v0.1
  （M2 Core Legacy Full-Horizon Same-Case Evidence Completion, Horizon Router
  and Observed-Channel Allocation Validation v0.1，
  `M2-EXP-CORE-LEGACY-HORIZON-ROUTER-01`）。

两条谱系都没有产生可晋升模型。现行运行回退、研究比较基线、production、自动化、
留出集和发布边界均未改变。

## 当前联合结论

| 能力或实验 | 当前机器状态 | 结论 |
|---|---|---|
| 出版行业规模适配渠道核心（`M2-CHAN-PSC01`） | `M2_PUBLISHING_SCALE_CORE_FAIL` | 首个完整、同人口 raw candidate 已执行、冻结并失败；不是未执行或实现阻断 |
| 核心收入人工规则基线（`M2-WORK-CRMR01`） | `M2_CORE_REVENUE_MANUAL_BASELINE_FAIL` | 短期存在局部信号，但长期复合失效 |
| 分层收入组合模型（`M2-PORT-LRC01`） | `M2_LAYERED_REVENUE_COMPOSITION_FAIL` | 四分量守恒，但 12/36 个月主门失败，协议物化不完整 |
| 核心老品训练人口消融 | `TAIL_INTERFERENCE_NOT_CONFIRMED` | 动态 Core90 改善微小且不稳定，动态 Core80 稳定退化 |
| 按预测周期滚动模型路由器（`M2-WORK-HR01`） | `HORIZON_ROUTER_NOT_CONFIRMED` | 没有稳定优于各周期最强单模型 |
| 已有渠道固定历史份额分配 | `CHANNEL_ALLOCATION_MIXED` | 不同 horizon 的方向、bootstrap 与时间块稳定性不一致 |
| 业务自动化 | `AUTOMATION_BLOCKED` | 活动实验、活动候选与自动化批准均为空 |

## 出版行业规模适配渠道核心

出版行业规模适配渠道核心的历史首次私有物化曾在候选拟合前因接线错误 fail-closed
（`M2_PUBLISHING_SCALE_IMPLEMENTATION_BLOCKED`）。该记录继续作为运行溯源，不得被
删除或改写；后续受控重试已经形成第一份有效结果，因此它不再代表当前模型状态。

第一份有效原始候选（`M2-CHAN-PSC01-RAW`）冻结了 3,318,819 行预测：

| 同人口评价 | 冻结研究基线 WAPE / signed bias | 原始候选 WAPE / signed bias | 相对结论 |
|---|---:|---:|---|
| Primary | 0.44310049 / -0.12165171 | 0.92408663 / -0.88928240 | WAPE 恶化 108.55% |
| Strict | 0.41281268 / -0.03786001 | 0.91533339 / -0.85410647 | WAPE 恶化 121.73% |

2,000 次作品聚类配对 bootstrap 的相对 WAPE 95% 区间在两个人口上都整体低于 0。
主要误差来源是条件正金额严重低估，而不是真实 occurrence oracle 所能解释的部分。
候选已经冻结；没有执行第二个参数版本，也没有获得同窗调参、production 或自动化
授权。

当前证据：

- `docs/analysis/m2-current/M2-current-publishing-scale-channel-development-v0.1.json`
- `docs/analysis/m2-current/M2-current-publishing-scale-channel-forecastability-v0.1.json`

## 核心老品范围、路由与渠道分配

当前作品级开发人口只包括每个预测起点动态重算的成熟核心老品，以及这些作品在同一
起点已经出现并成熟的 canonical 渠道。未来新增作品、未来首次出现渠道、动态核心
之外长尾和公司组合缺口不进入当前作品预测 actual，也不得按预测为 0。

核心老品联合证据为：

- 正确人口冻结重评分已覆盖全部合法起点；不同 horizon 的最强冻结模型不同；
- 动态 Core90 训练的 3/6 个月作品总额改善仅约 0.033%/0.247%，没有 bootstrap
  与时间块稳定性支持，渠道层同时变差；
- 动态 Core80 训练的 3/6 个月作品总额退化约 4.456%/4.705%；
- 滚动路由在 3/12/36 个月只追平同周期最强单模型，6 个月相对 FVA 为 -2.53%，
  且 52/60 次选择来自预注册回退；
- 固定历史渠道份额在 3/12 个月有局部点估计信号，在 6 个月退化，36 个月主人口
  不可评价，因此不能确认统一分配方法。

当前证据：

- `docs/analysis/m2-current/M2-core-legacy-frozen-rescore-v0.1.json`
- `docs/analysis/m2-current/M2-core-legacy-tail-interference-test-v0.1.json`
- `docs/analysis/m2-current/M2-core-legacy-full-horizon-same-case-rescore-v0.1.json`
- `docs/analysis/m2-current/M2-core-legacy-horizon-router-v0.1.json`
- `docs/analysis/m2-current/M2-core-legacy-observed-channel-allocation-v0.1.json`

## 模型角色与注册表

- 现行运行回退：作品发生—金额校准模型 v0.3
  （Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）。
- 研究比较基线：人工锚定可学习全局模型
  （Human-Anchored Learned Global，`M2-WORK-LG01`）。
- 组合级参考：组合现金 ETS/Holt-Winters
  （Portfolio ETS/Holt-Winters，`M2-PORT-ETS01`）。
- 活动实验：无（`activeExperiment=null`）。
- 活动候选：无（`activeCandidate=null`）。
- 自动化批准：无（`approvedForAutomation=null`）。

Model Registry 已联合登记 31 个持久模型或模型家族、17 个实验、61 个非模型标识、
32 个可比组和 83 条评价记录。出版规模评价与核心老品评价只在各自明确的人口、目标、
粒度、horizon、actual 定义和评价窗口内比较，不形成跨组总榜。

## 历史版本冲突的处理

两条独立谱系都曾在各自远端分支创建
`docs/analysis/m2-v2/M2-v2-current-state-index-v0.37.md`，但内容不同。联合收敛没有
改写任一父提交：

- 出版规模谱系的原始 v0.37 blob 保留在 Git 提交
  `8c89abed771109d7da9fcf9ccc01e66a6315682d`；
- 核心老品谱系的 v0.37→v0.40 链继续保留在当前目录；
- 本索引 v0.41 是唯一新的当前映射与解释层，不把任一历史 v0.37 重新解释为另一条
  谱系的授权或结果。

## Public / Private 与停止边界

- 公开仓库只包含代码、合同、测试和脱敏聚合；真实账单、行级预测、评价行、private
  digest、receipt、凭据与数据库均保持 Git ignored。
- 私有来源权威（`PRIVATE_SOURCE_AUTHORITY`）、可重建私有派生缓存
  （`PRIVATE_DERIVED_CACHE`）和私有运行溯源（`PRIVATE_RUN_PROVENANCE`）继续分开
  报告。缓存或历史 receipt 缺失不能冒充来源权威缺失。
- 没有打开 final/later-origin holdout、provider、production、共享数据库、
  Canary/full160、release 或 M3 formal。
- 本索引不授予训练、调参、新候选或 private evaluation；任何后续执行仍需新的明确
  用户授权与独立门禁。

## 当前权威入口

- 用户首页：`README.md`
- 机器模型权威：`config/m2-model-registry.v1.json`
- 中文模型目录与成绩总账：
  `docs/analysis/m2-current/M2-model-catalog-and-scorecard-v1.md`
- 仓库长期规则：`AGENTS.md`
- M2 canonical core 局部规则：`src/domain/m2Current/AGENTS.md`
