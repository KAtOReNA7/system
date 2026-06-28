# M3 restart PRD v0.2

生成日期：2026-06-28

状态：当前权威 PRD。本文基于用户 Q1-Q16 答复和 M3-1 acceptance audit 清理生成，直接替换 v0.1 中与用户答复冲突的旧硬阻断表和旧输出口径。v0.1 仅保留为历史记录，不再作为最高优先级规则。

## 1. M3 定位

M3 面向新品选题评估。现实运营中 90% 以上新品评估只有选题物料，因此 M3 的第一入口是 material-first：从 Word/PDF/PPT/物料表等本地 private 物料中提取候选字段，再由用户确认关键判断。

结构化选题表只作为 fallback，用于少数仅有书名、作者或少量字段、没有完整物料的小众选题。

M3 当前只允许本地非正式候选开发，不代表 formal execution、正式发布、正式审批或生产任务执行。

## 2. 输入范围

允许输入形态：

- 本地 private 选题物料，作为 M3-1 主入口；
- 人工补充字段，用于补齐 readiness hard blockers；
- 结构化选题表 fallback；
- 后续经用户授权的外部热度和对标信息。

当前公开仓库只允许保存规则、fixture、脱敏报告和测试，不保存 raw material、原文片段、private Excel/CSV/JSON、Word/PDF/PPT 原文件或真实作品明细。

## 3. Source 枚举

`source` 只允许：

- `publication`：出版物；
- `web_original`：原创网文。

不保留 `other` 来源。任何其他值均阻断 numeric forecast。

## 4. 最终 readiness hard blockers

只有下列字段或条件缺失时阻断 numeric forecast：

| hard blocker | 规则 |
|---|---|
| `title` | 必须存在 |
| `author` | 必须存在 |
| `source` | 必须存在且只能是 `publication` / `web_original` |
| `classificationCandidate` 或 `confirmedClassification` | 至少一个存在；系统候选不能自动等同最终确认 |
| `wordCount` 或 `audioVolumeEstimate` | 二者至少一个存在 |
| usable heat signal | 至少一个可用热度信号存在 |
| `copyrightTermRange` | 必须存在 |
| `targetChannels` | 至少一个目标渠道 |
| `sameNameAudioStatusCheckStatus` | 必须已核查同名有声状态 |

## 5. Source-specific 规则

- `publication` 缺少 `completionStatus` 时，可按来源默认 `completed`，但必须输出 warning，说明这是 source default。
- `web_original` 缺少 `completionStatus` 时，必须 blocked 或进入 pending confirmation，不得直接生成 numeric forecast。
- `sameNameAudioStatus` 只允许 `has` / `none` / `unknown`。
- 如果完全没有核查同名有声状态，必须 blocked。
- 如果已核查但结果为 `unknown`，只输出 warning，不 blocked。

## 6. Warning 字段

下列字段缺失或不确定时只输出 warning、limitation 或 risk，不直接阻断 numeric forecast：

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

分类候选仍需用户确认。当前 M3-1 fixture/prototype 可在有 `classificationCandidate` 时继续生成本地非正式候选结果，但必须保留人工确认提示。

## 7. 热度信号

至少一个可用热度信号即可满足 hard blocker。允许来源包括：

- 阅读；
- 收藏；
- 评分；
- 评论；
- 榜单；
- 搜索；
- 社媒；
- 平台热度；
- 其他可追溯外部热度摘要。

具体外部平台口径和权重后续由 PRD 或 M4 校准案例补充。

## 8. 改编信号

影视、动漫、漫画、游戏等改编信号是关键信息，应影响新品候选评级和风险解释。缺失改编信号不阻断 numeric forecast。

## 9. 预测输出

M3 不输出预测区间，不输出 high/base/low，不输出 optimistic/pessimistic。

必须输出：

- channel-level point forecast；
- `totalForecast = sum(channelForecasts)`；
- first-year forecast；
- year 1-5 breakdown；
- five-year total。

人工预测的业务口径是所有渠道收入预测求和，系统也必须保持这一结构。

## 10. 评级与禁止输出

M3 沿用 S+/S/A/B/C/D/E，但必须标记为 `new_product_candidate_rating`。

禁止输出：

- “是否建议开发”；
- 资源投入等级；
- formal release conclusion；
- formal task/export/write API。

## 11. 对标展示

运营指定对标和系统候选对标并列展示，互不覆盖。运营经验不能被系统候选自动覆盖，系统候选也不能被运营指定对标无条件替代。

## 12. M3-1 验收标准

M3-1 必须满足：

- material-first 是主入口；
- structured topic table 只是 fallback；
- source 仅允许 `publication` / `web_original`；
- 支持 variable material fields；
- 不保存 raw material；
- readiness hard blockers 与本文一致；
- channel forecast 按渠道生成；
- totalForecast 为渠道求和；
- 不输出 forecast range；
- 不输出开发建议；
- 不输出资源投入等级；
- fixture-only / nonFormal；
- 不连接数据库、不写 migration、不提交 private data。

## 13. 当前不做

- 不进入 M3-2；
- 不进入 M3 formal execution；
- 不连接数据库；
- 不写 migration；
- 不读取或提交 private 物料；
- 不生成正式发布审批结果；
- 不新增正式 task/export/write API。
