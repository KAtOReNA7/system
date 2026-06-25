# M1 Original Library Structure Audit v1

- Source workbook: `data/master-data/原创全库.xlsx`
- Sheet count: `1`
- Total data rows: `13848`
- This report is aggregate-only and contains no real work names, author names, or raw rows.

## Sheets
| sheet | rows | fields | supported |
| --- | --- | --- | --- |
| 全库排查 | 13848 | 11 | authorName, classificationLevel1, classificationLevel2, copyrightEndDate, copyrightStartDate, requiredTags, standardWorkName |

## Recognized Key Fields
| key | value |
| --- | --- |
| idFields | 作品ID |
| titleFields | 书名初, 书名更 |
| authorFields | 作者笔名 |
| licensorFields |  |
| copyrightStartFields | 授权时间 |
| copyrightEndFields | 结束时间 |
| workStatusFields |  |
| categoryFields | 一级分类, 三级分类, 二级分类 |
| tagFields | 三级分类 |
| audioRightsFields |  |
| contractStatusFields |  |

## Supported Backfill Fields
`authorName`, `classificationLevel1`, `classificationLevel2`, `copyrightEndDate`, `copyrightStartDate`, `requiredTags`, `standardWorkName`
