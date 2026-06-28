# M3 material parsing scope v0.2

生成日期：2026-06-28

状态：当前权威解析范围。v0.1 是历史设计稿，其中“所有必填字段缺失均阻断”的表述已被用户答复修订；本 v0.2 以 PRD v0.2 和 M3-1 acceptance audit 为准。

## 1. 主入口

M3-1 的主入口是本地 private 选题物料解析。结构化选题表仅作为 fallback，不是默认工作流。

物料可以来自 Word/PDF/PPT/物料表等本地文件，但当前公开仓库只使用 synthetic fixture，不读取、不保存、不提交真实 private 物料。

## 2. 解析输出形态

解析器只输出候选结构：

- `extractedFields`
- `missingFields`
- `invalidFields`
- `confidence`
- `sourceSpanSummary`
- `manualFillRequired`
- `defaultedFields`
- `normalizedFields`

不得输出 raw material、完整原文、原始文件路径、文件字节或 private 文件内容。

## 3. 可解析候选字段

可从物料中提取候选值：

- 身份：`title`、`author`、`source`
- 分类：`classificationCandidate`
- 内容：`synopsis`、`wordCount`、`audioVolumeEstimate`、`completionStatus`
- 热度：`reads`、`collections`、`ratingScore`、`commentCount`、`rankings`、`searchHeat`、`socialHeat`、`platformHeat`、`externalHeat`
- 同名有声：`sameNameAudioStatus`、`sameNameAudioStatusCheckStatus`
- 改编：`adaptationSignals`
- 预测输入：`targetChannels`、`copyrightTermRange`
- 运营信息：`operatorRecommendationReason`、`operatorComparators`
- 追溯信息：`materialSource`、`materialUpdatedAt`、`inputConfirmedBy`

字段可变，不要求每份物料都包含完整字段集。

## 4. 自动默认与人工确认

- `publication` 缺 `completionStatus` 时，可默认 `completed`，并写入 `defaultedFields`，同时在 readiness 输出 warning。
- `web_original` 缺 `completionStatus` 时，不得默认，必须 blocked 或 pending confirmation。
- 同名有声必须先确认是否已核查；未核查时 blocked。
- 已核查但 `sameNameAudioStatus` 结果未知时，可归一为 `unknown`，只输出 warning。
- 分类候选可以由系统提取，但不能自动确认；必须保留用户确认提示。

## 5. 结构化选题表 fallback

结构化选题表只用于缺少完整物料的小众选题。它可以提供同样的字段候选，但仍需通过 readiness gate，不得绕过 hard blockers。

## 6. 安全边界

- 不读取真实 private 物料；
- 不保存 raw material；
- 不提交 Word/PDF/PPT/Excel/CSV/JSON private 文件；
- 不连接数据库；
- 不写 migration；
- 不进入 formal execution；
- 不输出开发建议或资源投入等级。
