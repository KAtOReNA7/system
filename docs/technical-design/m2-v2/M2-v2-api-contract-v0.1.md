# M2 Forecast Intelligence v2 API 契约 v0.1

## 1. 状态与边界

- 状态：`V2_A_ARCHITECTURE_CONTRACT_READY_FOR_REVIEW`
- 契约版本：`m2.v2.api.v0.1`
- 结果结构：`m2.v2.serving-result.v0.1`
- 当前只允许 fixture 或隔离 shadow 读取；不开放正式生产服务。
- 所有响应必须保持 `not_for_formal_decision`，直至后续独立验收与明确批准。
- 本文件不授权实现路由、调用外部 provider、写数据库、打开 final holdout 或发布结果。

V2 API 是独立版本化契约。不得用兼容性改名把旧 `high/base/low`、自动运营建议或 PI 端点带回产品表面，也不得直接改变现有 M2 v1 API。

## 2. 统一响应封套

成功响应：

```json
{
  "contractVersion": "m2.v2.api.v0.1",
  "datasetMode": "fixture",
  "decisionStatus": "not_for_formal_decision",
  "generatedAt": "2030-01-01T00:00:00Z",
  "data": {}
}
```

约束：

- `datasetMode` 仅允许 `fixture`、`isolated_shadow`；V2-A 不允许 `formal`。
- 时间采用 UTC ISO 8601；业务 cutoff 使用 `YYYY-MM`。
- 金额以整数分返回，币种固定为 `CNY`；禁止二进制浮点金额。
- `decisionStatus` 仅允许 `research_only`、`not_for_formal_decision`。
- 作品身份使用系统标准作品 ID；API 不输出外部平台身份、原始网页、抓取正文或 provider 凭据。

错误响应：

```json
{
  "contractVersion": "m2.v2.api.v0.1",
  "error": {
    "code": "M2V2_RESULT_NOT_AVAILABLE",
    "message": "当前版本没有可展示结果。",
    "requestId": "synthetic-request-id"
  }
}
```

允许的错误码至少包括：

| 错误码 | HTTP | 语义 |
|---|---:|---|
| `M2V2_RESULT_NOT_AVAILABLE` | 404 | 没有当前或指定 cutoff 结果 |
| `M2V2_INVALID_FILTER` | 400 | 过滤或分页参数非法 |
| `M2V2_EVIDENCE_NOT_AUTHORIZED` | 403 | 请求越过聚合证据边界 |
| `M2V2_CONTRACT_VERSION_UNSUPPORTED` | 406 | 客户端请求不支持的契约版本 |
| `M2V2_DATASET_MODE_NOT_ALLOWED` | 409 | 试图把 fixture/shadow 当正式结果使用 |

## 3. 只读资源

所有 V2-A 端点仅允许 `GET`。禁止 `POST`、`PUT`、`PATCH`、`DELETE`，禁止通过产品 API 触发 provider 查询、证据抓取、模型训练、结果批准或发布。

### 3.1 组合概览

`GET /api/m2/v2/old-products/overview`

返回脱敏聚合：

- 结果作品数、abstained 数和比例；
- 点预测现金合计；
- Commercial Value / Trend 可用性分布；
- 风险等级分布；
- External Evidence Coverage；
- 五个 head 的方法、策略和状态版本；
- `B4` comparator 版本及 `not_for_formal_decision` 状态。

任何分组小于 10 个作品时必须抑制精确数量和可反推金额。

### 3.2 结果列表

`GET /api/m2/v2/old-products`

允许参数：

| 参数 | 语义 |
|---|---|
| `cutoffMonth` | 指定 cutoff，默认当前 shadow snapshot |
| `forecastStatus` | `served` / `abstained` |
| `valueStatus` | `unavailable` / `assessment_only` / `validated_for_shadow` |
| `trendStatus` | `unavailable` / `assessment_only` / `validated_for_shadow` |
| `trendLabel` | 仅在 status 非 unavailable 时允许 `rising` / `stable` / `declining` |
| `riskSeverity` | `low` / `medium` / `high` |
| `evidenceCoverage` | `none` / `partial` / `sufficient` |
| `page`、`pageSize` | 分页；`pageSize` 上限 100 |
| `sort` | 仅允许白名单字段及 `asc` / `desc` |

列表每项使用 `M2-v2-result.schema.json` 的同义子集。排序白名单：`pointForecastCents`、`commercialValue.score`、`commercialValue.rankPercentile`、`cutoffMonth`。null 永远排在数值之后，禁止把 null 当 0。

### 3.3 单作品当前结果

`GET /api/m2/v2/old-products/{standardWorkId}`

返回完整 `m2.v2.serving-result.v0.1`。scoreable/model/serving/abstention 字段属于状态审计元数据，不是额外预测值。Cash Forecast 的数值输出仍只有：

- 一个 `pointForecastCents`；
- `annualBreakdown`；
- `confidence`；
- `limitations`；
- `pointBasis`，仅作为现金来源审计元数据，不是第二个预测值；
- `excludesUncommittedFutureBuyout`。

不得输出内部 `rawModelPrediction`、内部 80% PI 端点、optimistic/pessimistic/high/base/low 或自动运营动作。

### 3.4 历史结果

`GET /api/m2/v2/old-products/{standardWorkId}/history`

返回不可变结果版本的摘要。每项必须带 cutoff、创建时间、结果/模型/证据 snapshot/策略版本和 decision status。历史记录不得被当前外部证据重算覆盖。

### 3.5 证据摘要

`GET /api/m2/v2/old-products/{standardWorkId}/evidence-summary`

只返回：

- 按 evidence type 的 claim 数；
- prediction-allowed / explanation-only / prohibited 数量；
- coverage level；
- 置信等级分布；
- unresolved contradiction 数；
- evidence snapshot 与策略版本；
- serving result 已引用的脱敏 evidence ID。

不返回 URL、完整网页文本、搜索 query、原始 excerpt、provider payload 或外部用户身份。

### 3.6 外部证据覆盖概览

`GET /api/m2/v2/evidence/coverage`

按 source class、evidence type、cutoff 月和 coverage level 返回脱敏聚合。小样本抑制规则与 overview 一致。该端点只说明覆盖，不等于证据被允许进入预测。

### 3.7 版本与状态

`GET /api/m2/v2/contracts`

返回 API、result schema、data policy、provider policy、source policy、confidence policy、value policy、trend definition、B4 comparator 和 evidence snapshot 的版本及状态。未冻结策略必须显式为 `null` / `pending`，不得伪造版本。

## 4. 关键业务语义

### 4.1 Pure buyout

cutoff 时没有可审计已承诺未来买断应收：

- `modelPredictionAvailable=false`；
- `businessServingEligible=false`；
- `abstained=true`；
- `pointForecastCents=null`；
- `annualBreakdown=[]`；
- `abstentionReason=uncommitted_future_buyout_not_forecastable`。

不得输出 0，不得使用 `buyoutMonthlyEquivalent`。

如果 cutoff 时有已确认未来买断应收，只按确认金额与预计入账时间计入；不推测额外买断。纯买断此时使用 `pointBasis=confirmed_receivable_only`，允许 `modelPredictionAvailable=false` 但合法 served，不能把确定现金冒充模型输出。已确认收款时间落在预测 horizon 之外时，horizon 点值可以为 0，且必须说明“已确认但在本预测窗口外”，这不是 abstention。

### 4.2 Buyout plus sales

预测各实销渠道未来现金之和，并加上 cutoff 已确认的未来买断应收；没有确认买断时仅预测实销，并设置 `excludesUncommittedFutureBuyout=true`。

### 4.3 Commercial Value 与 Trend

V2-A 未冻结价值真值、权重和趋势阈值。因此默认：

- Commercial Value `status=unavailable`、score/rank 为 null；
- Trend `status=unavailable`、`label=null`、`horizonMonths=null`；
- API 不得自行生成或用当前 rating 替代。

后续只有经版本化政策与独立验证后，状态才可进入 `assessment_only` 或 `validated_for_shadow`。

## 5. 一致性要求

- API、DB snapshot、canonical JSON 和 Excel 必须来自同一不可变 result ID。
- 年度拆分整数分合计必须严格等于 point forecast；不得扩大容差。
- `abstained=true` 时点值 null；`abstained=false` 时点值为非负整数分。
- evidence 引用必须属于结果绑定的 prospective snapshot，且 `max(availableAt, firstObservedAt, capturedAt) <= evidenceAsOfAt <= predictionLockedAt`；income data cutoff 与 evidence as-of 不得混用。
- unresolved contradiction 或低置信 claim 不得进入预测特征；只能按 data policy 降级或拒绝。
- 产品读请求不能直接访问互联网；外部数据只能由独立、受控、可审计的离线管道写入 immutable snapshot。

## 6. 后续实现前门禁

API 实现前必须具备：

1. provider/source/legal policy 已批准；
2. value truth/policy 与 trend definition 已冻结；
3. DB migration 获得单独授权；
4. fixture 契约测试覆盖 null/0、金额守恒、证据 as-of、冲突与隐私边界；
5. shadow 结果仍保持 `not_for_formal_decision`；
6. 未打开 final holdout，未进入 M3。
