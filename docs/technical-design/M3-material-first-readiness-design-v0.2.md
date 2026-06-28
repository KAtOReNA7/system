# M3 material-first readiness design v0.2

生成日期：2026-06-28

状态：当前权威 readiness 设计。v0.1 中把 `wordCount/audioVolumeEstimate`、`completionStatus`、`sameNameAudioStatus` 等作为普通 warning 的旧口径已修订；本文件以用户最终答复和 PRD v0.2 为准。

## 1. Readiness 目标

Readiness 只判断本地非正式 M3 候选是否允许生成 numeric forecast。它不代表 formal execution、正式审批、正式发布或生产可用结论。

## 2. Hard blockers

| code | 触发条件 |
|---|---|
| `missing_title` | 缺少 `title` |
| `missing_author` | 缺少 `author` |
| `missing_source` | 缺少 `source` |
| `unsupported_source` | `source` 不是 `publication` / `web_original` |
| `missing_classification` | 同时缺少 `classificationCandidate` 和 `confirmedClassification` |
| `missing_volume_estimate` | 同时缺少 `wordCount` 和 `audioVolumeEstimate` |
| `missing_completion_status_web_original` | `source = web_original` 且缺少 `completionStatus` |
| `missing_heat_signal` | 缺少任一可用热度信号 |
| `missing_copyright_term` | 缺少 `copyrightTermRange` |
| `missing_target_channels` | 缺少 `targetChannels` |
| `missing_same_name_audio_check_status` | 缺少 `sameNameAudioStatusCheckStatus` |
| `same_name_audio_not_checked` | `sameNameAudioStatusCheckStatus` 不是 `checked` |

只要存在 hard blocker，`numericForecastAllowed = false`。

## 3. Warning codes

| code | 触发条件 |
|---|---|
| `classification_requires_user_confirmation` | 有分类候选但未确认分类 |
| `missing_synopsis` | 缺少简介 |
| `missing_comment_count` | 缺少评论数 |
| `missing_adaptation_signals` | 缺少改编信号 |
| `missing_operator_reason` | 缺少运营推荐理由 |
| `missing_operator_comparators` | 缺少运营指定对标 |
| `missing_material_source` | 缺少物料来源摘要 |
| `missing_material_updated_at` | 缺少物料更新时间 |
| `missing_input_confirmed_by` | 缺少输入确认人 |
| `completion_status_source_defaulted` | 出版物完结状态按来源默认 completed |
| `same_name_audio_unknown` | 已核查同名有声但结果 unknown |

只有 warning 且无 hard blocker 时，`numericForecastAllowed = true`，但 `readinessStatus = warning_only`。

## 4. Source-specific 行为

- `publication`：允许 `completionStatus` 缺失时默认 `completed`，并输出 `completion_status_source_defaulted`。
- `web_original`：缺少 `completionStatus` 必须阻断或等待人工确认。
- `sameNameAudioStatusCheckStatus = checked` 且 `sameNameAudioStatus = unknown`：warning only。
- `sameNameAudioStatusCheckStatus` 缺失或不是 `checked`：blocked。

## 5. 输出字段

Readiness 输出至少包含：

- `readinessStatus`
- `numericForecastAllowed`
- `nonFormal = true`
- `hardBlockers`
- `warnings`
- `hardBlockerCodes`
- `warningCodes`
- `notForFormalDecision = true`

## 6. 安全边界

M3-1 readiness 不连接数据库、不写 migration、不读取真实 private 物料、不保存 raw material、不输出开发建议、不输出资源投入等级。
