# M1 Master Data Gap Ledger Backfill Audit v1

本报告为脱敏聚合审计。自动补全候选仅为本地候选，不代表正式主数据已发布。

- 当前标准作品数：`3054`
- 候选总数：`12945`
- 高置信自动补全候选：`7153`
- 中置信建议补全候选：`3160`
- 低置信/人工复核候选：`1846`
- 冲突候选：`1444`

## 当前缺口聚合
| 缺口类型 | 数量 |
|---|---|
| missingWorkName | 3099 |
| missingAuthor | 1830 |
| missingCopyrightStart | 1833 |
| missingCopyrightEnd | 2223 |
| missingPublisher | 3099 |
| missingClassification1 | 3099 |
| missingClassification2 | 3099 |
| missingClassification3 | 3099 |
| missingRequiredTags | 1829 |
| missingAudioRights | 3054 |
| missingFirstPublicationDate | 3099 |

## 台账可补全潜力
| 字段 | 候选数 | 高置信自动 | 中置信建议 | 低置信人工 | 冲突 |
|---|---|---|---|---|---|
| audioRightsStatus | 1558 | 819 | 181 | 97 | 85 |
| authorName | 1557 | 1270 | 156 | 131 | 120 |
| classificationLevel1 | 1558 | 0 | 1318 | 240 | 0 |
| classificationLevel2 | 1290 | 0 | 1034 | 256 | 139 |
| copyrightEndDate | 1557 | 918 | 140 | 174 | 165 |
| copyrightStartDate | 1558 | 1227 | 114 | 217 | 211 |
| firstPublicationDate | 1341 | 918 | 26 | 397 | 396 |
| publisherName | 968 | 768 | 78 | 122 | 116 |
| standardWorkName | 1558 | 1233 | 113 | 212 | 212 |

## 高收入作品覆盖
| 收入桶 | 作品数 | 候选数 | 高置信自动 | 人工复核 |
|---|---|---|---|---|
| top_1_percent | 30 | 219 | 114 | 105 |
| top_5_percent | 122 | 1232 | 523 | 709 |
| top_10_percent | 153 | 931 | 463 | 468 |