# M2 Forecast Intelligence v2 导出契约 v0.1

## 1. 状态与用途

- 状态：`V2_A_ARCHITECTURE_CONTRACT_READY_FOR_REVIEW`
- 契约版本：`m2.v2.export.v0.1`
- canonical payload：`m2.v2.serving-result.v0.1`
- 当前只允许合成 fixture 或隔离 shadow 导出，统一标记 `not_for_formal_decision`。
- 本文件不生成导出、不授权 release，也不改变现有 prepared/export 结果。

导出与 API、DB 必须投影同一个不可变 `result_id`。Excel 是 canonical JSON 的中文业务视图，不是第二套算法或口径。

## 2. 允许的导出类型

| 类型 | 用途 | 身份粒度 | 状态 |
|---|---|---|---|
| Canonical JSON | 自动契约校验、受控 shadow review | 标准作品 ID | 允许设计 |
| 中文 Excel | 业务抽检 | 标准作品 ID；不含外部平台身份 | 允许设计 |
| 脱敏聚合 JSON/Markdown | 技术/决策报告 | 无作品、渠道或 reviewer 身份 | 允许设计 |
| External raw evidence dump | 无 | 原文/URL/payload | 禁止 |

## 3. Canonical JSON

每个作品结果必须通过 `M2-v2-result.schema.json`。批量封套：

```json
{
  "exportContractVersion": "m2.v2.export.v0.1",
  "resultSchemaVersion": "m2.v2.serving-result.v0.1",
  "datasetMode": "isolated_shadow",
  "decisionStatus": "not_for_formal_decision",
  "cutoffMonth": "2030-01",
  "generatedAt": "2030-02-01T00:00:00Z",
  "manifestDigest": "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  "results": []
}
```

JSON 中不得出现内部 raw prediction、PI endpoint、网页正文、完整 URL、搜索 query、provider payload、凭据或 reviewer 身份。

## 4. 中文 Excel 工作簿

### 4.1 `评估结果`

| 列 | 语义 |
|---|---|
| 标准作品ID | 权威内部 ID |
| 截止月份 | `YYYY-MM` |
| 结果状态 | current / historical / invalidated |
| 决策状态 | 固定 not_for_formal_decision |
| 是否可展示现金预测 | businessServingEligible |
| 是否弃权 | abstained |
| 弃权原因 | 弃权时必填；未弃权时留空 |
| 点值依据 | sales_model / sales_model_plus_confirmed_receivable / confirmed_receivable_only；不是第二个预测值 |
| 未来现金点预测_元 | point cents 转两位小数；null 留空 |
| 币种 | CNY |
| 现金预测置信度 | high / medium / low / unavailable |
| 现金预测限制 | 事实型 limitation，多值分隔 |
| 是否排除未承诺未来买断 | boolean |
| 商业价值状态 | unavailable / assessment_only / validated_for_shadow |
| 商业价值分数 | 0–100；unavailable 留空 |
| 商业价值百分位 | 0–100%；unavailable 留空 |
| 趋势状态 | 同 result schema |
| 趋势判断 | 上升/稳定/下降；unavailable 时留空 |
| 趋势不可用原因 | unavailable 时必填受控原因，其他状态留空 |
| 趋势置信度 | 同 result schema |
| 外部证据覆盖 | none / partial / sufficient |
| 未解决冲突数 | 非负整数 |
| 结果ID | API/DB 对账键 |

### 4.2 `年度现金拆分`

列：标准作品 ID、结果 ID、cutoff 月、自然年、预测金额_元、币种。一个 served result 每年一行；abstained result 不产生行。整数分合计必须严格等于点预测。

### 4.3 `价值与趋势`

列：标准作品 ID、结果 ID、价值状态、价值方法、价值总分、价值百分位、六个维度分、价值 policy/truth version、趋势状态、趋势标签、趋势 horizon、趋势定义版本、对应置信度与限制。

V2-A 未冻结 policy 时，价值分和趋势 label/horizon 必须留空，status=unavailable 并给受控原因；禁止用 rating-standard-v3/v4 或人工印象代填。

### 4.4 `风险与解释`

一条 risk/driver 一行：标准作品 ID、结果 ID、记录类型、受影响 head、风险等级或方向、强度档、as-of、事实说明、限制、脱敏 evidence ref。不得包含运营动作、资源投入建议或“应买/应推”等结论。

### 4.5 `证据覆盖`

该 sheet 是从 sealed evidence snapshot 与 result typed provenance 派生的 batch projection，不是单条 serving-result payload 的额外字段。仅输出摘要：标准作品 ID、result/snapshot ID、evidence type、claim 数、prediction-allowed 数、explanation-only 数、置信等级分布、冲突状态、coverage level、provider/source/confidence policy version。projection 必须与 canonical result 中 evidenceSummary 的 totals 严格对账。

不得输出 source locator、网页标题/正文、query、完整 excerpt、provider payload 或外部用户身份。

### 4.6 `口径与版本`

至少记录：

- formal cash target 定义；
- pure-buyout null/0 规则；
- Commercial Value 与 Trend 状态说明；
- B4 comparator、model、result schema、API/export/data/evidence/value/trend policy 版本；
- evidence snapshot ID/digest；
- generated time、dataset mode、decision status；
- final holdout sealed；
- `not_for_formal_decision`、未 release、未进入 M3。

## 5. 金额与 null 语义

1. 内部/JSON 用整数分；Excel 仅显示为两位小数元。
2. 所有对账在整数分上精确相等，不用浮点容差。
3. pure-buyout 无 cutoff 承诺时，点预测单元格留空、年度无行、confidence=unavailable，并输出 `uncommitted_future_buyout_not_forecastable`。
4. 不得将空值渲染为 `0.00`、`-` 后再被下游解析为 0。
5. cutoff 已确认现金落在 horizon 外时，horizon 点值可以为 `0.00`，必须有 limitation；这不是 abstention。
6. buyout plus sales 无已确认买断时只导出实销预测，并标明排除未承诺未来买断。

## 6. 明确禁止字段

- optimistic / pessimistic / high / base / low；
- 对外 80% PI 下限/上限；
- rawModelPrediction；
- future buyout probability、预计未承诺买断金额；
- buyoutMonthlyEquivalent 作为 future cash；
- 自动运营建议、资源投入动作、release/approval 字段；
- external raw content、完整 URL、provider request/response、cookie、token；
- private 文件路径、真实人工 reviewer 身份、人工自由文本原稿。

`buyoutMonthlyEquivalent` 如未来需在评级说明导出，必须位于独立历史价值上下文列，并同时展示 `ratingContextOnly=true`、`historicalValueOnly=true`、`notCashForecast=true`、`notIncludedInFutureCashRevenue=true`；默认不在 V2 主结果表出现。

## 7. 脱敏聚合报告

- 不含作品、渠道、provider record 或 reviewer 标识；
- 小于 10 个作品的分层抑制精确数量与收入；
- 展示 evidence coverage、missingness、contradiction、abstention 和模型指标时必须给清晰分母；
- total ledger 业务差额不得命名为 point forecast WAPE；
- 只可报告内部 PI 的 aggregate coverage/WIS，不得披露单作品端点。

## 8. 导出 manifest 与验收

每次导出必须有 sidecar manifest：文件名、字节数、SHA-256、result count、cutoff、contract/schema/policy/snapshot/model/B4 版本、dataset mode、decision status、created at。

自动验收必须覆盖：

- JSON schema；
- JSON/API/DB/Excel result ID 与值一致；
- 年度金额守恒；
- abstention null 与数值 0 区分；
- 禁止字段和 private pattern 扫描；
- evidence ref 属于冻结 snapshot；
- work/channel/provider/reviewer 小样本脱敏；
- workbook 中每个数值列类型稳定；
- `not_for_formal_decision` 和版本 sheet 存在。

任何一项失败必须阻止生成可分发 export；不得通过删除 limitation、填 0 或放宽金额容差绕过。
