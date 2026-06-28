# M3 输入字段字典 v0.1

生成日期：2026-06-28

状态：M3-0 planning only。字段字典用于确认 M3 输入，不代表已实现。

## 字段清单

| 中文名 | key | 类型 | 必填 | 阻断 numeric forecast | 影响评级 | 影响对标 | 来源 | 示例 | 缺失处理 | 允许人工补录 | 材料解析 | 外部平台 | private |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 书名 | `title` | string | 是 | 是 | 是 | 是 | 用户表/材料 | 测试书名 | readiness blocked | 是 | 是 | 否 | 是 |
| 作者 | `author` | string | 是 | 是 | 是 | 是 | 用户表/材料/M2 | 测试作者 | readiness blocked | 是 | 是 | 否 | 是 |
| 来源 | `source` | enum | 是 | 是 | 是 | 是 | 用户表/材料 | 出版物/原创网文/其他 | readiness blocked | 是 | 是 | 否 | 否 |
| 完整三级分类 | `completeClassification` | string/list | 是 | 是 | 是 | 是 | 用户表/M2/人工 | 一级/二级/三级 | readiness blocked | 是 | 候选 | 否 | 否 |
| 简介 | `synopsis` | text | 是 | 是 | 是 | 是 | 用户表/材料 | 简介摘要 | readiness blocked | 是 | 是 | 否 | 是 |
| 字数 | `wordCount` | number | 是 | 是 | 是 | 是 | 用户表/材料 | 800000 | readiness blocked | 是 | 是 | 否 | 否 |
| 完结状态 | `completionStatus` | enum | 是 | 是 | 是 | 是 | 用户表/材料/外部 | 完结/连载中 | readiness blocked | 是 | 候选 | 是 | 否 |
| 阅读量 | `reads` | number | 是 | 是 | 是 | 是 | 用户表/外部 | 100000 | readiness blocked | 是 | 候选 | 是 | 否 |
| 收藏量 | `collections` | number | 是 | 是 | 是 | 是 | 用户表/外部 | 5000 | readiness blocked | 是 | 候选 | 是 | 否 |
| 评分 | `ratingScore` | number | 是 | 是 | 是 | 是 | 用户表/外部 | 8.5 | readiness blocked | 是 | 候选 | 是 | 否 |
| 评论量 | `commentCount` | number | 否 | 否 | 是 | 是 | 用户表/外部 | 1200 | 标记风险 | 是 | 候选 | 是 | 否 |
| 同名有声状态 | `sameNameAudioStatus` | enum | 是 | 是 | 是 | 是 | 用户表/外部/人工 | 无/有/不确定 | readiness blocked | 是 | 候选 | 是 | 否 |
| 改编信号 | `adaptationSignals` | list | 否 | 否 | 是 | 是 | 用户表/材料/外部 | 影视/动漫/漫画/游戏 | 标记风险 | 是 | 候选 | 是 | 否 |
| 站外热度 | `externalHeat` | string/object | 是 | 是 | 是 | 是 | 用户表/外部 | 高/中/低或指标集合 | readiness blocked | 是 | 候选 | 是 | 否 |
| 目标渠道 | `targetChannels` | list | 是 | 是 | 是 | 否 | 用户表/人工 | 渠道A;渠道B | readiness blocked | 是 | 否 | 否 | 否 |
| 版权期限范围 | `copyrightTermRange` | string | 是 | 是 | 是 | 否 | 用户表/版权信息 | 5年 | readiness blocked | 是 | 候选 | 否 | 是 |
| 运营推荐理由 | `operatorRecommendationReason` | text | 是 | 是 | 是 | 是 | 用户表/人工 | 推荐理由摘要 | readiness blocked | 是 | 否 | 否 | 是 |
| 运营指定对标 | `operatorComparators` | list | 否 | 否 | 是 | 是 | 用户表/人工 | 对标ID或标题摘要 | 无则仅系统候选 | 是 | 否 | 否 | 是 |
| 材料来源 | `materialSource` | string | 否 | 否 | 否 | 否 | 文件元数据/人工 | 文件名摘要 | 标记来源未知 | 是 | 是 | 否 | 是 |
| 材料更新时间 | `materialUpdatedAt` | date | 否 | 否 | 否 | 否 | 文件元数据/人工 | 2026-06-28 | 标记时效风险 | 是 | 是 | 否 | 否 |
| 输入确认人 | `inputConfirmedBy` | string | 否 | 否 | 否 | 否 | 人工 | 运营角色 | readiness warning | 是 | 否 | 否 | 是 |
| readiness 状态 | `readinessStatus` | enum | 是 | 是 | 是 | 是 | 系统计算 | ready/blocked/draft | 控制输出 | 否 | 否 | 否 | 否 |

## readiness 规则

- 必填字段缺失时，输出 `readiness blocked`，不生成 numeric forecast。
- 可选但影响解释的字段缺失时，输出风险或解释限制，不阻断 numeric forecast。
- 材料解析只能产出候选字段，不能自动确认。
- 人工确认后才可进入 evaluation candidate。

## private 边界

- 选题表、材料原文、字段抽取明细、人工补录明细默认属于 private。
- 公开仓库只允许提交字段字典、模板说明、脱敏 summary 和规则文档。

## 用户答复后的字段口径修订

- M3-1 默认输入来自选题物料，结构化选题表只作为 fallback。
- `source` 只允许 `publication` / `web_original`。
- hard blockers 缩减为：title、author、source、classification candidate or confirmed classification、至少一个可用 heat signal、copyrightTermRange、targetChannels。
- synopsis、wordCount/audioVolumeEstimate、completionStatus、commentCount、sameNameAudioStatus、adaptationSignals、operatorRecommendationReason、operatorComparators、materialSource、materialUpdatedAt、inputConfirmedBy 缺失时只输出 warning / limitation / risk。
- `sameNameAudioStatus` 只判断 has / none / unknown。
- `adaptationSignals` 影响新品候选评级和风险解释。
