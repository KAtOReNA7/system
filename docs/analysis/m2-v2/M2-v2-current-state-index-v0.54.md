# M2 当前状态索引 v0.54

截至 2026-08-01，本索引是 M2 用户阅读的最新状态入口。模型名称、别名、角色、
评价人口和可比组仍以 `config/m2-model-registry.v1.json` 为唯一机器权威；数值业务
门限仍以 `config/m2-business-acceptance-contract.v1.json` 为唯一权威。

## 当前结论

| 对象 | 当前状态 | 含义 |
|---|---|---|
| 兼容性现行运行回退 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 仅为兼容性回退；没有新增当前范围性能支持 |
| 研究比较基线 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 研究比较用途，不是 production 晋升 |
| 出版行业适配渠道模型 | 出版行业适配的渠道月度发生—条件金额核心（Publishing-Scale Channel Monthly Occurrence × Conditional Amount Core，`M2-CHAN-PSC01`）已执行失败并冻结 | 根因审计确认估计器尺度收缩，未确认实现或比较器缺陷 |
| 头部保护尾段修正研究 | LG01 头部保护尾段修正模型 v0.2（LG01 Head-Protected Tail-Band Correction Model v0.2，`M2-WORK-HPSR02`）唯一独立结果证据不足 | 现金-only 相邻研究已结束；第二起点和后继模型未启动 |
| 活动候选 | `activeCandidate=null` | 没有活动候选 |
| 自动化批准 | `approvedForAutomation=null` | 没有自动化批准 |
| production ready | `false` | 没有生产权限 |
| final holdout | `finalHoldoutOpened=false` | 未打开 |

## 出版行业渠道条件金额尺度根因

出版行业适配的渠道月度发生—条件金额核心（`M2-CHAN-PSC01`）的冻结 raw candidate、
评价、manifest、receipt 与公开摘要已完成只读一致性复核：

- 扫描 `3,318,819` 行冻结候选评价与 `395,904` 行冻结 LG01 比较器；digest、行数、
  manifest 和 receipt 绑定均通过；
- raw candidate 保持冻结，fallback 没有覆盖 raw 结果；冻结后生成或修改预测均为 `0`；
- 正式比较粒度的 `86,359` 个作品×起点×horizon case 全部 exact same-case、
  same-origin、same-horizon、same-target、same-actual-definition；
- 主评价预测总额只占实际的 `11.0718%`，严格滚动各 horizon 为
  `12.8979%`–`15.7112%`；
- 塌缩在起点可见经验父层已经出现：主评价为 `1.8593%`，严格滚动为
  `3.5583%`–`5.0327%`；
- 主评价条件金额 oracle 可移除 `78.1641%` 的原始候选误差，发生 oracle 仅可移除
  `0.2101%`；严格滚动相应为 `79.9934%` 与 `0.5746%`；
- 机制/时间信息相对全局父层的局部误差改善为主评价 `4.9988%`、严格滚动
  `5.2592%`；这不能抵消基础尺度塌缩；
- 冻结实现的单位、horizon 累加、log/link、Duan smearing、逆变换、发生概率乘法、
  clip、冲销 actual、权重和唯一键均通过审计；taxonomy 为 `REPORT_ONLY` 且完全未
  进入计算。

最终根因是“估计器尺度收缩已确认，但实现正确”
（`ESTIMATOR_SCALE_SHRINKAGE_CONFIRMED_IMPLEMENTATION_CORRECT`）。工作平衡的
`log1p` 几何中心在最早父层就与现金加权总额目标错位，ridge 与 log1p 层级收缩继续
保留低尺度；pooled fallback 是放大器而不是首因。

统一总额归一化诊断全部属于后验诊断，不是模型证据
（`POST_HOC_DIAGNOSTIC_NOT_MODEL_EVIDENCE`）。全局 actual-derived scalar 会把作品×
渠道 WAPE 恶化到 `127.45%`–`134.63%`；逐作品去除总额尺度后仍有
`35.77%`–`40.96%` 的渠道构成 WAPE。因此问题不是统一少乘一个常数，渠道排序、
作品间尺度异质性和时间结构仍有残差。

详细报告：

- `docs/analysis/m2-current/M2-publishing-scale-channel-amount-scale-root-cause-audit-v0.1.md`
- `docs/analysis/m2-current/M2-publishing-scale-channel-amount-scale-root-cause-audit-v0.1.json`

证据支持在另一项授权中预注册下一修订的设计
（`PSC02_DESIGN_PREREGISTRATION_SUPPORTED_NOT_AUTHORIZED`），但没有创建新模型、实现、
拟合、调参或评价，也没有把该设计登记为 active candidate。

## HPSR02 研究证据集成状态

LG01 头部保护尾段修正模型 v0.2（`M2-WORK-HPSR02`）的唯一一次 2026-03 起点独立
评价已经冻结：

| 同案例臂 | WAPE / 结果 |
|---|---|
| 冻结 LG01 同案例基线 | 64.4488% |
| HPSR02 唯一主候选 | 64.1150% |
| relative FVA | 0.5179% |
| 2,000 次作品聚类 bootstrap 95% 区间 | `[-2.4406%, 3.8718%]` |

最终状态仍为证据不足并结束现金-only 相邻研究
（`M2_HPSR02_FIRST_INDEPENDENT_INCONCLUSIVE_CASH_ONLY_RESEARCH_ENDED`）。冻结评价形成
时保持 Draft/Open/Unmerged；其后的 Git merge 是独立的研究证据集成授权，不改变
模型激活、production、automation、release、final holdout 或财务使用状态。

集成记录：
`docs/analysis/m2-current/M2-hpsr02-research-evidence-integration-decision-v0.1.md`。

## 已实现、已验证、已授权与可发布

| 层次 | 当前状态 |
|---|---|
| 已实现 | 现有 canonical 模型代码、只读尺度审计器、隐私安全聚合器和 synthetic contract tests |
| 已验证 | 冻结 PSC01/LG01 工件绑定、正式同案例比较、逐层尺度、oracle、后验构成诊断和公共门禁 |
| 已授权 | 只授权现有冻结证据审计和公开治理；HPSR02 只授权研究证据 Git 集成 |
| 可发布 | 否；没有模型、automation、production、release 或财务使用授权 |

## 保持关闭的能力

- 不创建或实现出版行业尺度适配渠道模型的下一修订；
- 不训练、调参、重跑冻结候选或执行新的 private evaluation/bootstrap；
- 不打开 later-origin、prospective final holdout、Canary/full160 或 M3 formal；
- 不修改 production loader、route、API、数据库或 provider；
- 不执行 HPSR03 或第二个 HPSR02 独立起点；
- 不用 fallback/selected pipeline 掩盖 raw candidate，不把后验 scalar 登记为成绩。

## 当前权威证据

- `config/m2-model-registry.v1.json`
- `config/m2-business-acceptance-contract.v1.json`
- `docs/analysis/m2-current/M2-current-publishing-scale-channel-development-v0.1.json`
- `docs/analysis/m2-current/M2-current-publishing-scale-channel-forecastability-v0.1.json`
- `docs/analysis/m2-current/M2-publishing-scale-channel-amount-scale-root-cause-audit-v0.1.json`
- `docs/analysis/m2-current/M2-publishing-scale-channel-amount-scale-root-cause-audit-v0.1.md`
- `docs/analysis/m2-current/M2-head-protected-tail-band-correction-independent-evaluation-v0.2.json`
- `docs/analysis/m2-current/M2-hpsr02-research-evidence-integration-decision-v0.1.md`

本索引取代 v0.53 作为当前阅读入口，但不改写 v0.53、冻结预测、评价、指标、
bootstrap、digest、receipt、历史阻断、历史 ID 或参数谱系。
