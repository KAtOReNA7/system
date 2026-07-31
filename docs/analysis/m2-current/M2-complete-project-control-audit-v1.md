# M2 完整项目控制审计 v1

> 状态：`M2_COMPLETE_PROJECT_CONTROL_AUDIT_READY_FOR_EXTERNAL_REVIEW`
>
> 中文状态：M2 完整项目控制审计已完成，后续算法开发暂停，等待用户与外部 ChatGPT 审阅。
>
> 审计日期：2026-07-31（Asia/Shanghai）
>
> 审计证据起点：分支 `codex/m2-head-protected-segmented-router-v0-1`，提交
> `51f62a1f295bcf108f72b5699901bb3f2c4f56e2`；对应 `origin/main`
> `628bc959e18457509e3120af11e0cb4708ffdb64`，活动分支领先 8、落后 0。
>
> 活动变更载体：[Draft PR #35](https://github.com/KAtOReNA7/system/pull/35)，审计开始时
> `Open / Draft / Unmerged / Mergeable`。
>
> 本轮计数：`modelExecutionCount=0`、`privateActualRowsRead=0`、
> `productionChangeCount=0`。

本报告只审计 Git 跟踪的公开证据、Git/PR/CI 元数据和公开聚合结果。它没有训练、拟合、
调参、选模、生成新预测、打开新实际值、打开独立后期起点或最终留出集，也没有修改生产。
报告发布提交的 exact HEAD 由 PR Git 历史和最终 CI 绑定；报告不制造自引用提交号。

证据等级统一为：

- `VERIFIED_FROM_CODE_AND_RESULT`：代码、合同与结果能相互核对；
- `VERIFIED_FROM_AGGREGATE_RESULT`：由已提交的公开聚合结果核对，未重读 private 行；
- `VERIFIED_FROM_GIT_HISTORY`：由 Git、PR 或 CI 历史核对；
- `DOCUMENTED_BUT_NOT_INDEPENDENTLY_VERIFIED`：仓库或用户已说明，但本轮不能独立重建；
- `NOT_RECOVERABLE_FROM_REPOSITORY`：仓库不能恢复；
- `USER_CONFIRMATION_REQUIRED`：确实会改变后续业务决策，需用户确认。

## 1. 执行摘要

**项目总体控制状态：`PARTIALLY_OUT_OF_CONTROL_RECOVERABLE`（部分失控、可恢复）。**

这不是“代码坏了”。相反，公开工程基线、跨平台 CI、private 隔离、机器 Registry、
命令生命周期和审计追溯都相当完整。部分失控发生在另一层：M2 在 35 个登记模型对象、
22 个实验、1,475 个 M2 相关跟踪文件和 60 个状态索引 artifact 之后，仍没有活动候选、
自动化批准、独立后期起点评价或生产模型；若继续相邻模型开发，治理与比较复杂度很可能
继续增长，而新增科学信息很少。`VERIFIED_FROM_CODE_AND_RESULT`

当前不存在一个可跨能力称为“总冠军”的模型：

- **运行兼容回退**是作品发生—金额校准模型 v0.3（`M2-WORK-OA03`）。这是 Registry
  的角色，不等于当前 Core 老品范围的性能冠军；当前范围复现没有给它新增性能支持。
- **研究比较基线**是人工锚定可学习全局模型（`M2-WORK-LG01`）。它在成熟老品 36
  个月及若干严格滚动比较中是最强的已保留简单基线，但成绩复用了开发窗口，不是独立证据。
- **预注册假设**是 LG01 头部保护尾段修正模型 v0.2（`M2-WORK-HPSR02`）。它只完成了
  独立评价前预注册和公开 synthetic 验证；没有独立成绩，不是活动候选。

最大三项问题：

1. **科学闭环没有跟上工程闭环。** 结果很多，但独立 later-origin、final holdout、
   active candidate、automation 和 production 均为 0。
2. **范围与治理膨胀。** 公司组合、未来新作品、渠道生成、商业状态历史等方向曾占用资源；
   部分有诊断价值，但不都是当前 cash-only 老品 M2 的核心。
3. **报告身份和门禁过密。** 123 个非模型标识、59 个可比组、311 个 package scripts、
   434 份 `m2-current`/`m2-v2` 文档 artifact，使“实现完成”容易被误读成“模型有效”。

现实终点应拆开：当前先把 **M2 研究结束** 作为目标，不把“生产完成”绑在同一阶段。
只有冻结假设获得一次真正独立的后期起点评价，或决定不再等待并冻结简单基线，才能关闭
cash-only 研究；生产化需要另行授权、业务验收、监控、回滚和发布合同。

**唯一推荐：继续暂停所有后续算法开发，先完成本报告的外部审阅；之后只在新的、合法且
独立的账单窗口可用并获得新授权时，执行一次已冻结的 HPSR02 评价。若它没有稳定、实质、
同案例改善，即结束 cash-only M2 研究并保留 OA03/LG01 角色，不再开发相邻模型。**
本轮不执行该建议。`VERIFIED_FROM_CODE_AND_RESULT`

## 2. 一页结论：项目是否失控

| 维度 | 0–5 | 结论与证据 |
|---|---:|---|
| 目标清晰度 | 4 | 当前 AGENTS、PRD 和 Registry 已把“成熟老品、已有渠道、未来分成现金”写清；历史上曾混入公司组合。`VERIFIED_FROM_CODE_AND_RESULT` |
| 范围控制 | 2 | 当前边界已纠偏，但 portfolio、future-new-work、commercial-state 和多轮渠道路线曾消耗开发。`VERIFIED_FROM_GIT_HISTORY` |
| 业务语义一致性 | 3 | 作品、渠道、现金类型和 Core 语义已基本统一；静态分类、billMonth 等业务事实仍主要来自用户确认。`DOCUMENTED_BUT_NOT_INDEPENDENTLY_VERIFIED` |
| 模型身份可理解性 | 3 | stable model ID 和 Registry 很好；35 个模型对象、123 个非模型 ID 仍给读者造成高负担。`VERIFIED_FROM_CODE_AND_RESULT` |
| 评价可比性 | 4 | v2.2 强制人口、actual、same-case 和 comparability group；历史口径与缺 raw 行仍限制重评分。`VERIFIED_FROM_CODE_AND_RESULT` |
| 数据边界合理性 | 4 | source authority/cache/provenance、分成/买断和 private/public 已分离；尚无独立新账单。`VERIFIED_FROM_CODE_AND_RESULT` |
| 执行可完成性 | 2 | 多次在候选结果前被环境、缓存、门槛或资格阻断；当前公共门禁稳定，但科学执行仍依赖合法数据窗口。`VERIFIED_FROM_GIT_HISTORY` |
| 跨电脑可迁移性 | 4 | Python resolver、clean-clone 合同和 public/private 解耦已建立；历史任务曾被 Git ignored 缓存反复阻断。`VERIFIED_FROM_CODE_AND_RESULT` |
| 报告与治理复杂度 | 1 | 1,475 个 M2 相关文件、60 个状态索引 artifact、311 个脚本，信息架构显著膨胀。`VERIFIED_FROM_GIT_HISTORY` |
| 工程质量 | 4 | 单一 current runtime、无逐字节重复 tracked blob、公开验证器、守恒与数值披露较完整；仍有大量历史入口。`VERIFIED_FROM_CODE_AND_RESULT` |
| 测试与 CI 价值 | 4 | Linux/Windows 同门禁，当前 exact-head CI 全绿；历史失败说明门禁确实捕获问题，但全绿不代表科学成功。`VERIFIED_FROM_GIT_HISTORY` |
| 科学证据质量 | 2 | same-case、bootstrap 和时间块已改善，但多数结论仍为开发窗口复用、单起点或后验诊断。`VERIFIED_FROM_AGGREGATE_RESULT` |
| 结果可复现性 | 4 | 冻结 config、Registry、公开聚合和 deterministic verifier 完整；private 行级重算不在本轮允许范围。`VERIFIED_FROM_CODE_AND_RESULT` |
| 投入产出比 | 1 | 工程资产显著增长，但 active candidate、automation、production 和独立后期结果均为 0。`VERIFIED_FROM_CODE_AND_RESULT` |
| 距离业务可用程度 | 2 | 有明确回退和研究基线，但没有获批候选、独立证明、业务验收或发布合同。`VERIFIED_FROM_CODE_AND_RESULT` |

合计 44/75，平均 2.93/5。评分不是模型指标，而是审计判断。

**为什么不是 `OUT_OF_CONTROL`：** 当前机器权威一致、历史结果不可变、生产未被修改、
private 边界没有被突破、活动 PR 单一且可合并，恢复路径明确。

**为什么不是 `CONTROLLED_WITH_MATERIAL_DRIFT`：** 范围漂移、报告膨胀和科学闭环缺失已不只是
局部偏差；继续开发会提高失控风险。

**需要停止什么：** 停止新增模型、调参、相邻消融和新标签打开。**不需要停止什么：**
不需要丢弃现有代码、删除失败证据或否定 M2；应先完成外部审阅和阶段决策。

## 3. M2 的真实目标与当前范围

### 3.1 用户目标与仓库实现并列

| 用户确认的业务定义 | 仓库当前实现 | 对齐状态 | 证据 |
|---|---|---|---|
| 预测成熟老品 | origin 至少有 3 个完整账单月，动态 Core80 为主、Core90 敏感性 | `ALIGNED` | 当前 AGENTS、范围合同。`VERIFIED_FROM_CODE_AND_RESULT` |
| 作品 ID 是预测对象 | `standardWorkId` 是作品粒度；名称只用于可读展示 | `ALIGNED` | schema、current runtime。`VERIFIED_FROM_CODE_AND_RESULT` |
| 只预测起点已有成熟渠道 | future-first channel 明确排除，首次有账单后才进入以后起点 | `ALIGNED` | observed-channel scope contract。`VERIFIED_FROM_CODE_AND_RESULT` |
| 目标是未来分成收入现金 | 买断及其他非分成现金在模型外，只留对账 | `ALIGNED` | target authority、current route。`VERIFIED_FROM_CODE_AND_RESULT` |
| horizon 为 3/6/12/36 月 | 当前证据矩阵覆盖 3/6/12/36；严格滚动 36 月仍有能力缺口；HPSR02 只针对 3 月 | `PARTIALLY_ALIGNED` | Registry、full-horizon matrix。`VERIFIED_FROM_CODE_AND_RESULT` |
| Core80/Core90 聚焦大部分收入、减少尾部噪声 | 每个 origin 用当时可见收入动态重算；服务人口与训练支持已分开 | `ALIGNED` | tail-interference test、AGENTS。`VERIFIED_FROM_CODE_AND_RESULT` |
| Core 不是公司全年总收入/预算/新作组合 | 当前机器权威已明确；历史 portfolio 实验曾越出当前范围 | `PARTIALLY_ALIGNED` | Registry 与 Git 历史。`VERIFIED_FROM_GIT_HISTORY` |
| 排除公司总收入、收入缺口、未来新作金额/名称 | 当前作品模型已排除；portfolio reference 保留为历史参考 | `PARTIALLY_ALIGNED` | current roles、LRC/ETS 报告。`VERIFIED_FROM_CODE_AND_RESULT` |
| 排除起点后首次出现渠道 | actual 和服务覆盖均不把 future-first 当预测为 0 | `ALIGNED` | scope contract、allocation report。`VERIFIED_FROM_CODE_AND_RESULT` |
| 排除买断及其他非分成现金 | pure-buyout 返回 `null abstain`，原因为 `buyout_outside_m2_forecast_scope` | `ALIGNED` | current route。`VERIFIED_FROM_CODE_AND_RESULT` |
| 三级分类、作品来源建立时基本固定 | AGENTS 允许作诊断/预注册回退，不允许直接金额倍率 | `ALIGNED` | 当前治理；固定性来自用户事实。`DOCUMENTED_BUT_NOT_INDEPENDENTLY_VERIFIED` |
| 不制造复杂 historical `availableAt` | 当前治理已豁免上述静态字段；历史 commercial-state 路线曾过度要求 | `PARTIALLY_ALIGNED` | AGENTS 与历史审计。`VERIFIED_FROM_GIT_HISTORY` |
| `billMonth` 是财务入账月，平移 1–2 月不改变曲线理解 | 当前目标以 posting month 为起点，并另设冲销重述视图 | `ALIGNED` | evaluation v2.2。业务解释为用户事实。`DOCUMENTED_BUT_NOT_INDEPENDENTLY_VERIFIED` |
| ISBN、版次、音频产品、平台条目不是独立对象 | canonical work identity 汇总到 `standardWorkId` | `ALIGNED` | identity/schema。`VERIFIED_FROM_CODE_AND_RESULT` |
| 会员/广告平台是黑箱，消费/曝光/eCPM 不是当前必要输入 | current cash-only 模型不把这些字段设为 capability source authority | `ALIGNED` | current configs。`VERIFIED_FROM_CODE_AND_RESULT` |
| 单购可抽象为统一销售变化，不要求逐作售价/分成率 | 当前实际值直接使用分成账单现金 | `ALIGNED` | target authority。`VERIFIED_FROM_CODE_AND_RESULT` |
| 第一次财务账单视为首次上线；状态与上架同义 | channel entry 由首笔账单定义；状态历史不再阻断 cash-only 模型 | `ALIGNED` | current scope。用户语义未独立核验。`DOCUMENTED_BUT_NOT_INDEPENDENTLY_VERIFIED` |
| 版权状态与在售状态不同 | current contract 分离 rights 与 listing 语义 | `ALIGNED` | domain governance。`VERIFIED_FROM_CODE_AND_RESULT` |
| 推广、推荐位、限免不是核心输入 | current model configs 未要求 | `ALIGNED` | configs。`VERIFIED_FROM_CODE_AND_RESULT` |
| 三级分类只是假设，不能直接乘金额倍率 | channel scalar/category multiplier 路线不再获授权 | `ALIGNED` | AGENTS、channel architecture audit。`VERIFIED_FROM_CODE_AND_RESULT` |
| 平台整体趋势可作背景尺度 | LG01 等允许 origin-safe 的全局统计支持 | `ALIGNED` | LG01 input contract。`VERIFIED_FROM_CODE_AND_RESULT` |

### 3.2 人工规则基线

核心收入人工规则基线 v0.1（`M2-WORK-CRMR01`）忠实实现了用户给定的月滚动、
3 个月最新月×3、6 个月最近半年、12 个月按趋势在两种锚之间取 MAX/MIN、36 个月
逐年增长系数的规则，因此**实现对齐是 `ALIGNED`**。但无界复利使 36 个月 WAPE 在
Core80 达 113.43、Core90 达 104.38；把增长系数固定为 1 的反事实 36 月 WAPE
分别降到约 0.660 和 0.721。这是**长期稳定性失效**，不是短期人工经验无效。
`VERIFIED_FROM_CODE_AND_RESULT`

### 3.3 Core 的正确解释

Core80/Core90 是每个 forecast origin 的**服务/评价人口选择器**，目的是覆盖当时可见
收入的大部分，而不是把尾部收入补回公司组合。训练人口另行预注册。尾部干扰测试未确认
缩到 Core90 能稳定改善，Core80-only 训练反而在 3/6 月恶化约 4.46%/4.70%；因此保留
全体成熟历史作 `FULL_MATURE_TRAINING_SUPPORT` 是合理研究参考，不等于服务尾部。
`VERIFIED_FROM_AGGREGATE_RESULT`

## 4. 非技术读者版：M2 到底在做什么

假设现在是 7 月，要预测一部已经有多年账单的有声书未来 3、6、12、36 个月会收到多少
分成现金。M2 先确认这部作品在 7 月之前至少有 3 个完整账单月，再只看它在 7 月之前已经
出现过的渠道。它不会猜未来会突然新增哪个平台，也不会把买断款、未来新书或公司收入缺口
塞进预测。

我们手里主要是按作品、渠道和财务入账月整理的历史分成账单。系统会看近期现金、历史同期、
趋势和全体成熟作品提供的统计尺度。头部几十部作品很重要，是因为它们覆盖了大部分现金；
但“头部”每个月都按当时可见收入重算，不能拿今天的畅销名单回看过去。

可以把几个主要方法理解为：

- 人工规则像业务人员拿“最新月、半年、去年同期、趋势”做一张滚动表；
- OA03 像先问“未来是否还有收入”，再估“有收入时大约多少”，目前只保留作兼容回退；
- LG01 像在人工锚的基础上，让全部成熟历史学习一个统一修正，是当前研究比较基线；
- 生命周期、渠道、分类和分段尝试，是在问“不同阶段、平台或现金层是否要用不同修正”。

很多尝试失败，并不表示预测理论上不可能。失败原因包括：候选确实比基线差、代码实现的
其实只是倍率而非理论中的生成机制、资格门槛不适合出版行业规模、只有一个时间起点、
工程故障发生在结果之前，以及只有后验切片看起来变好。当前可以稳定做到的是：明确人口、
重现简单基线、给出同案例误差并保留失败证据；做不到的是证明一个新模型在未来独立月份
稳定胜出，更做不到直接上线。

HPSR02 目前只是一个已冻结的窄假设：收入头部和中部仍用 LG01，只在尾部现金带用已有的
有界修正，而且只看 3 个月。新账单重要，是因为只有新的 forecast origin 才能避免再次
用开发数据证明自己。若这次独立评价仍没有稳定、实质改善，就应停止继续试相邻模型，
把 cash-only 数据的信息上限写清。

## 5. 当前模型与最佳成绩

所有“最好”都受人口、horizon、actual、same-case 和独立性约束。不同 actual 定义、
portfolio 与 work、Primary 与 Strict 不能放在一个排行榜。

| 能力 | 当前最好对象/结论 | 数字与适用范围 | 独立性和置信度 |
|---|---|---|---|
| Core80 作品总额 3 月 | 无确认冠军；Primary 描述领先为 OA03，Strict 描述领先为 LG01 | Primary same-case：OA03 WAPE 0.262461、bias -0.036460，人工规则 0.265224、+0.246510；Strict：LG01 0.292427、-0.1214，人工规则 0.691435、+0.5719 | 开发窗口复用；时间块/偏差不支持统一胜者。低至中置信。`VERIFIED_FROM_AGGREGATE_RESULT` |
| Core80 作品总额 6 月 | 无确认冠军，人工规则与统计基线有 WAPE/bias 交换 | Primary：人工规则 0.265139、+0.11387；OA03 0.283949、+0.000818。Strict：人工规则 0.303323、+0.1553；LG01 0.333977、-0.1136 | 非独立，bias 方向相反。低置信。`VERIFIED_FROM_AGGREGATE_RESULT` |
| Core80 作品总额 12 月 | 无跨人口冠军；Primary OA03、Strict LG01 是描述领先 | Primary：OA03 0.248919、+0.008341；人工规则 0.379738、+0.309667。Strict：LG01 0.306360、-0.0647；人工规则 0.803814、+0.6539 | Strict 对人工规则是清晰胜出，但整体仍非独立。中低置信。`VERIFIED_FROM_AGGREGATE_RESULT` |
| Core80 作品总额 36 月 | LG01 是当前同案例描述最佳 | Primary same-case：LG01 WAPE 0.284898、bias +0.075559；人工规则 18.649596、+18.61464 | Strict 36 月不可用；开发复用。中置信、非发布结论。`VERIFIED_FROM_AGGREGATE_RESULT` |
| Core90 敏感性 | 无统一冠军；36 月 LG01 明显优于人工规则，3/6/12 月仍有 trade-off | Primary H36：LG01 0.332402，对人工规则 10.560634；H3/H6/H12 在 OA03、LG01、人工规则之间随口径变化 | 只是敏感性人口，不得替代 Core80 主结论。低至中置信。`VERIFIED_FROM_AGGREGATE_RESULT` |
| mature legacy 全量人口 | LG01 是保留的研究基线 | H36 Primary：LG01 WAPE 0.440225、bias -0.123771；人工忠实公式 0.531410、-0.405523 | 12,039 cases、1,125 works、13 origins，但复用开发窗口。中置信。`VERIFIED_FROM_AGGREGATE_RESULT` |
| 作品×已有渠道分配 | 无确认冠军；trailing-12 份额只得到混合证据 | Core80 current same-case H3/H6/H12：WAPE 0.294089/0.315692/0.286101；相对 direct FVA +0.84%/-7.10%/+32.81% | bootstrap/时间块混合，H36 不可用。低置信。`VERIFIED_FROM_AGGREGATE_RESULT` |
| portfolio reference | ETS01 是 Registry 参考，不是当前 M2 冠军 | pooled WAPE 0.127950、bias +0.100483；相对 seasonal naive WAPE 改善 22.24%，但 H12 0.1094 劣于 naive 0.0848 | 小样本、非独立且粒度不同。中低置信。`VERIFIED_FROM_AGGREGATE_RESULT` |
| occurrence | 无确认冠军 | PSC01 occurrence Brier 0.25234、PR-AUC 0.73755；OA03 有发生输出但 Strict Core80 正例占比极高 | PSC 点额失败；OA03 发生分数区分力有限。低置信。`VERIFIED_FROM_AGGREGATE_RESULT` |
| conditional amount | 无合格对象 | PSC01 positive-amount WAPE 0.949714；OA03 当前 artifact 未存独立 conditional-amount 输出 | 缺少可接受且同口径的候选。`VERIFIED_FROM_CODE_AND_RESULT` |
| ranking | 无合格对象 | channel experts Spearman Primary/Strict 0.8343/0.9056，但点预测 WAPE 失败 | 排序高不等于现金金额可用，且无独立时间证明。低置信。`VERIFIED_FROM_AGGREGATE_RESULT` |
| interval/risk | LG01 是保留的诊断领先者 | 名义 90%/80%/60% 区间覆盖 0.8985/0.8009/0.5995 | 接近校准但仍是开发证据；多数模型没有原生区间。中置信。`VERIFIED_FROM_AGGREGATE_RESULT` |
| operational fallback | OA03 | Registry 明确角色；当前 served 7,083 cases 的历史 Primary WAPE 0.490759、bias +0.073781 | 兼容角色，不代表当前 Core scope 获得性能支持。高置信角色、低置信效果。`VERIFIED_FROM_CODE_AND_RESULT` |
| research baseline | LG01 | Primary H36 0.440225/-0.123771；Strict pooled 0.411919/-0.038474 | Registry 明确角色；非独立。高置信角色、中低置信效果。`VERIFIED_FROM_CODE_AND_RESULT` |

## 6. 模型发展时间线

| 时间/阶段 | 做了什么 | 结果与停止原因 | 留下的资产/是否偏离 |
|---|---|---|---|
| 2026-07-15 起，早期校准与 PR #1 | 建立分群校准、旧公式比较 | 新分群候选未形成可发布改善 | 建立 work-level 回测骨架；仍属 M2 |
| PR #7 及历史证据阶段 | 建立 cryptographic authority、多层评价与全局候选活动（`M2-EXP-R0-R5-01`）及旧 C1–C3 追溯 | 多个候选被 nested gate 拒绝 | 不可变历史证据有价值；标识治理开始变重 |
| 2026-07-24，OA03/组合/历史状态 | 固化发生—金额校准、portfolio ETS、后验状态诊断 | OA03 成为兼容回退；ETS 仅 portfolio 参考；状态诊断被拒 | 建立多粒度角色分离；portfolio 不属当前 Core M2 |
| 2026-07-25，渠道与人工锚 | 统一渠道曲线、人工渠道、人工忠实公式 | 新渠道曲线/人工渠道未胜 OA03；人工公式作为比较器 | 建立 canonical channel 与人工锚 |
| 2026-07-26，LG01、TSB、生命周期 | 学习全局修正、间歇发生、五状态生命周期 | LG01 保留；TSB 原始/混合均劣；生命周期只有极小后验增益 | 得到研究基线和 raw-vs-fallback 规则 |
| 2026-07-27，渠道专家与生成机制 | 倍率专家、独立月度 occurrence×amount 设计 | v0.1 实现只是倍率且失败；v0.2 在资格门槛前无 raw candidate | 证明实现失配与 arbitrary threshold 风险；没有证明生成理论失败 |
| 2026-07-28，出版规模与评价 v2.1/v2.2 | 按出版支持规模修订渠道核心；建立严格可比、冲销重述 | PSC01 3,318,819 行预测有效但 WAPE 约 0.92，明确失败；评价合同激活开发口径 | 有效负结果；actual 视图和 residual 隔离资产 |
| 2026-07-29，人工规则、分层组合、Core 纠偏 | 复刻人工规则；四组件组合；动态 Core 与尾部干扰测试 | 人工规则长周期爆炸；LRC 12/36 月失败且偏出当前 M2；未确认尾部干扰 | 业务规则基线、守恒、Core 合同；纠正公司组合误读 |
| 2026-07-29，周期路由与已有渠道分配 | 补 3/6/12/36 same-case；按周期选模型；trailing-12 分配 | 6 月路由退化，整体未确认；渠道分配 mixed | 完整能力矩阵和 conservation 资产 |
| 2026-07-30，OA03 当前范围复现 | 同公式在新范围重跑并核对已有渠道 | 技术复现完成，但不能复现旧数值，当前效果 mixed/not supported | 纠正 OA03 “冠军”叙述；保留兼容回退 |
| 2026-07-30，CHAM01 | 分别拟合 3/6/12 月金额 | Strict H3 仅 +2.66% 且 CI 跨 0；H6/H12 退化；Primary/Core90 数值爆炸 | 有效负结果和 numeric-stability 披露 |
| 2026-07-30，HCRC01 | 尝试只修正 LG01 头部现金残差 | 16 个外层单元均无合格 alpha，C2/C3 raw cases 为 0，全量回退 | 这是 selection-gate failure，不是候选性能成绩 |
| 2026-07-31，HPSR01 | 头部保护、分现金带路由；合法回溯开发评价 | 单起点 57 works：FVA +0.8477%，bootstrap 跨 0，绝对 bias 恶化 2.0358pp；合同不支持、科学上不确定 | 保留单起点诊断；未进入独立评价 |
| 2026-07-31，HPSR02 | 只修 L20，H50/M30 保持 LG01；独立前预注册 | 未读新 actual、未执行独立评价 | 唯一冻结假设；当前只是 preregistration/implemented synthetic |

时间线由 Git 可达提交、PR #1–#35、Registry evidenceRefs 和公开 aggregate 交叉核对；
原始历史自然语言指令并非全部进入仓库，不能假装逐份审阅。`VERIFIED_FROM_GIT_HISTORY`

## 7. 真实进展、阻断和失败重新分类

### 7.1 结果产出与授权漏斗

Registry 有 22 个实验。按“是否尝试形成真实开发/外层结果”计，21 个进入结果执行流程；
HPSR02 只预注册并 synthetic 验证。19 个实验至少留下一个合法 raw candidate 结果；
渠道生成 v0.2、HCRC01 和 HPSR02 没有 raw candidate。

- **结果产出率：19/21 = 90.5%。** 这是“有合法结果”，不是“结果成功”；包含失败、历史
  archive 和开发复现。
- **成功活动候选率：0/21 = 0%。**
- **治理/阻断比例的可验证下界：3/22 = 13.6%。** 分子只计“最终仅剩资格阻断、
  universal fallback 或 preregistration/synthetic”的注册实验。任务级治理工作散落在
  commit、closure 和 state-index 中，无法恢复唯一 task 分母，因此真实比例只会更高，
  不伪造精确值。

| 项目 | 可验证数量 | 说明 |
|---|---:|---|
| 有首个合法 raw candidate 的实验 | 19 | Registry 22 个实验中排除 GEN02、HCRC01、HPSR02 |
| 真正训练过的模型 | ≥14 | 公开代码/结果可确认的保守下界；Registry 没有统一 `trained` 布尔值，历史公式、选择器与拟合器无法无歧义同计 |
| 只完成 preregistration | 0 | HPSR02 同时完成 canonical implementation/synthetic，因此不算“纯预注册” |
| 只到 implementation/synthetic | 1 | HPSR02；独立评价 0 |
| 在合法 outer candidate 前被资格阻断 | 1 | channel generative v0.2 |
| 结果前至少一次工程故障的实验 | ≥4 | PSC01、CHAM01、OA03 current replication、LRC01；是实验级保守下界，不是 retry 次数 |
| 有结果后明确失败/拒绝 | ≥15 | 保守下界；不把 mixed/inconclusive 强行算失败 |
| mixed/inconclusive | ≥4 | Core 人口/尾部、周期与渠道分配、OA03 当前范围、HPSR01 |
| 等待独立数据 | 1 | HPSR02 |
| 真正进入 independent later-origin | 0 | HPSR01 是合法回溯、非独立 |
| final holdout opened | 0 | 所有 35 个模型均为 false |
| activeCandidate | 0 | Registry 为 null |
| automation approval | 0 | 所有 35 个模型均为 false |
| production modification | 0 | 所有 35 个模型 `productionImported=false` |

### 7.2 历史失败的真正类别

| 对象 | 重新分类 | 结论 |
|---|---|---|
| 渠道倍率专家 v0.1（`M2-CHAN-SCL01`） | `IMPLEMENTATION_MISMATCH` + `MODEL_PERFORMANCE_FAIL` | 代码是 scalar multiplier/recalibration，不是独立 channel-time generator；其失败只否定该实现。渠道倍率专家实验第 6 候选臂（A6）WAPE Primary/Strict 0.537767/0.658653，明显劣于 LG01。 |
| 渠道生成 v0.2（`M2-CHAN-GEN02`） | `ARBITRARY_THRESHOLD_BLOCK` + `CONTRACT_SEMANTIC_BLOCK` | 核心执行已开始，但独立作品支持 25–32，低于无业务证据的固定 50，outer fold 0 在候选预测前停止；没有 raw performance。 |
| 出版规模渠道核心（`M2-CHAN-PSC01`）首轮 | `INFRASTRUCTURE_FAILURE_BEFORE_OUTCOME` | 首次尝试在候选 fit 前 fail-closed；不能算模型失败。 |
| 出版规模渠道核心有效轮 | `VALID_NEGATIVE_RESULT` + `MODEL_PERFORMANCE_FAIL` | 3,318,819 行 raw prediction；Primary WAPE 0.924087 对 LG01 0.443100，Strict 0.915333 对 0.412813。只证明该 amount mechanism 失败，不证明所有渠道机制无效。 |
| 固定 50/100 门槛 | `ARBITRARY_THRESHOLD_BLOCK` | 首见于历史 PR #28 相关提交，没有出版项目 learning curve、ESS 或失败概率依据；后续 PSC 改为支持层级/ESS。 |
| 人工规则 36 月 | `MODEL_PERFORMANCE_FAIL` | 原因是增长/下降系数跨年无界复利，不是 3/6/12 月人工锚整体无用。 |
| 分层收入组合（`M2-PORT-LRC01`） | `OUT_OF_SCOPE` + `VALID_NEGATIVE_RESULT` | portfolio 3/6 月尚可，12/36 月 WAPE 0.553/1.964；公司组合与未来新作不属当前 work-level M2。 |
| CHAM01 | `VALID_NEGATIVE_RESULT` + numeric failure | Strict H3 小幅改善但 CI 跨 0；H6/H12 退化；五个 Primary/Core90 单元为有限极端值。不能推导“周期模型永久无效”。 |
| HCRC01 | `CONTRACT_SEMANTIC_BLOCK` / selection-gate fail | 没有合格 alpha、没有 C2/C3 raw cases；selected 全回退 LG01，不能写成模型性能成绩。 |
| HPSR01 | `EVIDENCE_INCONCLUSIVE`，同时原合同 `MODEL_PERFORMANCE_FAIL` | 机械门槛失败正确；FVA +0.8477%、bootstrap [-18.3441%, +20.0303%]、bias 恶化刚超 2pp，单起点不足以永久否定方向。 |
| HPSR02 | preregistered model object，非 raw candidate | 是已实现并 synthetic 验证的预注册独立候选结构；没有实际评价、不是 active candidate、更不是生产模型。 |
| 历史 private/cache 恢复阻断 | `PRIVATE_ARTIFACT_PORTABILITY_BLOCK` / `REPORTING/GOVERNANCE ERROR` | 可重建 cache 或 historical receipt 曾被误当执行前提；当前 AGENTS 已区分三种 private 角色。 |
| 当前缺新独立月份 | `DATA_NOT_AVAILABLE` | 这是合法科学边界，不是代码故障；本轮没有打开或推断新 actual。 |

## 8. 业务语义对齐

当前 canonical 语义可以概括为：

1. `standardWorkId` 是作品，渠道是作品在 origin 前已有账单的 canonical channel；
2. actual 只来自人工拆分后的分成账单；
3. `billMonth` 是 posting-time 财务月；冲销另有 as-of/final/modelable restatement；
4. pure-buyout 是 `null abstain`，不是 0；
5. dynamic Core 由每个 origin 当时可见收入选取；
6. 训练支持、服务人口、served coverage、company-cash economic scope 分开；
7. category/source 可作诊断或预注册层级回退，不能直接乘金额倍率。

这些语义在当前 AGENTS、Registry、route 和评价合同中基本一致。
`VERIFIED_FROM_CODE_AND_RESULT`

仍有三类限制：

- 用户关于分类固定性、billMonth 业务解释、首账单即上线、平台黑箱等事实，本轮只能核对
  它们是否已进入治理，不能用公开仓库独立证明现实世界事实。
- historical route 为冻结兼容仍含旧买断承诺处理；current route 已正确 abstain。历史代码
  不能被误认为当前实现，也不应为了“清理”而改写。
- 当前完整账单截止月份和 HPSR02 所需月份只来自既有公开 readiness 元数据；本轮没有读取
  actual 值，也不把文件存在当真实性通过。

结论：**当前业务语义总体 `ALIGNED`，历史演进为 `PARTIALLY_ALIGNED`；没有发现当前 Core
被继续解释为公司组合目标。**

## 9. 评价与数据边界

### 9.1 评价合同演进

| 版本 | 解决的问题 | 仍有的限制 |
|---|---|---|
| v1 | 用 WAPE 表达总体金额误差，用 signed bias 表达系统性高估/低估 | 看不到个体误差分布、稳定性、发生/金额拆解、排序、区间和时间独立性；历史分母口径不完全统一 |
| v2 proposal | 增加 horizon 分层、same-case、MAE/median AE、bootstrap/time block、occurrence、conditional amount、ranking、interval | 初始只是 proposal；raw 行、pre-origin scale 和 native interval capability 不齐 |
| v2.1 | 激活开发评价，明确 Primary/Strict、same-case 和 200 次 bootstrap | bootstrap 规模偏小；PR-AUC/AP 名称、冲销重述和 residual 处理仍需修正 |
| v2.2 | 2,000 次 cluster bootstrap、时间块、PR-AUC/AP 区分、四种冲销视图、冻结预测 label-only 重评分 | 合同很完整但复杂；production/automation gate 未激活，历史 base 文档与 activation amendment 需要分层阅读 |

WAPE/bias 仍应是现金金额的主指标；MAE、median AE、时间块、cluster bootstrap 是必需的
稳定性证据。occurrence、conditional amount、ranking、interval 只在模型确实输出对应
能力时作为诊断或独立能力，不应强迫每个模型共享一个排行榜。top revenue 分组只能在
结果后作归因，不能用于事后选模。

### 9.2 冲销口径影响

同一冻结预测从 v2.1 原入账 actual 切到 v2.2 development-modelable restatement：

- OA03 WAPE 0.490759 → 0.486136；
- canonical channel curve WAPE 0.490701 → 0.485389；
- LG01 Primary WAPE 0.440225 → 0.443114；
- LG01 Strict WAPE 0.411919 → 0.412814；
- LG01 overlap WAPE 0.277239 → 0.274130。

292 个 cases 被恢复、143 条 reversal 保留、未分配 residual -267.769… 继续留在财务对账，
6 个冻结 artifact / 716,801 行预测未改变。变化不大，既有失败结论没有反转；但两个 actual
definition 属于不同 comparability group，不能跨组宣称模型改善或退化。
`VERIFIED_FROM_AGGREGATE_RESULT`

### 9.3 推荐的精简评价框架（仅建议，不激活）

1. **主表只保留**：同案例 WAPE、signed bias、case/work/origin 数、2,000 次 work-cluster
   bootstrap FVA、至少两个合法时间块。
2. **三态结论**：`SUPPORTED / INCONCLUSIVE / NOT_SUPPORTED`；materiality 与 bias
   guardrail 做 threshold-sensitive 附表，避免单点悬崖。
3. **能力附表**：只有模型原生输出时才报告 occurrence（Brier、AP/PR-AUC）、
   conditional amount、ranking、interval calibration。
4. **actual 分层**：posting-time 与 modelable-restated 永不混排；只允许冻结预测做
   label-impact 配对。
5. **授权分层**：development、independent later-origin、final holdout、business
   acceptance、production 五个门，状态最多一行，不再为每个小步骤造新状态码。

### 9.4 数据缺口分级

| 数据/语义 | 分类 | 当前判断 |
|---|---|---|
| 真实分成账单、`standardWorkId`、canonical channel、billMonth | A 当前必需 | 已有 private source authority 合同；本轮未读取行值 |
| 上下架、授权开始/终止 | B 有帮助非必要 | 可作异常诊断，不应阻断 cash-only 老品 |
| 三级分类、作品来源 | B 有帮助非必要 | 固定业务字段，可验证层级差异，不直接赋倍率 |
| historical `effectiveAt`/`availableAt`（对上述固定字段） | E 仓库曾错误假设需要 | 当前不应伪造；只有会随时间变化且模型使用的状态才需 origin-safe 时间 |
| 消费/收听/阅读、曝光/eCPM | D 用户明确不存在或无意义 | 平台黑箱；不是当前阻断 |
| 订单/退款、价格/折扣、逐作品分成比例、平台分配池 | B 或 D | 账单现金已吸收结果；除非未来建立明确机制模型，不是当前必需 |
| 推广/推荐位/限免 | B 有帮助非必要 | 可解释异常，不是核心输入 |
| future-first channel、新作品 | C 未来新作/新渠道阶段 | 当前明确排除；不能当 actual=0 |
| 新的独立账单月份 | A（仅独立评价需要） | HPSR02 的科学评价需要，但本轮禁止打开 |

## 10. 工程质量与科学质量

### 10.1 工程质量

做得好的部分：

- current loader、route、API、fixture composition 保持单一 canonical 路线；生产 loader
  不导入 HPSR、渠道生成或 PSC challenger；
- doctor 与执行器共用 Python 3.11–3.13 resolver，Linux/Windows 使用同一公开门禁；
- 公开 clone 能 lint/build/test/smoke，private 缺失只阻断所属 capability；
- source authority、derived cache、run provenance 三种角色已明确；
- no-real-data、cash conservation、reversal reconciliation、numeric stability、
  Registry validator 和 report verifier 已形成；
- 当前 2,164 个 tracked 文件中没有逐字节重复 blob group；
- 311 个 package scripts 全部被 lifecycle registry 分类：43 current-public、1 history
  dispatcher、183 archive-only、84 restricted-local，无未分类项。

仍需收敛：

- 183 个 archive-only 命令和大量历史 runner 虽有审计价值，但给维护者造成高认知成本；
- `src/domain/m2Current` 48 个文件（47 个 JS）中，很多 challenger 不被 production
  引用；它们是冻结证据，不等同于可随意删除的 dead code；
- 本轮只证明“无生产入口引用”和“无逐字节重复”，没有逐个证明所有历史模块无合同、
  测试或审计引用，因此不宣称可删除 dead code；
- 历史 PR workflow 有 29 次 failure；45 个失败 step 事件主要落在 public default
  registry（16）、S1 preflight（9）、Test（8）、S0 doctor（7）、historical contracts
  （4）、authority proof（1）。一个 run 可含多个事件，这不是根因次数。

工程结论：**4/5，基本受控。** `VERIFIED_FROM_CODE_AND_RESULT`

### 10.2 科学质量

做得好的部分：

- origin-safe、same-case、population、actual definition 和 raw/fallback 已显式化；
- 2,000 次 cluster bootstrap、time block、bias trade-off、threshold sensitivity 已进入
  v2.2；
- HPSR01 保留机械失败但把科学解释改成 inconclusive，避免把单起点写成永久失败；
- 冻结预测在 actual 重述时不改写，post-hoc 和 prospective preregistration 分开。

核心不足：

- 0 个实验真正进入 independent later-origin，0 个 final holdout；
- LG01、OA03 和多数 challenger 都复用开发窗口；
- 多个方向由同一数据连续启发，multiple comparisons 风险高；
- HPSR01 只有一个 origin、57 works，head cash concentration 使普通 case 数不等于独立
  支持；
- 部分模型缺 raw 行、pre-origin MASE scale 或 native interval，历史结论不能完整重评分；
- 大量失败是有效负结果，但没有收敛成“信息上限”，反而连续生成相邻模型。

科学结论：**2/5，明显不足。** `VERIFIED_FROM_AGGREGATE_RESULT`

**工程上越来越完整，确实在一定程度上掩盖了模型科学上没有明显进展。** CI 全绿证明
artifact 一致、代码可运行、边界未破坏；它不证明预测在未来独立月份胜过 LG01。当前最强
科学事实不是“找到新冠军”，而是清楚知道多类复杂机制没有在开发证据中稳定增值。

## 11. 指令、AGENTS 与治理问题

### 11.1 25 项指令质量核验

| # | 疑似问题 | 判断/严重度 | 主要来源 | 后果、证据与动作 |
|---:|---|---|---|---|
| 1 | 固定 branch/HEAD/PR | 成立/高 | ChatGPT 指令/旧治理 | 合并后指令失效；历史恢复任务反复纠偏。删除固定状态，运行时解析。 |
| 2 | cache/receipt 当 source authority | 成立/高 | ChatGPT 指令/旧治理 | 跨电脑误阻断。当前三角色规则已修复，应固化。 |
| 3 | Git ignored 缺失反复阻断 | 成立/高 | 工程/旧治理 | 可重建 artifact 被当先决条件。保留 capability doctor，删除 cache 必须存在。 |
| 4 | 固定路径/SHA/digest/换行门禁 | 部分成立/中 | ChatGPT 指令 | digest 对内容绑定有价值，本机路径和运输 hash 无业务价值。简化并分层。 |
| 5 | 工程故障消耗科学窗口 | 成立/高 | 工程/ChatGPT 指令 | PSC/CHAM 等曾在 outcome 前关闭。工程失败不得计科学 retry。 |
| 6 | 单次 retry exhausted 永久无结果 | 成立/高 | ChatGPT 指令 | 造成 invalid closure。改为“修复后重新授权”，不预设次数。 |
| 7 | 历史任务的 Python 环境阶段（K0）/公开实现准备阶段（K1）被误解为模型完成 | 成立/高 | Codex 报告 | implementation/readiness 被当 progress 终点。状态必须带对象类型和 outcome。 |
| 8 | 状态码过多 | 成立/高 | 旧治理/Codex 报告 | 123 个非模型 ID，用户难理解局部缩写。保留 stable ID，减少用户可见状态。 |
| 9 | 50/100 固定作品门槛 | 成立/高 | ChatGPT 指令 | GEN02 无 raw candidate。删除固定门槛，使用 ESS/learning curve/uncertainty。 |
| 10 | 大行业样本规则套出版 | 部分成立/中 | ChatGPT 指令 | 仓库无独立行业依据。未来门槛必须项目内证据化。 |
| 11 | 公司组合/未来新作偏离 M2 | 成立/高 | 早期业务定义/ChatGPT 指令 | LRC/portfolio/future-new-work 消耗资源。保留历史参考，移出 current M2。 |
| 12 | 过度 historical effectiveAt | 成立/中 | ChatGPT 指令/旧治理 | 固定 category/source 被错误阻断。只对真正时变字段要求时间可用性。 |
| 13 | 把平台行为数据当必要 | 部分成立/中 | 早期业务定义/ChatGPT 指令 | 早期语义审计扩大缺口；当前已不阻断。明确 cash-only minimum data。 |
| 14 | WAPE/bias 当唯一评价 | 历史成立、当前已修复/高 | 旧治理 | v2.2 已增加稳定性和能力指标；保留精简主表。 |
| 15 | 单一硬阈值门槛悬崖 | 成立/高 | ChatGPT 指令 | HPSR01 bias 仅超 0.0358pp 即机械失败。改三态并做阈值敏感性。 |
| 16 | 极少时间块写永久失败 | 成立/高 | Codex 解释/科学证据不足 | HPSR01 已修订为科学 inconclusive。固化最少独立时间证据。 |
| 17 | 独立性导致已有账单不能诊断 | 部分成立/中 | ChatGPT 指令 | 独立证据必须保留，但开发诊断和最终评价应分层，不应互相禁止。 |
| 18 | 每轮重复 Git/private/CI 模板 | 成立/中 | 旧治理/ChatGPT 指令 | 指令冗长、偏离科学问题。下沉 AGENTS/公共脚本。 |
| 19 | 每小步 commit/push/CI | 成立/高 | ChatGPT 指令/Codex 执行 | 304 个 M2 相关 commit 的治理负担显著。按可审阅单元批处理。 |
| 20 | receipt/manifest/digest 过多 | 部分成立/中 | 旧治理 | 守恒与真实性 digest 有价值；transport/provenance 不应成为业务门。 |
| 21 | 过度防止数据打开 | 部分成立/高 | ChatGPT 指令 | 保护 holdout 正确，但可合法开发诊断曾被一并阻断。权限按用途分层。 |
| 22 | 指令太长、停止条件过多 | 成立/高 | ChatGPT 指令 | 多个 closure 停在 readiness。采用一页模板和单一 completion condition。 |
| 23 | 失败后立即开发相邻模型 | 成立/高 | 用户选择/ChatGPT 指令/Codex 执行 | LG01 后连续 TSB/lifecycle/channel/CHAM/HCRC/HPSR。当前必须总复盘。 |
| 24 | public/private、安全/科学混合 | 成立/高 | 旧治理/ChatGPT 指令 | 工程 capability 与模型证据状态相互污染。分别报告。 |
| 25 | 实现/验证/授权/发布层级过用 | 部分成立/中 | 旧治理/Codex 报告 | 分层本身必要，但每步生成新状态造成噪声。保留四层含义，压缩 artifact。 |

责任不是单方：用户早期业务边界不完整、外部 ChatGPT 的长指令设计、Codex 的实现/报告
选择、仓库旧规则、真实数据不足、工程缺陷和合理科学失败都存在。无法从仓库恢复每一份历史
原始指令文本，以上结论依据结果、commit、状态码与实现影响，而非假装逐字审阅。

### 11.2 AGENTS 建议（本轮不修改）

**A. 永久固化：**

- 中文优先、stable model ID 与对象类型同时出现；
- current M2 目标、Core 用途、future-first/buyout/portfolio 排除；
- source authority / derived cache / provenance 三分；
- 动态解析 repo/branch/HEAD，禁止本机路径和运输 hash 成为合同；
- historical result 不改写，raw candidate 不被 fallback 掩盖；
- infrastructure failure、contract block、model failure、inconclusive 分开；
- same-case、origin-safe、actual/population/comparability group；
- implementation、validation、authorization、release 四层只保留统一定义。

**B. 从 AGENTS/通用模板删除或缩短：**

- 无项目证据的固定样本量、固定 retry 次数；
- 固定 branch/SHA/PR 状态、private cache 必须存在；
- 每一小阶段多次 CI、重复列出已由脚本执行的门禁；
- transport receipt/digest 和与当前阶段无关的 release/M3 规则；
- 具体实验参数、arms、阈值和 holdout 日期。

**C. 只留在单次 preregistration：**

- population、horizon、actual、arms、参数和 materiality；
- bootstrap 单元与次数、time block、multiple-comparison 处理；
- success/failure/inconclusive gates、fallback、holdout；
- 该实验允许读取的数据、一次执行授权和停止条件。

### 11.3 未来 Codex 指令最小模板

> **目标**：一句话说明要回答的业务/科学问题，不写“继续优化”。
>
> **允许范围**：列出唯一 capability、模型/实验 ID、人口、horizon。
>
> **禁止范围**：新模型、调参、private actual、holdout、生产等未授权项。
>
> **数据**：source authority、可读取窗口、禁止窗口、actual definition。
>
> **实验**：冻结候选、基线、same-case、fallback；工程失败不消耗科学结果。
>
> **评价**：WAPE、bias、cluster bootstrap、time blocks、三态门；能力附表按需。
>
> **完成条件**：一个 outcome 或一个真实 block；禁止以 implementation 代替 outcome。
>
> **交付**：最多一个 MD、一个 JSON；中文结论先行。
>
> **Git**：运行时解析当前分支/PR；一个普通 commit/push；exact-head CI；不 merge。

## 12. 范围漂移

| 方向 | 分类 | 是否占用资源/价值 |
|---|---|---|
| 公司未来总收入 | `OUT_OF_SCOPE_DRIFT` | LRC/portfolio 方向占用开发；对公司规划有价值，但不是当前作品 M2 |
| 未来新增作品组合 | `OUT_OF_SCOPE_DRIFT` | 有 future-new-work 文档；不应进入当前 actual |
| portfolio ETS | `SUPPORTING_DIAGNOSTIC` | 有有效参考价值，必须保持独立 capability |
| 新作品 | `FUTURE_PHASE` | 当前正确 abstain/排除 |
| future-first channel | `FUTURE_PHASE` | 当前正确排除；首次账单后才进入后续起点 |
| commercial-state 历史 | `NECESSARY_BUT_OVERBUILT` | 真正时变状态可能有用，但固定分类/source 不需伪造 history |
| channel generative | `VALID_FAILED_EXPERIMENT` | 理论路线未被充分测试；v0.2 被门槛阻断，PSC amount 实现有效失败 |
| platform taxonomy | `SUPPORTING_DIAGNOSTIC` | 只适合分层诊断，不是金额倍率权威 |
| 三级分类倍率 | `OUT_OF_SCOPE_DRIFT` | 未经验证直接乘金额不合法；当前已禁止 |
| 作品总额 | `CORE_M2` | 当前主要点预测能力 |
| 已有渠道份额分配 | `CORE_M2` | 作为作品总额的守恒分配能力，证据 mixed |
| Core80/Core90 | `CORE_M2` | 服务/评价人口，不是公司组合 |
| occurrence | `SUPPORTING_DIAGNOSTIC` | 可解释稀疏性；不能单独证明现金预测有用 |
| conditional amount | `SUPPORTING_DIAGNOSTIC` | 若模型原生输出则有用；当前没有合格对象 |
| ranking | `SUPPORTING_DIAGNOSTIC` | 业务优先级可能有用，但不能替代金额 |
| interval | `SUPPORTING_DIAGNOSTIC` | 风险沟通需要，当前只为开发证据 |
| production/automation | `FUTURE_PHASE` | 当前无授权、无修改 |

## 13. 投入产出与复杂度

### 13.1 可验证数量

| 项目 | 数量 | 口径 |
|---|---:|---|
| 仓库 tracked 文件 | 2,164 | audit-start HEAD |
| M2 相关 tracked 文件 | 1,475 | 路径名含 M2 或 `src/domain/m2Current` |
| 其中 Markdown / JSON | 527 / 520 | 扩展名 |
| M2 config / tests / source / scripts | 47 / 176 / 96 / 164 | 路径类别；会与扩展名口径交叉 |
| `m2-current` / `m2-v2` 文档 artifact | 223 / 211 | 前者 113 MD+110 JSON |
| 状态索引 artifact | 60 | 51 MD+9 JSON，不等于 60 个模型版本 |
| current domain 模块文件 | 48 | 47 JS + 1 AGENTS |
| Registry model / experiment | 35 / 22 | 另有 123 non-model IDs、59 comparability groups |
| package scripts | 311 | 43 current、1 dispatcher、183 archive、84 restricted |
| HEAD 可达 commit | 412 | 其中核心 M2 三目录触达 155 |
| 广义 M2 路径触达 commit | 304 | 63 evidence-only、49 runtime-only、149 mixed、其余 test/evidence |
| PR | 35 | 34 merged；#35 Open/Draft/Unmerged |
| Actions workflow runs | 340 | 248 success、90 failure、2 cancelled |
| 2026-07-15 后 PR workflow | 210 | 180 success、29 failure、1 cancelled |
| private artifact 角色 | 3 | authority/cache/provenance；不是 3 个 private 文件 |
| 当前可发布模型 | 0 | productionImported/automation/activeCandidate 均为 0 |

commit 文件触达只是可观察代理，不能换算人工时或 token。M2 相关 304 个 commit 中，
20.7% 只触达 evidence/config，49.0% 同时触达 runtime 与 evidence；无法从仓库恢复唯一的
“治理工时/建模工时”比例。token、人工小时、现金费用和外部 ChatGPT 成本均
`NOT_RECOVERABLE_FROM_REPOSITORY`，本报告不估算。

### 13.2 哪些复杂度值得保留

- stable ID、Registry、comparability group、source authority 三分；
- origin-safe scope、same-case、actual view、raw/fallback；
- public/private 隔离、跨平台 CI、守恒、数值稳定性和不可变失败证据。

### 13.3 哪些是必要合规成本

- private actual 不入 Git、frozen artifact digest、冲销四视图；
- 一次 exact-head Linux/Windows CI、历史结果不可改写；
- independent later-origin 与 final holdout 分权。

### 13.4 哪些是治理膨胀

- 每个小步骤生成 MD+JSON+state-index 三件套；
- 大量局部缩写/status code 面向用户；
- 183 个 archive-only package 入口暴露在同一脚本列表；
- 每次任务重复长 Git/private/CI 模板；
- transport receipt 与业务 authority 混在同一完成条件。

下一阶段应“删除”的首先是**流程要求和用户可见噪声**，不是冻结历史 artifact 或被测试、
合同引用的代码。任何物理删除都需独立收敛审计，本轮不做。

## 14. M2 的三层结束标准

| 层级 | 标准 | 当前达到 | 是否结束 |
|---|---|---|---|
| A 最小业务可用 | 明确作品/渠道；每 horizon 冻结方法；月滚动可复现；误差/bias 可解释；abstain/fallback；不承诺范围外对象；业务验收 | 7 项中 5 项满足，horizon 统一方法与业务验收未满足 | **未达到** |
| B M2 研究结束 | 主要 cash-only 方向充分测试；新候选不能稳定胜基线；independent later-origin/必要 holdout；信息上限；冻结最终简单方法；停止相邻模型 | 6 项中 2 项满足（大量方向已测试、已有简单基线），独立证据/信息上限/最终冻结/停止决议未满足 | **未达到；应作为现实终点** |
| C 自动化/生产结束 | 业务验收、production contract、monitoring、rollback、canary、权限/数据源、发布 | 7 项中 0 项完成或获授权 | **未开始** |

研究结束与 production 完成必须拆开。当前不应为了“离生产更近”继续造模型；应先决定
cash-only 研究是否在一次独立评价后关闭。

## 15. 推荐下一步与不应做的事

以下都是建议，不在本轮执行。

| 路线 | 目标/数据 | 成本与风险 | 能/不能回答 | 停止条件 | 优先级 |
|---|---|---|---|---|---|
| A 等待独立账单，只评价冻结 HPSR02 | 需要首个合法独立 origin 的现有渠道分成 actual；不训练、不改结构 | 工程成本低；等待成本和单起点不确定性高 | 能回答 L20-only 修正在新时间点是否增值；不能证明长期生产稳定 | 无稳定实质 FVA、bias 不可接受或 bootstrap/time 证据不足即结束 cash-only 研究 | **1** |
| B 现在冻结简单模型并结束 cash-only 研究 | 不需要新数据；保留 OA03 fallback、LG01 research baseline | 成本最低；风险是错过 HPSR02 一次低成本检验 | 能立即收敛治理；不能获得独立胜负 | 外部审阅确认现有证据已足够、等待价值低 | 2 |
| C 新数据/新业务问题后开新阶段 | 必须有用户确认的新信息，例如可观测机制数据或不同业务目标 | 成本最高；最容易再次范围漂移 | 能回答 cash-only 历史无法回答的问题；不能修饰成当前 M2 延续 | 没有明确新增信息增益或独立授权就不开启 | 3 |

**唯一推荐：先维持暂停并接受外部审阅；若审阅后仍认为一次独立检验值得等待，则只走路线 A。
现在不应训练、调参、开新 actual、重跑历史模型、开发 HPSR03 或任何相邻候选。重新决策点
是“独立 origin 合法可用 + 用户重新授权”，不是下一次代码完成。**

## 16. 仍需用户确认的问题

这些问题不阻断本次审计，只影响外部审阅后的路线选择：

1. M2 的首要业务用途是月度现金预算、作品运营排序，还是财务风险区间？三者会改变主损失
   与“最小业务可用”的验收口径。`USER_CONFIRMATION_REQUIRED`
2. 36 个月是否必须是与 3/6/12 月同等约束的业务输出，还是只作低置信情景参考？
   `USER_CONFIRMATION_REQUIRED`
3. 对 Core80 的 3/6/12/36 月，业务可接受的 WAPE、signed bias 和最小实质 FVA 分别
   是多少？是否允许按 horizon 不同？`USER_CONFIRMATION_REQUIRED`
4. 最小业务可用时，允许多少作品/收入金额因资格不足或异常而 abstain？
   `USER_CONFIRMATION_REQUIRED`
5. 如果 HPSR02 的首次独立结果仍为 inconclusive，是否同意直接结束 cash-only 研究，
   而不是等待第二个新候选？`USER_CONFIRMATION_REQUIRED`

## 17. Caveats / 假设与证据限制

- 本轮没有 private 行级数据，因此不能独立重算 aggregate；公开 JSON 与代码能交叉的结论
  才使用最高证据等级。
- 用户确认的现实业务事实不能由 Git 独立证明，均标为
  `DOCUMENTED_BUT_NOT_INDEPENDENTLY_VERIFIED`。
- 历史原始自然语言指令未全部进入仓库；指令质量依据可观察结果和 Git 影响审计。
- 35 个 Registry model object 包含 model、model family、pipeline 和 archive；不能当成
  35 个同类型训练模型。
- 22 个 Registry experiments 不是全部“任务”总数；治理/阻断比例只能给可验证下界。
- CI failure step 是失败事件，不是唯一根因；同一 run 可能贡献多个 step。
- 文件、commit、PR 数不能换算成本或科学价值；人工时、token、费用不可恢复。
- 本报告不把没有 raw 行的历史模型补评分，也不跨 actual/population/horizon 排名。
- 审计开始时 exact-head CI 成功；报告提交后的最终 exact-head CI 由 GitHub 动态绑定，
  以 PR checks 为最终发布证据。

## 18. 模型谱系与成绩总账

表中“运行”指历史上是否形成真实开发执行，不表示本轮运行；本轮执行数始终为 0。
共同 actual 为分成现金，除非明确标为 portfolio/archive。`—` 表示该对象没有可合法引用
的统一数字，不是 0。

| stable model ID（中文名） | 对象/一句话输入→输出 | horizon、population、actual | 真实运行/raw | 同案例成绩、FVA/不确定性 | 证据状态、复用价值与当前角色 |
|---|---|---|---|---|---|
| `M2-WORK-B4` 旧现金生命周期公式 | MODEL/BASELINE；历史作品现金→作品金额 | 历史 3/6/12/18/24，曾含 36；旧 population/actual | 是/是 | 历史分母与当前不完全一致；本审计不跨组引用统一 WAPE | 比较器；保留回归测试。 |
| `M2-WORK-SEG01` 作品分群向下校准 | MODEL；分群统计→校准金额 | legacy frozen cases | 是/是 | 候选被拒；统一 current same-case 数字不可恢复 | rejected；保留历史开发证据。 |
| `M2-WORK-HRC02` 层级稳健校准 | MODEL；层级统计→校准金额 | legacy frozen cases | 是/是 | nested 历史候选；当前不可比 | rejected；保留历史证据。 |
| `M2-WORK-OA03` 发生—金额校准 v0.3 | MODEL/FALLBACK；发生概率×金额校准→作品总额 | 3/6/12/18/24；历史/current scope；posting/restated 分组 | 是/是 | 历史 served WAPE 0.490759、bias +0.073781；current scope mixed，非新冠军 | compatibility operational fallback；发生输出可诊断。 |
| `M2-WORK-GHG01` 全局门槛 GLM | MODEL/ARM；全局特征→发生×金额 | 多层评价与全局候选活动（`M2-EXP-R0-R5-01`）冻结 origins | 是/是 | nested gate reject；无 current 可比主分数 | failed research candidate；算法对照。 |
| `M2-WORK-TWD01` Tweedie 树桩 | MODEL/ARM；全局特征→金额 | 多层评价与全局候选活动（`M2-EXP-R0-R5-01`） | 是/是 | nested gate reject | failed research candidate。 |
| `M2-WORK-HGB01` 门槛提升树桩 | MODEL/ARM；全局特征→发生×金额 | 多层评价与全局候选活动（`M2-EXP-R0-R5-01`） | 是/是 | nested gate reject | failed research candidate。 |
| `M2-WORK-GDE04` 全局分布组合回退 | SELECTED PIPELINE；候选失败则回 OA03 | legacy frozen | 是/管线 raw 由 arms 提供 | 开发失败时返回 OA03，不能把 fallback 写成候选成绩 | rejected safe-fallback pipeline；保留 raw/fallback 规范。 |
| `M2-PORT-ETS01` 组合 ETS/Holt-Winters | PORTFOLIO REFERENCE；公司组合月序列→组合现金 | portfolio H3/6/12 | 是/是 | pooled WAPE 0.127950、bias +0.100483；H12 劣于 naive；非 work-level | portfolio reference；不能参加作品模型排名。 |
| `M2-BASE-CLASSIC01` 经典基线族 | MODEL FAMILY/BASELINE；季节 naïve 等→比较预测 | 随实验变化 | 是/是 | 多口径，无单一分数 | regression baseline family。 |
| `M2-WORK-HSC01` 历史状态校准 | MODEL/POST-HOC；当前/历史状态→后验校准 | 25 origins，H3/6/12 | 是/是 | post-hoc rejected；无独立证明 | 只保留诊断。 |
| `M2-WORK-MCR01` 人工渠道规则 | MODEL/BASELINE；渠道人工规则→H36 金额 | H36 safe-window | 是/是 | rejected；当前 Core 合同不可比 | 历史人工渠道比较。 |
| `M2-WORK-CCR01` 统一渠道曲线 | MODEL/RAW CANDIDATE；统一曲线→作品/渠道金额 | H3/6/12 dense + served 3/6/12/18/24 | 是/是 | restated WAPE 0.485389；未胜 OA03 | rejected keep OA03；canonical channel 资产。 |
| `M2-WORK-MAN01` 人工锚定忠实公式 | MODEL/BASELINE；人工锚→H36 金额 | Primary H36 | 是/是 | WAPE 0.531410、bias -0.405523 | human formula comparator。 |
| `M2-WORK-CRMR01` 核心收入人工规则 | MODEL/BASELINE；滚动人工规则→作品×渠道金额 | dynamic Core80/90，H3/6/12/36 | 是/是 | H3/H6 可竞争；H36 Core80 WAPE 113.43、Core90 104.38 | failed long-term compounding；短期规则仍有比较价值。 |
| `M2-PORT-LRC01` 分层收入组合 | PORTFOLIO MODEL；四组件→组合收入 | portfolio H3/6/12/36 | 是/是 | WAPE 0.180/0.219/0.553/1.964；无统一 FVA，协议有缺口 | portfolio gate fail；守恒和分层文档可复用，偏出 current M2。 |
| `M2-WORK-LG01` 人工锚定可学习全局 | MODEL/RESEARCH BASELINE；成熟历史+人工锚→作品总额/区间 | H36 Primary + Strict H3/6/12/18/24 | 是/是 | Primary 0.440225/-0.123771；Strict 0.411919/-0.038474；区间接近校准 | frozen research baseline；非独立、非生产。 |
| `M2-WORK-HP01` 层级正金额专家 | MODEL/RAW CANDIDATE；层级正金额→金额 | H36 Primary | 是/是 | WAPE 0.455405，劣于 LG01 | rejected nested layer；保留 raw 负结果。 |
| `M2-WORK-OR01` 发生与冲销模型 | MODEL/RAW CANDIDATE；发生/冲销→金额 | H36 Primary | 是/是 | WAPE 0.441261，未过 material gate | rejected nested layer。 |
| `M2-WORK-TSB01` TSB 间歇发生 | MODEL/RAW CANDIDATE；间歇发生→作品金额 | Primary H36 + Strict rolling | 是/是 | Primary 0.543462/+0.220681；Strict 0.508022 | rejected and frozen；发生信号不足以改善点额。 |
| `M2-WORK-TSBB01` TSB×LG01 混合 | MODEL/ARM；TSB 与 LG01 blend→金额 | 同上 | 是/是 | Primary 0.453482/+0.037774；Strict 0.444871；最终 λ=0 回 LG01 | rejected blend；证明 fallback 不能冒充 candidate。 |
| `M2-WORK-LC01` 生命周期五状态 | MODEL/RAW/POST-HOC；状态→金额 | Primary H36 + Strict rolling | 是/是 | raw 0.501393/0.622760；selected 0.440161/0.411899，仅约 0.0145%/0.0048% 后验增益 | failed trivial post-hoc gain。 |
| `M2-CHAN-SCL01` 渠道倍率专家 | MODEL/ARM；渠道倍率→分解金额 | Primary H36 + Strict rolling | 是/是 | 渠道倍率专家实验第 6 候选臂（A6）WAPE 0.537767/0.658653；ranking 高但 point fail | architecture retired；只否定倍率实现。 |
| `M2-CHAN-GEN02` 渠道生成 v0.2 | MODEL FAMILY/BLOCKED；月发生×条件金额→渠道月预测 | 独立渠道月度发生—条件金额核心臂（G1）开始，后续渠道生成臂（G2–G6）未执行 | 尝试/否 | outer fold 0 在资格门前停止；无 WAPE/FVA/bootstrap | blocked not failed；机制合同可复用。 |
| `M2-CHAN-PSC01` 出版规模渠道核心 | MODEL REVISION/RAW；出版支持层级→渠道月 occurrence×amount | H3/6/12/18/24/36 | 是/是，3,318,819 行 | Primary WAPE 0.924087、bias -0.889282；Strict 0.915333/-0.854106；harm CI 均低于 0 | valid negative、frozen；occurrence 有信号，amount 失败。 |
| `M2-WORK-C1TE01` C1 透明组合 | ARCHIVE MODEL | historical frozen | 是/是 | 历史失败；current contract 不可比 | archive only。 |
| `M2-WORK-C2R01` 旧买断路由 | ARCHIVE MODEL | historical frozen，含旧 cash route | 是/是 | 当前 target 已排除 buyout，不可排名 | archive only。 |
| `M2-WORK-C2R101` 正式现金路由分治 | ARCHIVE MODEL | historical frozen | 是/是 | 历史失败，不重评分 | archive only。 |
| `M2-WORK-C2IM01` 活跃度/间歇组合 | ARCHIVE MODEL | historical frozen | 是/是 | 历史失败 | archive only。 |
| `M2-WORK-C3IR01` 内部特征残差 | ARCHIVE MODEL | historical frozen | 是/是 | 历史失败 | archive only。 |
| `M2-WORK-HR01` 按周期滚动路由 | ROUTER/SELECTED PIPELINE；冻结模型按 horizon 选取 | Core80/90 H3/6/12/36 | 是/所选模型 raw | 6 月退化，整体无新增 FVA；selected 不掩盖各 raw | not confirmed；能力矩阵可复用。 |
| `M2-WORK-CHAM01` 分周期金额 | MODEL/RAW；分别拟合 H3/H6/H12 cumulative amount | mature Core80，Core90 sensitivity | 是/是 | Strict H3 WAPE 0.251288 vs LG01 0.258167，FVA +2.66%，CI [-15.99%,21.64%]；H6/H12 -2.41%/-24.09% | valid negative + numeric failure；frozen。 |
| `M2-WORK-HCRC01` 头部现金残差校准 | MODEL/SELECTED PIPELINE；LG01 residual→alpha 修正 | Strict Core80 H3 | 是/否 | 16 cells 无 eligible alpha，C2/C3 0 raw cases；selected 全回 LG01 | gate failure，无 candidate performance。 |
| `M2-WORK-HPSR01` 头部保护分段路由 | ROUTER/RAW；H50/M30/L20 分带→H3 金额 | retrospective single origin，Core80 57 works | 是/是 | LG01 0.143234/-0.066974；router 0.142019/-0.087333；FVA +0.8477%，CI 跨 0 | contract unsupported, scientifically inconclusive；不生产。 |
| `M2-WORK-HPSR02` 头部保护尾段修正 | PREREGISTERED MODEL/IMPLEMENTED_ONLY；H50/M30=LG01，L20=bounded correction | first independent Core80 H3 | 否/否 | 无 actual、WAPE、FVA 或 bootstrap | preregistered + synthetic only；等待独立数据，非 active。 |

## 19. 证据索引

关键机器权威与结果：

- `config/m2-model-registry.v1.json`：模型、实验、角色、可比组与评价合同机器权威；
- `docs/analysis/m2-v2/M2-v2-current-state-index-v0.53.md`：当前状态入口；
- `config/m2-evaluation-contract.v2.2.json` 与 activation/validation 文档：当前开发评价；
- `docs/analysis/m2-current/M2-current-human-anchored-development-v0.1.json`：LG01、人工、
  HP01、OR01；
- `docs/analysis/m2-current/M2-current-human-anchored-tsb-occurrence-development-v0.1.json`；
- `docs/analysis/m2-current/M2-current-lifecycle-aware-revenue-forecast-development-v0.1.json`；
- `docs/analysis/m2-current/M2-current-channel-experts-development-v0.1.json` 与 architecture audit；
- `docs/analysis/m2-current/M2-current-channel-generative-g1-development-v0.1.json`；
- `docs/analysis/m2-current/M2-current-publishing-scale-channel-development-v0.1.json`；
- `docs/analysis/m2-current/M2-core-revenue-manual-development-v0.1.json`；
- `docs/analysis/m2-current/M2-layered-revenue-composition-development-v0.1.json`；
- `docs/analysis/m2-current/M2-core-legacy-tail-interference-test-v0.1.json`；
- `docs/analysis/m2-current/M2-core-legacy-full-horizon-same-case-rescore-v0.1.json`；
- `docs/analysis/m2-current/M2-core-legacy-horizon-router-v0.1.json`；
- `docs/analysis/m2-current/M2-core-legacy-observed-channel-allocation-v0.1.json`；
- `docs/analysis/m2-current/M2-oa03-current-scope-replication-development-v0.1.json`；
- `docs/analysis/m2-current/M2-oa03-trailing12-observed-channel-allocation-v0.1.json`；
- `docs/analysis/m2-current/M2-core-legacy-horizon-amount-development-v0.1.json`；
- `docs/analysis/m2-current/M2-lg01-head-cash-residual-development-v0.1.json`；
- `docs/analysis/m2-current/M2-head-protected-segmented-router-retrospective-development-v0.1.json`；
- `docs/analysis/m2-current/M2-head-protected-segmented-router-interpretation-amendment-v0.1.json`；
- `docs/analysis/m2-current/M2-head-protected-tail-band-correction-preregistration-v0.2.md`；
- `docs/analysis/m2-current/M2-evaluation-v2.2-development-modelable-rescore-v1.json`；
- `docs/analysis/m2-current/M2-reversal-four-view-reconciliation-v1.json`；
- `config/command-lifecycle.v0.1.json`、root/domain AGENTS、README、package/test registries；
- Git 可达历史、PR #1–#35 与 GitHub Actions 元数据。

机器可读的完整 findings、scores、counts、routes 和 source index 见
`docs/analysis/m2-current/M2-complete-project-control-audit-v1.json`。

**审计停止点：** 报告完成后不启动任何新模型、不打开任何新 actual、不改变 HPSR02
预注册、不修改 production，等待用户交给外部 ChatGPT 审阅。
