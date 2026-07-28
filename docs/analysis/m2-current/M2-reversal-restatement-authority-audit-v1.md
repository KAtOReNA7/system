# M2 冲销追溯重述权威审计 v1

状态：`M2_EVALUATION_V2_2_BLOCKED_UNRESOLVED_REVERSAL`。权威与 scope 已证明，但这不代表最终重述视图通过；未解决残差在影响报告中单独阻断合同激活。

## 权威结论

- 现金类型权威：`user_reviewed_sales_share_workbook_membership`，由人工复核账单成员关系决定，未使用金额符号做机器分类。
- 分成行数：190,663；其中负数冲销行：143。
- 负数业务规则：`all_negative_cash_records_are_reversals`。
- 账单月份字段：`billMonth`；记录可得时间字段：`billMonth`，粒度为 `month`。
- 权威覆盖：2017-06 至 2026-05；冻结标签成熟截止月为 2025-12。

## 冲销范围

冲销键字段为 `cashCategory`、`standardWorkId`、`channelMemberId`、`sourceLedgerNativeCurrencyScope`。追溯不跨作品、canonical 渠道、币种范围或现金类型；公司级汇总回退为 `false`。渠道映射覆盖率为 1.000000，渠道主数据确认状态为 `true`。

## 精确性与隐私

金额按 10^18 整数尺度累计，整数守恒差为 `0`。权威来源、导出事实与 receipt 的摘要绑定均通过，权威记录标识唯一。公共报告仅含聚合，未发布逐笔标识或私有路径。
