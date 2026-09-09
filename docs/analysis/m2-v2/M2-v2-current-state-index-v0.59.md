# M2 当前状态索引 v0.59

截至 2026-08-02，本索引记录 PR #40 的阻断证据已安全集成，以及出版行业渠道直接现金
尺度条件金额模型 v0.1（Publishing-Scale Channel Direct-Cash Conditional Amount Model
v0.1，`M2-CHAN-PSC03`）在任何私有 outcome 前的预注册与公共实现状态。模型名称、别名、
角色、实验映射和评价人口以 `config/m2-model-registry.v1.json` 为唯一机器权威；业务门限
以 `config/m2-business-acceptance-contract.v1.json` 为唯一数值权威。

## 当前结论

| 对象 | 当前状态 | 含义 |
|---|---|---|
| 兼容性现行运行回退 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 仅为兼容性回退，没有新增当前范围性能支持 |
| 研究比较基线 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 只用于同案例研究比较，不是 production 晋升 |
| 冻结失败渠道模型 | 出版行业适配渠道月度核心（Publishing-Scale Channel Monthly Occurrence × Conditional Amount Core，`M2-CHAN-PSC01`） | 首个原始候选冻结失败；根因是估计器尺度收缩，未确认实现或比较器缺陷 |
| 已集成的阻断模型 | 出版行业渠道起点可见现金锚金额模型 v0.1（Publishing-Scale Channel Origin-Visible Cash-Anchor Amount Model v0.1，`M2-CHAN-PSC02`） | 历史重放被不可恢复的源权威阻断，真实执行器不完整，没有模型性能证据 |
| 当前预注册开发模型 | 出版行业渠道直接现金尺度条件金额模型 v0.1（`M2-CHAN-PSC03`） | 公共数学核心与 synthetic 完整路径通过；私有开发重放尚未执行 |
| 当前私有执行状态 | `NOT_EXECUTED_PRE_EXECUTION_EXACT_HEAD_CI_REQUIRED` | 必须先通过全部公共门禁、全新 clone 与 pre-execution exact-head 双平台 CI |
| 当前模型性能证据 | `NO_MODEL_PERFORMANCE_EVIDENCE` | 没有模型性能结果；没有 PSC03 私有候选预测、WAPE、FVA、bootstrap、门禁或科学结果 |
| 活动候选 | `activeCandidate=null` | 没有活动候选 |
| 自动化批准 | `approvedForAutomation=null` | 没有自动化批准 |
| production ready | `productionReady=false` | 没有生产权限 |
| final holdout | `finalHoldoutOpened=false` | 未打开 |
| 独立评价 | `independentEvaluationOpened=false` | 未打开 |
| later-origin | `laterOriginOpened=false` | 未打开 |

## PR #40 的集成边界

PR #40 只以“PSC02 历史重放被源权威阻断、没有模型性能证据”的身份通过 merge commit
集成。它没有把阻断升级为模型失败，也没有重跑、补完或激活 `M2-CHAN-PSC02`。以下事实
保持不变：

- 历史预注册稳定 ID `M2-PREREG-PSC02-ORIGIN-VISIBLE-CASH-ANCHOR-01` 和实验稳定 ID
  `M2-EXP-PUBLISHING-SCALE-CHANNEL-CASH-ANCHOR-02` 原样保留；
- 源权威状态为
  `PSC02_HISTORICAL_REPLAY_BLOCKED_NO_RECOVERABLE_ORIGIN_VISIBLE_CASH_AUTHORITY`；
- 执行状态为 `PSC02_EXECUTION_IMPLEMENTATION_INCOMPLETE_NO_CANDIDATE_RESULT`；
- `componentId`、`revisionId`、`effectiveAt`、`availableAt` 不可恢复，24 个冻结起点可
  合法重建的 snapshot 数为 0；
- 唯一历史预测前 attempt 的 `PSC02_DEVELOPMENT_NOT_SUPPORTED` 与 private receipt 原样
  保留，其身份仍是私有源权威阻断而非模型失败
  （`PRIVATE_SOURCE_AUTHORITY_BLOCKER_NOT_MODEL_FAILURE`）；没有 PSC02 拟合、真实预测、
  outer outcome、指标或 bootstrap；
- Model Registry 的 PSC02 `evaluations=[]`，模型性能证据仍为
  `NO_MODEL_PERFORMANCE_EVIDENCE`；没有模型性能结果。

## PSC03 模型、实验与实验臂

预注册稳定 ID 为 `M2-PREREG-PSC03-DIRECT-CASH-QUASI-POISSON-01`；模型稳定 ID 为
`M2-CHAN-PSC03`；唯一原始候选 ID 为 `M2-CHAN-PSC03-RAW`；父实验稳定 ID 为
`M2-EXP-PUBLISHING-SCALE-CHANNEL-DIRECT-CASH-03`。

| 中文名称 | 完整实验臂 ID | 身份 |
|---|---|---|
| 算术层级诊断（Arithmetic Hierarchy Only） | `M2-EXP-PUBLISHING-SCALE-CHANNEL-DIRECT-CASH-03/D0` | 只作尺度/层级机制诊断，不是候选或 fallback |
| 直接准 Gamma 层级诊断（Direct Quasi-Gamma Hierarchy） | `M2-EXP-PUBLISHING-SCALE-CHANNEL-DIRECT-CASH-03/D1` | 只作方差族诊断，不得替代主设计 |
| 直接准 Poisson 层级主设计（Direct Quasi-Poisson Hierarchy） | `M2-EXP-PUBLISHING-SCALE-CHANNEL-DIRECT-CASH-03/P` | 唯一原始候选，映射到 `M2-CHAN-PSC03-RAW` |

PSC03 只复用冻结且已证明 origin-visible 的 PSC01 人口、训练信息、18 个特征、basis、
occurrence、actual、origin、horizon、渠道结构与评价口径。月度预测人口继续是 3,318,819
行；primary 继续是 13 个起点、36 个月、12,039 个作品级 case、1,125 部作品；strict
继续是 11 个季度起点、3/6/12/18/24 个月、74,320 个作品级 case、2,650 部作品。

PSC02 的四个缺失字段和三行账本差异不属于 PSC03 输入或门禁；PSC03 不重建 PSC02
snapshot。taxonomy 仅报告（`REPORT_ONLY`），LG01 prediction 不作为特征、offset、倍率、
prior、锚、校准目标或 fallback。

## 公共实现与验证状态

公共 domain 实现覆盖直接准 Poisson/准 Gamma objective、gradient、Hessian、damped
Newton/IRLS、case-balanced 权重、三层 fixed-offset hierarchy、支持回退、完整 occurrence
逐位 parity、exact population coverage、嵌套 lambda 选择、完整 synthetic campaign、
原始候选先封存后读取比较器、聚合评价、隐私保护与 whole-work paired bootstrap。

公共 synthetic 结果是
`PSC03_PUBLIC_SYNTHETIC_FULL_PATH_PASSED`，仅证明无私有完整路径可达与合同护栏有效，
不构成模型成绩。私有开发重放必须等到 pre-execution exact-head Linux/Windows CI 首次
成功后才可运行一次；当前没有 attempt、prediction、evaluation 或 bootstrap。

## 已实现、已验证、已授权与可发布

| 层次 | 当前状态 |
|---|---|
| 已实现 | 结果前预注册、schema、语义验证、公共数学核心、研究 runner 成功路径、失败关闭和公开占位报告 |
| 已验证 | 定向 public contract 与 synthetic 完整路径；尚未完成本阶段全部公共门禁、全新 clone 和 pre-execution exact-head CI |
| 已授权 | 仅在所有结果前门禁通过后进行唯一一次历史开发重放（`DEVELOPMENT_REPLAY`） |
| 可发布 | 否；没有模型性能证据、active candidate、automation、production、release 或财务使用授权 |

## 关闭边界

独立评价、later-origin、第二起点、final holdout、第二次 PSC03 replay、PSC02 replay、
taxonomy/category 模型、production loader、route、API、数据库、provider、automation、
release 与财务使用继续关闭。即使未来开发状态支持提出独立评价请求，也必须等待单独授权。

本索引取代 v0.58 作为当前阅读入口，但不改写 v0.58。当前预注册与公共证据见：

- `docs/analysis/m2-current/M2-publishing-scale-channel-direct-cash-quasi-poisson-preregistration-v0.1.json`
- `docs/analysis/m2-current/M2-publishing-scale-channel-direct-cash-quasi-poisson-preregistration-v0.1.md`
- `docs/analysis/m2-current/M2-publishing-scale-channel-direct-cash-public-diagnostic-v0.1.json`
- `docs/analysis/m2-current/M2-publishing-scale-channel-direct-cash-development-evaluation-v0.1.json`
- `docs/analysis/m2-current/M2-publishing-scale-channel-direct-cash-implementation-and-result-decision-v0.1.md`
