# M2 v2 Human Baseline PRD v0.1

## 结论

Human baseline 用于验证人工、B4 和未来 V2 candidate 在相同 cutoff 与信息集下的相对能力，不用于证明人工天然更强。它必须独立于生产结果和模型训练，并按 `work × origin` 处理相关性。

本轮只完成协议设计，不选择真实 reviewer、不生成任务包、不读取 private 数据。

## 1. 研究问题

Human baseline 回答：

1. 人工点值是否在相同信息集下优于 B4；
2. 外部 evidence packet 是否改善人工判断；
3. 人工与系统在哪些 cohort 各自更稳定；
4. 人工 abstention 与系统 abstention 是否互补；
5. 人工时间和成本是否支持规模化使用。

它不回答：

- 哪个 reviewer 最擅长；
- 如何形成运营动作；
- 是否直接批准模型；
- 是否可以把人工答案作为训练 label。

## 2. 抽样单位

主抽样单位是不同的 `work × origin` block，不是单个重叠 horizon case。

- 回溯盲测建议 120–200 blocks；
- 每个 standard work 在一个 batch 中最多选择一个 origin，避免同作品跨 origin 记忆污染；
- 每个 block 包含适用的 3/6/12/18/24 月 horizons；
- horizons 是同 block 重复观测，不作为独立样本扩充样本量；
- 最终 block 数由预注册 power simulation 决定；
- prospective shadow 建议约 150 部作品，先观察 3/6/12 月，18/24 月延后审计。

当前没有历史 External Evidence snapshot，因此 retrospective batch 只能运行 H0。H1 只能在 V2-B 后基于真实 prospective snapshot 开始累积；禁止把当前抓取页面按自报发布日期回填为历史 H1 packet。

## 3. 分层策略

采用“70% 人口比例 + 30% 关键少数”分配原则；比例是抽样设计，不是模型 gate，可在抽样前根据实际 cell 数发布 v0.2。

必须覆盖：

- high-value / ordinary / long-tail；
- dense / intermittent / dormant；
- pure-sales / buyout-plus-sales / pure-buyout；
- 3/6/12/18/24 horizons；
- external evidence available / unavailable；
- business serving eligible / route abstained；
- historical source/rights/shelf 仅在有 cutoff snapshot 时作抽样字段，否则 post-hoc。

限制：

- 不按模型 error 选择样本；
- 不只选择有完整外部 evidence 的作品；
- 不通过删除 pure-buyout abstention 改善 coverage；
- 小 cohort 可以 oversample，但汇总时必须按人口权重和未加权结果双报。

## 4. Reviewer 设计

- 每个 block 在抽样前以固定 seed、按关键分层 cluster-randomize 到且仅到一个 packet arm；
- 每个已分配 arm 的 block 至少 2 名独立 reviewer；
- 第 3 名只用于预注册的分歧复核；不得把一个 block 的 reviewer 拆到两个 arm；
- reviewer 需记录角色、经验带、开始/提交时间，不记录不必要个人信息；
- reviewer 不得查看 B4、candidate、actual、其他 reviewer 或后来的 evidence；
- reviewer 不得查询 packet 外信息；
- reviewer 不得讨论后再分别提交。

## 5. Evidence packet arms

### H0：internal-only

包含 cutoff 可得的：

- 月度收入与渠道汇总；
- revenue model；
- 生命周期与稀疏度；
- rights/commitment 仅在有 as-of snapshot 时；
- 数据限制与可预测状态。

### H1：internal + external

包含 H0，加上：

- 通过 External Evidence contract 的结构化 facts；
- source class、availableAt、confidence、freshness；
- contradiction 与 limitation；
- 不提供系统 score、B4 或 candidate 结果。

同一 block 只进入一个 arm，同一 reviewer 也不得看到同一 block 的另一个 arm，防止记忆污染。block 到 arm 的 cluster randomization 使用冻结 seed，按 source/value/activity/revenue-model 分层平衡；reviewer 分配再按经验带平衡。H0/H1 比较使用预注册的分层随机化估计，不伪装成同 block paired comparison。

同一 reviewer 在一个 batch 中不得接触同一 standard work 的多个 origin；assignment validator 必须以 work 为污染簇，而不只检查 work × origin block key。

## 6. Reviewer 工作流

1. 创建 batch，冻结 blocks、packet versions、reviewers、seed 和 metrics；
2. 生成去 outcome、去 B4/candidate 的 packet；
3. 分配 H0/H1；
4. reviewer 独立提交；
5. 提交后生成不可变 prediction lock；
6. 只有 lock 完成后 join future actual；
7. 计算个人、共识、B4 和未来 candidate 指标；
8. work × origin block-bootstrap；
9. 生成脱敏中文报告；
10. 不把人工答案回写生产特征。

## 7. 人工输出合同

每个 block/horizon 输出：

- `pointForecast` 或 null；
- `annualBreakdown`；
- `forecastConfidence`；
- `limitations`；
- `trendLabel`；
- `commercialValueDimensions`，仅当批准 policy packet 提供 dimension rubric；否则为空；
- `commercialValueScore`，仅当批准 policy packet 提供 rubric；
- `evidenceRefsUsed`；
- `abstained`；
- `abstentionReason`；
- `submittedAt`；
- `durationSeconds`。

禁止 high/base/low、PI endpoints、future buyout speculation 和 operating action。

## 8. 共识规则

- point：同一 arm、同 block/horizon 的 reviewer point 中位数；
- annual breakdown：先计算各 reviewer 年度占 point 的比例，再取逐年中位比例并归一化；最后使用最大余数法把整数分确定性分配到各年，使年度合计严格等于 consensus point；不得使用浮点金额容差；
- trend：同一 arm 内多数票；平票为 `no_consensus`；
- value dimensions：同一 arm 内维度中位数；
- abstention：不得将 abstain 转成 0；
- 若只有一名 reviewer 提供合法 point，则该 block 不产生 human consensus point，但保留个人结果和 coverage；
- 第 3 reviewer 不得在看到 actual 后加入。

## 9. 指标

### Cash

- WAPE；
- signed aggregate bias；
- MAE；
- SMAPE；
- per horizon；
- high-value 和 revenue-model 分层。

### Rank/Value

- Spearman；
- Kendall；
- NDCG@K；
- TopK precision/recall；
- value capture；
- score monotonicity。

### Trend

- macro-F1；
- balanced accuracy；
- per-class precision/recall；
- confusion matrix。

### Agreement

- point/log-point ICC；
- trend/value weighted kappa 或 Krippendorff alpha；
- no-consensus share。

### Coverage/Cost

- served work and revenue share；
- Top1/5/10 served revenue share；
- abstention reason；
- high-value abstained count；
- median/P90 duration；
- reviewer disagreement rate。

## 10. 比较与推断

- 比较 individual human、human consensus、B4、未来 candidate；
- H0 vs H1 使用分层 cluster-randomized block 的 intention-to-treat 估计 External Evidence 对人工判断的增量；
- 与 B4/候选比较的 paired unit 为 work × origin；H0 vs H1 不作同 block paired 声明；
- block-bootstrap 95% CI；
- horizons 不独立抽样；
- 预先冻结 multiple-comparison policy；
- CI 包含 0 或主要差异 <1% 时不得声称明确胜出；
- 不只报告最佳 reviewer。

## 11. 防泄漏和隐私

- packet cutoff 后事实全部移除；
- current rights/shelf 无历史 snapshot 时不展示；
- 外部 evidence 必须来自 prediction lock 前 sealed 的 prospective snapshot；当前抓取不得回填历史 cutoff；
- reviewer 不得自行搜索；
- packet 不包含 private path、raw bill、渠道明细或 source credential；
- public report 不含 reviewer、work 或 channel identity；
- cohort <10 做抑制。

## 12. 停止条件

出现以下任一条件，batch 必须 fail-closed：

- actual 或 B4/candidate 泄漏；
- 同一 block 被分到 H0 和 H1，或 reviewer 看到另一个 arm；
- 同一 reviewer 接触同一 work 的多个 origin，或同一 work 跨 arm；
- block/seed/metric 未预注册；
- packet evidence 在 cutoff 后可得；
- reviewer 答案被用作生产 feature；
- private 标识进入公共报告；
- pure-buyout abstention 被转换成 0。

## 13. 当前状态

- 协议：设计完成；
- reviewer：未选择；
- sample：未 materialize；
- power simulation：未运行；
- batch：未创建；
- Human-vs-B4 结论：不存在；
- V2-B evidence pilot：已由用户另行授权，但不运行 Human baseline；
- V2-C/Human baseline：未授权。
