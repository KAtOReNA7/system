# M1 Ledger Backfill Auto Apply Rule v1

本报告定义本地 dry-run 的严格自动应用规则；不写正式主数据。

- 自动应用字段候选数：`7152`
- 自动应用标准作品数：`1225`
- 自动应用收入覆盖：`63.7%`
- 中置信和 fuzzy：不得自动应用。

## 各字段自动应用数
| 字段 | 数量 |
|---|---|
| audioRightsStatus | 819 |
| authorName | 1270 |
| copyrightEndDate | 918 |
| copyrightStartDate | 1227 |
| firstPublicationDate | 917 |
| publisherName | 768 |
| standardWorkName | 1233 |

## 排除原因分布
| 排除原因 | 数量 |
|---|---|
| requires_manual_review | 5793 |
| value_confidence_below_0_95 | 5007 |
| match_method_or_confidence_not_strict | 1946 |
| conflict_status_not_none | 1446 |
| perpetual_or_infinite_requires_business_confirmation | 385 |
| date_pending_anchor | 18 |
| audio_rights_limited_or_conflict | 1 |

## 规则
- exact_work_id / mapping_work_id 可进入自动应用候选；title_author_exact 仅在匹配置信度 >= 0.98 时可进入。
- valueConfidence 必须 >= 0.95，且 conflictStatus=none、requiresManualReview=false。
- classificationLevel3、相对期限锚点、无限期、自动续约、limited_or_conflict 有声权利均不得自动应用。