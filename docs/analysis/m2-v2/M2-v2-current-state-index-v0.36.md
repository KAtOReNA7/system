# M2 当前状态索引 v0.36

截至 2026-07-28，M2 评价合同 v2.2 的开发评价状态继续为
`M2_EVALUATION_V2_2_ACTIVE_FOR_DEVELOPMENT_WITH_DISCLOSED_RESIDUAL_EXCLUSION`。

出版行业真实规模适配已完成 K7A（阈值、人口与权威审计）、K7B（训练侧学习曲线、
统计支持合同、PRD amendment 与参数冻结）和 K7C（新模型修订、配置、测试与全仓
影响闭合）。K7C 精确提交已通过 Draft PR #29 的 Linux 与 Windows CI。

K7D 唯一一次私有命令随后启动 capability-scoped 物化，但在候选拟合前因实现接线
错误 fail-closed。当前最终状态为出版行业规模适配实现阻断
（`M2_PUBLISHING_SCALE_IMPLEMENTATION_BLOCKED`），不是模型通过，也不是模型在真实
候选评价后失败。

## K7D 事实与根因

- 模型：出版行业适配的渠道月度发生—条件金额核心
  （Publishing-Scale Channel Monthly Occurrence × Conditional Amount Core，
  `M2-CHAN-PSC01`）。
- 实验臂：出版行业规模适配渠道核心开发的核心臂
  （`M2-EXP-PUBLISHING-SCALE-CHANNEL-01/CORE`）。
- K7C 运行时前置核验：干净工作树、HEAD 与 upstream/PR head 一致、
  `origin/main` 为祖先、PR #29 为 Draft、Linux/Windows CI 均通过。
- K7D 私有物化已启动并读取 capability-scoped 输入。
- 失败阶段：私有物化配置校验，发生在候选拟合之前。
- 根因：新 runner 误调用历史渠道时间生成模型 v0.2 的物化模式；该历史模式的
  一次性授权已关闭，因此边界校验正确拒绝继续。
- 候选拟合启动次数：0。
- raw candidate、候选预测行、候选评价行和评价 manifest：均未生成。
- primary、strict、horizon、time block、top revenue、bias、MAE、median AE、
  occurrence、conditional amount、ranking、2,000 次作品聚类 bootstrap 与
  forecastability/oracle：均未产生结果。

私有 fail-closed 收据已记录“候选拟合前失败”。该收据、行级输入、行级预测和摘要
保留在 Git ignored capability 范围；公共 artifact 不包含私有路径、摘要或作品/
渠道行级身份。

## 修复与授权状态

实现已修复为独立的 publishing-scale 物化入口，并让物化阶段异常自动写入
fail-closed 收据；历史渠道时间生成模型 v0.2 的入口与历史 artifact 未改写。修复后
只允许公开 synthetic 验证和公共门禁，不执行第二次私有物化或拟合。

- 已实现：统计支持核心、独立物化接线、失败收据控制流。
- 已验证：K7C 精确提交 Linux/Windows CI；修复提交需完成新的公共门禁与精确提交
  Linux/Windows CI。
- 已授权：K7D 一次性私有授权已经消耗，重试未授权
  （`retryAuthorized=false`）。
- 可发布：否。自动化、生产、release 和 PR 合并均未授权。

未来若要重试，必须由用户提供新的明确私有开发授权，使用新的不可覆盖收据，并在
新的精确提交通过 Linux/Windows CI 后才可执行。本状态索引本身不授予重试。

## 冻结支持与参数

- 统计支持合同：`M2-PUBLISHING-SCALE-SUPPORT-01`。
- 没有 `DIRECT_FIT` 节点。
- global pooled parent、会员、广告与交易型机制为 `SHRUNK_FIT`。
- 喜马拉雅、微信读书、番茄畅听为 `SHRUNK_FIT` 到所属机制。
- 猫耳、克拉漫播为 `POOLED_PARENT`。
- 三级分类和 work-platform 授权关系缺少历史 as-of 权威，均为 `REPORT_ONLY`。
- occurrence 与 conditional amount 分别按作品聚类有效样本量和现金有效作品数，
  在 logit 与 log1p 尺度连续收缩；月度行数不冒充独立作品数。
- 参数仍是 K7B 训练侧冻结值：global `compact/1/1/p20`，会员
  `current/1/1/p23`，广告 `compact/1/1/p21`，交易
  `compact/1/3/p21`。

## 当前模型角色与封闭边界

- 现行运行回退模型：作品发生—金额校准模型 v0.3
  （Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）。
- 研究比较基线：人工锚定可学习全局模型
  （Human-Anchored Learned Global，`M2-WORK-LG01`）。
- 组合级参考：组合现金 ETS/Holt-Winters
  （Portfolio ETS/Holt-Winters，`M2-PORT-ETS01`）。
- 当前阻断实验：出版行业规模适配渠道核心开发
  （`M2-EXP-PUBLISHING-SCALE-CHANNEL-01`）。
- 活动候选：无（`activeCandidate=null`）。
- 自动化批准：无（`approvedForAutomation=null`）。

operational fallback 未改动；final holdout、later-origin、provider、数据库、
Canary/full160、production、release、M3 formal 与合并 Draft PR #29 均未打开。

## 当前权威入口

- 机器模型权威：`config/m2-model-registry.v1.json`
- 评价合同：`config/m2-evaluation-contract.v2.2.json`
- 统计支持合同：`config/m2-publishing-scale-statistical-support.v1.json`
- 新模型配置：`config/m2-current-publishing-scale-channel.v0.1.json`
- K7D 公共闭环：
  `docs/analysis/m2-current/M2-current-publishing-scale-channel-execution-closure-v0.1.json`
- threshold impact map：
  `docs/analysis/m2-current/M2-publishing-scale-threshold-impact-map-v1.json`
