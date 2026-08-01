# M2 LG01 头部保护尾段修正模型首次独立评价 v0.2

最终状态：**因不可替代源权威不完整而阻断**（`M2_HPSR02_BLOCKED_MISSING_SOURCE_AUTHORITY`）。

对象是 LG01 头部保护尾段修正模型 v0.2（LG01 Head-Protected Tail-Band Correction Model v0.2，`M2-WORK-HPSR02`），所属实验是 M2 LG01 头部保护分段路由与独立后期起点验证 v0.1（M2 LG01 Head-Protected Segmented Router and Independent Later-Origin Validation v0.1，`M2-EXP-LG01-HEAD-PROTECTED-SEGMENTED-ROUTER-01`）。健康同案例基线仍是冻结 LG01（`M2-WORK-LG01`）。

本轮没有形成模型科学结果。金额读取前的完整性与合同复核检查点（`K0`）已经确认 2026-04 至 2026-06 的账单月份均存在，日期窗口本身已满足预注册；但标准导入所依赖的用户复核渠道主数据和总表/分表一致性没有通过。因此严格在读取 actual 金额前停止，未运行候选、未预测、未评分，也未执行 bootstrap。

## 金额读取前检查结果

| 检查项 | 结果 |
| --- | --- |
| 不可替代权威文件存在性 | 文件存在（`SOURCE_AUTHORITY_FILES_PRESENT`），但内容未通过标准导入权威校验（`SOURCE_AUTHORITY_INCOMPLETE_STANDARD_IMPORT`） |
| 权威账单月份 | 2026-04、2026-05、2026-06 均存在；完整截止月为 2026-06（`BILL_MONTH_WINDOW_COMPLETE`） |
| 非金额事实行数 | 2026-04：2,949；2026-05：3,190；2026-06：2,517 |
| schema | 通过（`SCHEMA_VALID`） |
| 作品映射 | 通过（`WORK_MAPPING_VALID`） |
| canonical 渠道校验 | 未通过：2026-05 有 134 行涉及 3 个未经用户复核映射的原始渠道组合（`CANONICAL_CHANNEL_MAPPING_INCOMPLETE`） |
| 部分导入标记 | 未发现明确的部分导入或未完整标记（`NO_EXPLICIT_PARTIAL_IMPORT_MARKER`） |
| 总表/分表非金额元数据守恒 | 未通过：总表 198,076 行，分成表 196,367 行，买断表 1,712 行；组合分表比总表多 3 行（`METADATA_PARTITION_MISMATCH`） |
| 去重 | 因上游源权威已阻断且不得读取金额，未进入金额依赖的完整去重检查（`NOT_REACHED_SOURCE_AUTHORITY_BLOCKED_BEFORE_AMOUNT_READ`） |
| 可重建派生缓存 | 缺失但可自动重建，不构成阻断（`CACHE_MISS_REBUILDABLE`） |
| 历史运行收据 | 缺失但仅属可选 provenance，不构成阻断（`OPTIONAL_PROVENANCE_MISSING`） |
| actual 金额单元格读取数 | 0（`NO_ACTUAL_AMOUNT_READ`） |

这里只公开聚合计数，不公开原始作品、渠道身份、私有路径或金额。月份存在不等于标准源权威已经有效；本次阻断来自可复核的主数据和分表一致性问题，不是另行发明 availableAt、effectiveAt、签约、上架、曝光或消费量门禁。

## 预留边界与未执行项

预注册的首次独立起点仍是 2026-03，三个月实际窗口仍是 2026-04 至 2026-06。前瞻最终留出起点仍是 2026-06，其 2026-07 至 2026-09 窗口未打开、未读取。二者保持隔离。

本轮执行账如下：

- actual 金额读取 0 行；
- 候选运行、预测与科学评价均为 0 次；
- bootstrap、训练、拟合、调参、alpha 搜索、残差边界重估与选模均为 0 次；
- 没有生成 raw candidate、selected fallback 或任何模型成绩；
- Core90 敏感性能力没有在既有合同中定义（`CAPABILITY_NOT_DEFINED`），本轮没有创建第二套现金带；
- 因源权威阻断，成熟作品数、动态 Core80 case 数和金额覆盖、H50/M30/L20 构成、WAPE、signed bias、paired FVA、误差集中度、现金带归因和数值诊断全部不可用（`CAPABILITY_NOT_EXECUTED_SOURCE_AUTHORITY_BLOCKED`），不得填 0 或推断。

## 治理结论与恢复条件

作品—渠道门禁保持部分但未激活（`PARTIAL_NOT_ACTIVE`；633 个作品—起点—渠道案例、914 个组成项）。活动候选保持 `null`，自动化批准保持 `null`，生产就绪为 `false`，最终留出仍未打开。Draft PR 必须保持 Open/Unmerged。

要恢复本能力，必须先由用户复核并补齐 3 个原始渠道组合的 canonical 映射，并复核总表与分成/买断分表之间的 3 行非金额元数据差异。修复完成后仍需新的明确授权；本任务不会自动继续读取金额或执行模型。

机器可读同源结果见 `M2-head-protected-tail-band-correction-independent-evaluation-v0.2.json`。
