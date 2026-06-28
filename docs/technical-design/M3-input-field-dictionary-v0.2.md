# M3 input field dictionary v0.2

生成日期：2026-06-28

状态：当前权威字段字典。v0.1 字段字典中把 synopsis、reads、collections、ratingScore、operatorRecommendationReason 等字段列为硬阻断的旧规则，已被用户答复和 PRD v0.2 修订；v0.1 仅作历史参考。

## 1. 字段分层

M3 字段不要求每份选题物料都完整一致。字段按用途分为：

- hard blocker：缺失时阻断 numeric forecast；
- warning：缺失或不确定时只输出 warning、limitation 或 risk；
- candidate/manual confirmation：系统可提取候选，但需要用户确认；
- output/control：系统计算输出。

## 2. Hard blocker 字段

| key | 中文含义 | 类型 | 规则 |
|---|---|---|---|
| `title` | 作品名/选题名 | string | 必须存在 |
| `author` | 作者 | string | 必须存在 |
| `source` | 来源 | enum | 必须为 `publication` 或 `web_original` |
| `classificationCandidate` / `confirmedClassification` | 分类候选或已确认分类 | list | 至少一个存在；分类候选需要用户确认 |
| `wordCount` / `audioVolumeEstimate` | 字数或音频体量估算 | number | 至少一个存在 |
| heat signal | 可用热度信号 | number/object/list | 至少一个可用信号 |
| `copyrightTermRange` | 版权期/可开发窗口 | string | 必须存在 |
| `targetChannels` | 目标渠道 | list | 至少一个渠道 |
| `sameNameAudioStatusCheckStatus` | 同名有声状态是否已核查 | enum | 必须为 `checked` |

## 3. Source-specific 字段

| key | 规则 |
|---|---|
| `completionStatus` for `publication` | 缺失时可默认 `completed`，但必须输出 source default warning |
| `completionStatus` for `web_original` | 缺失时 blocked 或 pending confirmation |
| `sameNameAudioStatus` | 只允许 `has` / `none` / `unknown` |
| `sameNameAudioStatusCheckStatus` | `unchecked` 或缺失时 blocked；`checked` 且状态 `unknown` 时 warning only |

## 4. Warning 字段

| key | 中文含义 | 缺失处理 |
|---|---|---|
| `synopsis` | 简介 | warning |
| `commentCount` | 评论数 | warning |
| `adaptationSignals` | 改编信号 | warning；存在时影响评级和风险解释 |
| `operatorRecommendationReason` | 运营推荐理由 | warning |
| `operatorComparators` | 运营指定对标 | warning；系统对标仍可并列展示 |
| `materialSource` | 物料来源摘要 | warning |
| `materialUpdatedAt` | 物料更新时间 | warning |
| `inputConfirmedBy` | 输入确认人 | warning |
| `completionStatus` source default | 出版物默认完结 | warning |
| `sameNameAudioStatus = unknown` after checked | 已核查但结果未知 | warning |

## 5. 可用热度信号

任一可用信号即可满足热度 hard blocker：

- `reads`
- `collections`
- `ratingScore`
- `commentCount`
- `rankings`
- `searchHeat`
- `socialHeat`
- `platformHeat`
- `externalHeat`

## 6. 输出控制字段

| key | 规则 |
|---|---|
| `readinessStatus` | `blocked` / `warning_only` / `ready` |
| `numericForecastAllowed` | hard blockers 为空时为 true |
| `nonFormal` | M3-1 固定为 true |
| `notForFormalDecision` | M3-1 固定为 true |

## 7. 安全边界

字段字典不包含真实作品名、作者名、渠道名、原始账单行、private 物料正文或完整作品明细。M3-1 不连接数据库、不写 migration、不进入 formal execution。
