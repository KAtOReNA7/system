# M2 Forecast Intelligence v2 当前系统审计

## 结论摘要

当前 M2 已具备可信的数据底座、严格的无泄漏回测治理和可审计的正式现金目标，但尚不具备正式发布条件，也尚未形成完整的“老品商业智能评估系统”。B4 应继续作为确定性比较器和降级锚点，不能被表述为已上线模型：它未通过全部模型与业务覆盖门槛，而且当前代码库没有 B4 的正式 serving runtime，API、持久化和导出仍残留旧三情景合同。

本审计支持启动 M2 v2 的“研究、PRD 与 shadow evidence”阶段，但不支持直接进入 C4、训练新模型、打开 final holdout 或 release。升级重点不是简单替换 B4，而是把未来现金、趋势、商业价值、解释和风险拆成可独立验收的能力，并补建 cutoff-as-of 外部证据层。

## 审计范围与方法

- 审计日期：2026-07-17。
- Git 分支：`codex/m2-m2-finalization-v1`。
- 审计起始提交：`bffc28c69f45821231e9f43862cb7cf40c14b84a`。
- 起始状态：HEAD 与 upstream、`origin/main` 一致；工作区干净。
- 审计对象：M1/M2/M3 PRD、M2 technical design、API、页面、数据模型、calibration specs、B4 与 C1/C2-R/C2-R.1/C2/C3 实现及报告、数据角色、测试与 Git 状态。
- 方法：静态代码审计、合同与报告交叉核对、指标守恒核对、状态与实现追踪；未读取或输出 private 明细，未执行真实数据训练。

## 审计覆盖索引

| 类别 | 已检查的主要证据 |
|---|---|
| 根目录与治理 | `README.md`、`AGENTS.md`、`NEXT-CODEX-INSTRUCTION.md`、`docs/prd/README.md`、scope、document-status、traceability、decision-register |
| M1 数据 PRD | bill-import、data-quality、work-master-data、channel-master-data、classification-and-tags |
| M2 PRD | 旧 `05-老品评估.md`、算法校准、任务/导出、技术发布约束、当前 M2 PRD、common evaluation rules |
| M3 边界 | M3 restart v0.1/v0.2、external evidence、research assist、channel forecast、weighting、author ranking、comparable works；只审计可复用设计，未进入 M3 |
| 产品与技术合同 | M2 API 及 addendum、页面设计、数据模型、B1–B5/C0–C3/FR1–FR6 technical design、test plan |
| calibration specs | v1/v1.1/v1.2、formal-cash comparator、C1、legacy C2-R、C2-R.1、C2 reconciliation、C3 amendments |
| 成功与失败报告 | Gate A–D、B0b–B4 replay、C1 failure/root cause、legacy C2-R supersession、C2-R.1/C2/C3 validation 与 decision reports |
| 实现 | B4/calibration/formal-cash/C1–C3 Python、DB migrations、repository、fixture engine、package scripts |
| 测试与 Git | M2 contract/development tests、future perturbation、case-key、abstention、seals、privacy/no-real-data、分支/HEAD/upstream/worktree |

## 当前真实能力

### 业务能力

当前 M2 是内部老品评估系统，已经覆盖：

- 历史收入与渠道分析；
- 生命周期识别；
- 剩余预测期的未来账单现金点值；
- 评级与评级说明；
- 风险与事实型复核提示；
- 回测、版本、seals 和审计证据。

当前正式预测目标固定为：

```text
futureCashRevenueForecast
= futureSalesCashForecast
+ cutoffConfirmedFutureReceivables
```

未承诺未来买断、历史周期猜测、买断概率乘金额、已到账买断摊销和 `buyoutMonthlyEquivalent` 均不得进入未来现金。纯买断在 cutoff 时没有可审计承诺时，必须返回 null abstention，不能用 0 冒充预测。

### 正式输出边界

产品/API/Excel/正式导出只允许输出：

- 一个未来现金 point forecast；
- 与点值对账的年度拆分；
- confidence；
- limitations；
- 生命周期、评级、风险和事实型复核提示。

内部 80% 区间只用于 coverage、WIS 与过度自信审计，不得外发区间端点。自动运营建议和资源投入动作不属于当前正式输出。

### 权威数据与回测人口

| 范围 | 数量 | 审计含义 |
|---|---:|---|
| 标准作品 | 3,053 | 权威作品范围 |
| 收入事实 | 192,872 | 权威账单事实 |
| 完整月收入事实 | 192,869 | 截至 2026-04 的完整月事实 |
| development case universe | 18,615 | 冻结的开发回测 case |
| statistically scoreable case | 12,223 | 具备历史与完整 actual window |
| statistically scoreable works | 1,044 | 可参与模型质量评估 |
| formal-cash model cases | 7,851 | 正式现金模型共同人口 |
| formal-cash model works | 824 | B4/C2-R.1/C2/C3 可比作品 |

没有独立、可审计的历史买断承诺快照或结算关联，因此后来发生的买断不能事后回填成 cutoff 时已知承诺。这是 formal-cash 覆盖的硬数据边界，不是可通过放宽 gate 消除的模型问题。

## 模型路线与当前结果

| 路线 | 目标口径 | WAPE | signed bias | 验收结果 | 可解释结论 |
|---|---|---:|---:|---|---|
| B4 | formal cash | 55.6485% | +8.9111% | comparator；未全过 gate | 最强冻结比较器，不是可发布模型 |
| C1 | historical target | 385.0157% | +351.1370% | 5/19，FAIL | 冻结 transparent ensemble/fallback 对稀疏序列失效 |
| legacy C2-R | legacy buyout target | 117.96% | +79.26% | FAIL | 目标已废弃，不具 formal-cash 指标资格 |
| C2-R.1 | formal cash | 58.3824% | +2.9338% | 13/23，FAIL | 路由分治改善 bias，但未稳定超过 B4 |
| C2 | formal cash | 55.6955% | +9.2891% | 16/25，FAIL | 活跃度分层与经典间歇模型无稳定增益 |
| C3-A | formal cash | 55.3945% | +8.2739% | 15/25，FAIL | 内部聚合特征残差校正仅有约 0.46% 相对 WAPE 改善 |

B4 的关键不足仍可量化：

- 18 月 signed bias 为 +15.5063%，超过 ±15% 门槛；
- 高价值 signed bias 为 +12.0534%，超过 ±10% 门槛；
- 全库 forecastable cash coverage 为 73.9647%，低于 90%；
- Top10 forecastable cash coverage 为 75.9413%，低于 90%；
- C3 只在 2/5 origins 超过 B4，未形成稳定提升。

所有 final holdout、embargo shadow 和 deferred 60-month labels 仍 sealed；所有结果均为 `not_for_formal_decision`，未 release。

### 成功门禁与模型失败必须分开

| 门禁 | 结果 | 证明范围 | 不代表什么 |
|---|---:|---|---|
| Gate A | 13/13 PASS | comparator、case universe、seals、预注册和 C1 启动完整性 | 不代表 C1 模型通过 |
| Gate B | 14/14 PASS | formal-cash comparator 与 C2-R.1 启动完整性 | 不代表 C2-R.1 模型通过 |
| Gate C | 14/14 PASS | C2 spec、人口、seals 与 checkpoint 完整性 | 不代表 C2 模型通过 |
| Gate D | 14/14 PASS | C3 features、候选、人口、seals 与 checkpoint 完整性 | 不代表 C3 模型通过 |

这些 success reports 证明研究执行没有越过预注册与数据边界；随后 C1、C2-R.1、C2、C3 的 FAIL 是模型验收结论。工程门禁 PASS 与模型质量 PASS 不得合并叙述。

### 失败 gate 的可解释范围

- C1 是 historical-target 机制证据，不能与 formal-cash B4/C2/C3 指标直接比较。
- C2-R.1 只有 2/5 origins 超过 B4，短 horizon 与 TopK 提升未达门槛，内部区间校准亦未全过。
- C2 相对 B4 的 paired CI 包含 0；intermittent/dormant 子群仍弱，高价值保护大量回退 B4。
- C3 只有 2/5 origins 超过 B4，3/6/12 月改善均未达 3%，TopK 和 WIS 提升不足；C3-S 未取得 strictly-earlier activation 证据，因此 skipped。
- “同一内部信息集的小公式/硬分层/透明线性 residual 未产生稳定价值”是经验结论；“未来泄漏、未承诺买断、blocked→0”是合同禁止，二者不能混为一类。

## 当前技术架构

### B4 的真实身份

B4 位于本地校准脚本，而非 `src` 中的产品运行时。它由 `m2_calibration_v1_2.py` 通过 B0b 基础预测入口 materialize，再用 B4 公式变体覆盖身份。点预测核心为历史统计量的最大值，并施加生命周期因子和低收入 cap；各销售渠道独立预测后求和，月路径基本为平坦延展，horizon 近似线性缩放。

B4 主要使用 cutoff 前月收入、渠道、首个观察月、业务形态、生命周期和批次聚类。作者、分类、标签、作品身份、当前货架/版权状态和外部热度不是 B4 的预测特征；当前状态在缺少历史快照时只能 post-hoc 切片。

formal-cash 安全语义目前由第二层 decorator 实施。基础 v1.2 入口对纯买断仍可能先计算旧周期值，再由 formal-cash decorator 丢弃并置为 null。这种“可绕过的安全层”不适合作为未来 serving 架构；目标语义应下沉到不可绕过的核心合同。

### 正式 serving 缺口

当前正式持久化、API/页面和导出设计仍存在旧合同：

- migration 保留 base/optimistic/pessimistic/range 和 suggestion 表；
- export repository 仍查询并映射三情景字段；
- fixture engine 仍生成三情景；
- 页面与 API 文档仍包含 forecast range、primary suggestion 或 suggestions。

因此即使 B4 的 development 指标未来达到门槛，也不能在没有现行化 schema、API、export 和集成测试前 release。

## 数据结构审计

### 已具备

- 可对账的月度收入事实；
- 标准作品、作者、分类、标签、版权期限与状态；
- 渠道别名与收入模式；
- as-of 回测 case、origin、horizon、raw/served/abstention；
- 模型版本、gate、seal、digest 与审计收据；
- formal cash、surprise buyout、total ledger cash 三套 actual 守恒。

### 关键缺口

- cutoff-as-of 买断承诺快照与预计入账时间；
- 可回放的历史外部证据快照；
- 同名消歧、来源可靠性、event time 与 available time；
- 独立的趋势 truth、商业价值 truth 和 Human-vs-AI baseline；
- 现行 point-only serving schema；
- Python 模型依赖与运行时的可复现清单。

## 测试体系审计

### 强项

- as-of 与 future-perturbation invariance；
- case-key、actual、scoreability 和 prediction parity；
- raw prediction、served prediction、abstention、null 不等于 0；
- work × origin block bootstrap；
- prediction lock、digest、receipt 与 holdout seal；
- public artifact 脱敏和 no-real-data gate；
- formal cash 三 actual 守恒与整数分 reconciliation。

### 缺口

- CI 主要验证已提交报告和 synthetic fixtures，不重放本地 192,872 条 private 权威事实；
- 没有 B4 到正式 API/DB/export 的端到端 serving 集成测试；
- 没有真实承诺应收路径的集成样本；
- 没有趋势、排序、商业价值、解释忠实度或外部证据覆盖测试；
- 没有 external evidence as-of/freshness/contradiction/provider-fallback 测试；
- formal cash 基础层仍存在浮点 tolerance 与 C2 整数分合同不一致的历史实现边界；
- 仓库没有 Python 依赖 manifest，新算法库无法仅凭现有 Node lockfile 复现。

## PRD 与实现一致性

当前权威决策已经冻结 formal cash、单点输出、null abstention、无自动运营动作和 C3 FAIL，但部分早期文档/实现仍保留：

- 三情景预测；
- optimistic/pessimistic/range；
- primary suggestion 与 operating suggestions；
- 已废弃的 pure-buyout 周期/月均等效预测；
- C2/C3 尚未执行的陈旧状态；
- 旧 3,054 作品或早期数据缺口。

根目录交接文档也存在状态冲突：`AGENTS.md` 的部分历史段落仍写 C3 未开始，`NEXT-CODEX-INSTRUCTION.md` 仍要求停在 C3 前；当前权威 C3 validation/terminal reports 已确认 C3 完成且 FAIL。本轮不修改这些根目录文件，但后续交接前必须现行化，避免新电脑或新任务重复进入 C3。

这些冲突没有改变当前 seals，但会显著增加误实现与误发布风险。M2 v2 之前应先建立统一的现行 technical contract 和 requirement → schema → API → test → report 追踪矩阵。

## 发布就绪判断

| 条件 | 当前状态 |
|---|---|
| 模型质量 gate 全通过 | 否 |
| 业务覆盖 gate 全通过 | 否，CONDITIONAL |
| final holdout 已打开并通过 | 否，sealed |
| 中文业务抽检和明确批准 | 否 |
| 现行 point-only serving runtime | 否 |
| API/DB/export 与正式合同一致 | 否 |
| 正式 release | 否 |

结论：B4 不应进入正式发布。它应继续作为 M2 v2 的现金锚点、性能比较器和外部证据缺失时的安全 fallback。

## 审计限制

- 本轮是静态与已冻结报告审计，未读取 private 明细，未重新训练或重放真实数据。
- 仓库没有同 case-key 的人工数值预测，因此不能证明“人工比 B4 强”。
- 当前外部信息只存在需求意图或 M3 fixture-only 设计，没有 M2 历史 as-of 快照，不能估计真实增量提升。
- 本审计不构成法律意见；外部数据采集仍需来源条款、个人信息和版权专项评审。

## 主要证据

- `docs/prd/20-evaluation/M2-old-product-evaluation-prd-v0.1.md`
- `docs/analysis/m2-real-data/M2-formal-cash-forecast-target-decision-v1.md`
- `docs/analysis/m2-real-data/M2-formal-cash-comparator-replay-v1.md`
- `docs/analysis/m2-real-data/M2-C1-development-validation-v1.md`
- `docs/analysis/m2-real-data/M2-C2R1-development-validation-v1.md`
- `docs/analysis/m2-real-data/M2-C2-development-validation-v1.md`
- `docs/analysis/m2-real-data/M2-C3-development-validation-v1.md`
- `src/domain/oldProductEvaluation/calibrationSpec.c3.v1.amendment.json`
- `scripts/m2-real-data/m2_calibration_v1.py`
- `scripts/m2-real-data/m2_calibration_v1_2.py`
- `db/migrations/V0070_000__m2_evaluation_persistence.sql`
- `src/repositories/m2EvaluationExportRepository.js`
