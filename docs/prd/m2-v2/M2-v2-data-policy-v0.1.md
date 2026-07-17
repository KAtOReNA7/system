# M2 v2 数据使用政策 v0.1

## 结论

M2 v2 新增数据分为四类：必须自动获取、只允许权威系统导入、允许但隔离的人工评估数据、以及禁止人工输入/覆盖的数据。任何信息进入预测前还必须满足 as-of、来源、confidence、矛盾和用途五道门。

本政策优先保护 formal-cash、无泄漏和可审计边界。它不授权实际抓取、导入或数据库写入。

## 1. 用途枚举

每个数据字段或 evidence claim 必须声明：

- `prediction_allowed`：可以作为未来候选的特征；
- `explanation_only`：只能用于风险、limitation、post-hoc 分析或解释；
- `prohibited`：不得进入预测、解释或产品结果；
- `baseline_isolated`：只属于 Human baseline 评估域。

默认值为 `prohibited`。没有显式用途不得进入任何 head。

## 2. 必须自动获取的数据

下列数据不得要求用户逐作品手工补录：

| 数据角色 | 自动获取要求 | 最低审计字段 | 预测用途前置条件 |
|---|---|---|---|
| 来源发现 | 搜索/结构化 API | provider、query hash、URL、capturedAt | 来源策略允许 |
| 公开实体消歧 | 自动实体解析 | candidates、match score、rule/model version | confidence 达标 |
| 搜索/榜单/趋势指标 | 批量或事件触发 | metric、unit、period、availableAt | 历史值或 prospective snapshot |
| 改编/出版/获奖/公开事件 | 自动抽取 | eventTime、publishedAt、availableAt、source | 多源或权威来源 |
| 作者/IP/原作公开信息 | 自动抽取和消歧 | entity key、source、effective time | as-of 且身份确定 |
| source reliability | registry 自动解析 | registry version、score、policy | registry 已批准 |
| freshness | 规则计算 | capturedAt、validity window、rule version | score 达标 |
| contradiction | claim group 自动检测 | claimKey、conflicting IDs、status | 无 unresolved conflict |
| evidence snapshot | 自动物化 | snapshot ID、cutoff、item digests | immutable、完整 |
| provider 成本/失败 | 自动遥测 | call count、cost、latency、error class | 不作预测特征 |

自动获取失败时允许：

- B4-only fallback；
- confidence 下调；
- `explanation_only`；
- abstention。

禁止要求运营补录缺失外部数值来保持 coverage。

## 3. 只允许权威系统导入的数据

以下内部事实不能作为 V2 自由表单输入：

- 月度收入事实；
- standard work identity 和 merge mapping；
- 作者、分类、标签与权利基础信息；
- cutoff-as-of 买断/其他现金 commitment snapshot；
- confirmed amount、outstanding amount、expected posting month；
- truth-only settlement link；
- month completeness；
- result invalidation trigger。

这些数据必须来自已有 M1 治理或未来单独授权的权威数据角色。Human baseline 页面、evidence review 页面和 V2 API 都不得修改它们。

## 4. 禁止人工输入或覆盖的数据

### 4.1 生产预测数据

禁止手工填写或覆盖：

- 搜索热度、社交热度、榜单值和市场指数；
- 来源 URL、发布时间、availableAt、eventTime 或 capturedAt；
- 自动抽取的结构化 claim；
- entity match、source reliability、extraction、freshness confidence；
- contradiction status 和 prediction eligibility；
- forecast point、annual breakdown、confidence 和 limitation；
- Commercial Value score、rank、dimension score；
- Trend label；
- Risk severity；
- Explanation direction/strength；
- 模型特征、candidate selection、gate 或阈值；
- 历史 cutoff 状态快照；
- future buyout occurrence、probability、amount 或 timing；
- `buyoutMonthlyEquivalent` 到未来现金的映射。

### 4.2 人工 override

禁止：

- 直接把 low-confidence evidence 改成 high；
- 用人工备注解决同可信等级的来源冲突；
- 修改 availableAt 以进入历史 cutoff；
- 删除失败/abstained case 改善指标；
- 把 candidate/holdout 结果反馈到 eligibility、rubric、阈值或 provider 选择；
- 在 V2 中覆盖已确认 M1 基础数据。

如果发现事实错误，必须回到对应权威数据治理流程创建新版本，不能在 V2 result 上就地改值。

## 5. 允许但必须隔离的人工数据

| 人工数据 | 允许位置 | 允许用途 | 禁止用途 |
|---|---|---|---|
| Human point forecast | Human baseline batch | 人机比较 | 训练/生产特征 |
| Human trend/value judgment | Human baseline batch | agreement/benchmark | 生产 label 的事后改写 |
| reviewer confidence/limitations | Human baseline batch | calibration/qualitative audit | 系统 confidence override |
| source policy approval | governance registry | provider/source 许可 | 单作品预测 override |
| contradiction review note | review metadata | 审计与升级 | claim value 或 confidence 修改 |
| value/trend policy approval | versioned decision record | 冻结未来 policy | 看到结果后修改 |
| release approval | audit event | 正式门禁 | 改变历史指标 |

人工基准数据必须与生产 input snapshot 物理或逻辑隔离，并带 `baseline_isolated=true`。

## 6. 只能作为解释、风险或 post-hoc 的信息

| 信息 | 允许用途 | 禁止用途 |
|---|---|---|
| eligible time 晚于 evidenceAsOfAt 的外部证据 | 独立 post-hoc audit snapshot | 当时 result 的预测或解释 provenance |
| 当前 rights/shelf 无历史快照 | 当前风险、post-hoc slice | 历史 routing/eligibility/feature |
| unresolved contradiction | conflict risk/limitation | 预测、value、trend |
| low-confidence 外部 evidence | limitation、research gap | 预测特征 |
| 只有 search snippet 的证据 | source discovery 说明 | 独立事实或预测特征 |
| 有引用但未达阈值的 LLM summary | evidence summary/limitation | 预测特征 |
| 无引用 LLM 输出 | 不允许展示 | 任何用途 |
| `buyoutMonthlyEquivalent` | 历史价值、评级说明 | 未来现金、trend |
| uncommitted buyout surprise | 端到端 business gap、风险 | formal-cash WAPE target |
| operator review note | 审计记录 | 生产 feature/score |
| source/channel/current-state 分层 | post-hoc 报告 | 无 as-of snapshot 时的历史选择 |

## 7. 预测可用性判定

External claim 只有同时满足以下条件才可标记 `prediction_allowed`：

1. provider/source policy 允许；
2. entity match 正确；
3. `availableAtStatus=known` 且 `max(availableAt, firstObservedAt, capturedAt) <= evidenceAsOfAt <= predictionLockedAt`；
4. confidence overall ≥ 0.80；
5. confidence tier 为 medium/high；
6. contradiction status 为 none/resolved；
7. freshness 仍在 evidence type 的有效窗口；
8. schema validation 通过；
9. snapshot 在 prediction lock 前冻结；
10. feature manifest 在结果前预注册。

任一条件失败则降为 `explanation_only` 或 `prohibited`，不得自动放宽阈值。

## 8. Confidence 计算政策

External evidence confidence 由四个组件构成：

- `entityMatchConfidence`；
- `sourceReliability`；
- `extractionConfidence`；
- `freshnessScore`。

```text
overallConfidence = min(all required components)
```

使用最小值而非平均值，避免一个高分掩盖身份、来源、抽取或时效中的低分。

初始 tier：

- high：overall ≥ 0.90；
- medium：0.80 ≤ overall < 0.90；
- low：overall < 0.80；
- unavailable：组件缺失。

这些阈值用于 V2-A contract validation；若 evidence pilot 要调整，必须在查看模型 uplift 前发布新 policy version。

## 9. 数据保留和隐私

- 不保存网页全文或长摘录；
- 只保存结构化 facts、source locator、digests 和许可允许的最小短摘录引用；
- 受限 snapshot 不进入 Git；
- provider credential 不进入 evidence 表、日志、API 或导出；
- retention 由 source terms class 和未来法律评审决定；
- public/deidentified reports 不含 work、author、channel、URL、raw rows；
- 小于 10 的 cohort 做抑制或合并。

## 10. Fail-closed

遇到以下情况必须停止使用对应 evidence：

- 来源条款未知；
- availableAt 不可证明；
- entity resolution ambiguous；
- confidence 组件缺失；
- contradiction unresolved；
- content digest 或 schema 不匹配；
- provider 返回内容与记录类型不符；
- snapshot 在 cutoff 后被回填；
- 人工 override 被检测；
- private/raw content 进入公开产物。

Fail-closed 不影响 B4 comparator/fallback，但会降低 evidence coverage，并必须被报告。
