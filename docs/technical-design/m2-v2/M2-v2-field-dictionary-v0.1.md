# M2 Forecast Intelligence v2 字段字典 v0.1

## 1. 状态与适用范围

- 状态：`V2_A_ARCHITECTURE_CONTRACT_READY_FOR_REVIEW`
- 结果 schema：`m2.v2.serving-result.v0.1`
- evidence schema：`m2.v2.external-evidence.v0.1`
- 决策状态：`not_for_formal_decision`

本字典统一 PRD、JSON Schema、API、逻辑 DB 和 export 的字段语义。JSON Schema 是结构约束权威；本字典是中文业务语义权威。二者冲突时必须停止实现并先修订合同。

## 2. Serving result 顶层

| 字段 | 类型/可空 | 语义 | API/Export |
|---|---|---|---|
| `schemaVersion` | string，否 | 固定 `m2.v2.serving-result.v0.1` | 是 |
| `resultId` | string，否 | 不可变结果 ID | 是 |
| `standardWorkId` | string，否 | 权威标准作品 ID | 受控业务视图 |
| `cutoffMonth` | `YYYY-MM`，否 | 预测信息截止月 | 是 |
| `resultStatus` | enum，否 | current/historical/invalidated | 是 |
| `decisionStatus` | enum，否 | 当前仅 research/not-for-formal | 是 |
| `forecast` | object，否 | formal cash head | 是 |
| `commercialValue` | object，否 | 商业价值 head | 是 |
| `trend` | object，否 | 销售现金趋势 head | 是 |
| `risks` | array，否 | 事实型风险 | 是 |
| `explanation` | array，否 | 有证据的驱动解释 | 是 |
| `evidenceSummary` | object，否 | 外部证据覆盖摘要 | 是，不含原文/URL |
| `governance` | object，否 | 模型、schema、policy、snapshot 版本 | 是 |

## 3. Cash Forecast

| 字段 | 类型/可空 | 规则 |
|---|---|---|
| `statisticallyScoreable` | boolean | 只表示回测 actual/history 完整性 |
| `modelPredictionAvailable` | boolean | 是否存在内部模型原始预测；不等于可展示 |
| `businessServingEligible` | boolean | 产品是否允许展示数值 |
| `abstained` | boolean | true 时 point 必须 null |
| `abstentionReason` | string/null | abstained 时必填；served 时 null |
| `pointBasis` | enum | unavailable / sales_model / sales_model_plus_confirmed_receivable / confirmed_receivable_only |
| `pointForecastCents` | integer/null | 唯一 formal cash 点值，整数分 |
| `currency` | `CNY` | 固定 |
| `annualBreakdown[].year` | integer | 自然年 |
| `annualBreakdown[].amountCents` | integer | 非负整数分，合计严格等于 point |
| `confidence.level` | enum | high/medium/low/unavailable |
| `confidence.basisCodes` | string[] | 可审计依据代码 |
| `limitations` | string[] | 事实限制，不含运营动作 |
| `excludesUncommittedFutureBuyout` | boolean | 未承诺未来买断始终排除 |

正式点值只包含未来实销现金与 cutoff 已确认、可审计的未来应收。pure-buyout 无承诺时必须 `modelPredictionAvailable=false`、`businessServingEligible=false`、`abstained=true`、point=null、年度数组为空，禁止以 0 或 `buyoutMonthlyEquivalent` 替代。pure-buyout 只有确认应收时可以 `pointBasis=confirmed_receivable_only` 且 `modelPredictionAvailable=false` 但合法 served；确认现金不得冒充模型原始预测。

## 4. Commercial Value

| 字段 | 类型/可空 | 未批准 policy 时 |
|---|---|---|
| `status` | enum | `unavailable` |
| `methodType` | enum | `unavailable` |
| `score` | number/null，0–100 | null |
| `rankPercentile` | number/null，0–1 | null |
| `dimensionScores[]` | code + score/null + provenanceRefs | unavailable 时为空或全 null；非 unavailable 时六个冻结 code 各且仅出现一次、均为数值且各有 typed provenance |
| `confidence` | object | unavailable |
| `limitations` | string[] | 明确 truth/weights 未批准 |
| `policyVersion` | string/null | null |
| `truthDefinitionVersion` | string/null | null |

维度机器码仅冻结为 `cash_outlook`、`persistence`、`demand_momentum`、`rights_usability`、`evidence_strength`、`risk_adjustment`；中文展示名另行映射。V2-A 不冻结权重，不生成当前 score；外部需求证据不得同时定义 truth 和作为模型特征。

## 5. Trend

| 字段 | 类型/可空 | 未批准 definition 时 |
|---|---|---|
| `status` | enum | `unavailable` |
| `label` | rising/stable/declining/null | null |
| `horizonMonths` | integer/null | null |
| `unavailabilityReason` | enum/null | definition_not_approved / insufficient_history / not_applicable_no_sales / evidence_unavailable |
| `confidence` | object | unavailable |
| `evidenceRefs` | typed provenance ref[] | 空数组 |
| `limitations` | string[] | 至少一项，说明不可用原因 |
| `trendDefinitionVersion` | string/null | null |

Trend 只描述 forecastable sales cash 方向；已承诺买断 lump sum 和 surprise buyout 不定义销售趋势。任何 threshold、horizon 和 truth window 必须在后续算法实验前独立冻结。

## 6. Risk 与 Explanation

Risk 字段：`riskId`、`riskCode`、`severity`、`affectedHead`、`evidenceRefs`、`rationale`、`limitation`。Risk 只陈述可审计风险，不得包含资源投入或运营动作。

Explanation 字段：`driverId`、`driverType`、`direction`、`strengthBand`、`affectedHead`、`evidenceRefs`、`asOf`、`text`、`limitations`。解释必须能回指 internal fact 或 evidence claim；模型 attribution 不得被表述为因果事实。

typed provenance ref 包含 `refType`、`refId`、`snapshotId`、`asOf`。external evidence 和 internal snapshot 的 snapshot ID 不可为空；前者必须等于当前 result 的 sealed evidence snapshot ID，后者必须等于当前 result 的 sealed cash input snapshot ID。value dimension、trend、risk 与 explanation 必须各自定位到稳定 target ID。prediction lock 后的 truth 不得作为 serving provenance，只能进入独立 evaluation audit。`evidenceSummary` 的 prediction/explanation 计数之和不得超过 total，且全部计数、冲突数与 coverage 必须和 snapshot projection 精确一致。

## 7. External Evidence identity 与 claim

| 字段 | 类型/可空 | 语义 |
|---|---|---|
| `schemaVersion` | string，否 | 固定 schema 版本 |
| `evidenceId` | string，否 | claim 稳定 ID |
| `evidenceVersion` | integer，否 | append-only 版本 |
| `standardWorkId` | string，否 | private store 中的标准作品引用；不进公开报告 |
| `evidenceType` | enum，否 | 受控 evidence 类别 |
| `claimKey` | string，否 | 可比较/冲突分组键 |
| `structuredValue` | typed object，否 | 结构化事实，不保存网页全文 |
| `unit` | string/null | 数值单位 |

当前 schema 只承载 per-work claim。`market_index` 是 shared/cohort evidence，必须使用未来独立 schema，不得复制到每个 standardWorkId 以虚增 work coverage。

## 8. Entity Resolution

`entityResolution.work` 与 `entityResolution.author` 必须分别解析，不能只凭同名一次性绑定。每个对象包含：

- `status`：resolved/ambiguous/unresolved/not_applicable；
- `method`；
- `confidence`；
- `candidateCount`；
- `selectedEntityKeyHash`；
- `candidateSetDigest`；
- `runnerUpMargin` 与 `acceptanceThreshold`；
- `ambiguityReason`；
- `alternateCandidateHashes`，只存 hash；
- `sourceEvidenceIds`；
- `normalizationVersion`、`policyVersion`、`resolverInputDigest` 与 `evaluatedAt`。

顶层另有 `status`、`overallConfidence`、`resolutionVersion`。work 未 resolved，或需要作者而 author 未 resolved 时，evidence 不得成为 prediction candidate。

## 9. Provider、source 与 extraction

| 分区 | 必填字段 | 审计目的 |
|---|---|---|
| provider | providerId/version、queryId、retrievalId | 从 claim 追到查询与 receipt |
| source | sourceTier/class/terms、name、domain、recordKey、originKey、lineageDigest、locator | 来源层级、转载谱系、许可与引用完整性 |
| extraction | extractionId、extractorType、modelId、promptVersion、schemaVersion | 结构化抽取可复现 |
| governance | policy versions、createdAt、contentDigest、excerptDigest、restrictedSnapshotRef | 版本与内容摘要 |

`sourceLocator` 只进入 private store；公共报告只保留 source tier/class 聚合。accepted evidence 必须有可审计 locator。LLM 只能抽取/规范化/分类/消歧，不能直接生成收入、无来源事实或商业价值分数。

## 10. 三类时间

| 字段 | 可空 | 定义 |
|---|---|---|
| `eventTime` | 是 | 事件发生时间；不证明当时已公开 |
| `availableAtStatus` | 否 | known/unknown |
| `availableAt` | unknown 时 null | 最早可证明公开可得时间 |
| `availableAtBasis` | 否 | availableAt 的可审计推导依据代码 |
| `availableAtDerivationVersion` | 否 | 推导规则版本 |
| `capturedAt` | 否 | 本次系统实际获取时间 |
| `publishedAt` | 是 | 来源声明发布时间 |
| `firstObservedAt` | 否 | 系统首次观察到该 claim 的时间 |
| `validFrom/validTo` | 是 | 指标适用区间 |

三类核心时间 `eventTime`、`availableAt`、`capturedAt` 相互独立。`availableAtStatus=unknown` 时 evidence 必须从 prediction eligibility 排除；当前采集只能形成 prospective snapshot，不能回填历史 development cutoff。

Snapshot 还必须区分 `incomeDataCutoffAt`、`evidenceAsOfAt`、`predictionLockedAt`。候选资格要求 `max(availableAt, firstObservedAt, capturedAt) <= evidenceAsOfAt <= predictionLockedAt`。页面自报的旧 published/event time 不能让当前首次观察的 evidence 进入历史 replay。

## 11. Confidence、contradiction 与 admissibility

Confidence 四组件为 entity/source/extraction/freshness，`overall=min(components)`；任一组件不可得时该组件与 overall 为 null、tier=unavailable。high ≥ 0.90，medium ≥ 0.80 且 <0.90，low <0.80；低于 0.80 或 unavailable 不得 prediction allowed。JSON Schema 约束 tier 区间，runtime contract test 必须精确验证 minimum 关系。

Contradiction 字段：status、groupId、conflictingEvidenceIds、resolutionRule、winnerEvidenceId、resolutionVersion、resolvedAt、currentClaimDisposition。同 work + claim key + 重叠有效区间形成 group；resolved 的 prediction candidate 必须是 winner，unresolved 不得进入预测，LLM 不得隐式选择一方。

Admissibility：

- `accepted_prediction_candidate`：仅表示未来具备候选资格，不表示已经进入模型；
- `accepted_explanation_only`：只可解释；
- `excluded`：保存排除原因用于审计。

`predictiveUse` 与 admissibility 必须一致；默认 `prohibited`，只有 allowlisted authoritative/reliable secondary、身份 resolved、availableAt known、置信中/高、冲突 none/resolved 且引用完整时才可成为 prediction candidate。

## 12. 禁止字段与旧字段

V2 surface 禁止：optimistic/pessimistic/high/base/low、range、PI endpoint、raw model prediction、future buyout probability、自动运营建议、网页全文、长摘录、credential、provider raw payload、reviewer 真实身份。

旧字段只能保留在 legacy/non-formal 历史合同中，不得映射或改名进入 V2。
