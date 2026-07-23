# M2 Forecast Intelligence v2 PRD v0.1

## 技术摘要

M2 v2 将老品评估从单一未来现金判断扩展为五个彼此独立验收的 intelligence heads：Cash Forecast、Commercial Value、Trend、Risk 和 Explanation。B4 继续作为 cash comparator/fallback；V2-A 不修改 B4，也不训练候选。

正式现金语义保持不变：只预测未来实销现金与 cutoff 时已确认、可审计的未来应收。Commercial Value 不是现金改名，Trend 不复用生命周期标签充当 truth，Risk 与 Explanation 不输出运营动作。External Evidence 必须自动、可追踪、as-of；Human baseline 只用于有限评估，不能成为生产特征。

## 1. 文档状态与适用范围

- 文档版本：`m2-forecast-intelligence-v2-prd-v0.1`
- 状态：`V2_A_ARCHITECTURE_CONTRACT_READY_FOR_REVIEW`
- 决策状态：`not_for_formal_decision`
- 适用范围：V2 产品目标、输出合同、数据政策、评价体系和阶段门禁
- 不适用：模型训练、算法选择、migration、运行时、正式发布

本 PRD 基于：

- `docs/analysis/m2-v2/M2-v2-current-system-audit.md`；
- `docs/analysis/m2-v2/M2-v2-final-recommendation.md`；
- `docs/analysis/m2-real-data/M2-formal-cash-forecast-target-decision-v1.md`；
- 当前 calibration specs 与 C1–C3 terminal evidence。

## 2. 产品定位

M2 v2 是内部老品商业智能评估系统。它回答五个不同问题：

1. 未来可预测账单现金是多少；
2. 在当前可审计信息下，作品的相对商业价值如何；
3. 未来销售现金方向是上升、稳定还是下降；
4. 哪些事实、数据缺口或不确定性可能影响判断；
5. 哪些内部与外部证据驱动了上述判断。

系统不替代财务系统，不预测未承诺买断，不自动给出运营动作，不让 LLM 直接预测收入。

## 3. 权威范围与当前基线

当前权威数据范围仍为：

- 3,053 部标准作品；
- 192,872 条收入事实；
- 192,869 条完整月收入事实。

当前 B4 formal-cash 指标只作为 V2 comparator evidence，不作为发布批准。C1、legacy C2-R、C2-R.1、C2 和 C3 的 FAIL 保持不变；Gate A–D 的基础设施 PASS 不等于模型 PASS。

## 4. 五个产品目标

### 4.1 Cash Forecast

`REQ-M2V2-CASH-001`：

```text
futureCashRevenueForecast
= futureSalesCashForecast
+ cutoffConfirmedFutureReceivables
```

允许：

- 未来实销现金；
- cutoff 时已签署/确认、金额与预计入账时间可审计的买断应收；
- cutoff 时已确认金额和预计入账时间的其他现金。

禁止：

- 未签署未来买断；
- 历史周期猜测；
- 买断概率乘预计金额；
- 已到账买断款未来摊销；
- `buyoutMonthlyEquivalent`。

产品只输出：

- 一个 point forecast；
- 年度拆分；
- confidence；
- limitations。

内部 80% PI 只用于 coverage/WIS，不输出端点。纯买断无 cutoff 承诺时必须 null abstain，不能输出 0。

### 4.2 Commercial Value

`REQ-M2V2-VALUE-001`：Commercial Value 是组合内的多维相对评估，不是第二个现金预测。

输出合同：

- `status`：`unavailable`、`assessment_only`、`validated_for_shadow`；
- `score`：0–100；policy/truth definition 未批准时必须 null。批准后可生成 `assessment_only` score，但只有完成未来验证后才能标记 `validated_for_shadow`；
- `rankPercentile`：同一 cutoff、同一 scope 内的百分位；
- `dimensionScores`；
- `confidence`；
- `limitations`；
- `policyVersion` 与 `truthDefinitionVersion`。

V2-A 冻结的维度名称：

- `cash_outlook`：formal-cash 结果及可服务状态；
- `persistence`：收入持续性与稀疏性；
- `demand_momentum`：合格外部需求证据；
- `rights_usability`：cutoff-as-of 权利可用性；
- `evidence_strength`：证据覆盖、时效与一致性；
- `risk_adjustment`：事实型风险扣减。

V2-A 不冻结维度权重，也不生成当前 score。未来 policy 必须满足：

- 只要 status 不是 `unavailable`，六个冻结维度必须各出现一次、均为数值并具有 typed provenance；禁止空维度、重复 code 或无证据总分；
- 权重、缺失处理和 rank cohort 在任何结果前批准并提交；
- 权重和为 1；
- 同一证据不得同时定义 truth 与作为模型输入；
- 可学习 value target 必须来自独立未来 outcome 或独立采集、预先冻结的业务 rubric；
- 未批准 policy 时 `score=null`、`status=unavailable`。

### 4.3 Trend

`REQ-M2V2-TREND-001`：Trend 是对 forecastable sales cash 方向的独立判断。

输出：

- `status`：`unavailable`、`assessment_only`、`validated_for_shadow`；
- `label`：policy 已批准时为 `rising`、`stable`、`declining`，否则为 `null`；
- `horizonMonths`：definition 已批准时为正整数，否则为 `null`；
- `unavailabilityReason` 与 `limitations`；
- `confidence`；
- `evidenceRefs`；
- `trendDefinitionVersion`。

边界：

- commitment lump sum 和 surprise buyout 不定义销售趋势；
- lifecycle 可作为输入或解释，但不能直接充当 trend actual；
- truth 需使用完整 future sales window，并在 prediction lock 后构建；
- trend index、绝对金额 floor 和分类阈值必须在 V2-D 算法实验前独立批准，不得用候选结果或 final holdout 调整；
- 未有批准 definition 时输出 `status=unavailable`、`label=null`、`horizonMonths=null`，不伪造标签。

### 4.4 Risk

`REQ-M2V2-RISK-001`：Risk 只描述可审计风险和缺口。

每项包含：

- `riskId`；
- `riskCode`；
- `severity`；
- `affectedHead`；
- `evidenceRefs`；
- `rationale`；
- `limitation`。

最小类型：

- commitment missing；
- evidence missing/stale/conflicting；
- entity resolution uncertain；
- sparse/intermittent/dormant；
- unusual spike unresolved；
- future channel not represented；
- rights/shelf snapshot unavailable；
- extrapolated beyond evidence；
- model confidence low。

Risk 不得包含 promotion、pricing、renewal、downlisting、repackaging、resource allocation 或其他运营建议。

### 4.5 Explanation

`REQ-M2V2-EXPLAIN-001`：Explanation 必须把结论与证据联系起来，但不得把相关性包装成因果。

每个 driver 包含：

- `driverId`；
- `driverType`：`internal_fact`、`external_evidence`、`model_attribution`、`policy_rule`；
- `direction`：`up`、`down`、`neutral`、`uncertain`；
- `strengthBand`：`weak`、`medium`、`strong`、`unknown`；
- `affectedHead`；
- `evidenceRefs`；
- `asOf`；
- `text`；
- `limitations`。

Risk、Explanation、Trend 与 Commercial Value dimension 的 provenance 必须使用 typed ref 定位到 external evidence、internal snapshot、policy rule 或 model attribution；prediction lock 后 truth 只能进入独立 evaluation audit。

没有合格 evidence 时必须说明缺口，不能由 LLM 补写事实。

## 5. 五个 head 的互斥关系

| 项目 | Cash | Value | Trend | Risk | Explanation |
|---|---|---|---|---|---|
| 未承诺未来买断 | 禁止 | 可作为不确定性，不计现金 | 不进入 sales trend | 风险/limitation | 说明排除原因 |
| buyoutMonthlyEquivalent | 禁止 | 仅历史价值维度，显式标记 | 禁止 | 可提示口径 | rating/history explanation only |
| cutoff 后外部证据 | 禁止 | 禁止进入当时 score | 禁止 | 可在事后审计披露 | post-hoc only |
| current rights/shelf 无历史快照 | 禁止作历史特征 | 禁止作历史 value feature | 禁止 | post-hoc risk | post-hoc explanation |
| unresolved contradiction | 禁止 | 禁止 | 禁止 | 必须披露 | explanation-only |
| Human baseline 预测 | 禁止 | 禁止 | 禁止 | 禁止 | 仅评估报告 |

## 6. 状态分离

以下状态不能再合并：

- `statisticallyScoreable`：是否可参与回测；
- `modelPredictionAvailable`：模型是否产生 raw point；
- `businessServingEligible`：产品是否允许展示；
- `abstained`：是否不展示数值；
- `abstentionReason`：不展示原因；
- `decisionStatus`：研究、shadow 或正式决策状态；
- `resultStatus`：current、historical、invalidated。

产品 API/export 只展示合法 served point；raw model point 仅属于未来受控审计面，不进入产品合同。

## 7. External Evidence 目标

`REQ-M2V2-EVIDENCE-001`：External Evidence Layer 是独立 evidence plane，不直接写现金预测。

必须支持：

- 自动 provider 获取；
- 实体消歧；
- 相互独立的 `eventTime/publishedAt/availableAt/capturedAt`；
- 相互独立的 `incomeDataCutoffAt/evidenceAsOfAt/predictionLockedAt`，当前采集不得回填历史 development cutoff；
- 结构化 claim；
- source reliability、entity match、extraction、freshness confidence；
- contradiction group；
- `prediction_allowed/explanation_only/prohibited`；
- immutable snapshot；
- provider failure 与 B4 fallback。

详细合同见 `docs/technical-design/m2-v2/M2-v2-external-evidence-layer-v0.1.md`。

## 8. Human Baseline 目标

`REQ-M2V2-HUMAN-001`：Human baseline 用于回答人类、B4 与未来 V2 candidate 在相同信息集下的相对表现。

最低要求：

- 120–200 个不同 `work × origin` block；
- 每个 block 覆盖适用 horizons；
- 2–3 reviewer；
- 同 cutoff、同证据、同 actual；
- reviewer 不得看到 B4、candidate 或 future actual；
- internal-only 与 internal+external packet 随机分配；
- work × origin paired block-bootstrap；
- 报告单人、共识、B4、未来 candidate、abstention 和耗时。

详细合同见 `M2-v2-human-baseline-prd-v0.1.md`。

## 9. 产品输出

`ForecastIntelligenceResultV2` 包含：

```text
forecast
commercialValue
trend
risks[]
explanation[]
evidenceSummary
governance
```

禁止字段：

- optimistic/pessimistic/high/base/low；
- PI endpoints；
- operatingSuggestion/primarySuggestion/resourceInvestment；
- raw webpage/full text；
- rawModelPrediction；
- 未承诺未来买断金额或概率。

## 10. 评价体系

### Cash

- WAPE、MAE、SMAPE；
- signed aggregate bias；
- 3/6/12/18/24 月；
- 36/60 月 audit-only；
- high-value、revenue model、activity、evidence coverage 分层；
- paired work × origin block-bootstrap；
- 内部 80% coverage/WIS。

### Commercial Value

- Spearman、Kendall；
- NDCG@K；
- TopK precision/recall；
- value capture；
- rank stability；
- score calibration 与 dimension monotonicity。

### Trend

- macro-F1；
- balanced accuracy；
- per-class precision/recall；
- confusion matrix；
- transition stability。

### Risk/Explanation

- evidence coverage；
- unsupported claim rate；
- evidence-link validity；
- contradiction disclosure recall；
- explanation repeatability；
- prohibited-action count = 0。

### External Evidence

- work/type/as-of eligible coverage；
- entity resolution success；
- authoritative/fresh source share；
- contradiction/unresolved rate；
- provider failure/fallback rate；
- median query/page/token cost；
- evidence-to-feature conversion；
- pre-registered incremental value。

## 11. API、DB 与 export

V2 使用新的 versioned contracts，不复用旧三情景字段作为新语义：

- API：`docs/technical-design/m2-v2/M2-v2-api-contract-v0.1.md`；
- DB：`docs/technical-design/m2-v2/M2-v2-db-contract-v0.1.md`；
- export：`docs/technical-design/m2-v2/M2-v2-export-contract-v0.1.md`；
- result JSON Schema：`docs/technical-design/m2-v2/M2-v2-result.schema.json`。

V2-A 不实施上述合同。

## 12. 非功能要求

- as-of：任何预测特征必须在 cutoff 可得；
- immutable：evidence、snapshot、result 不覆盖更新；
- money：以整数分保存和精确对账；
- reproducibility：provider/query/prompt/model/policy/schema 版本齐全；
- privacy：不提交 private 输入、原始账单、网页全文、证书或凭据；
- resilience：外部层失败不破坏 B4-only 路径；
- cost：按 cohort、缓存和预算控制；
- safety：无登录、付费、互动、发布或自动运营动作；
- traceability：REQ → design → planned test → gate。

## 13. V2 阶段门禁

### V2-A：Architecture contract

完成条件：本轮用户指定的 PRD、evidence、human baseline、API/DB/export 和数据策略文档齐全、互相一致、可机器解析。

V2-A 文档本身不等于：

- provider/source/legal approved；
- V2-B authorized；
- value/trend policy approved；
- model authorized；
- formal decision/release。

后续用户指令可以独立授权下一阶段而不改变上述 V2-A authority。2026-07-17 指令曾授权在 V2-A checkpoint 合入并确认 main CI 后启动 V2-B，记录见 decision register DEC-011；该授权已经执行并被 V2-B.2–B.8 与后续完整性修复 supersede，仅作历史追溯，**不构成当前 provider、resume、Canary 或新开发授权**。当前只以 current-state-index-v0.2 与用户最新明确指令为准。

### V2-B：Evidence pilot

已获独立授权：100–200 部分层作品只测试覆盖、消歧、时效、矛盾、成本和复现，不训练模型。该授权不延伸到 V2-C/V2-D、C4、final holdout、release 或 M3。

### V2-C：Prospective shadow

未来单独授权后积累多个 origin 的 as-of snapshots，运行 Human baseline，不影响正式结果。

### V2-D：Algorithm experiment

必须另行预注册并授权；V2-A 不定义 C4，也不训练任何模型。

### V2-E：Formal decision

必须完成全部 gates、final holdout、中文抽检和用户明确批准。

## 14. 明确非目标

- 不写业务代码；
- 不写 migration；
- 不训练模型；
- 不开发 C4；
- 不修改 B4；
- 不修改当前正式结果；
- 不打开 final holdout、embargo 或 60-month labels；
- 不 release；
- 不进入 M3。

## 15. V2-A 已知未决项

以下问题必须在 V2-B 前由单独决策解决，不能由实现者自行假设：

- provider 清单、商业条款和法律批准；
- source reliability registry 的批准人和变更流程；
- Commercial Value 权重、缺失维度处理与 rank cohort；
- Trend truth 的 index、floor 和分类阈值；
- evidence freshness windows；
- pilot 成本上限和停止条件；
- Human baseline power simulation 后的最终 block 数。
