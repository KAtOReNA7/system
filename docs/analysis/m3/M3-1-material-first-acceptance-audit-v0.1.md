# M3-1 material-first acceptance audit v0.1

生成日期：2026-06-28

审计范围：M3-1 material-first fixture/prototype、PRD v0.2、字段字典 v0.2、解析范围 v0.2、readiness 设计 v0.2、M3 领域代码和测试。

本审计不进入 M3-2，不连接数据库，不执行 Docker，不读取 private 物料，不写 migration。

## 1. 结论

M3-1 material-first prototype 在本轮清理后，已与用户 Q1-Q16 业务答复和 PRD v0.2 对齐，可作为本地非正式 fixture/prototype 基线。它不是 M3 formal execution，不代表正式新品评估结果。

## 2. 逐项验收

| 验收项 | 当前状态 | 证据 |
|---|---|---|
| material-first 是主入口 | 已满足 | `src/domain/newProductEvaluation/newProductEvaluationEngine.js`、`test/m3-new-product-evaluation-engine.test.js` |
| structured topic table 只是 fallback | 已满足 | `structuredTopicTableRole = fallback_only`、`docs/prd/30-new-product-evaluation/M3-restart-prd-v0.2.md` |
| source 只允许 publication / web_original | 已满足 | `src/domain/newProductEvaluation/materialFieldExtractor.js`、`test/m3-material-field-extractor.test.js` |
| 支持 variable material fields | 已满足 | `extractMaterialFields` 输出 missingFields/manualFillRequired/defaultedFields |
| 不保存 raw material | 已满足 | `assertNoRawMaterialPayload`、API fixture 测试 |
| readiness blockers 符合用户最终口径 | 已修正并满足 | `src/domain/newProductEvaluation/newProductReadiness.js`、`test/m3-new-product-readiness.test.js` |
| channel forecast 逐渠道计算 | 已满足 | `src/domain/newProductEvaluation/channelForecast.js`、`test/m3-channel-forecast.test.js` |
| totalForecast 是 channelForecasts 求和 | 已满足 | `aggregateChannelForecasts`、channel forecast 测试 |
| 不输出 forecast range | 已满足 | `forecastShape = point_estimate_only`、engine/channel 测试 |
| 不输出开发建议 | 已满足 | engine guardrails 与测试 |
| 不输出资源投入等级 | 已满足 | engine guardrails 与测试 |
| fixture-only / nonFormal | 已满足 | fixture dataset、API 测试、engine 输出 |
| 无 DB / migration / private data | 已满足 | 本轮未改 `db/migrations/`，未读取 private 物料，未连接数据库 |

## 3. 本轮修正点

- `wordCount` 或 `audioVolumeEstimate` 二者至少一个存在，缺二者时 hard blocked。
- `publication` 缺 `completionStatus` 时默认 `completed`，并输出 warning。
- `web_original` 缺 `completionStatus` 时 hard blocked。
- 新增 `sameNameAudioStatusCheckStatus`，未核查同名有声状态时 hard blocked。
- 已核查但 `sameNameAudioStatus = unknown` 时 warning only。
- v0.2 文档直接替换旧规则，不再把 v0.1 旧表格作为当前最高优先级。

## 4. 最终 hard blockers

1. `title`
2. `author`
3. `source`，且只能是 `publication` / `web_original`
4. `classificationCandidate` 或 `confirmedClassification`
5. `wordCount` 或 `audioVolumeEstimate`
6. 至少一个 usable heat signal
7. `copyrightTermRange`
8. `targetChannels`
9. `sameNameAudioStatusCheckStatus = checked`

## 5. 最终 warning 字段

- `synopsis`
- `commentCount`
- `adaptationSignals`
- `operatorRecommendationReason`
- `operatorComparators`
- `materialSource`
- `materialUpdatedAt`
- `inputConfirmedBy`
- `completionStatus` for `publication` if defaulted
- `sameNameAudioStatus = unknown` after checked

分类候选仍需用户确认；M3-1 可生成本地非正式候选结果，但不能作为正式确认结果。

## 6. 仍不进入 M3 formal execution

当前仍禁止：

- 读取或提交 private 物料；
- 连接数据库；
- 写 migration；
- 输出正式新品评估；
- 输出“是否建议开发”；
- 输出资源投入等级；
- 开放正式 task/export/write API。
