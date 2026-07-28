# 出版行业适配的渠道月度发生—条件金额核心：K7C 实现就绪报告

- 英文名：Publishing-Scale Channel Monthly Occurrence × Conditional Amount Core
- 稳定模型 ID：`M2-CHAN-PSC01`
- 实验臂：`M2-EXP-PUBLISHING-SCALE-CHANNEL-01/CORE`
- 当前状态：已实现但尚未执行私有开发评价（`IMPLEMENTED_NOT_EXECUTED_AWAITING_EXACT_HEAD_CI`）
- 支持合同：`M2-PUBLISHING-SCALE-SUPPORT-01`

## 实现结果

新版本位于 canonical M2 core，使用每部作品总权重相等的训练权重，并分别在发生概率的
logit 尺度与条件金额的 log1p 尺度连续收缩到父层。历史
`M2-CHAN-GEN02`、历史配置、历史评分和旧阻断结论均未改写。

## 冻结支持层级

- 全局池化父层：`SHRUNK_FIT`
- 会员分成机制：`SHRUNK_FIT`
- 广告分成机制：`SHRUNK_FIT`
- 单购交易机制：`SHRUNK_FIT`
- 三级分类：`REPORT_ONLY`
- 授权关系：`REPORT_ONLY`
- 独立拟合（`DIRECT_FIT`）节点数：0

月度行没有被解释为独立作品样本。每个公开节点都报告 distinct works、
positive works、work-cluster ESS、现金 ESS、集中度、支持层级、连续收缩权重与回退原因。

## 权威与执行边界

三级分类和 work-platform 授权关系缺少历史 as-of 字段，因此保持
`REPORT_ONLY`；只允许使用 forecast origin 已观察到的 canonical channel
identity，不回填 current-only 分类或授权。K7C 只运行了公开 synthetic diagnostic，
未读取新候选 outer outcome；一次性 private development execution 必须等待本提交的
exact-head Linux/Windows CI 成功后才能执行。

## 公开 synthetic 验证

- 状态：`SYNTHETIC_DIAGNOSTIC_PASS`
- distinct works：180
- monthly rows：4464
- WAPE：0.23341901
- signed bias：-0.14437953
- private artifact read：false
- candidate outer outcome read：false
