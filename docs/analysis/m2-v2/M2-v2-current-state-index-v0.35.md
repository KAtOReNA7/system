# M2 当前状态索引 v0.35

截至 2026-07-28，M2 评价合同 v2.2 的开发评价状态继续为
`M2_EVALUATION_V2_2_ACTIVE_FOR_DEVELOPMENT_WITH_DISCLOSED_RESIDUAL_EXCLUSION`。

出版行业真实规模适配已完成 K7A（阈值、人口与权威审计）、K7B（训练侧学习曲线、
统计支持合同、PRD amendment 与参数冻结）和 K7C（新模型修订、配置、测试、runner、
validator、公开报告与全仓影响闭合）：
`M2_PUBLISHING_SCALE_K7C_IMPLEMENTED_NO_PRIVATE_OUTER_EXECUTION`。

## K7C 新模型身份

- 中文名：出版行业适配的渠道月度发生—条件金额核心。
- 英文名：Publishing-Scale Channel Monthly Occurrence × Conditional Amount Core。
- 稳定模型 ID：`M2-CHAN-PSC01`。
- 实验与实验臂：出版行业规模适配渠道核心开发
  （`M2-EXP-PUBLISHING-SCALE-CHANNEL-01/CORE`）。
- canonical core：`src/domain/m2Current/publishingScaleChannelCore.js`。
- active runtime config：`config/m2-current-publishing-scale-channel.v0.1.json`。
- 统计支持合同：`M2-PUBLISHING-SCALE-SUPPORT-01`。
- 当前状态：已实现、公开 synthetic diagnostic 已验证；尚未执行私有 outer
  development evaluation，尚未授权自动化、生产或发布。

该身份是新的 model revision，不改写历史渠道时间生成模型 v0.2
（Channel Generative v0.2，`M2-CHAN-GEN02`）及其历史独立核心实验臂
（`M2-EXP-CHANNEL-GENERATIVE-02/G1`）。历史 `50/100` 资格、配置、评分、阻断结论和
verifier 全部保留。

## 冻结支持与参数

- 没有 `DIRECT_FIT` 节点。
- global pooled parent、会员、广告与交易型机制为 `SHRUNK_FIT`。
- 喜马拉雅、微信读书、番茄畅听为 `SHRUNK_FIT` 到所属机制。
- 猫耳、克拉漫播为 `POOLED_PARENT`。
- 三级分类和 work-platform 授权关系缺少历史 as-of 权威，均为 `REPORT_ONLY`。
- occurrence 与 conditional amount 分别按 work-cluster 有效样本量和现金有效作品数，
  在 logit 与 log1p 尺度连续收缩；月度行数不进入独立作品样本量分子。
- 参数继续使用 K7B training-side freeze：global `compact/1/1/p20`，
  会员 `current/1/1/p23`，广告 `compact/1/1/p21`，
  交易 `compact/1/3/p21`。

## 当前模型角色

- 现行运行回退模型：作品发生—金额校准模型 v0.3
  （Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）。
- 研究比较基线：人工锚定可学习全局模型
  （Human-Anchored Learned Global，`M2-WORK-LG01`）。
- 组合级参考：组合现金 ETS/Holt-Winters
  （Portfolio ETS/Holt-Winters，`M2-PORT-ETS01`）。
- 新模型修订：`M2-CHAN-PSC01` 已实现但未执行私有评价；它尚不是活动候选
  （`activeCandidate=null`）。
- 自动化批准：无（`approvedForAutomation=null`）。

## 当前权威入口

- 机器模型权威：`config/m2-model-registry.v1.json`
- 评价合同：`config/m2-evaluation-contract.v2.2.json`
- 统计支持合同：`config/m2-publishing-scale-statistical-support.v1.json`
- 新模型配置：`config/m2-current-publishing-scale-channel.v0.1.json`
- K7C readiness：
  `docs/analysis/m2-current/M2-current-publishing-scale-channel-readiness-v0.1.json`
- threshold impact map：
  `docs/analysis/m2-current/M2-publishing-scale-threshold-impact-map-v1.json`

## 下一检查点与封闭边界

K7D 只允许在 K7C 普通提交、普通推送及 exact-head Linux/Windows CI 全部成功后，
进行一次 private development execution。执行前必须在运行时核验当前 HEAD、upstream、
PR #29 head、双平台 CI 与干净工作树，不得把本机路径或预设提交写入长期合同。

当前仍禁止在 K7D 前读取新候选 outer outcome，也禁止 production、automation、
exact v0.3 改动、later-origin、final holdout、provider、数据库、Canary/full160、
release、M3 formal 与合并 Draft PR #29。
