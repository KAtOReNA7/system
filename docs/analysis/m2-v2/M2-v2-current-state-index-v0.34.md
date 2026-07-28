# M2 当前状态索引 v0.34

截至 2026-07-28，M2 评价合同 v2.2 的开发评价状态继续为：

`M2_EVALUATION_V2_2_ACTIVE_FOR_DEVELOPMENT_WITH_DISCLOSED_RESIDUAL_EXCLUSION`

出版行业真实规模适配已完成 K7A（阈值、人口与权威审计）和 K7B（训练侧学习曲线、
统计支持合同、PRD amendment 与参数冻结）：

`M2_PUBLISHING_SCALE_K7B_CONTRACT_FROZEN_NO_OUTER_EXECUTION`

K7B 使用 v2.2 重述后的 strict training rows，在三个历史 origin 内做完整作品
cluster 留出和 grouped subsampling。没有读取新候选 outer outcome 或 sealed
holdout，也没有执行新的 outer candidate。

## 冻结结论

- 没有证据支持一个跨 mechanism、platform 和 taxonomy 复用的固定作品数门槛。
- 当前没有 `DIRECT_FIT` 节点。
- global pooled parent、会员、广告和交易型机制为 `SHRUNK_FIT`。
- 喜马拉雅、微信读书、番茄畅听为 `SHRUNK_FIT` 到所属机制。
- 猫耳因 leave-one-work-out 敏感性高，克拉漫播因最大研究支持低于参数数，均为
  `POOLED_PARENT`。
- 三级分类和授权关系缺少历史 as-of 权威，均为 `REPORT_ONLY`。
- 微信读书在当前训练侧协议中从 32 部起进入观察稳定区间；该整数只属于该平台、
  该协议和该模型自由度，不是 standalone 晋升授权，也不能传播为通用门槛。

参数冻结：

| 节点 | time basis | occurrence L2 | conditional amount L2 | 有效参数数 |
| --- | --- | ---: | ---: | ---: |
| global pooled parent | compact | 1 | 1 | 20 |
| 会员机制 | current | 1 | 1 | 23 |
| 广告机制 | compact | 1 | 1 | 21 |
| 交易型机制 | compact | 1 | 3 | 21 |

所有 `SHRUNK_FIT` 节点的 occurrence 与 conditional amount 分别按作品类平衡
有效样本量和现金 Kish ESS 连续收缩。月度行数不进入有效作品数分子。

## 当前模型角色

- 作品现行运行回退模型：作品发生-金额校准模型 v0.3
  （Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）。
- 作品研究比较基线：人工锚定可学习全局模型
  （Human-Anchored Learned Global，`M2-WORK-LG01`）。
- 组合级参考：组合现金 ETS/Holt-Winters
  （Portfolio ETS/Holt-Winters，`M2-PORT-ETS01`）。
- 历史渠道时间生成模型 v0.2 独立核心
  （`M2-CHAN-GEN02`，`M2-EXP-CHANNEL-GENERATIVE-02/G1`）继续保持资格阻断；
  其 `50/100`、结果和历史 verifier 不变。
- 新出版行业适配模型修订：尚未登记，等待 K7C 实现。
- 活动候选：无（`activeCandidate=null`）。
- 自动化批准：无（`approvedForAutomation=null`）。

## 当前权威入口

- 机器模型权威：`config/m2-model-registry.v1.json`
- 评价合同：`config/m2-evaluation-contract.v2.2.json`
- 统计支持机器合同：
  `config/m2-publishing-scale-statistical-support.v1.json`
- 中文统计支持合同：
  `docs/analysis/m2-current/M2-publishing-scale-statistical-support-contract-v1.md`
- 训练侧学习曲线：
  `docs/analysis/m2-current/M2-publishing-scale-training-side-learning-study-v1.json`
- PRD amendment：
  `docs/prd/m2-v2/M2-forecast-intelligence-v2-publishing-scale-amendment-v0.1.md`

各检查点的 exact HEAD、远端同步、Draft PR #29 和 Linux/Windows CI 状态必须在
运行时查询，不写死在长期状态索引中。

## 下一检查点与保持关闭

下一步 K7C 必须登记新的 model revision/experiment arm，并实现 support tier、
continuous shrinkage、runner、validator、public report、Model Registry、目录、
AGENTS、threshold impact map 和历史兼容测试。

K7C 完成普通提交、普通推送并通过 exact-head Linux/Windows CI 之前，不允许 K7D
private outer execution。当前仍禁止新候选 outer outcome、production、automation、
exact v0.3 改动、later-origin、final holdout、provider、数据库、Canary/full160、
release 和 M3 formal；Draft PR #29 不合并。
