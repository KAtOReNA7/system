# M2 当前状态索引 v0.58

截至 2026-08-02，本索引记录出版行业渠道起点可见现金锚金额模型 v0.1
（Publishing-Scale Channel Origin-Visible Cash-Anchor Amount Model v0.1，
`M2-CHAN-PSC02`）PR #40 的执行完整性与源权威可恢复性纠正。模型名称、变体、角色、
实验映射和成绩人口以 `config/m2-model-registry.v1.json` 为唯一机器权威；业务门限以
`config/m2-business-acceptance-contract.v1.json` 为唯一数值权威。

## 当前结论

| 对象 | 当前状态 | 含义 |
|---|---|---|
| 兼容性现行运行回退 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 仅为兼容性回退，没有新增当前范围性能支持 |
| 研究比较基线 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 只用于研究比较，不是 production 晋升 |
| 冻结失败渠道模型 | 出版行业适配渠道月度核心（Publishing-Scale Channel Monthly Occurrence × Conditional Amount Core，`M2-CHAN-PSC01`） | 首个原始候选冻结失败；根因是估计器尺度收缩，未确认实现或比较器缺陷 |
| 当前阻断实验 | 出版行业渠道起点可见现金锚金额实验（`M2-EXP-PUBLISHING-SCALE-CHANNEL-CASH-ANCHOR-02`） | 公共数学核心存在，但真实执行器不完整且历史源权威不可恢复 |
| 当前源权威状态 | `PSC02_HISTORICAL_REPLAY_BLOCKED_NO_RECOVERABLE_ORIGIN_VISIBLE_CASH_AUTHORITY` | 四个关键字段均不可恢复，24 个冻结起点可重建数为 0 |
| 当前执行状态 | `PSC02_EXECUTION_IMPLEMENTATION_INCOMPLETE_NO_CANDIDATE_RESULT` | 没有可达的完整 P raw result 路径 |
| 模型性能证据 | `NO_MODEL_PERFORMANCE_EVIDENCE` | 没有模型性能结果；未拟合、未预测、未打开 outcome、未计算指标 |
| 活动候选 | `activeCandidate=null` | 没有活动候选 |
| 自动化批准 | `approvedForAutomation=null` | 没有自动化批准 |
| production ready | `productionReady=false` | 没有生产权限 |
| final holdout | `finalHoldoutOpened=false` | 未打开 |

## 模型、实验与实验臂

预注册设计（`M2-PREREG-PSC02-ORIGIN-VISIBLE-CASH-ANCHOR-01`）保持不可变。模型
`M2-CHAN-PSC02` 只有一个原始候选变体 `M2-CHAN-PSC02-RAW`。父实验为
`M2-EXP-PUBLISHING-SCALE-CHANNEL-CASH-ANCHOR-02`：

- 现金锚单独诊断（Anchor Only Diagnostic，完整臂 ID
  `M2-EXP-PUBLISHING-SCALE-CHANNEL-CASH-ANCHOR-02/D0`）只用于尺度归因；
- 锚定对数比率岭回归诊断（Anchored Log-Ratio Ridge Diagnostic，完整臂 ID
  `M2-EXP-PUBLISHING-SCALE-CHANNEL-CASH-ANCHOR-02/D1`）只用于 loss/link 归因；
- 锚定准 Gamma offset 主设计（Anchored Quasi-Gamma Offset Primary Design，完整臂 ID
  `M2-EXP-PUBLISHING-SCALE-CHANNEL-CASH-ANCHOR-02/P`）对应唯一原始候选。

三个实验臂均未执行（`NOT_EXECUTED_PRIVATE_SOURCE_AUTHORITY_BLOCKED`）。不存在由诊断臂、
fallback 或 selected pipeline 替换原始候选的结果，Model Registry 中没有 PSC02
evaluation row。

## 公共数学核心不等于真实执行器

公共 domain 层具备现金锚、六层 fallback、冻结 occurrence、嵌套 residual fit/predict、
parity、coverage、月到 horizon 聚合与局部 scoring primitives，并通过 synthetic 合同。
taxonomy 仍为 `REPORT_ONLY`，LG01 prediction 没有进入模型。

真实 runner 则缺少或未编排：component authority adapter、origin-visible revision
snapshot、月度物化、PSC01 occurrence join、三个实验臂执行、parity/coverage、horizon、
P raw 原子封存、比较器延后读取、完整指标、2,000 次 paired whole-work bootstrap、
成功 manifest/receipt/digest 冻结链。历史代码在权威通过时也只会进入缺少 adapter 的
占位异常。因此完整候选成功路径不可达。

当前开发命令在 Git preflight、私有目录和 receipt 访问前失败关闭。唯一历史 attempt
不会被改写或重跑。

## 私有源权威恢复审计

当前总账、分成与买断资料只有合并后的单一工作簿快照，没有隐藏来源 sheet、历史不可变
快照、上游 identity、revision lineage 或真实到达时间：

| 字段 | 当前判定 | 原因 |
|---|---|---|
| `componentId` | `NOT_RECOVERABLE` | 行 hash/位置不能证明上游 component identity，也不能区分两次合法相同行 |
| `revisionId` | `NOT_RECOVERABLE` | 当前 workbook digest 不是 component 或自然键的历史修订谱系 |
| `effectiveAt` | `NOT_RECOVERABLE` | 没有业务生效时间；`cashMonth` 不可临时改名 |
| `availableAt` | `NOT_RECOVERABLE` | 没有历史到达记录；mtime、复制/Git/读取时间均无权威性 |

Primary 13 个和 strict 11 个冻结起点合计 24 个，可合法重建的 origin-visible component
revision snapshot 为 0。

## 账本差异

确定性 multiset 审计仍为 `missing=0, extra=3`。三行均是分成侧独有、总账不存在的加性
金额变体（`SALES_SHARE_ONLY_ADDITIVE_AMOUNT_VARIANTS_ABSENT_FROM_TOTAL_LEDGER`），不是
重复、合法拆分、分类漂移、格式/数值规范化或比较键问题，也不涉及买断、冲销或未分配
残差。删除会改变现金并恢复行与金额守恒，因此未经权威纠正不得删除。公开材料只登记
受抑制类别和不可逆摘要，不含行值、作品名或金额。

## 历史记录如何保留

唯一历史预测前 attempt 的原始状态继续是开发重放不支持
（`PSC02_DEVELOPMENT_NOT_SUPPORTED`）和私有源权威阻断而非模型失败
（`PRIVATE_SOURCE_AUTHORITY_BLOCKER_NOT_MODEL_FAILURE`）。其私有 receipt 与旧公开结果
原样保留，作为历史 attempt 记录。

本次执行完整性与源恢复审计成为当前权威；它纠正“真实 runner 已完整实现”的解释，
不改写历史 attempt，不产生模型成绩，也不改变冻结 PSC01、LG01 或 HPSR02 证据。

## 已实现、已验证、已授权与可发布

| 层次 | 当前状态 |
|---|---|
| 已实现 | 公共数学 primitives 与结果前失败关闭护栏；真实 private 成功编排未实现 |
| 已验证 | 公共 synthetic/contract；执行链静态审计；四字段、24 起点与账本差异只读审计 |
| 已授权 | 只授权本次审计和状态纠正；唯一历史重放授权已消耗，无重试授权 |
| 可发布 | 否；没有候选结果、性能证据、automation、production、release 或财务使用授权 |

## 后续边界

后续若单独授权，应转向只使用已经冻结且已证明 origin-visible 的 PSC01 人口与训练信息
的新金额模型，而不是再次尝试 PSC02。本任务没有设计或实现该模型。

独立评价、later-origin、final holdout、第二次 PSC02 重放、production loader、route、API、
数据库、provider、automation、release 与财务使用继续关闭。

本索引取代 v0.57 作为当前阅读入口，但不改写 v0.57。当前审计见：

- `docs/analysis/m2-current/M2-psc02-pr40-execution-completeness-and-source-authority-recovery-audit-v0.1.json`
- `docs/analysis/m2-current/M2-psc02-pr40-execution-completeness-and-source-authority-recovery-audit-v0.1.md`
- `docs/analysis/m2-current/M2-psc02-pr40-pre-result-status-correction-v0.1.md`
