# M2 v2 PRD Gap Analysis 与候选 PRD

## 结论

当前 M2 PRD 的防泄漏、formal-cash、回测和发布治理并不弱；真正缺口是产品目标仍把“未来现金预测、评级、趋势、解释和风险”放在一个松耦合评估结果中，却没有为商业价值、趋势、排序、人工基准和外部证据建立独立 truth 与验收合同。

建议启动 M2 Forecast Intelligence v2 的 PRD/研究阶段，将系统升级为“以 B4 现金锚点为基础的老品商业智能评估系统”。升级不改变当前 formal-cash target，也不自动取代 B4；它新增独立的 trend、commercial value、evidence、explanation 和 risk heads，并要求每项能力分别验收。

## 当前 PRD 的真实目标

当前权威范围是内部老品评估，目标包括：

- 历史收入分析；
- 生命周期识别；
- 未来账单现金预测；
- 评级；
- 风险；
- 事实型复核提示；
- 版本与回测。

正式现金只包括未来实销和 cutoff 时已确认应收。产品外发只有单点、年度拆分、confidence 和 limitations；内部 PI 不外发；自动运营建议已移除。

因此当前目标不是“仅有一个 WAPE 指标的预测函数”，但也还没有形成可验收的商业价值智能产品。

## Gap 清单

### G1：商业价值没有独立 target

总体 PRD 提到“当前价值”和评级，但没有：

- commercial value 的业务定义；
- truth/label 的形成时间和窗口；
- 与未来现金、历史价值、版权、热度的关系；
- 回测、排序和校准指标。

不能把现有评级改名为商业价值，也不能把不可预测买断塞回 cash target。

### G2：趋势有字段，没有准确率合同

现有 growth/stable/declining/long_tail/inactive/rebound 更接近生命周期解释。缺少 trend actual window、阈值、类别不平衡处理、macro-F1/balanced accuracy 和状态切换稳定性。

### G3：缺少排序指标

现有 Top1/5/10 是 served/scoreable 收入覆盖，不是“是否找对最有价值作品”。缺少 Spearman/Kendall、NDCG、TopK precision/recall 和排序稳定性。

### G4：没有 Human-vs-AI baseline

现有中文抽检是 release gate，不是同 cutoff 的人工数值预测。缺少盲测抽样、人工输出合同、inter-rater agreement、耗时和人机 paired comparison。

### G5：解释没有统一驱动 schema

已有 rating rationale、risk 和 limitations，但缺少 driver direction、contribution、evidence IDs、availableAt、faithfulness、重复稳定性和无证据 fail-closed。

### G6：外部信息意图未进入当前数据合同

旧 M2 PRD提到外部热点和重大业务事件；当前模块化 M2 输入没有 external evidence role。M3 的 fixture-only evidence design 可作研究参考，但不能直接当作 M2 已有能力。

### G7：没有 External Evidence Coverage

缺少检索、消歧、来源、时效、矛盾、provider fallback、成本和增量价值指标。

### G8：复杂模型没有产品级采用门槛

现有统计 gate 较强，但缺少训练/推理成本、latency、刷新频率、依赖复现、模型 drift、证据 drift、fallback 和最低解释能力。

### G9：缺统一现行 technical contract

formal cash、单点、null abstention、无建议和 C3 FAIL 已冻结，但 API、页面、DB、export、测试设计仍存在旧三情景/建议字段。

### G10：M2 traceability 不完整

治理索引和 traceability 主要覆盖 M1，尚无完整的 M2 requirement → data → feature → model → API → test → report → decision 链。

## 陈旧与冲突矩阵

| 领域 | 陈旧状态 | 当前权威状态 | 风险 |
|---|---|---|---|
| 预测输出 | optimistic/base/pessimistic/range | 单 point + annual + confidence + limitations | 旧字段误外发 |
| 建议 | primary suggestion/operating suggestions | 只保留风险和事实提示 | 自动动作越界 |
| pure-buyout | 历史周期/月均等效 | 无承诺 null abstain | 违反现金目标 |
| 结果状态 | failed formal result | 失败尝试不生成正式结果 | 状态误发布 |
| C2/C3 状态 | 部分 PRD仍称未执行 | C2、C3 已执行且 FAIL | 决策追踪错误 |
| 数据范围 | 部分旧文档 3,054 | 权威 3,053/192,872 | 范围漂移 |
| API/DB/export | 旧三情景 schema | 尚缺 point-only runtime | 工程不可发布 |

## M2 Forecast Intelligence v2 候选 PRD

> 状态：研究草案，`not_for_formal_decision`。本节不修改当前正式合同，不授权 C4、训练、final holdout、release 或 M3。

### 1. 产品定位

M2 v2 是面向老品组合的内部商业智能评估系统。它在严格 formal-cash 预测之外，结构化呈现趋势、商业价值、驱动因素和风险，帮助用户理解“未来可能收多少钱、方向如何、相对价值如何、为什么、哪里不确定”。

系统不替代财务系统，不预测未承诺买断，不生成自动运营动作，不把 LLM 作为收入预测器。

### 2. 产品目标

#### V2-OBJ-1：Forecast

- 预测未来实销现金与 cutoff 已确认应收；
- 保持一个点值、年度拆分、confidence、limitations；
- B4 为 anchor/fallback；
- formal cash 与 total ledger business gap 分开报告。

#### V2-OBJ-2：Trend

- 输出上升/稳定/下降；
- lifecycle 可作为解释，但 trend 必须有独立 actual 和验收；
- 预测窗口与 cash horizon 对齐。

#### V2-OBJ-3：Value

- 输出商业价值评分与组合内排序；
- value 不是 cash 的改名，也不是未来未承诺买断；
- value truth 必须由独立的未来 outcome 或预先冻结、独立采集的业务 rubric 构成；外部需求证据可以作为 feature/解释，但同一证据不得同时定义 label 和充当模型输入。truth 窗口、rubric、权重与 feature exclusion 必须在 holdout 前由业务批准并冻结。

#### V2-OBJ-4：Explanation

- 输出主要驱动、方向、贡献级别和 evidence IDs；
- 区分内部收入证据与外部证据；
- 无可靠证据时明确 limitation。

#### V2-OBJ-5：Risk

- 输出不确定因素、数据缺口、异常、承诺缺失、外部证据冲突；
- 不输出资源投入或运营建议。

### 3. 输出合同

```text
ForecastIntelligenceResult
  forecast
    futureCashRevenueForecast
    annualBreakdown
    confidence
    limitations[]
  trend
    label: rising | stable | declining
    confidence
    evaluationWindow
  value
    score
    rankPercentile
    dimensionScores[]
    confidence
  explanation
    drivers[] {type, direction, strengthBand, evidenceIds, asOf}
  risk
    factors[] {type, severity, evidenceIds, limitation}
  evidence
    coverageSummary
    freshnessSummary
    contradictionSummary
  governance
    modelVersion
    evidenceSnapshotVersion
    cutoff
    decisionStatus
```

禁止 optimistic/pessimistic/high/base/low、PI endpoints、未承诺买断、LLM 直接现金值和自动运营动作。

### 4. 数据需求

#### 必须自动获取

- 外部来源发现与 URL；
- 作者/IP/原作公开身份与消歧；
- 搜索/榜单/公开趋势的时点值；
- 改编、出版、获奖和公开事件；
- source reliability、freshness、availableAt 和 contradiction；
- evidence snapshots 与 provider metadata。

不得把常规逐作品人工填写设为运行前置条件。

#### 必须补建的内部数据角色

- cutoff-as-of 买断承诺快照；
- 已确认金额、确认时间、预计入账时间和证据状态；
- 历史分类/版权/货架快照，若要作为历史特征；
- trend actual 与 value label 版本。

#### 可选增强

- 许可明确的社交聚合；
- 更长的市场指数与类别景气；
- 公开评价和口碑；
- 同类作品/作者网络；
- 更细渠道公开信号。

### 5. 评价体系

#### 现金模型指标

- WAPE；
- signed aggregate bias；
- MAE、SMAPE；
- 3/6/12/18/24 月稳定性；
- 有历史时 36/60 月审计；
- high-value、source、revenue model、rights/shelf post-hoc 分层；
- work × origin paired block-bootstrap；
- 内部 80% coverage/WIS。

#### 排序与商业价值

- Spearman、Kendall；
- NDCG@K；
- TopK precision/recall；
- 组合价值 capture；
- 排序跨 origin 稳定性；
- score calibration 与分档单调性。

#### 趋势

- macro-F1；
- balanced accuracy；
- precision/recall by class；
- confusion matrix；
- transition stability。

#### 人工 baseline

- 同 cutoff、同 evidence、同 case keys；
- 120–200 个不同的回溯盲测 `work × origin` block，2–3 reviewer；每个 block 覆盖适用 horizons；
- 约 150 部 prospective shadow cohort；
- 比较 individual human、human median、B4、v2 candidate；
- 报告 inter-rater reliability 与耗时。

#### External Evidence Coverage

- work/type/as-of eligible coverage；
- entity resolution success；
- authoritative/fresh source share；
- contradiction/unresolved rate；
- provider failure/fallback；
- median cost；
- feature conversion 与预注册 incremental value。

### 6. 分层

必须报告：

- Top/high-value；
- ordinary；
- long-tail、intermittent、dormant；
- pure-sales、mixed、pure-buyout；
- statistically scoreable / served / abstained；
- 外部证据有/无与质量等级；
- current rights/shelf 仅 post-hoc，除非有 cutoff snapshot。

### 7. Human-vs-AI 规则

- reviewer 独立预测时隐藏 B4；
- 使用同一 evidence packet；
- 不给 cutoff 后信息；
- pure-buyout 可 abstain；
- 不只选最佳 reviewer；
- 预注册抽样与 block-bootstrap；
- 人工优于 B4 只有在 paired 指标支持时才可陈述。

### 8. 外部证据与 LLM 边界

- LLM 只能提取、消歧、评分证据和生成带来源解释；
- evidence 需 URL、observedAt、eventAt、availableAt、可靠性、时效和矛盾状态；
- `availableAt > cutoff` 不得进入历史特征；
- 整页和长文本不进入模型仓库；
- provider 故障时 fallback 到 B4，不伪造证据。

### 9. 非功能要求

- 可重复：依赖 lock、seed、线程和 artifact checksum；
- 可审计：query/model/prompt/provider/evidence versions；
- 隐私：不提交 private 输入、原始网页或身份明细；
- 成本：按 cohort 分层刷新和预算早停；
- 可用性：外部层故障不阻断 B4；
- 漂移：监控 evidence coverage、feature drift、prediction drift 和 route mix；
- 安全：来源 allowlist、限流、超时、circuit breaker、无登录/互动/发布。

### 10. Gate

#### Gate V2-A：PRD/contract readiness

- 现行 formal cash/point-only/无建议合同统一；
- evidence schema、source policy、legal review、cost cap；
- trend/value truth 定义；
- Human baseline 预注册。

#### Gate V2-B：evidence pilot

- 分层 100–200 部作品；
- 覆盖、消歧、时效、冲突、成本达到预设阈值；
- 无历史回填或 private 泄漏。

#### Gate V2-C：prospective shadow

- 稳定积累多个 origin 的 as-of snapshots；
- provider fallback 与 B4-only 模式通过；
- 不影响正式 serving。

#### Gate V2-D：algorithm experiment

- final holdout 前预注册候选、参数、features、seed 和 gate；
- internal-only/external-only/combined ablation；
- 简单模型优先；
- 所有 gate 全过才可进入业务抽检。

#### Gate V2-E：formal decision

- 中文业务抽检；
- Human-vs-AI 结果；
- final holdout 仅一次；
- 明确用户批准；
- API/DB/export point-only runtime 与端到端测试；
- 未经批准仍 `not_for_formal_decision`。

### 11. 明确非目标

- 不开发 C4；
- 不修改 B4 或当前结果；
- 不进入 M3；
- 不预测未承诺买断；
- 不让 LLM 直接预测现金；
- 不用人工常规补表替代自动获取；
- 不自动 release。

## PRD 变更优先级

1. 建立单一现行 M2 technical contract，标记旧三情景文档 superseded。
2. 将 formal cash decorator 下沉为不可绕过的 serving target contract。
3. 定义 trend/value truth 与指标，避免目标混合。
4. 建立 External Evidence schema、as-of snapshots 和 coverage gate。
5. 建立 Human-vs-AI baseline。
6. 建立 point-only DB/API/export 与集成测试。
7. 再决定是否授权候选训练。
