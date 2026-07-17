# M2 v2 External Evidence Layer 设计 v0.1

## 技术摘要

External Evidence Layer 是 provider-neutral、append-only、as-of 的证据平面。单条 claim 只有通过来源许可、实体匹配、时间、confidence、矛盾和 schema gate，才能成为未来预测特征；否则只能解释或被禁止。

V2-A 不调用搜索、浏览器或外部 API。本文是设计合同。

## 1. Evidence object

权威 machine-readable 结构：`M2-v2-external-evidence.schema.json`。

主要分区：

- identity：evidence/version、work、claim；
- work 与 author 分离的 entity resolution；
- evidence type 与 structured value；
- source；
- provider/query/retrieval；
- extraction model/prompt/schema version；
- timestamps；
- confidence；
- contradiction；
- predictive use 与 admissibility/exclusion reason；
- governance/digests。

禁止字段：raw page、long excerpt、credential、forecast、operating action、private material。

## 2. Evidence types

初始 enum：

- `author_identity`；
- `original_work_performance`；
- `search_interest`；
- `social_signal`；
- `ranking_signal`；
- `adaptation_event`；
- `publication_event`；
- `award_event`；
- `official_notice`。

新增 type 必须发布 schema version，不能自由字符串进入预测。

`market_index` 属于 cohort/shared-scope evidence，不能复制为逐作品 claim 以虚增 coverage；V2-A per-work schema 暂不接收。未来必须使用独立 shared-scope schema 与 result link，V2-B 将其记为独立 attempt/category 指标，不计入逐作品有效证据覆盖分母。

## 3. Source classes

优先级：

1. `official_structured_api`；
2. `official_page`；
3. `authorized_structured_api`；
4. `licensed_aggregate`；
5. `permitted_public_page`；
6. `search_index`，只作发现，不能单独解决冲突。

每个 source 同时绑定四级 `sourceTier`（`authoritative`、`reliable_secondary`、`weak_secondary`、`prohibited`）和 `sourceTermsClass`：

- `structured_facts_allowed`；
- `short_excerpt_allowed`；
- `metadata_only`；
- `prohibited`；
- `review_required`。

`prohibited/review_required` 在批准前不得 prediction use。

## 4. Provider abstraction

### Provider registry

记录：

- provider ID/version；
- supported evidence types；
- source classes；
- rate/cost unit；
- historical coverage；
- terms class；
- health status；
- allowed request modes；
- max results/pages；
- retention restrictions。

### Request

```text
providerId
evidenceType
entityQuery
cutoff
queryTemplateVersion
queryHash
budget
allowedDomains
blockedDomains
timeoutMs
```

### Response envelope

```text
providerId/version
requestId
capturedAt
status
cost
latency
results[]
sourceTermsClass
errorClass
```

Response 不等于 evidence。必须经过 extraction 和 evidence gates。

每条 accepted claim 必须能沿 `evidenceId → extractionId → retrievalId → queryId → providerId/version → sourceLocator/contentDigest` 追溯。公共报告仅展示脱敏聚合，不展示 locator、query 或真实实体。

每个 source 还必须保存 origin key 与 lineage digest，防止同一原始报道的多个转载页被误计为独立来源或用于虚假“多源一致”。

### Failure policy

- retry 只针对 transient failure；
- 固定最大重试；
- rate limit/cost cap 立即停止；
- provider failure 不切换到未经批准 provider；
- fallback 记录原因；
- 不在 product read path 发起 provider call。

## 5. Timestamp semantics

| 字段 | 定义 | 预测 gate |
|---|---|---|
| `eventTime` | 事件实际发生时间 | 不单独证明可得性 |
| `publishedAt` | 来源声明发布时间 | 可辅助 availableAt |
| `firstObservedAt` | 系统首次观察时间 | 防止回填 |
| `availableAt` | 最早可证明公开可得时间 | 必须 ≤ evidenceAsOfAt |
| `capturedAt` | 本次系统抓取/获取时间 | 审计/时效 |
| `validFrom/validTo` | 指标适用区间 | feature period |

规则：

- `availableAtStatus=unknown` 且 `availableAt=null`：prediction prohibited；
- eligible time 晚于 `evidenceAsOfAt`：只能进入独立 post-hoc audit snapshot，不得绑定当时 result 的预测或解释；
- `capturedAt` 早于已知 `availableAt`：invalid；
- historical API 自带 period 仍需证明当时可得；
- 页面当前显示历史事件，不等于历史 cutoff 时可得；
- timestamp 不能人工改写。

`eventTime`、`availableAt`、`capturedAt` 是三个不同事实，不允许相互回填。`firstObservedAt` 是防止未来网页反向伪装历史可得性的附加审计时间。

每次 snapshot 必须区分三个时钟：

- `incomeDataCutoffAt`：内部收入事实截止时间；
- `evidenceAsOfAt`：本次 prospective evidence snapshot 的封存时点；
- `predictionLockedAt`：未来模型/人工结果锁定时点。

当前采集记录的页面即使声明早期发布日期，也只能从系统 `firstObservedAt/capturedAt` 开始用于 prospective snapshot。历史 API 返回旧 period 不构成历史 development cutoff 可得性证明。eligible time 取 `availableAt`、`firstObservedAt` 和用于该 snapshot 的 `capturedAt` 中最晚者。

### Entity resolution

- work 与 author 必须分别解析；
- 同名不能单独构成 resolved；
- alias、来源、分类、官方 identifier 与组合匹配必须记录 method/version；
- alternate candidate 只保存不可逆 hash；
- ambiguous/unresolved 证据 fail-closed；
- LLM 可以提出候选和理由，但不能绕过规则强制选择。

## 6. Confidence

组件范围 0–1：

- entity match；
- source reliability；
- extraction confidence；
- freshness score。

```text
overall = min(entity, source, extraction, freshness)
```

Tier：

- high ≥ 0.90；
- medium ≥ 0.80 且 < 0.90；
- low < 0.80；
- unavailable：任一必需组件缺失；缺失组件与 overall 为 null。

`prediction_allowed` 还要求无 unresolved conflict、source terms allowed 和 as-of。high/medium 不自动证明因果，只证明 evidence 可用于未来预注册 feature experiment。

JSON Schema 固定 tier 数值区间；runtime validator 还必须验证 `overall` 精确等于四个非空组件的最小值，不能只相信 tier 标签。

## 7. Contradiction handling

### Grouping

按以下键组成 conflict group：

```text
standardWorkId + claimKey + overlapping effective interval
```

状态：

- `none`；
- `detected`；
- `resolved`；
- `unresolved`；
- `superseded`。

### 自动 resolution precedence

1. 官方结构化来源；
2. 官方声明页面；
3. 授权结构化 API；
4. 许可聚合且有两个独立来源一致；
5. permitted page；
6. search index 不能单独 resolve。

规则：

- 高优先级且时间适用的 claim 可 supersede 低优先级；
- resolved group 必须保存 winner evidence ID、resolution version/time 和当前 claim 的 winner/loser disposition；只有 winner 可成为 prediction candidate；
- 同优先级冲突保持 unresolved；
- human note 不能修改 claim value/confidence；
- unresolved group 全部禁止 prediction；
- risk 输出 `external_evidence_conflict`；
- explanation 可列 conflict，但不得选择一方作为事实。

## 8. Predictive-use gate

```text
predictionAllowed
= schemaValid
&& sourceTermsAllowed
&& sourceTier in [authoritative, reliable_secondary]
&& entityMatchAccepted
&& availableAtStatus == known
&& max(availableAt, firstObservedAt, capturedAt) <= evidenceAsOfAt
&& evidenceAsOfAt <= predictionLockedAt
&& overallConfidence >= 0.80
&& confidenceTier in [medium, high]
&& contradictionStatus in [none, resolved]
&& freshnessValid
&& snapshotLockedBeforePrediction
&& featureManifestPreRegistered
```

此外，`admissibility.status` 必须为 `accepted_prediction_candidate`，并具有完整 source locator、query/retrieval receipt、extraction version 和 exclusion audit。

失败分类：

- `explanation_only`：合法来源但 confidence/as-of/conflict 不满足预测；
- `prohibited`：来源/隐私/schema/credential/raw content 违规。

## 9. Snapshot

Evidence snapshot 包含：

- snapshot ID/version；
- work ID；
- cutoff；
- source/confidence policy versions；
- eligible claim IDs/digests；
- explanation-only claim IDs/digests；
- conflict groups；
- coverage summary；
- createdAt；
- manifest digest。

Snapshot immutable。晚到 evidence 创建新 snapshot，不能回写旧 cutoff snapshot。

V2-B 产生的 snapshot 只能 prospective 使用，不得进入 B4/C1/C2/C3 历史 replay。claim、snapshot policy evaluation 和 result link 必须各自版本化；policy 变化创建新 evaluation/version，不能原地改写 claim。

## 10. Acquisition and storage boundary

允许保存：

- URL/domain；
- query hash；
- status/content type；
- short excerpt/content digest；
- source locator；
- structured facts；
- 许可允许的 restricted snapshot reference。

禁止保存：

- 网页全文；
- 长摘录；
- 登录态/credential；
- paywalled body；
- private material；
- 未授权数据库复制；
- LLM chain-of-thought；
- direct revenue answer。

如果来源不允许最小快照，只能承诺 source/query traceability，reproducibility level 必须降低。

## 11. Evidence coverage metrics

- work coverage；
- type coverage；
- as-of eligible coverage；
- entity success/ambiguity；
- authoritative source share；
- fresh share；
- contradiction/unresolved rate；
- provider success/fallback；
- median latency/cost；
- evidence-to-feature conversion；
- coverage by value/activity/revenue model。

## 12. V2-B 前置未决

- provider/source registry approval；
- legal/terms review；
- freshness windows by evidence type；
- query budgets/cost cap；
- pilot sample；
- restricted snapshot retention；
- confidence policy 是否需要在任何结果前升级 v0.2。

在这些决策前不得启动真实 acquisition。
