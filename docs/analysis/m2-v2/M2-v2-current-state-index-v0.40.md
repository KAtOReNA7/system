# M2 当前状态索引 v0.40

截至 2026-07-29，实验“M2 核心老品全周期同案例证据补齐、按周期模型路由与已有渠道
分配验证 v0.1”（M2 Core Legacy Full-Horizon Same-Case Evidence Completion,
Horizon Router and Observed-Channel Allocation Validation v0.1，
`M2-EXP-CORE-LEGACY-HORIZON-ROUTER-01`）已按预注册边界完成
（`M2_CORE_LEGACY_HORIZON_ROUTER_AND_CHANNEL_ALLOCATION_COMPLETE`）。

合法模型交集的同案例证据已补齐
（`SAME_CASE_EVIDENCE_COMPLETE_FOR_LEGAL_MODEL_INTERSECTIONS`），但按预测周期滚动
模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`）未确认
（`HORIZON_ROUTER_NOT_CONFIRMED`），已有渠道分配证据混合
（`CHANNEL_ALLOCATION_MIXED`）。现行模型角色、production、自动化、留出集和发布状态
均未改变。

## 目标、人口与边界

本轮只评价预测起点已经成熟的核心老品，以及这些作品在起点已经出现且成熟的
canonical 渠道。目标仍是未来分成收入开发可建模冲销重述现金
（`M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01`），作品总额等于同一符合条件渠道
集合的求和。

下列现金和人口不进入模型目标：买断及其他非分成现金、未来新增作品、起点后首次出现
的新渠道、动态核心之外长尾现金和公司组合缺口。不成熟渠道对只能弃权，不能按 0
伪装成预测。作品点预测、渠道分配、组合预测、排序与风险区间仍是不同能力。

## 执行身份

| 阶段（所属实验与对象类型） | exact HEAD | Linux/Windows exact-head CI |
|---|---|---:|
| 能力矩阵与重建合同（`M2-EXP-CORE-LEGACY-HORIZON-ROUTER-01/CAPABILITY_MATRIX`；治理检查点，原指令 K0） | `3773b77eddbf57c96e3c7e2c15a8c1852cdc3144` | `30460017317` |
| 首次有效同案例私有评价（evaluation checkpoint，原指令 K1） | `f30fbc0660d90197bd44e516a0c07439fe08219b` | `30461873691` |
| 同案例结果提交（documentation checkpoint） | `e8dd880e946a1ba36caefe06735e255b50e420e3` | `30462382848` |
| 首次有效滚动路由私有评价（router execution checkpoint，原指令 K2） | `fdb82d56560a0c7736acaa3605f45cb1f74e62cb` | `30463531260` |
| 滚动路由结果提交（documentation checkpoint） | `9eb6990c9c73d16b13ae592296a1f68538577591` | `30464201431` |
| 首次有效已有渠道分配私有评价（allocation execution checkpoint，原指令 K3） | `e3dc070dc7945ce5ffbba3676f2107061d533d6c` | `30465820862` |

最终文档身份（`finalDocumentationHead`）由包含本状态索引、Model Registry、中文成绩
总账和最终报告的远端提交赋值，并在 PR #32 与最终复盘中报告。仓库内不回填其自身
SHA 或最终 CI run，以免制造无穷后继提交。

## 能力矩阵与确定性重建合同

实验的能力矩阵阶段
（`M2-EXP-CORE-LEGACY-HORIZON-ROUTER-01/CAPABILITY_MATRIX`；治理检查点）
对 48 个“模型 × 评价族 × horizon × 粒度”单元逐一分类：

| 状态 | 单元数 | 含义 |
|---|---:|---|
| 已有冻结预测（`FROZEN_AVAILABLE`） | 25 | 可验证私有冻结行存在；缓存缺失时可由冻结代码确定性重建 |
| 可直接确定性重放（`DETERMINISTIC_FROZEN_REPLAY_AVAILABLE`） | 0 | 没有单元需要在该阶段立即重放 |
| 模型合同不支持（`UNSUPPORTED_BY_MODEL_CONTRACT`） | 10 | horizon 或粒度不属于该模型输出合同 |
| 不可重建（`NOT_RECONSTRUCTABLE`） | 13 | 原始 fold 参数、预测行或成熟选择起点不足；不得复制参数或补造预测 |

作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，
`M2-WORK-OA03`）仅有主滚动 3/6/12 个月作品总额冻结行；其严格滚动 fold 证据不可
重建，也没有 36 个月或作品×渠道输出合同。人工锚定可学习全局模型
（Human-Anchored Learned Global，`M2-WORK-LG01`）有主滚动 36 个月及严格滚动
3/6/12 个月冻结行，但主滚动 36 个月参数不得复制到较短 horizon，严格滚动 36 个月
也没有成熟选择起点。核心收入人工规则基线 v0.1
（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`）支持主滚动全部周期，
但严格滚动 36 个月没有成熟评价起点。

## 完整周期同案例重评分

实验的冻结同案例重评分阶段
（`M2-EXP-CORE-LEGACY-HORIZON-ROUTER-01/SAME_CASE_RESCORE`；评价活动）
只使用既有冻结预测，没有训练、调参、跨 horizon 参数复制或补造预测。

核心 80% 主要滚动作总额结果如下；各行人口和 horizon 分开登记，不构成跨周期排名：

| horizon | 同案例数 / 作品数 | 冻结模型 | WAPE | signed bias | 同周期结论 |
|---:|---:|---|---:|---:|---|
| 3 个月 | 65 / 43 | 作品发生—金额校准模型 v0.3（`M2-WORK-OA03`） | 0.262460 | -0.036457 | 未形成稳定优胜（`NO_STABLE_WINNER`） |
| 3 个月 | 65 / 43 | 核心收入人工规则基线 v0.1（`M2-WORK-CRMR01`） | 0.265224 | 0.246508 | 未形成稳定优胜（`NO_STABLE_WINNER`） |
| 6 个月 | 65 / 43 | 核心收入人工规则基线 v0.1（`M2-WORK-CRMR01`） | 0.265139 | 0.113867 | WAPE 与偏差存在权衡（`WAPE_WIN_BIAS_TRADEOFF`） |
| 6 个月 | 65 / 43 | 作品发生—金额校准模型 v0.3（`M2-WORK-OA03`） | 0.283949 | 0.000818 | WAPE 与偏差存在权衡（`WAPE_WIN_BIAS_TRADEOFF`） |
| 12 个月 | 47 / 32 | 作品发生—金额校准模型 v0.3（`M2-WORK-OA03`） | 0.248919 | 0.008341 | 未形成稳定优胜（`NO_STABLE_WINNER`） |
| 12 个月 | 47 / 32 | 核心收入人工规则基线 v0.1（`M2-WORK-CRMR01`） | 0.379738 | 0.309667 | 未形成稳定优胜（`NO_STABLE_WINNER`） |
| 36 个月 | 408 / 55 | 人工锚定可学习全局模型（`M2-WORK-LG01`） | 0.284898 | 0.075559 | 明确优于同案例人工规则（`CLEAR_WINNER`） |
| 36 个月 | 408 / 55 | 核心收入人工规则基线 v0.1（`M2-WORK-CRMR01`） | 18.649596 | 18.614640 | 长期复合失效（`CLEAR_WINNER` 的比较落后方） |

## 按预测周期滚动模型路由

实验的路由阶段
（`M2-EXP-CORE-LEGACY-HORIZON-ROUTER-01/ROLLING_ROUTER`；模型管线）
在每个外层起点内只使用更早且标签已经成熟的起点做选择。至少需要 3 个成熟内层起点；
不足时按预注册规则回退。当前外层 actual、事后最优组合和未来渠道身份均未参与选择。

| horizon | Core80 主要人口路由 WAPE | signed bias | 同周期最强单模型 | 相对 FVA | 状态 |
|---:|---:|---:|---|---:|---|
| 3 个月 | 0.262460 | -0.036457 | 作品发生—金额校准模型 v0.3（`M2-WORK-OA03`） | 0.00% | 未确认（`HORIZON_ROUTER_NOT_CONFIRMED`） |
| 6 个月 | 0.271841 | 0.048457 | 核心收入人工规则基线 v0.1（`M2-WORK-CRMR01`） | -2.53% | 未确认（`HORIZON_ROUTER_NOT_CONFIRMED`） |
| 12 个月 | 0.248919 | 0.008341 | 作品发生—金额校准模型 v0.3（`M2-WORK-OA03`） | 0.00% | 未确认（`HORIZON_ROUTER_NOT_CONFIRMED`） |
| 36 个月 | 0.284898 | 0.075559 | 人工锚定可学习全局模型（`M2-WORK-LG01`） | 0.00% | 未确认（`HORIZON_ROUTER_NOT_CONFIRMED`） |

60 个选择单元中，作品发生—金额校准模型 v0.3 被选 26 次，核心收入人工规则基线
v0.1 被选 2 次，人工锚定可学习全局模型被选 32 次；其中 52 次是预注册回退，只有
8 次来自滚动内层选择。selected pipeline 没有掩盖 raw 路由结果：路由器没有在任何
horizon 稳定优于最强单模型。

## 已有渠道分配

实验的已有渠道分配阶段使用固定、预注册的分配臂，不按结果选择窗口：

- 已有渠道直接金额比较臂（`M2-EXP-CORE-LEGACY-HORIZON-ROUTER-01/C0_DIRECT`）；
- 起点前三个月历史份额臂
  （`M2-EXP-CORE-LEGACY-HORIZON-ROUTER-01/C1_TRAILING_3`）；
- 起点前六个月历史份额臂
  （`M2-EXP-CORE-LEGACY-HORIZON-ROUTER-01/C2_TRAILING_6`）；
- 起点前十二个月历史份额臂
  （`M2-EXP-CORE-LEGACY-HORIZON-ROUTER-01/C3_TRAILING_12`）；
- 人工锚定可学习全局模型隐含份额诊断臂
  （`M2-EXP-CORE-LEGACY-HORIZON-ROUTER-01/C4_LG01_IMPLIED`）。

核心 80% 主要人口以作品发生—金额校准模型 v0.3 的作品总额为固定总量来源：

| horizon | 前 3 月份额 WAPE | 前 6 月份额 WAPE | 前 12 月份额 WAPE | 周期结论 |
|---:|---:|---:|---:|---|
| 3 个月 | 0.294286 | 0.296735 | 0.294089 | 方向接近但不足 1%、bootstrap 与时间块不支持（`CHANNEL_ALLOCATION_MIXED`） |
| 6 个月 | 0.317783 | 0.316020 | 0.315692 | 三个固定窗口均劣于直接比较（`CHANNEL_ALLOCATION_NOT_CONFIRMED`） |
| 12 个月 | 0.294126 | 0.286287 | 0.286101 | 点估计改善约 30.9%–32.8%，但 bootstrap 下界与时间块稳定性不支持（`CHANNEL_ALLOCATION_MIXED`） |
| 36 个月 | 不可评价 | 不可评价 | 不可评价 | 固定总量来源不支持 36 个月（`CHANNEL_ALLOCATION_NOT_EVALUABLE`） |

作为分开的诊断，人工锚定可学习全局模型 36 个月总额配合起点前三个月历史份额时，
渠道 WAPE 从直接渠道金额的 0.337945 降至 0.311365，达到该单元门禁；但它不属于
预注册主要确认人口，不能事后替换主结论。综合状态仍为已有渠道分配证据混合
（`CHANNEL_ALLOCATION_MIXED`）。

总计 32,351 次分配尝试中，30,308 次产生渠道预测，2,043 次因诊断臂无法形成合法
份额而弃权；产生 95,974 条渠道预测。所有已分配尝试均按分币精确守恒，作品总额
差异与分币守恒差异最大值均为 0。弃权没有渠道预测，不纳入守恒最大值。

## 十项审计问题的定量回答

1. 作品发生—金额校准模型 v0.3 的严格滚动行能否重建？不能。原始严格 fold 参数与
   预测行缺失（`NOT_RECONSTRUCTABLE_ORIGINAL_STRICT_FOLD_EVIDENCE_ABSENT`），不得用
   主滚动结果替代。
2. 作品发生—金额校准模型 v0.3 是否支持 36 个月？不支持
   （`UNSUPPORTED_BY_MODEL_CONTRACT`），不能外推或补造。
3. 固定历史渠道份额能否安全确认？不能整体确认。3/12 个月点估计有局部信号，6 个月
   退化，且主人口没有一个固定窗口同时通过全部 horizon、bootstrap 与时间块门禁。
4. 人工锚定可学习全局模型能否填补主滚动 3/6/12 个月或严格滚动 36 个月？不能。
   前者会复制只在 36 个月选定的参数，后者没有成熟选择起点。
5. 核心收入人工规则基线 v0.1 的 6 个月低 WAPE 是否代表无条件优胜？否。其 WAPE
   0.265139 低于 0.283949，但 signed bias 为 +11.39%，而比较模型约为 +0.08%，形成
   明确的 WAPE—偏差权衡。
6. 周期差异是否能通过滚动路由泛化？没有证据。3/12/36 个月只追平最强单模型，
   6 个月相对 FVA 为 -2.53%，且 52/60 次选择依赖回退。
7. 路由器是否击败同周期最强模型？没有。四个主要 horizon 的相对 FVA 分别为
   0.00%、-2.53%、0.00%、0.00%。
8. 已有渠道分配是否确认？没有；综合为证据混合（`CHANNEL_ALLOCATION_MIXED`）。
   36 个月的单一诊断通过不能覆盖主要人口的 3/6/12/36 个月联合门禁。
9. 还缺什么证据？缺少作品发生—金额校准模型严格 fold 与 36 个月合同、人工锚定
   可学习全局模型主滚动短周期和严格长周期合法预测、更多独立成熟时间块、合格
   later-origin，以及不依赖大多数回退的路由证据。
10. 是否足以进入收入加权训练？目前不充分。滚动路由没有正 FVA，固定渠道份额也未
    稳定确认；收入加权训练需要新的独立预注册和明确授权。本轮没有实现、训练或执行
    该方案。

## 当前角色与停止条件

- 现行运行回退仍是作品发生—金额校准模型 v0.3
  （Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）。
- 研究比较基线仍是人工锚定可学习全局模型
  （Human-Anchored Learned Global，`M2-WORK-LG01`）。
- 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，
  `M2-WORK-HR01`）是已执行失败的开发模型管线，不是 fallback、活动候选或 production
  管线。
- 活动候选与自动化批准均为空（`activeCandidate=null`；
  `approvedForAutomation=null`）。
- 没有读取 later-origin 或 final holdout，没有连接 provider、production、共享或
  staging-like 数据库，没有执行 Canary/full160、release、M3 formal 或分支合并。
- 本轮在报告、注册表、中文目录、Draft PR 和最终 exact-head CI 完成后停止；不自动
  进入收入加权训练或下一模型开发。

## 当前权威入口

- 机器模型权威：`config/m2-model-registry.v1.json`
- 预注册配置：`config/m2-current-core-legacy-horizon-router.v0.1.json`
- 能力矩阵：
  `docs/analysis/m2-current/M2-core-legacy-full-horizon-capability-matrix-v0.1.json`
- 完整周期同案例重评分：
  `docs/analysis/m2-current/M2-core-legacy-full-horizon-same-case-rescore-v0.1.json`
- 按预测周期滚动模型路由：
  `docs/analysis/m2-current/M2-core-legacy-horizon-router-v0.1.json`
- 已有渠道分配：
  `docs/analysis/m2-current/M2-core-legacy-observed-channel-allocation-v0.1.json`
- 中文模型目录与成绩总账：
  `docs/analysis/m2-current/M2-model-catalog-and-scorecard-v1.md`
