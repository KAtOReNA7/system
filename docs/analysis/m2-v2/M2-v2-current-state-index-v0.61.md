# M2 当前状态索引 v0.61

截至 2026-08-02，本索引以 PSC03 冻结尾部爆炸与合同一致性审计作为最新变化。
模型名称、别名、角色、实验映射、评价人口与可比组以
`config/m2-model-registry.v1.json` 为唯一当前机器权威；业务门限以
`config/m2-business-acceptance-contract.v1.json` 为唯一数值权威。

## 当前角色与权限

| 对象 | 当前状态 | 含义 |
|---|---|---|
| 兼容性现行运行回退 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 只有兼容性回退角色，没有新增当前范围性能支持 |
| 作品金额研究比较基线 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 只用于合法同案例研究比较，不是 production 晋升 |
| 冻结失败渠道模型 | 出版行业适配渠道月度核心（`M2-CHAN-PSC01`） | 根因为估计器尺度收缩，冻结结果不改写 |
| 历史源权威阻断设计 | 出版行业渠道起点可见现金锚金额模型 v0.1（`M2-CHAN-PSC02`） | runner 不完整且无模型性能证据 |
| 最新审计对象 | 出版行业渠道直接现金尺度条件金额模型 v0.1（`M2-CHAN-PSC03`） | 冻结 raw 真实，但实现合同不一致，不是有效候选性能证据 |
| 活动候选 | `activeCandidate=null` | 没有活动候选 |
| 自动化批准 | `approvedForAutomation=null` | 没有自动化批准 |
| production ready | `productionReady=false` | 没有生产权限 |
| final holdout | `finalHoldoutOpened=false` | 未打开 |
| 独立评价 | `independentEvaluationOpened=false` | 未打开 |
| later-origin | `laterOriginOpened=false` | 未打开 |

## PSC02 继承的阻断边界

出版行业渠道起点可见现金锚金额模型 v0.1
（Publishing-Scale Channel Origin-Visible Cash-Anchor Amount Model v0.1，
`M2-CHAN-PSC02`；历史原始候选身份 `M2-CHAN-PSC02-RAW`）的结果前预注册
`M2-PREREG-PSC02-ORIGIN-VISIBLE-CASH-ANCHOR-01` 继续作为不可变谱系保存。

其历史 `PSC02_DEVELOPMENT_NOT_SUPPORTED` 与
`PRIVATE_SOURCE_AUTHORITY_BLOCKER_NOT_MODEL_FAILURE` 原样保留。当前仍是
`PSC02_HISTORICAL_REPLAY_BLOCKED_NO_RECOVERABLE_ORIGIN_VISIBLE_CASH_AUTHORITY`
和 `PSC02_EXECUTION_IMPLEMENTATION_INCOMPLETE_NO_CANDIDATE_RESULT`：没有模型性能结果
（`NO_MODEL_PERFORMANCE_EVIDENCE`），不能把源权威阻断解释成模型性能失败。
不得补造 `componentId`、`revisionId`、`effectiveAt`、`availableAt` 或历史
snapshot，也不授权 PSC02 重放、候选评价、production 或 automation。

## PSC03 当前权威结论

出版行业渠道直接现金尺度条件金额模型 v0.1
（Publishing-Scale Channel Direct-Cash Conditional Amount Model v0.1，
`M2-CHAN-PSC03`）的唯一冻结准 Poisson raw
（`M2-EXP-PUBLISHING-SCALE-CHANNEL-DIRECT-CASH-03/P`；
`M2-CHAN-PSC03-RAW`）保持 3,318,819 行、原 digest、原评价、原 bootstrap 和
原 receipt 不变。

一次只读扫描完整复现 382 项公开评价比较，证明 raw 与历史评价是真实冻结证据。
但静态合同审计同时确认：

- `SHRUNK_FIT` 只执行 distinct works、positive distinct works 和 independent
  origins 三项门槛；
- grouped-CV convergence、coefficient instability、prediction work-total CV、
  leave-one-work-out WAPE delta 和 parent-relative uncertainty 均未执行；
- `parentShrinkageRequired`、连续条件金额收缩以及 log1p child-to-parent
  interpolation 均未执行；
- `cashEffectiveWorkCount` 被计算但没有进入资格、收缩或预测调用链；
- 子层完整 log residual 直接叠加，非空 child fit 被标为 `SHRUNK_FIT`。

因此当前状态为：

- 实现合同不一致已确认
  （`PSC03_IMPLEMENTATION_CONTRACT_MISMATCH_CONFIRMED`）；
- raw 保留但不是有效候选性能证据
  （`PSC03_FROZEN_RAW_PRESERVED_BUT_NOT_VALID_CANDIDATE_PERFORMANCE_EVIDENCE`）；
- 直接现金尺度假设未被合同一致实现裁决
  （`DIRECT_CASH_SCALE_HYPOTHESIS_NOT_ADJUDICATED_BY_CONFORMING_IMPLEMENTATION`）；
- 不授权后继模型或重放（`NO_SUCCESSOR_OR_REPLAY_AUTHORIZED`）。

历史 `PSC03_DEVELOPMENT_NOT_SUPPORTED`、全部指标和历史报告继续不可变，只是
`validForCandidateDecision=false`。这不是把历史失败改写成成功，也不是允许通过
结果后修改合同挽救候选。

## 尾部根因定位

冻结总体 primary H36 WAPE 仍为 54.2647%，strict WAPE 仍为 297.0822%；这些数字只
描述非一致实现，不是当前候选成绩。

最严重单元为 2025-09/H3：WAPE 26,591.5300%，预测/实际 266.6756；单一作品占
68.0316% 误差，Top-10 占 99.4749%。occurrence-weighted mechanism/global 预测质量
比为 215.8916，而 named-platform/mechanism 为 0.8458。首个灾难性放大层因此是
advertising mechanism residual；fanqie_audio 平台层略微回压但没有消除爆炸。
occurrence 只应用一次，future-first-seen 保持 0，三层 eta clip 均没有命中或接近。

冻结准 Poisson data term 随现金单位缩放，但固定 L2 不随之缩放，因而固定 lambda
相对 data term 不是现金单位不变量。fold coefficients、standardizers、selected
lambdas 和 stability receipts 未封存，不能在禁止重跑的本任务中补造或反推。

## 已实现、已验证、已授权与可发布

| 层次 | 当前状态 |
|---|---|
| 已实现 | 与模型执行物理隔离的只读冻结 raw 审计器、私有 ignored receipt/定位器、公开报告和结果权威纠正层 |
| 已验证 | raw/manifest/seal/decision/attempt/bootstrap/digest；382 项评价复算；20 项合同矩阵；隐私阈值 |
| 已授权 | 只授权本次 frozen audit 与当前治理；没有模型重放、修正或后继开发授权 |
| 可发布 | 只可发布不含 private 金额、作品名、行键、系数和私有路径的聚合审计结论；模型不可发布 |

## 停止边界

PSC03 replay、独立评价、later-origin、final holdout、PSC04/修正版、taxonomy、
production loader、route、API、数据库、provider、automation、release 和财务使用
继续关闭。任何新模型必须等待独立、结果前的科学理由、预注册与用户授权。

本索引取代 v0.60 作为当前阅读入口，但不改写 v0.60。当前证据见：

- `docs/analysis/m2-current/M2-psc03-frozen-tail-and-contract-conformance-audit-v0.1.json`
- `docs/analysis/m2-current/M2-psc03-frozen-tail-and-contract-conformance-audit-v0.1.md`
- `docs/analysis/m2-current/M2-psc03-result-authority-correction-v0.1.json`
- `docs/analysis/m2-current/M2-psc03-result-authority-correction-v0.1.md`
- `config/m2-model-registry.v1.json`
