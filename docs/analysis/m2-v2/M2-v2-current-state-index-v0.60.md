# M2 当前状态索引 v0.60

截至 2026-08-02，本索引记录出版行业渠道直接现金尺度条件金额模型 v0.1
（Publishing-Scale Channel Direct-Cash Conditional Amount Model v0.1，
`M2-CHAN-PSC03`）唯一开发重放的冻结结果。模型名称、别名、角色、实验映射、成绩人口与
可比组以 `config/m2-model-registry.v1.json` 为唯一当前机器权威；业务门限以
`config/m2-business-acceptance-contract.v1.json` 为唯一数值权威。

## 当前结论

| 对象 | 当前状态 | 含义 |
|---|---|---|
| 兼容性现行运行回退 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 仅为兼容性回退，没有新增当前范围性能支持 |
| 研究比较基线 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 只用于同案例研究比较，不是 production 晋升 |
| 冻结失败渠道模型 | 出版行业适配渠道月度核心（Publishing-Scale Channel Monthly Occurrence × Conditional Amount Core，`M2-CHAN-PSC01`） | 首个原始候选冻结失败；根因是估计器尺度收缩，未确认实现或比较器缺陷 |
| 已集成的阻断模型 | 出版行业渠道起点可见现金锚金额模型 v0.1（Publishing-Scale Channel Origin-Visible Cash-Anchor Amount Model v0.1，`M2-CHAN-PSC02`） | 历史重放被不可恢复的源权威阻断，真实执行器不完整，没有模型性能证据 |
| 最新已执行渠道模型 | 出版行业渠道直接现金尺度条件金额模型 v0.1（`M2-CHAN-PSC03`） | 唯一开发重放完成并冻结，最终不支持继续开发（`PSC03_DEVELOPMENT_NOT_SUPPORTED`） |
| 当前模型性能证据 | 开发重放模型性能证据（`DEVELOPMENT_REPLAY_MODEL_PERFORMANCE_EVIDENCE`） | 不是独立评价、later-origin、final holdout、production 或财务使用证据 |
| 活动候选 | `activeCandidate=null` | 没有活动候选 |
| 自动化批准 | `approvedForAutomation=null` | 没有自动化批准 |
| production ready | `productionReady=false` | 没有生产权限 |
| final holdout | `finalHoldoutOpened=false` | 未打开 |
| 独立评价 | `independentEvaluationOpened=false` | 未打开 |
| later-origin | `laterOriginOpened=false` | 未打开 |

## PR #40 的集成边界

PR #40 只以“PSC02 历史重放被源权威阻断、没有模型性能结果或证据”的身份通过 merge commit
集成。它没有把阻断升级为模型失败，也没有重跑、补完或激活 `M2-CHAN-PSC02`：

- 源权威状态继续是
  `PSC02_HISTORICAL_REPLAY_BLOCKED_NO_RECOVERABLE_ORIGIN_VISIBLE_CASH_AUTHORITY`；
- 执行状态继续是 `PSC02_EXECUTION_IMPLEMENTATION_INCOMPLETE_NO_CANDIDATE_RESULT`；
- `componentId`、`revisionId`、`effectiveAt`、`availableAt` 不可恢复，24 个冻结起点可
  合法重建的 snapshot 数为 0；
- 唯一历史预测前 attempt、`PSC02_DEVELOPMENT_NOT_SUPPORTED` 和
  `PRIVATE_SOURCE_AUTHORITY_BLOCKER_NOT_MODEL_FAILURE` 原样保留；
- Model Registry 的 PSC02 `evaluations=[]`，仍为 `NO_MODEL_PERFORMANCE_EVIDENCE`。
- PSC02 历史预注册稳定 ID
  `M2-PREREG-PSC02-ORIGIN-VISIBLE-CASH-ANCHOR-01` 原样保留，仅用于谱系与审计追溯。

这些 PSC02 缺口和三行账本差异均未成为 PSC03 输入、人口或门禁。

## PSC03 身份与执行完整性

- 模型稳定 ID：`M2-CHAN-PSC03`；
- 唯一原始候选 ID：`M2-CHAN-PSC03-RAW`；
- 父实验稳定 ID：`M2-EXP-PUBLISHING-SCALE-CHANNEL-DIRECT-CASH-03`；
- 预注册稳定 ID：`M2-PREREG-PSC03-DIRECT-CASH-QUASI-POISSON-01`；
- 评价活动类型：开发重放（`DEVELOPMENT_REPLAY`），不是独立评价。

| 中文名称 | 完整实验臂 ID | 身份与结果 |
|---|---|---|
| 算术层级诊断（Arithmetic Hierarchy Only） | `M2-EXP-PUBLISHING-SCALE-CHANNEL-DIRECT-CASH-03/D0` | 已执行的尺度/层级机制诊断（`EXECUTED_DIAGNOSTIC_NOT_CANDIDATE`），不是候选或 fallback |
| 直接准 Gamma 层级诊断（Direct Quasi-Gamma Hierarchy） | `M2-EXP-PUBLISHING-SCALE-CHANNEL-DIRECT-CASH-03/D1` | 已执行的方差族诊断（`EXECUTED_VARIANCE_FAMILY_DIAGNOSTIC_NOT_CANDIDATE`），不得替代主设计 |
| 直接准 Poisson 层级唯一原始候选（Direct Quasi-Poisson Hierarchy） | `M2-EXP-PUBLISHING-SCALE-CHANNEL-DIRECT-CASH-03/P` | 首次完整 raw 已冻结且不支持继续开发（`EXECUTED_FIRST_COMPLETE_RAW_FROZEN_DEVELOPMENT_NOT_SUPPORTED`） |

PSC03 只复用冻结且已证明 origin-visible 的 PSC01 人口、训练信息、18 个特征、basis、
occurrence、actual、origin、horizon、渠道结构与评价口径。taxonomy 只报告，LG01 prediction
不作为特征、offset、倍率、prior、锚、校准目标或 fallback。

执行完整性事实：

- pre-execution exact HEAD 为 `7a719474291c7b7286decab5bf9c11eb26d88d35`，Linux 与
  Windows CI 均成功后才开始私有重放；
- 第 1 次工程尝试在 occurrence join 前因冻结范围身份字段读取错误停止；第 2 次工程尝试
  在算术层级诊断生成前因大数组展开导致栈溢出停止；二者都没有形成完整原始候选、评价、
  bootstrap 或注册表成绩；
- 一次 GitHub TLS preflight 失败发生在 attempt receipt 创建前，不计为工程尝试，也没有
  读取比较器成绩或启动候选拟合；
- 第 3 次工程尝试完成唯一重放；首次完整原始候选共 3,318,819 行，SHA-256 为
  `2c04ac66b47613fd70e4630582c79ea4de718800f0da267d7c431ca85f89c05b`；
- occurrence 权威摘要为
  `e1e06d5a00d46689aff54d32ec55925e5f6dee02e28f7dd233fe1b3aea4ea5ba`，
  完整键覆盖与 IEEE-754 binary64 逐位一致均通过；
- occurrence、父层 offset 和 horizon 汇总均只应用一次；taxonomy、LG01 prediction、
  PSC02 四字段和 `extra=3` 均未使用；
- 原始候选通过逐行正确性门禁并原子封存后，才读取 PSC01 与 LG01 比较器；raw 没有被
  fallback、诊断臂或 selected pipeline 覆盖；
- 首次完整原始候选只形成一次（`primaryRawRepeated=false`），不得重跑或重估。
- raw 封存后只修复了公开 JSON 的纯报告序列化遗漏，补齐性能证据标志、预测已形成标志与
  已计算的尺度诊断；私有预测、指标、bootstrap、digest、参数和科学判定均未改变。

## 冻结成绩

Primary 为 13 个起点、36 个月、12,039 个作品级 case、1,125 部作品；strict 为 11 个
季度起点、3/6/12/18/24 个月、74,320 个作品级 case、2,650 部作品。

| 对象 | Primary WAPE | Primary 预测/实际比 | Strict WAPE | Strict 预测/实际比 |
|---|---:|---:|---:|---:|
| 算术层级诊断（`M2-EXP-PUBLISHING-SCALE-CHANNEL-DIRECT-CASH-03/D0`） | 178.1610% | 1.2647 | 265.5676% | 2.2873 |
| 直接准 Gamma 层级诊断（`M2-EXP-PUBLISHING-SCALE-CHANNEL-DIRECT-CASH-03/D1`） | 93.7931% | 0.9144 | 86.8537% | 0.8833 |
| 直接准 Poisson 唯一原始候选（`M2-EXP-PUBLISHING-SCALE-CHANNEL-DIRECT-CASH-03/P`；`M2-CHAN-PSC03-RAW`） | 54.2647% | 0.8265 | 297.0822% | 3.3527 |
| 冻结 PSC01 原始候选（`M2-CHAN-PSC01-RAW`） | 92.4087% | 0.1107 | 91.5333% | 0.1459 |
| 冻结 LG01 研究基线（`M2-WORK-LG01`） | 44.3100% | 0.8783 | 41.2813% | 0.9621 |

准 Poisson 唯一原始候选的 strict 分周期结果为：

| Horizon | WAPE | signed bias | 预测/实际比 |
|---:|---:|---:|---:|
| 3 | 2488.7672% | 2444.9198% | 25.4492 |
| 6 | 176.9284% | 128.3698% | 2.2837 |
| 12 | 54.0120% | -1.6410% | 0.9836 |
| 18 | 52.4409% | -13.8145% | 0.8619 |
| 24 | 59.4613% | -20.1514% | 0.7985 |

H3 与 H6 的严重放大说明直接现金尺度并未形成跨 horizon 稳定恢复；短周期失败不得被
primary H36 或较长 strict horizon 的局部表现掩盖。

## 两条判定轴

### 尺度假设轴

尺度假设未通过（`DIRECT_CASH_SCALE_HYPOTHESIS_NOT_SUPPORTED`）：

- 相对 PSC01 的 primary FVA 为 41.2775%，通过预注册门限；
- 相对 PSC01 的 strict FVA 为 -224.5617%，未通过；
- primary 预测/实际比 0.8265 在冻结范围内；逐 strict horizon 的预测/实际比未通过；
- 统一作品实际总额后的渠道构成 WAPE 从 PSC01 的 40.9601% 降至 29.4707%，但所用
  scalar 来自评价 actual，只是
  `POST_HOC_DIAGNOSTIC_NOT_MODEL_EVIDENCE_NOT_CANDIDATE_SCORE`，不得登记为候选成绩。

### 候选竞争力轴

候选优越性未通过（`CANDIDATE_SUPERIORITY_CONTRACT_NOT_PASSED`）：

- 相对 LG01 的 primary / strict FVA 分别为 -22.4658% / -619.6537%；
- 业务可用性的 3/6/12/36 月 WAPE 门限均未通过，仅 3 月 absolute signed bias 通过；
- 候选优越性的九项 AND 要求全部未通过；
- Core80 全要求周期相对 LG01 的作品级 paired bootstrap 使用 seed `20260728`、2,000 次，
  观察改善为 -9.0078%，95% 区间为 [-14.4218%, 1.8034%]，区间跨 0；
- primary 相对 PSC01 的作品级 bootstrap 区间为 [19.1000%, 50.5620%]，不能覆盖 strict
  退化或替代 LG01 同人口比较。

因此“缓解 PSC01 主口径低估”与“形成可竞争候选”是两个不同命题；前者的局部证据不能
改写最终失败状态。

## 隐私、人口与成绩治理

- 公开机器结果包含 215 个满足阈值的聚合和 9 个隐私抑制单元；阈值为至少 30 个 case
  且至少 20 部作品，抑制单元指标为 `null`；
- 平台、机制、支持层级、起点、horizon、头部作品和 Core80/Core90 均只发布满足阈值的
  聚合，不发布逐作品或逐渠道私有行；
- Model Registry 只登记 1 条 PSC03 开发重放成绩行，`evidenceClass=DEVELOPMENT_REPLAY`、
  `independentEvidence=false`；strict、分层与诊断臂结果保留在同一机器评价报告中，
  不冒充额外模型或独立成绩；
- primary 与 strict、WORK_TOTAL 与 WORK_CHANNEL、Core80 与 Core90 必须分别解释；不同
  人口、horizon、粒度或实际值定义不得直接排名。

## 已实现、已验证、已授权与可发布

| 层次 | 当前状态 |
|---|---|
| 已实现 | 结果前预注册、schema、公共数学核心、失败关闭、唯一私有重放、原子 raw 封存、比较、bootstrap 与公开聚合 |
| 已验证 | pre-execution exact-head 双平台 CI、3,318,819 行 occurrence parity、完整人口覆盖、正确性门禁、封存摘要与隐私阈值 |
| 已授权 | 唯一历史开发重放授权已消耗；没有独立评价、later-origin 或第二次 replay 授权 |
| 可发布 | 否；没有 active candidate、automation、production、release 或财务使用授权 |

## 关闭边界

第二次 PSC03 replay、独立评价、later-origin、第二起点、final holdout、PSC02 replay、
后继 PSC04/新候选、taxonomy/category 模型、production loader、route、API、数据库、
provider、automation、release 与财务使用继续关闭。不得依据已打开结果修改 PSC03 或创建
后继设计；任何新模型都需要独立的事前科学理由、预注册和用户授权。

本索引取代 v0.59 作为当前阅读入口，但不改写 v0.59。当前证据见：

- `docs/analysis/m2-current/M2-publishing-scale-channel-direct-cash-quasi-poisson-preregistration-v0.1.json`
- `docs/analysis/m2-current/M2-publishing-scale-channel-direct-cash-public-diagnostic-v0.1.json`
- `docs/analysis/m2-current/M2-publishing-scale-channel-direct-cash-pre-execution-ci-receipt-v0.1.json`
- `docs/analysis/m2-current/M2-publishing-scale-channel-direct-cash-development-evaluation-v0.1.json`
- `docs/analysis/m2-current/M2-publishing-scale-channel-direct-cash-development-evaluation-v0.1.md`
- `docs/analysis/m2-current/M2-publishing-scale-channel-direct-cash-implementation-and-result-decision-v0.1.md`
