# M2 当前状态索引 v0.62

截至 2026-08-02，本索引以 2020–2025 Core80 全模型真实业务横评 v0.1
（M2 Core80 Cross-Model Real-Business Evaluation v0.1，`M2-CMX01`）作为最新变化。
模型名称、别名、角色、实验映射、评价人口与可比组以
`config/m2-model-registry.v1.json` 为唯一当前机器权威；业务门限以
`config/m2-business-acceptance-contract.v1.json` 为唯一数值权威。

## 本次最新结论

本次完成的是历史评价活动，不是模型开发、选模或激活。Model Registry 的 37 项登记
逐项审计后，14 个模型、21 个稳定变体进入合法历史横评。评价覆盖 2020–2025、
70 个完整月度预测起点、235 个起点×周期单元、2,615 部合格老作品和 38 个 canonical
渠道；短、中、长周期分别使用 H3、H6、H12 和成熟 H36。

所有 21 个变体跨全部周期的共同案例数为 0（`NO_GLOBAL_COMMON_MATCHED_CASES`），
原因是各冻结模型支持的周期与合法起点不同。因此不能产生诚实的“全模型、全周期、
六年统一冠军”，当前状态为无统一历史冠军
（`NO_UNIFIED_HISTORICAL_CHAMPION_IDENTIFIED`）。周期、年度和主要渠道排名均发生
翻转，业务结论为不同模型适配不同业务切片
（`DIFFERENT_MODELS_FIT_DIFFERENT_BUSINESS_SLICES`）。

横评活动最终状态为历史横评完成并等待独立业务决策
（`M2_CMX01_HISTORICAL_CROSS_EVALUATION_COMPLETE_DECISION_PENDING`）。
这些结果只形成历史证据（`HISTORICAL_ONLY_NOT_ACTIVATED`），不改变 Model Registry
中的任何模型角色。

## 当前角色与权限

| 对象 | 当前状态 | 含义 |
|---|---|---|
| 兼容性现行运行回退 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 没有新增当前范围性能支持 |
| 作品金额研究比较基线 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 仅用于合法同案例研究比较，不是 production 晋升 |
| 最新评价活动 | 2020–2025 Core80 全模型真实业务横评（`M2-CMX01`） | 历史评价已完成；不是模型或实验候选 |
| 活动候选 | `activeCandidate=null` | 没有活动候选 |
| 自动化批准 | `approvedForAutomation=null` | 没有自动化批准 |
| production ready | `productionReady=false` | 没有生产权限 |
| final holdout | `finalHoldoutOpened=false` | 未打开 |

## 动态 Core80 同案结果

以下第一名只在对应周期的合法共同案例内成立，参与集合、案例数和支持范围不同，
不得跨行拼成统一冠军。

| 周期 | 同案第一名稳定变体 | WAPE | cases / works |
|---:|---|---:|---:|
| H3 | `M2-WORK-CHAM01/B3` | 25.3790% | 486 / 75 |
| H6 | `M2-WORK-LG01/LEARNED_GLOBAL_COMMON_REVERSAL` | 28.0991% | 439 / 74 |
| H12 | `M2-WORK-LG01/LEARNED_GLOBAL_COMMON_REVERSAL` | 32.6455% | 305 / 66 |
| H36 | `M2-WORK-HR01/REGISTERED_HORIZON_ROUTER` 与 `M2-WORK-LG01/LEARNED_GLOBAL_COMMON_REVERSAL` 并列 | 35.0675% | 704 / 69 |

在动态 Core80 的模型自身可用案例上，学习型全局金额基线
（Learned Global Amount Model，`M2-WORK-LG01`）覆盖 7,728 个案例、124 部作品，
覆盖率 85.3357%，WAPE 32.2259%，signed bias -5.6816%，预测/实际总额比
94.3184%。这是 coverage-aware 描述，不是全模型共同同案冠军。

## 六个年度 H12 切片

年度人口按全年 actual 形成，只是 hindsight diagnostic，不是起点可见的正式服务人口。

| 目标年 | 共同同案第一名 | WAPE | cases / works |
|---:|---|---:|---:|
| 2020 | 隐私阈值下无可公开共同同案结果（`NO_PRIVACY_ELIGIBLE_COMMON_MATCHED_RESULT`） | — | 8 / 8 |
| 2021 | `M2-BASE-CLASSIC01/seasonal_naive` 与 `M2-WORK-CCR01/NESTED_CANONICAL_CHANNEL` 并列 | 50.1903% | 30 / 30 |
| 2022 | `M2-WORK-CRMR01/REGISTERED_NATIVE_WORK_CHANNEL` | 20.0190% | 42 / 42 |
| 2023 | `M2-WORK-LG01/LEARNED_GLOBAL_COMMON_REVERSAL` | 28.7751% | 46 / 46 |
| 2024 | `M2-WORK-LG01/LEARNED_GLOBAL_COMMON_REVERSAL` | 35.7818% | 47 / 47 |
| 2025 | `M2-WORK-HR01/REGISTERED_HORIZON_ROUTER` 与 `M2-WORK-LG01/LEARNED_GLOBAL_COMMON_REVERSAL` 并列 | 30.1336% | 58 / 58 |

## 原生作品×渠道能力

统一分配器组合只作为诊断，不冒充原生渠道预测能力。隐私阈值允许公开的五个重点
平台中，喜马拉雅由核心收入手册模型（`M2-WORK-CRMR01`）在自身原生覆盖上取得
28.6801% WAPE，微信读书同样由该模型取得 39.5818%；番茄畅听由生命周期感知渠道模型
原始臂（`M2-CHAN-SCL01/A6_RAW`）取得 44.2621%。猫耳与漫播因隐私阈值抑制。

## 配对不确定性

以学习型全局金额基线（`M2-WORK-LG01`）为基线的两两比较只使用完全相同案例，
按作品×forecast origin 联合分块，固定种子 20260802，执行 5,000 次 bootstrap 并
作 Holm 校正。没有候选被确认显著优于该基线。最接近的两个变体为：

- TSB–LG01 混合原始变体（`M2-WORK-TSBB01/RAW_TSB_LG01_BLEND`）点差
  +0.9546 个百分点，95% 区间 [+0.0282, +1.9310]，Holm p=0.0864；
- TSB 发生原始变体（`M2-WORK-TSB01/RAW_TSB_OCCURRENCE`）点差
  +3.1181 个百分点，95% 区间 [-0.4288, +6.7419]，Holm p=0.0864。

点差定义为“候选 WAPE − LG01 WAPE”；正数表示候选误差更高。逐对覆盖不同，因此
不能把配对表转换为全体共同榜。

## 真实性与完整性

- actual 固定为开发可建模冲销重述分成现金
  （`M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01`）。
- 237,595 个作品案例、621,466 个作品×渠道案例、预测有限数、逐模型 actual 一致、
  origin-safe 训练标签、动态 Core80 起点可见、作品和渠道现金守恒全部通过。
- 统一分配器有 122,037 个缺少合法渠道份额的案例，均显式 abstain，没有用 0 填充。
- 逐行私有金额、作品名、渠道明细、Excel、SQLite、CSV 与本地可筛选 HTML 只保存在
  Git ignored 派生交付目录；公开 JSON 和 Markdown 只发布满足隐私阈值的聚合结果。

## 承接的渠道模型冻结边界

本索引只增加当前横评映射，不改写此前渠道模型的冻结结论：

- 出版行业渠道起点可见现金锚金额模型 v0.1
  （`M2-CHAN-PSC02`；预注册
  `M2-PREREG-PSC02-ORIGIN-VISIBLE-CASH-ANCHOR-01`）继续保留历史停止状态
  `PSC02_DEVELOPMENT_NOT_SUPPORTED`。既有失败属于私有源权威阻断而非模型失败
  （`PRIVATE_SOURCE_AUTHORITY_BLOCKER_NOT_MODEL_FAILURE`）；当前仍为
  `PSC02_HISTORICAL_REPLAY_BLOCKED_NO_RECOVERABLE_ORIGIN_VISIBLE_CASH_AUTHORITY`、
  `PSC02_EXECUTION_IMPLEMENTATION_INCOMPLETE_NO_CANDIDATE_RESULT` 和
  `NO_MODEL_PERFORMANCE_EVIDENCE`，即没有模型性能结果。不得伪造
  `componentId`、`revisionId`、`effectiveAt`、`availableAt` 或 24 个历史起点快照，
  也不得把公共数学 primitive 写成真实端到端候选结果。
- 出版行业渠道直接现金尺度条件金额模型 v0.1（`M2-CHAN-PSC03`；冻结原始候选
  `M2-CHAN-PSC03-RAW`）继续保留历史停止状态 `PSC03_DEVELOPMENT_NOT_SUPPORTED`。
  当前权威结论仍为实现合同不一致已确认
  （`PSC03_IMPLEMENTATION_CONTRACT_MISMATCH_CONFIRMED`）；冻结 raw 必须保留，但不是
  有效候选性能证据
  （`PSC03_FROZEN_RAW_PRESERVED_BUT_NOT_VALID_CANDIDATE_PERFORMANCE_EVIDENCE`，
  `validForCandidateDecision=false`），所以直接现金尺度假设尚未被合同一致实现裁决
  （`DIRECT_CASH_SCALE_HYPOTHESIS_NOT_ADJUDICATED_BY_CONFORMING_IMPLEMENTATION`）。
  不得重跑、修补或创建后继模型（`NO_SUCCESSOR_OR_REPLAY_AUTHORIZED`），也不得打开
  独立评价、later-origin、final holdout、production 或 automation。
- 上述两条不改变本页总状态：`activeCandidate=null`、
  `approvedForAutomation=null`、`productionReady=false`、
  `finalHoldoutOpened=false`。

## 冻结附录没有重跑

- LG01 头部保护尾段修正模型 v0.2（`M2-WORK-HPSR02`）唯一 2026-03/H3 独立评价
  未重跑：LG01 WAPE 64.4488%，HPSR02 WAPE 64.1150%，relative FVA 0.5179%，
  bootstrap 95% 区间 [-2.4406%, 3.8718%]，状态仍为
  `M2_HPSR02_FIRST_INDEPENDENT_INCONCLUSIVE_CASH_ONLY_RESEARCH_ENDED`。
- 出版行业渠道直接现金尺度条件金额模型 v0.1（`M2-CHAN-PSC03`）未重跑；冻结 raw
  只作为法证附录，继续因实现合同不一致而不是有效候选性能证据
  （`PSC03_FROZEN_RAW_PRESERVED_BUT_NOT_VALID_CANDIDATE_PERFORMANCE_EVIDENCE`）。

## 已实现、已验证、已授权与可发布

| 层次 | 当前状态 |
|---|---|
| 已实现 | 可恢复的完整历史评价编排、逐行私有交付、公开聚合报告与确定性验证入口 |
| 已验证 | 37 项资格审计、14 模型/21 变体、三类人口、四个周期、六个年度、作品与渠道守恒、同案 bootstrap |
| 已授权 | 本次一次性历史横评授权已经消费；没有新的模型执行或评价授权 |
| 可发布 | 只可发布公开聚合报告；私有逐行资产继续 Git ignored |

## 停止边界

训练、调参、新模型、模型激活、production、automation、release、final holdout、
PSC03/HPSR02 重跑、M3 formal 与合并继续关闭。任何后续业务决策或新模型设计都需要
独立授权，不能从本次历史切片第一名自动推导。

本索引取代 v0.61 作为当前阅读入口，但不改写 v0.61 或任何历史冻结结果。当前证据：

- `docs/analysis/m2-current/M2-core80-cross-model-real-business-evaluation-v0.1.json`
- `docs/analysis/m2-current/M2-core80-cross-model-real-business-evaluation-v0.1.md`
- `docs/analysis/m2-current/M2-core80-cross-model-eligibility-audit-v0.1.json`
- `docs/analysis/m2-current/M2-core80-cross-model-pre-registration-v0.1.json`
- `config/m2-model-registry.v1.json`
