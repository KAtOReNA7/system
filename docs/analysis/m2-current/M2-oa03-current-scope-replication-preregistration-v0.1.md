# M2 作品发生—金额校准模型 v0.3 当前范围复现与已有渠道分配验证预注册 v0.1

## 结论先行

父实验为 M2 作品发生—金额校准模型 v0.3 当前范围复现与已有渠道分配验证
（M2 Occurrence-Amount Calibration v0.3 Current-Scope Replication and
Observed-Channel Allocation Validation，
`M2-EXP-OA03-CURRENT-SCOPE-REPLICATION-01`）。

P0 状态为 `P0_PREREGISTERED_NO_OUTER_OUTCOME_READ`。当前已经唯一解析作品发生—金额
校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）的公式身份，
冻结当前业务范围、训练支持、滚动评价、同案例重合验证、最近 12 月已有渠道份额分配、
统计门槛和停止条件。尚未读取 private outer outcome，尚未拟合或执行模型，也没有
生成任何性能结论。

技术复现完成不等于模型性能受到支持；作品总额证据与渠道分配证据将按 3、6、12
个月分别判定。

## 动态 Git 起点与仓库审计

执行时先完成 `git fetch origin --prune`，并以当时 `origin/main` 创建活动分支：

- 动态 `START_HEAD`：
  `ac18c154fa9afbf93ff36a12e32925eb509dfd79`；
- 分支：`codex/m2-oa03-current-scope-replication-v0-1`；
- 建分支时 tracked 工作区干净，HEAD 与 `origin/main` 一致；
- ahead/behind 为 0/0，upstream 为 `origin/main`；
- 开放 PR 为 0，worktree 为 1；
- 当时最新 `origin/main` CI 成功；
- Git tracked 文件共 2,075 个，逐字节重复组为 0。

上述提交仅为审计记录，状态为
`AUDIT_ONLY_NOT_A_PORTABLE_EXECUTION_PRECONDITION`。实现与长期合同不把该 SHA、
本机盘符、绝对路径、历史 CI run ID 或运输包 hash 当作跨电脑执行门禁。

调用关系审计确认：

- production formal composition 仍从 `src/server.js` 启动；
- synthetic fixture composition 仍从 `src/fixtureServer.js` 启动；
- production loader、route 和 API 没有导入本实验；
- `scripts/m2-current/run_m2_current_candidate.mjs` 是历史多代开发 runner，只作公式、
  配置与 lineage 证据，不作为本实验的新 runtime；
- 当前 M2 动态 Core 人口与成熟渠道 eligibility 的 canonical 实现在
  `src/domain/m2Current/coreLegacyPopulation.js`；
- 最近 12 月已有渠道份额、零分母 fallback、合法弃权与分币守恒的 canonical
  实现在 `src/domain/m2Current/coreLegacyChannelAllocation.js`；
- P1 只扩展 `src/domain/m2Current/**` 和现有 materializer/runner，不创建平行
  production loader、runtime、route 或 API。

## 模型身份决议

机器身份以 `config/m2-model-registry.v1.json` 为准：

- 中文名：作品发生—金额校准模型 v0.3；
- 英文名：Occurrence-Amount Calibration v0.3；
- 稳定模型 ID：`M2-WORK-OA03`；
- 对象类型：作品点预测模型；
- 当前角色：现行运行回退（`operational_work_fallback`）；
- active candidate：`null`；
- approved for automation：`null`。

唯一 canonical 公式入口为：

- 文件：`src/domain/m2Current/candidate.js`；
- 函数：`buildM2CurrentOccurrenceAmountCandidate`；
- 历史配置：`config/m2-current.v0.3.json`；
- 历史冻结输出：
  `docs/analysis/m2-current/M2-current-occurrence-amount-candidate-v0.3.json`。

历史配置的 target 是 `future_bill_cash`；本实验的 current target 是开发可建模分成
收入现金。因此复现保持公式身份，不把历史 target、人口或 actual 包装层冒充当前
合同，也不会为复现旧数字改写 v2.2 actual。

## 冻结公式

本实验保持作品发生—金额校准模型 v0.3（`M2-WORK-OA03`）原始语义：

- 基础候选：
  `M2-current-hierarchical-robust-calibration-v0.2`；
- 可校准 activity segment：`dense`、`intermittent`；
- `dormant` 使用基础候选 fallback；
- 训练行必须来自 outer origin 之前，且
  `labelAvailableAsOf <= outerOrigin`；
- 最少 earlier case 数：80；
- occurrence probability：
  `(positive case count + 10 × 0.5) / (case count + 10)`；
- conditional positive amount scale：
  `positive actual sum / base prediction sum on positive rows`；
- factor：
  `clamp(occurrence probability × conditional amount scale, 0.3, 1.5)`；
- 只有 earlier-label WAPE 相对基础候选改善至少 1%，且训练 absolute bias 不超过
  0.15，才启用该 factor；
- 否则 factor 为 1，回退到基础候选；
- `scaleFactors` 固定为 `[1.0]`，不扩张参数网格；
- seed、horizon 隔离、特征字段和 fallback 语义不改。

原生输出能力：

- occurrence probability：保存；
- conditional amount scale：保存；
- conditional positive amount prediction：原公式不保存，状态固定为
  `CAPABILITY_NOT_STORED`，不得从点预测逆推。

重合验证与渠道守恒使用分币定点整数和 `BigInt`；每一笔成功分配要求渠道预测分币和
严格等于作品总额分币，允许差额为 0 分。不得以浮点误差放宽复现容差。

禁止加入新特征、收入权重、尾部删除、分类倍率、渠道机制倍率、learnedGlobal
offset、router、blend，禁止从 3/6/12 月推导 36 月，也禁止修改 exact v0.3
production loader/route/API。

## 当前业务范围

actual 固定为开发可建模冲销重述口径
（`M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01`）。

评价对象为：

- Dynamic Core80 主人口；
- Dynamic Core90 敏感性人口；
- origin 时至少有 3 个完整账单月的成熟老作品；
- origin 时已经出现且至少有 3 个完整账单月的 canonical 渠道；
- 未来 3、6、12 个月开发可建模分成收入现金。

每个 forecast origin 重新用当时可见分成收入选择最小 Core 集合，并纳入 cutoff
同收入 ties。canonical reference window 是：

- 1–2 月 origin：截至 origin 的最近 6 个完整账单月；
- 3–12 月 origin：当年 1 月至 origin。

这里的 `origin` 是 canonical materializer 已关闭的最后可见完整账单月。不得用当前
固定名单、未来实际 TopN 或未来收入选择人口。

以下对象为合法 `null abstain`，不是 0：

- Core 外作品；
- 未来新增作品；
- origin 时不成熟作品；
- 未来首次出现渠道；
- origin 时不成熟的已观察渠道。

买断、其他非分成现金和公司总收入补差不进入特征、actual、预测、误差分母或渠道
分配。

冲销继续保留全部 143 条原始记录，只在相同 cash category、作品、canonical 渠道和
币种 scope 内向过去追溯。未分配残差仅从 development-modelable target 透明隔离，
仍留在财务对账；不得删除整条冲销、整条 case，不能跨 scope 吸收，也不能让未来
冲销进入更早 origin 的特征。

## 训练人口治理修正

历史尾部训练实验状态为 `TAIL_INTERFERENCE_NOT_CONFIRMED`：

- Dynamic Core90 训练只有不足 1% 的微小、不稳定变化；
- Dynamic Core80 训练明显退化。

因此当前治理层已作最小修正：

- Core80/Core90 固定约束服务与主评价人口；
- 训练人口由所属实验预注册且必须 origin-safe；
- 允许把 origin 前全体成熟历史用作统计支持；
- 本实验的训练标签固定为 `FULL_MATURE_TRAINING_SUPPORT`；
- 该标签不授权服务 Core 外尾部，也不表示 Core-only training；
- Core-only、Core90-only、Core80-only 均只能作为显式实验臂并保留 raw result。

本实验只复现作品发生—金额校准模型 v0.3（`M2-WORK-OA03`）原训练语义，不再执行
Core80-only、Core90-only、revenue-weighted 或 full-vs-core 新消融。公开报告必须
披露 Core 外训练作品数、训练行占比、actual 占比和训练损失占比。

该修正只作用于当前 `AGENTS.md` 治理层；历史报告、历史 ID、历史结果和冻结 digest
保持不变。

## 三个预注册实验臂

### 当前范围严格复现臂

- 父实验与臂 ID：
  `M2-EXP-OA03-CURRENT-SCOPE-REPLICATION-01/R0`；
- 中文名：作品发生—金额校准模型 v0.3 当前范围严格复现臂；
- 对象类型：existing-model replication arm；
- 输出：作品总额。

Primary rolling 与 Strict rolling 必须各自独立训练、选择和评价，只执行 3、6、12
个月。每个 outer fold 只能读取该 origin 前可见的训练行；原公式参数固定时不得为
形式增加内层调参。private 输出必须保存 fold 参数、训练人口摘要、case key、预测和
选择原因。

### 原冻结输出同案例重合验证

- 父实验与臂 ID：
  `M2-EXP-OA03-CURRENT-SCOPE-REPLICATION-01/R1`；
- 中文名：OA03 原冻结输出同案例重合验证；
- 对象类型：semantic replay diagnostic。

只有 actual、case key、horizon、训练支持和公式版本相同时才要求重合，并报告：

- 逐行完全一致率；
- 最大绝对分币差；
- 总和分币差；
- WAPE 复现差；
- signed bias 复现差。

若 actual 或训练窗口不同，状态必须为
`NOT_COMPARABLE_DIFFERENT_CONTRACT`，不能为追平旧值而改写当前 actual。

### 最近 12 月已有成熟渠道份额分配臂

- 父实验与臂 ID：
  `M2-EXP-OA03-CURRENT-SCOPE-REPLICATION-01/C1`；
- 中文名：OA03 作品总额 × 最近 12 个完整账单月已有成熟渠道份额分配臂；
- 对象类型：observed-channel allocation capability；
- 输出：作品 × canonical 渠道。

该能力只使用同 origin、同 horizon 的当前范围严格复现作品总额，并固定使用 origin
前最近 12 个完整账单月的 nonnegative 收入份额。只向 origin 时已有且成熟的
canonical 渠道分配。

零分母时按最近到最远扫描这 12 个月，使用最近一个非零月份的渠道权重；仍为零则
`ABSTAIN_CHANNEL_ALLOCATION`。不允许等分、未来 actual 份额、未来首次渠道、
trailing-3/trailing-6 竞争或结果后换窗口。分币通过 largest remainder 分配，同余数
按稳定 `channelUid` 排序。

作品总额模型与渠道 allocation capability 分开报告，渠道结果不能改变作品模型角色。

## 评价与比较

每个 horizon、人口和 rolling family 分开报告：

- eligible works、abstained works、origins、cases；
- origin-visible selection revenue coverage；
- future served actual cash coverage；
- same-case intersection；
- actual denominator、prediction sum、actual sum；
- WAPE、signed bias、absolute bias、MAE、median absolute error；
- overprediction cash、underprediction cash、error concentration；
- per-origin 与 time-block WAPE/bias。

只在 target、actual、人口、origin、horizon、grain 和 case key 完全相同时，与下列
参考进行 paired 比较：

- 全局学习现金基线 v0.1（Learned Global Cash Baseline，
  `M2-WORK-LG01`），固定为主要 research baseline；
- 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline，
  `M2-WORK-CRMR01`），固定为次要 manual reference；
- 原冻结 `M2-WORK-OA03` 只用于合法重合验证。

冻结统计门：

- relative WAPE materiality：1%；
- maximum absolute bias worsening：0.02；
- WAPE 改善但 bias 触发恶化护栏时只能判 `MIXED`；
- 2,000 次 `standardWorkId` paired cluster bootstrap；
- seed：20260728；
- 95% interval；
- 每次重采样重新计算 WAPE、bias 和 paired FVA；
- time-block improving share 门槛：0.5；
- 至少 2 个独立时间块；不足时标记
  `TIME_INDEPENDENCE_UNCONFIRMED`。

作品 bootstrap 不能冒充时间独立证据。跨 horizon pooled 指标只作诊断，不选统一
冠军。

occurrence probability 原生存在时评价 Brier、log loss、trapezoidal PR-AUC、
Average Precision、ROC-AUC 与 reliability。conditional positive amount prediction
未原生保存，因此不补造；冲销 occurrence/amount 与正收入 occurrence 分开。

渠道分配在作品 × 渠道粒度另报 WAPE、signed bias、MAE、median AE、成功分配、合法
弃权、最大守恒分币差、渠道误差贡献、主要 canonical 渠道 slice、time block 和
2,000 次作品 cluster paired bootstrap。只能在 exact same cases 上比较当前 OA03
总额 × trailing-12 allocation 与合法可得的 direct channel reference。

## 预注册机器状态

技术复现按以下状态之一结案：

- `OA03_CURRENT_SCOPE_REPLICATION_COMPLETE`；
- `OA03_CURRENT_SCOPE_REPLICATION_SEMANTIC_MISMATCH`；
- `OA03_CURRENT_SCOPE_REPLICATION_BLOCKED_SOURCE_AUTHORITY`；
- `OA03_CURRENT_SCOPE_REPLICATION_BLOCKED_NO_LEGAL_ORIGIN`；
- `OA03_CURRENT_SCOPE_REPLICATION_BLOCKED_MODEL_IDENTITY_AMBIGUOUS`；
- `OA03_CURRENT_SCOPE_REPLICATION_INFRASTRUCTURE_FAILURE_BEFORE_RESULT`。

作品总额证据对每个 horizon 分别选择：

- `OA03_CURRENT_SCOPE_PERFORMANCE_SUPPORTED`；
- `OA03_CURRENT_SCOPE_PERFORMANCE_MIXED`；
- `OA03_CURRENT_SCOPE_PERFORMANCE_NOT_SUPPORTED`；
- `OA03_CURRENT_SCOPE_PERFORMANCE_NOT_EVALUABLE`。

渠道分配证据对每个 horizon 分别选择：

- `OA03_TRAILING12_CHANNEL_ALLOCATION_SUPPORTED`；
- `OA03_TRAILING12_CHANNEL_ALLOCATION_MIXED`；
- `OA03_TRAILING12_CHANNEL_ALLOCATION_NOT_SUPPORTED`；
- `OA03_TRAILING12_CHANNEL_ALLOCATION_NOT_EVALUABLE`。

最终总结只能为：

- `M2_OA03_CURRENT_SCOPE_REPLICATION_COMPLETE_PERFORMANCE_SUPPORTED`；
- `M2_OA03_CURRENT_SCOPE_REPLICATION_COMPLETE_PERFORMANCE_MIXED`；
- `M2_OA03_CURRENT_SCOPE_REPLICATION_COMPLETE_PERFORMANCE_NOT_SUPPORTED`；
- `M2_OA03_CURRENT_SCOPE_REPLICATION_BLOCKED`。

“支持”要求 raw OA03 未被 selected fallback 掩盖、same-case 改善达到 1%、
bias 护栏未触发、paired interval 与 time block 不冲突、Primary/Strict 没有无法
解释的方向反转。技术复现成功本身不构成性能支持。

无论结果如何，operational fallback 暂不改变，active candidate 与 automation
approval 均保持 `null`。

## Private capability 与阶段门

capability ID 为 `m2-oa03-current-scope-replication`。private 文件分三类：

- `PRIVATE_SOURCE_AUTHORITY`：不可重建；确实缺失时才允许阻断；
- `PRIVATE_DERIVED_CACHE`：缺失状态为 `CACHE_MISS_REBUILDABLE`，必须从权威源和
  冻结代码自动重建；
- `PRIVATE_RUN_PROVENANCE`：缺失状态为 `OPTIONAL_PROVENANCE_MISSING`，只告警，
  不得阻断或伪造。

P0 capability doctor 只盘点路径和文件类型，没有读取文件内容。结果为：

- 5/5 个 `PRIVATE_SOURCE_AUTHORITY` role 存在，状态
  `SOURCE_AUTHORITY_AVAILABLE`；
- 10 个 `PRIVATE_DERIVED_CACHE` role 中 6 个存在、4 个尚未生成，状态
  `CACHE_MISS_REBUILDABLE`；
- 1 个本实验 `PRIVATE_RUN_PROVENANCE` role 尚未生成，状态
  `OPTIONAL_PROVENANCE_MISSING`；
- 总状态为 `DERIVED_CACHE_MISS_REBUILD_REQUIRED`；
- `safeToRebuildDerivedCache` 和 `safeToStartModelAfterRebuild` 均为 `true`。

因此 P0 没有权威源阻断。四个 cache miss 是 P2 的确定性重建计划，不允许从旧电脑
恢复，也不允许伪造成现成结果。

P0/P1 不读取 private outer outcome。只有 P0 和 P1 各自的普通 commit 已推送，且
exact-head Linux/Windows CI 成功后，P2 才能创建 runtime authorization 和新的
attempt receipt，读取所需 source authority、重建 derived cache，并执行一次受控
private 复现。

首个完整、可解释结果形成前，只允许修复 path、schema、memory、streaming、cache、
receipt、serialization 和 deterministic I/O 等基础设施问题；不得改公式、参数、
特征、fold、窗口或评价门。首个完整结果形成后立即冻结，不再执行第二版。

公开隐私门为至少 30 cases 且 20 works；未达到即
`SUPPRESSED_PRIVACY_THRESHOLD`。作品 ID、渠道 ID、作品名、private 路径、receipt、
逐行 actual 和 prediction 不进入公共 artifact。

## 授权边界

本实验授权：

- P2 读取已存在的 capability-scoped private source authority；
- 自动重建 derived cache；
- 为严格复现拟合 `M2-WORK-OA03`；
- Primary/Strict rolling 的 3/6/12 月预测；
- trailing-12 已有渠道分配；
- private row-level 预测和评价；
- 2,000 次 bootstrap；
- 达到隐私门的公共聚合。

不授权：

- later/final holdout；
- provider；
- production/shared/staging-like 数据库；
- exact v0.3 production loader/route/API；
- Canary/full160；
- automation、release、M3 formal；
- PR merge。

P0 尚未触发任何上述 private 执行能力。
