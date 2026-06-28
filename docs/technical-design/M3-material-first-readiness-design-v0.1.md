# M3 material-first readiness design v0.1

生成日期：2026-06-28

状态：M3-1 fixture/prototype design。本文不代表 M3 formal execution，不写数据库，不写 migration。

## 1. 设计目标

M3-1 的默认入口是选题物料，不是结构化选题表。系统需要从 synthetic fixture 物料中生成字段候选、缺口、置信度、来源摘要和人工补充要求，然后计算本地非正式 readiness。

## 2. material-first pipeline

1. 接收 synthetic fixture material id。
2. 读取合成物料元数据和结构化 fixture signals。
3. 生成 `extractedFields`、`missingFields`、`confidence`、`sourceSpanSummary`、`manualFillRequired`。
4. 自动确认低风险明确事实字段。
5. 将分类、版权期、关键热度解释、对标和预测输入判断保留给人工确认。
6. 计算 hard blockers 与 warnings。
7. hard blockers 为空时允许生成本地非正式 numeric forecast candidate。

## 3. material metadata

fixture metadata 至少包含：

- materialId；
- materialType；
- inputMode = `material_first`；
- syntheticOnly = true；
- rawMaterialStored = false；
- rawTextPersisted = false；
- nonFormal = true。

## 4. readiness hard blockers

| hard blocker | 字段 |
|---|---|
| identity | title、author、source |
| source enum | source 只能是 publication 或 web_original |
| classification | classificationCandidate 或 confirmedClassification |
| heat | 至少一个可用热度信号 |
| copyright term | copyrightTermRange |
| channel forecast prerequisite | targetChannels |

## 5. readiness warnings

以下字段缺失时只输出 warning、limitation 或 risk，不直接 blocked：

- synopsis；
- wordCount / audioVolumeEstimate；
- completionStatus；
- commentCount；
- sameNameAudioStatus；
- adaptationSignals；
- operatorRecommendationReason；
- operatorComparators；
- materialSource；
- materialUpdatedAt；
- inputConfirmedBy。

## 6. manual completion flow

分类候选不能自动确认。低风险明确事实字段可以自动确认，但必须记录字段来源摘要和置信度。所有人工补充只进入本地非正式候选，不构成 formal release。

## 7. safety boundary

- 不读取真实 private 物料；
- 不保存 raw material；
- 不提交 Word/PDF/PPT/Excel/CSV/JSON private 文件；
- 不连接 DB；
- 不写 migration；
- 不输出开发建议；
- 不输出资源投入等级。
