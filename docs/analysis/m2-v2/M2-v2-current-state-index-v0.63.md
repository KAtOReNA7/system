# M2 当前状态索引 v0.63

本索引于 2026-09-09 增加当前解释与披露更正，依据截至 2026-08-02 已冻结的
2020–2025 Core80 全模型真实业务横评 v0.1（M2 Core80 Cross-Model Real-Business
Evaluation v0.1，`M2-CMX01`）。本次没有产生新的模型预测、评价或验收结果。

模型名称、角色、人口与可比组以 `config/m2-model-registry.v1.json` 为唯一当前
机器权威；业务门限以 `config/m2-business-acceptance-contract.v1.json` 为唯一数值
权威。本索引替代 v0.62 作为当前阅读入口；v0.62、横评 v0.1 的 JSON/Markdown、
预注册、冻结预测、指标、bootstrap、digest 和 receipt 均保留原样。

## 当前结论与角色

历史横评完成了 37 项登记审计，14 个模型、21 个稳定变体覆盖 70 个合法月度预测
起点和 235 个起点×周期单元。全部变体跨全部周期的共同案例数为 0
（`NO_GLOBAL_COMMON_MATCHED_CASES`），未形成统一历史冠军
（`NO_UNIFIED_HISTORICAL_CHAMPION_IDENTIFIED`）。

不同历史周期、年度和渠道切片出现不同的点估计第一名；各切片参与模型、案例与
支持范围不同，现有证据尚未证明稳定的按切片选模收益。冻结 JSON 的
`DIFFERENT_MODELS_FIT_DIFFERENT_BUSINESS_SLICES` 保留为原历史结论码，当前解释
收紧为上述历史排名现象，不能据此实施路由、组合或模型晋升。已有两两同案比较中
没有候选被确认显著优于人工锚定可学习全局模型（Human-Anchored Learned Global，
`M2-WORK-LG01`）；这也不证明该基线对所有业务切片均最优或已经业务可用。

| 对象 | 当前状态 |
|---|---|
| 兼容性现行运行回退 | 作品发生—金额校准模型 v0.3（`M2-WORK-OA03`）；没有新增当前范围性能支持 |
| 作品金额研究比较基线 | 人工锚定可学习全局模型（`M2-WORK-LG01`）；模型角色不变 |
| 最新评价活动 | Core80 全模型历史横评（`M2-CMX01`），历史评价完成、等待独立业务决策（`M2_CMX01_HISTORICAL_CROSS_EVALUATION_COMPLETE_DECISION_PENDING`） |
| 活动候选与自动化批准 | `activeCandidate=null`、`approvedForAutomation=null` |
| 生产与最终留出 | `productionReady=false`、`finalHoldoutOpened=false` |

## LG01 四周期作品总额摘要与合同阈值对照

以下均为动态起点可见 Core80（`ORIGIN_VISIBLE_DYNAMIC_CORE80`）的作品总额
（`WORK_TOTAL`），只描述 LG01 自身有合法预测的案例。它们属于
`CG-CMX01-DYNAMIC-CORE80-WORK-MODEL-AVAILABLE`，不能与全模型共同同案第一名
混用，也不是原业务合同冻结参考窗口的替代结果。

源为横评 JSON 的 `comparison.modelAvailable`，筛选
`populationId=ORIGIN_VISIBLE_DYNAMIC_CORE80`、`modelId=M2-WORK-LG01`、
`sliceType=HORIZON`；变体为 `M2-WORK-LG01/LEARNED_GLOBAL_COMMON_REVERSAL`。
阈值来自业务合同 `businessUsability.horizons`，要求 WAPE 与绝对偏差同时满足。

| 周期 | 有效 / 应有案例 | 作品数 | 案例覆盖率 | 收入金额覆盖率 | WAPE | 有符号偏差 | 合同 WAPE / 绝对偏差上限 | 本摘要的数值对照 |
|---|---:|---:|---:|---|---:|---:|---:|---|
| 3 个月（H3） | 2,527 / 2,859 | 124 | 88.3875% | 未披露 | 27.8549% | -11.9749% | 30% / 10% | WAPE 在阈值内；绝对偏差超限 1.9749 个百分点 |
| 6 个月（H6） | 2,368 / 2,700 | 123 | 87.7037% | 未披露 | 28.7431% | -9.0065% | 32% / 10% | 两项在阈值内 |
| 12 个月（H12） | 2,045 / 2,377 | 113 | 86.0328% | 未披露 | 31.6422% | -4.3251% | 35% / 12% | 两项在阈值内 |
| 36 个月（H36） | 788 / 1,120 | 72 | 70.3571% | 未披露 | 36.4640% | -2.8559% | 40% / 12% | 两项在阈值内；仅历史开发证据 |

案例覆盖率为 `caseCount / expectedCaseCount`；同一作品在不同起点或周期可形成
多个案例。四周期合并为 7,728 / 9,056 案，案例覆盖率 85.3357%，WAPE 32.2259%，
有符号偏差 -5.6816%。合并偏差不能替代 H3 判定，合并覆盖也不能替代 H36 的
70.3571%。这些比例均不是作品数量覆盖率或收入金额覆盖率；公开冻结摘要没有提供
对应收入金额覆盖，故标为“未披露”，不从案例数推算。

本表只对照已有摘要与已有阈值，没有新增正式验收。H6/H12/H36 的两项数值在阈值内，
不等于完整业务门禁通过；各周期的收入覆盖、逐起点稳定性、不确定性与所属合同
要求仍须分别披露和判断。H36 永久保留历史多起点、非前瞻验证警示
（`HISTORICAL_MULTI_ORIGIN_NOT_PROSPECTIVE_VALIDATION`）。作品×渠道
（`WORK_CHANNEL`）保持 `PARTIAL_NOT_ACTIVE`，不并入本表或由作品总额反推通过。

## 原生作品×渠道比较的口径更正

v0.62 的“自身原生覆盖”和横评 Markdown 渠道表的“自身覆盖第一名”属于文案
不一致。冻结 JSON 的 `comparison.channelLeaderboards.native` 实际已经使用
各渠道参与模型的共同案例，状态为
`PUBLISHED_COMMON_MATCHED_PRIVACY_THRESHOLD_PASS`。当前应读作“原生作品×渠道
模型共同同案的历史点估计排名”；不需要重算渠道结果。

| 业务渠道 | 参与模型数 | 共同案例 / 作品 | 历史点估计第一名 | WAPE |
|---|---:|---:|---|---:|
| 喜马拉雅 | 3 | 1,248 / 74 | 核心收入手册模型（`M2-WORK-CRMR01/REGISTERED_NATIVE_WORK_CHANNEL`） | 28.6801% |
| 微信读书 | 3 | 771 / 56 | 核心收入手册模型（`M2-WORK-CRMR01/REGISTERED_NATIVE_WORK_CHANNEL`） | 39.5818% |
| 番茄畅听 | 3 | 893 / 50 | 生命周期感知渠道模型的原始实验臂（`M2-CHAN-SCL01/A6_RAW`） | 44.2621% |
| 猫耳、漫播 | — | 隐私阈值下未披露 | 无可公开结果（`SUPPRESSED_PRIVACY_THRESHOLD`） | — |

每个渠道的共同案例范围以冻结 JSON 为准。上述渠道汇总不能说明各周期分别通过
业务门禁，也不能跨渠道或与作品总额排行榜合并。统一分配器组合继续只作诊断，
不作为原生渠道能力。

36 个月作品总额共同同案第一名为按周期滚动模型路由器（`M2-WORK-HR01`）与
人工锚定可学习全局模型（`M2-WORK-LG01`）并列，WAPE 35.0675%，704 案、69 部。
PR #42 旧正文将前者写为核心收入手册模型（`M2-WORK-CRMR01`）属于文字错误；
冻结 JSON、v0.62 的同案表与模型成绩保持不变。

## 公共工程修正

能力 doctor 分开披露源文件盘点、真实性尚待验证、历史起点权威与明确执行授权。
缺少明确授权或历史授权已经消费时，不再将文件齐全解释为可执行。PSC02 的历史
起点权威不可恢复，即使缓存与文件齐全也保持阻断。其他能力的可重建缓存和可选历史
收据仍独立盘点；公开安装、测试和启动不要求私有权威。

Core80 横评公共数学核心在评分与配对前排除弃权和无效现金值，保留合法零预测。
该修正不触发实际 Python 横评路径，不重跑冻结模型或评价。

## 冻结证据与停止边界

- 出版行业渠道起点可见现金锚金额模型（`M2-CHAN-PSC02`）继续是历史源权威不可
  恢复、真实候选成功路径未实现、没有模型性能结果或证据；不补造历史四字段或重放。
  当前状态分别为
  `PSC02_HISTORICAL_REPLAY_BLOCKED_NO_RECOVERABLE_ORIGIN_VISIBLE_CASH_AUTHORITY`、
  `PSC02_EXECUTION_IMPLEMENTATION_INCOMPLETE_NO_CANDIDATE_RESULT` 和
  `NO_MODEL_PERFORMANCE_EVIDENCE`。历史 `PSC02_DEVELOPMENT_NOT_SUPPORTED` 与
  `PRIVATE_SOURCE_AUTHORITY_BLOCKER_NOT_MODEL_FAILURE` 保持冻结；预注册
  `M2-PREREG-PSC02-ORIGIN-VISIBLE-CASH-ANCHOR-01` 不变。
- 出版行业渠道直接现金尺度条件金额模型（`M2-CHAN-PSC03`）的冻结 raw 真实，
  但实现合同不一致（`PSC03_IMPLEMENTATION_CONTRACT_MISMATCH_CONFIRMED`），
  `validForCandidateDecision=false`；原始结果与历史停止状态保持冻结。不得重跑、
  补造折内状态或创建后继模型（`NO_SUCCESSOR_OR_REPLAY_AUTHORIZED`）。
- LG01 头部保护尾段修正模型 v0.2（`M2-WORK-HPSR02`）的唯一 2026-03/H3
  独立评价未重跑：43 部动态 Core80，LG01 WAPE 64.4488%，HPSR02 WAPE
  64.1150%，relative FVA 0.5179%，bootstrap 95% 区间跨 0，继续为
  `M2_HPSR02_FIRST_INDEPENDENT_INCONCLUSIVE_CASH_ONLY_RESEARCH_ENDED`。
  本次历史摘要不能替代该独立结果；第二独立起点、HPSR03 和现金相邻研究保持关闭。

| 层次 | 本次解释更正的状态 |
|---|---|
| 已实现 | 公共评分与能力诊断修正；四周期摘要、覆盖口径说明与渠道比较文案更正 |
| 已验证 | 数值来自既有公开冻结聚合结果；本页不代替当前提交的公共工程检查记录 |
| 已授权 | 只处理当前解释与工程修复；没有新增训练、调参、模型执行或私有评价授权 |
| 可发布 | 公开解释与汇总可供审阅；模型生产、自动化、release 和 M3 formal 均未获准 |

## 证据入口

- [冻结状态索引 v0.62](M2-v2-current-state-index-v0.62.md)：完整历史角色与边界。
- [冻结横评 JSON](../m2-current/M2-core80-cross-model-real-business-evaluation-v0.1.json)：本次摘要与更正的数值来源。
- [冻结横评 Markdown](../m2-current/M2-core80-cross-model-real-business-evaluation-v0.1.md)：历史报告保留，渠道覆盖和切片适配措辞以本索引更正为准。
- [模型登记表](../../../config/m2-model-registry.v1.json)：当前模型角色与可比组。
- [业务验收合同](../../../config/m2-business-acceptance-contract.v1.json)：四周期阈值的唯一数值权威。
