# M1 Digital Copyright Ledger Masterdata Backfill Summary v1

本报告只保留聚合统计；真实作品ID、作品名、作者和台账摘录仅在 gitignored private 候选包中。

## 结论
- 台账数据行数：`12033`
- 匹配台账行数：`1558`
- 匹配标准作品数：`1240`
- 高置信自动补全候选：`7153`
- 中置信建议补全候选：`3160`
- 仍需人工复核：`5792`
- 结论：大量人工录入可以被缩减为“高置信自动候选 + 中低置信复核清单”的受控流程，但不能直接写正式主数据。
- M3 状态：仍不进入 M3。

## 匹配方法分布
| 方法 | 数量 |
|---|---|
| unmatched | 10460 |
| exact_work_id | 1240 |
| title_author_exact | 253 |
| title_author_fuzzy | 77 |
| mapping_work_id | 3 |

## 候选字段分布
| 字段 | 数量 |
|---|---|
| audioRightsStatus | 1558 |
| classificationLevel1 | 1558 |
| copyrightStartDate | 1558 |
| standardWorkName | 1558 |
| authorName | 1557 |
| copyrightEndDate | 1557 |
| firstPublicationDate | 1341 |
| classificationLevel2 | 1290 |
| publisherName | 968 |