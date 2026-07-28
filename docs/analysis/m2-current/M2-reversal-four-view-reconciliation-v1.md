# M2 冲销四视图与残差隔离对账 v1

状态：`M2_EVALUATION_V2_2_ACTIVE_FOR_DEVELOPMENT_WITH_DISCLOSED_RESIDUAL_EXCLUSION`。原始冲销和已分配部分均保留；未分配残差没有被伪装成已解决，只从开发可建模标签中透明隔离。

## 现金守恒

| 项目 | 权威货币单位 | 精确整数单位 |
| --- | ---: | ---: |
| 正收入 | 83821498.165600000018517939 | 83821498165600000018517939 |
| 冲销入账 | -1228913.283699999995685150 | -1228913283699999995685150 |
| 已追溯抵消 | 1228645.514699999995355150 | 1228645514699999995355150 |
| 财务重述收入 | 82592852.650900000023162789 | 82592852650900000023162789 |
| 开发可建模重述现金 | 82592852.650900000023162789 | 82592852650900000023162789 |
| 未分配冲销残差（财务对账） | -267.769000000000330000 | -267769000000000330000 |
| 从开发标签隔离的未分配残差 | -267.769000000000330000 | -267769000000000330000 |
| 守恒差 | 0.000000000000000000 | 0 |

精确整数等式为：原入账正现金 + 已入账冲销 = 开发可建模重述现金 + 隔离的未分配冲销残差。差值为 `0`。

## 影响范围

- 101 个冲销 scope、85 个作品、11 个 canonical 渠道。
- 590 个 scope-month，其中 499 个完全抵消，91 个保留部分正收入。
- 最大向后追溯深度 62 个月；深度分布为 0 月 9、1 月 41、2 月 29、3 月 13、超过 3 月 51。
- 共审计 98,675 个唯一 case；430 个 case 受冲销影响。残差阻断 case 为 0；此前会因残差被阻断、现已恢复开发标签的 case 为 292。

## 四个独立视图

- 原入账财务视图（`POSTING_TIME_ACCOUNTING_VIEW`）：`PASS_RAW_ACCOUNTING_RECORDS_PRESERVED`；143 条冲销原样保留，物理删除数为 0。
- 截止时点重述视图（`AS_OF_RESTATED_VIEW`）：`PASS_ORIGIN_VISIBLE_REVERSALS_ONLY`；origin 后冲销进入该 origin 的行数为 0。
- 最终财务对账视图（`FINAL_ACCOUNTING_RECONCILIATION_VIEW`）：`RECONCILED_WITH_DISCLOSED_UNALLOCATED_RESIDUAL`；未分配残差是否已解决：`false`。
- 开发可建模重述视图（`DEVELOPMENT_MODELABLE_RESTATEMENT_VIEW`）：`UNALLOCATED_REVERSAL_RESIDUAL_EXCLUDED_FROM_MODELABLE_TARGET`；禁止整案排除：`false`。
- 当前权威与旧入账 actual 的差异状态：`DIFFERENCES_REPORTED_NOT_REWRITTEN`，差异只报告、不回写旧结果。

未发现未来泄漏风险，使用 forecast origin 之后冲销作为特征的行数为 0。两次完整执行比较 7 个输出文件，逐字节一致为 `true`。
