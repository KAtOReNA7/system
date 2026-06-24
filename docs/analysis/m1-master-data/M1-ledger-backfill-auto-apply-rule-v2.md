# M1 Ledger Backfill Auto Apply Rule v2

本报告定义更保守的 v2 自动应用规则；不写正式主数据。

- v1 自动字段候选：`7152`
- v2 自动字段候选：`7097`
- 数量变化：`-55`
- v2 自动作品数：`1225`
- v2 收入覆盖：`63.7%`
- 降级人工复核候选：`55`

## v2 自动字段分布
| 字段 | 数量 |
|---|---|
| audioRightsStatus | 819 |
| authorName | 1270 |
| copyrightStartDate | 1223 |
| firstPublicationDate | 917 |
| standardWorkName | 1233 |
| copyrightEndDate | 867 |
| publisherName | 768 |

## 降级原因
| 原因 | 数量 |
|---|---|
| multiple_date_text_requires_manual_review | 55 |

## 规则
- 当前值必须为空；非空权威值不覆盖，完全一致或格式标准化也不作为自动应用。
- 允许 exact_work_id / mapping_work_id；title_author_exact 需 matchConfidence >= 0.99。
- valueConfidence >= 0.97，conflictStatus=none，requiresManualReview=false。
- 仅允许作品名、作者、版权开始、版权到期、出版社、首发/出版日期、有声权利状态自动应用。
- fuzzy、三级分类、相对期限、多日期冲突、自动续约、权利冲突全部进入复核。