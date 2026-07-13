# M2 本地正式执行汇总 v1

## 结论

- 执行模式：`applied`。
- 正式基础信息写入：`true`。
- mapping activation：`true`。
- formal evaluation：`true`。
- DB-backed export：`prepared`。
- 自动运营建议：`0`，正式输出继续禁止运营动作建议。
- 最终发布批准：`false`。
- M3 formal execution：`false`。

## 输入与模型

- 标准作品：`3053`。
- 收入事实：`192872`。
- 业务复核：`238` 条，待确认 `0`。
- 期限/当前权利状态冲突：`0`；到期早于开始：`0`。
- 模型结论：`CONDITIONAL PASS`。
- WAPE：`0.6409`；baseline：`0.7043`。
- 区间覆盖率：`0.5769`；P0/P1/P2：`0/0/473`。
- 可预测收入覆盖：`0.7788`；true blocked 收入占比：`0.2038`。

## 严格对账

| 检查项 | 结果 |
|---|---|
| 总体通过 | `true` |
| factRowsMatch | `true` |
| projectionRowsMatch | `true` |
| projectedWorksMatch | `true` |
| amountsMatch | `true` |
| sourceAmountMatch | `true` |
| basicInfoWorksMatch | `true` |
| classificationAssignmentsMatch | `true` |
| evaluationResultsMatch | `true` |
| inputSnapshotsMatch | `true` |
| noOperatingSuggestions | `true` |
| noOpenBlockingReviews | `true` |
| exportItemsMatch | `true` |
| oneExportPackage | `true` |
| noReleasedPackage | `true` |
| auditEventChainComplete | `true` |
| formalTaskSucceeded | `true` |
| algorithmFrozenConditional | `true` |
| formalFlagsRemainUnapproved | `true` |
| exportPreparedNotReleased | `true` |
| lifecycleOperational | `true` |
| oneActiveMappingVersion | `true` |
| oneActiveBasicInfoVersion | `true` |

## 下一人工门禁

- 用户已于 2026-07-13 明确拒绝 v1.1 conditional 和当前 prepared export。
- 该 package 不得变为 approved/released；算法和结果继续保持非正式决策边界。
- 下一步以最终 3053 部权威基础数据和 192872 条收入事实校准最终上线预测算法，形成新候选后再进行业务抽检。M3 formal execution 仍不启动。

## 安全边界

- 本报告只包含脱敏聚合；不包含作品名、作者名、渠道名、原始账单行或连接凭据。
- private payload、NDJSON、模型缓存和本地 dump 均位于 Git 忽略目录，不进入版本控制。
