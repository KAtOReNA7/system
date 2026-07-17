# M2 v2 人工基准与信息地图

## 结论

现有项目证据不能证明“人工预测比 B4 强”。仓库没有与 B4 使用相同 cutoff、case key、horizon 和 actual 的人工点值预测；既有人工记录主要是基础事实确认、状态/版权复核、评级合理性和对预测的定性信任，不是可计算 WAPE、bias 或排序指标的 Human-vs-AI baseline。

因此 M2 v2 不能以“人工更强”为既定前提。正确做法是先建立盲测、同信息集、可审计的人工基准，再判断外部信息是否解释人工增量。人工基准是有限的评估与治理活动，不应转化为要求运营逐作品长期手工填数。

## 现有人工证据

### 已有流程要求与记录

| 信息 | 已有证据 | 能支持什么 | 不能支持什么 |
|---|---|---|---|
| 历史收入、近趋势、生命周期、回测方向 | operator validation guide | 人工会检查方向一致性 | 不等于人工给出数值预测 |
| 近 12 月规模、异常峰值、版权风险 | 评级复核规则 | 人工能识别明显风险 | 不证明可量化提升现金预测 |
| 收入模式与买断/实销边界 | v3/v4 validation | 人工能校正业务语义 | 不形成同 cutoff 模型 baseline |
| 作品状态、音频版权状态与版权期限事实 | 238 条业务复核 | 纠正权威事实与提示 | 属于事实校正，不是预测 |
| 预测是否“可信” | v1.1 25 例复核中 24 例可信 | 提供主观可用性信号 | 不是随机样本，也没有人工 actual error |

用户拒绝 v1.1 conditional 只证明该版本不获 release 批准，不能反推出人工点值精度优于 B4。

### 只能作为假设的信息

- 分类与标签：已完成基础数据人工收口，但没有证据表明运营以其生成数值预测。
- 外部热点与重大业务事件：旧 M2 PRD 有明确意图，但当前没有 M2 结构化 evidence role 或历史快照。
- 作者影响力、原作表现、搜索/社交热度、改编与市场趋势：主要出现在 M3 设计，不是已证明的 M2 人工流程。

## human-evaluation-information-map

### A. 已有系统信息

| 信息组 | cutoff 可得要求 | 可用于人工基准 | 可用于模型 | 注意事项 |
|---|---|---|---|---|
| 月度收入与销售渠道 | cutoff 前事实 | 是 | 是 | 使用与 B4 完全相同快照 |
| 生命周期与稀疏度 | 必须由 cutoff 前计算 | 是 | 是 | 禁止使用后来状态 |
| 收入模式 | as-of 可重建 | 是 | 是 | pure-buyout 无承诺必须允许 abstain |
| 分类、标签、作者 | 必须冻结 as-of 值 | 可研究 | 可研究 | 当前快照缺失时不能回填历史 |
| 版权/货架状态 | 只有历史快照才可用 | 条件允许 | 条件允许 | 当前状态仅 post-hoc |
| 买断承诺应收 | 需证据、确认时间与预计入账 | 是 | 是 | 当前权威历史角色缺失 |
| B4 点值 | 盲测阶段分组控制 | 可在第二阶段展示 | comparator | 初始独立预测时应隐藏 |

### B. 外部信息候选

| 信息 | 可能作用 | 进入基准前的最低条件 |
|---|---|---|
| 搜索热度与变化率 | 需求变化、再激活 | 来源稳定、时间戳、历史值或 prospective snapshot |
| 社交讨论与情绪 | 短期事件与口碑 | 去重、防刷量、来源许可、可审计聚合 |
| 作者影响力 | 层级借力与长尾先验 | 身份消歧、历史可得时间、稳定定义 |
| 原作表现 | IP 基础需求 | 来源、量纲、更新时间、同名消歧 |
| 改编/出版/获奖事件 | 跳变与持续影响 | event time 与 public available time 分离 |
| 平台榜单或市场趋势 | 类别景气和渠道机会 | 版本、榜单口径、回溯快照、来源许可 |
| 公开运营事件 | 解释异常与趋势 | 不得包含未公开、不可审计的临时经验 |

这些信息是否提升 B4 仍未被项目实验验证。没有历史 as-of 快照时，今天搜索到的页面不能作为旧 cutoff 的训练特征。

### C. 不应使用的信息

- cutoff 后收入、后来买断、后来排名或后来改编结果；
- 无历史快照的当前 rating、risk、shelf、rights 和 business action；
- 未承诺未来买断概率、历史周期猜测和月均摊销；
- 无 URL、采集时间或来源的临时经验；
- 不稳定、不可合法自动获取或无法重复查询的页面内容；
- LLM 直接给出的收入金额；
- 为达到 gate 而在看到结果后选择的信息或阈值。

## 当前 Human-vs-AI 缺口

仓库当前没有：

- cutoff 时冻结的人工 point forecast、年度拆分、confidence 和 limitations；
- 与 B4 一致的 3/6/12/18/24 月 case keys；
- 相同 evidence snapshot 和预测时间戳；
- blind/random sampling 与 reviewer 资历记录；
- 人工 WAPE、bias、MAE、rank、TopK 或 trend accuracy；
- inter-rater agreement；
- 人工耗时与成本。

现有 25 例任务是确定性风险覆盖样本，且只收集定性“可信/不可信”，不能作为总体人工 baseline。

## 建议的 Human-vs-AI 基准

### 设计原则

1. 人工与 AI 使用相同 cutoff、相同可得证据、相同 horizon 和相同 actual。
2. 人工独立预测阶段隐藏 B4 和后来结果，避免 anchoring 与泄漏。
3. 预先冻结 eligibility、抽样、指标、缺失处理和 gate。
4. pure-buyout 无承诺允许 null abstention，禁止填 0。
5. 比较单个人工、人工中位数共识、B4 与未来 B4+External candidate。
6. 按 work × origin block bootstrap 处理同作品和重叠 horizon 相关性。

### 两阶段方案

#### 阶段 1：回溯盲测

- 建议 120–200 个不同的 `work × origin` block，每个 block 覆盖其适用 horizons；
- 2–3 名具有实际老品判断经验的 reviewer；
- 分层覆盖高价值、普通、长尾、dormant、intermittent、纯实销、mixed 和 pure-buyout；
- 每个 case 提供同一 as-of system packet；
- 若某类外部证据没有历史快照，则不向人工提供，避免人工使用今天的信息预测过去。

#### 阶段 2：prospective shadow

- 建议约 150 部作品的滚动 shadow cohort；
- 从现在开始冻结系统与外部 evidence snapshot；
- 记录 3/6/12 月人机预测，长 horizon 只做延后审计；
- 不影响产品、不 release、不打开 final holdout。

block 数是研究启动建议，最终应由可用 reviewer 数、预期差异和 block-bootstrap power simulation 冻结，不能按结果事后调整。horizon 是 block 内的重复观测，不能被当作独立样本扩充样本量。

### 人工输出合同

每个 case 记录：

- point forecast；
- annual breakdown；
- trend：上升/稳定/下降；
- commercial value score 或排序；
- confidence；
- limitations；
- evidence IDs 与主要驱动；
- abstention reason；
- reviewer、预测时间与耗时。

不得要求人工给出 optimistic/pessimistic/high/base/low，也不得生成自动运营动作。

### 指标

| 能力 | 指标 |
|---|---|
| 现金预测 | WAPE、signed bias、MAE、SMAPE |
| 排序 | Spearman、Kendall、NDCG、TopK precision/recall |
| 趋势 | macro-F1、balanced accuracy、混淆矩阵 |
| 覆盖 | served work/revenue share、Top1/5/10 served revenue share、abstention reasons |
| 一致性 | point/log forecast ICC；trend/value 的 weighted kappa 或 Krippendorff alpha |
| 成本 | 单 case 中位耗时、复核率、争议率 |

人工 baseline 也必须报告失败和 abstention，不能只展示最佳 reviewer 或只保留有共识 case。

## 是否需要长期人工输入

不需要把人工填写设为 M2 v2 的常规依赖。建议的人工角色只有：

- 一次性/周期性 Human-vs-AI 基准；
- 来源白名单和证据冲突抽检；
- 高风险或低置信结果的业务验证；
- release 前中文抽检与明确批准。

外部特征必须优先自动采集。若自动证据缺失，系统应降级到 B4、降低 confidence 或 abstain，而不是强制运营补全每部作品。

## 主要证据

- `docs/analysis/m2-real-data/M2-v1.1-operator-task-validation-guide-cn.md`
- `docs/analysis/m2-real-data/M2-v1.1-after-staging-operator-validation-summary-v1.md`
- `docs/analysis/m2-real-data/M2-rating-standard-v3-operator-validation-summary-v1.md`
- `docs/analysis/m2-real-data/M2-rating-standard-v4-operator-validation-summary-v1.md`
- `docs/analysis/m2-real-data/M2-post-foundation-review-decision-apply-summary-v1.md`
- `docs/prd/05-老品评估.md`
- `docs/prd/07-算法校准与Codex修复.md`
- `docs/prd/30-new-product-evaluation/M3-restart-prd-v0.2.md`
