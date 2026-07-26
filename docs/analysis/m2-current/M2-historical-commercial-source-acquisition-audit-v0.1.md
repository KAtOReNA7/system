# M2 historical commercial source acquisition audit v0.1

日期：2026-07-26
状态：`ANALYSIS ONLY — NO MODEL DEVELOPMENT`

## Decision

`NO_RECOVERABLE_COMPLIANT_HISTORICAL_COMMERCIAL_SOURCE_ACQUIRED`

本轮确认了两个**可能在仓库外存在**的来源线索：

1. 用户已确认公司侧保留作品渠道历史，但当前不能导出；
2. 当前数字版权台账的字段名明确要求查阅另一份“下架反馈表”。

但在当前可访问范围内，两者都没有成为可核验的 source：没有文件、接口、
connector、版本清单、`availableAt`、事件链或完整性证明。现有工作簿、迁移 ZIP、
本地 PostgreSQL dump 和 history-shaped 表仍然只证明 current/effective-date
projection 或技术执行历史。

因此，当前答案不是“公司一定没有历史”，而是：

> **存在未接入的外部候选线索，但尚无可恢复、可审计、可用于历史 origin 的商业
> 状态源。必须先由业务系统导出，才能判断是否能生成 event ledger。**

## 必须回答

| 问题 | 结论 |
|---|---|
| 是否存在可恢复历史商业状态源？ | **当前不存在。**外部 B3 作品渠道历史与“下架反馈表”是候选，但未导出、未接入、未验证，不能称为可恢复 source。 |
| 如果存在，来源/覆盖/字段是什么？ | 没有已验证来源。候选覆盖和字段见第 2 节；只有 current footprint 或用户声明，不能折算为 historical coverage。 |
| 是否可生成 event ledger？ | **不能生成 canonical/model-ready ledger。**可从当前授权起止和 current 下架标志生成隔离的 effective-date-only diagnostic，但必须保留 `availableAt=unknown`，不得进入模型。 |
| 如果不存在，业务系统需要提供什么？ | 下架反馈/平台运营/合同权利变更的不可变导出，或 CRM/ERP/版权系统 audit/CDC；至少包含 exact identity、事件、`effectiveAt`、首次可证明 `availableAt`、版本、删除语义和完整性 manifest。 |

## 1. 调查边界

本轮只做 source investigation：

- 搜索仓库代码、source/private 目录、项目迁移 ZIP、技术 recovery 目录；
- 检查 importer、loader、archive、history、change、audit、event、snapshot；
- 检查全部 migration 中的 history/event/audit/version/restore 表；
- 不连接本地、远端、共享或 staging-like 数据库；
- 只读取 PostgreSQL dump 的目录和聚合行数，不输出任何业务行；
- 只读取 ZIP 成员路径、大小、时间和摘要，不解压业务数据；
- 不修改模型、训练、预测 pipeline、schema 或生产代码。

合格历史源必须同时证明：

1. exact work × channel/platform × contract/right relation identity；
2. entry/exit/relist/restore/renew/amend/terminate 等事件；
3. 业务生效时间 `effectiveAt`；
4. 该记录首次可以被证明已知的 `availableAt`；
5. source system、dataset、version、record/event ID 和内容摘要；
6. insert/update/delete 顺序与 lineage；
7. 每个 evaluation origin 的 complete-as-of 或显式 unknown。

只有历史业务日期而没有 `availableAt` 和版本链，不足以成为 as-of 历史源。

## 2. 外部依赖线索

### 2.1 “下架反馈表”

数字版权台账中存在字段：

`是否续约（不再更新，请查阅下架反馈表）`

这证明“下架反馈表”是一个真实的**外部依赖线索**，但不能证明当前已有可用文件。

检查结果：

- 数字版权台账公开结构审计只有 1 个 sheet，没有内嵌下架反馈 sheet；
- `data/**` 文件名中“下架反馈”命中数为 0；
- 代码中没有对应 importer、loader 或 archive reader；
- 两份项目迁移 ZIP 中没有对应成员；
- 当前 source contract 没有它的 schema、版本或摘要绑定。

结论：`EXTERNAL_CANDIDATE_UNACQUIRED`。

在拿到实际文件前，其 work、channel、contract、month 覆盖和字段均为 unknown。

### 2.2 用户确认的作品渠道历史

`config/m2-current-user-confirmation.v0.1.json` 记录：

- 作品渠道可售/上下架历史：存在；
- 历史保留：是；
- 当前可导出：否；
- current authority work count：3,053；
- 当前记录中各作品第一条明细月份范围：2017-06 至 2026-04；
- 可得性定义：`each_work_first_detail_month`。

该确认说明仓库外可能有可继续追踪的业务来源，但当前定义仍是“第一条明细月份”。
第一笔现金或明细不能证明：

- 作品何时真正上架；
- 某渠道何时可售、下架或恢复；
- 没有现金的月份是否仍然可售；
- 历史记录何时进入系统；
- 当前明细是否经过回补或改写。

因此该候选目前不能生成商业状态事件。

### 2.3 授权汇总台账的补充发现

本轮复核代码后确认，`授权汇总台账.xlsx` 的 detail reader 会读取：

- work identity；
- 平台作品 identity；
- 授权开始时间；
- 授权结束时间；
- `是否下架`。

这是比前轮“只有 current membership”更完整的字段发现，但仍然不是事件历史。

`run_m2_five_source_staging_recovery.py` 的实际行为是：

1. 读取 detail 当前行；
2. 把 `是否下架` 收集为 work 级字符串集合；
3. 只要任一值为下架/已解约，就输出一个 current `已下架`；
4. 否则输出一个 current `已上架`；
5. 不保留 channel-level transition、事件时间或版本序列。

当前 staging 覆盖 3,053/3,053 部作品，初始 current 分布为 2,410 上架、643
下架；后续 120 项 current 复核更新后，正式 current master 为 2,298 上架、
755 下架。两个 current 结果之间的差异进一步说明它们是可修订 projection，
不是不可变历史事件。

当前授权汇总 footprint 为 18,959 行。它可以提供 rights-start/rights-end 和
current delisted 的 **effective-date-only 候选**，但缺少：

- record-level `availableAt`；
- source version / transaction sequence；
- before/after；
- delete/tombstone；
- channel-level event chain；
- complete-as-of 证明。

所以它不能直接生成 canonical event ledger。

### 2.4 数字版权台账的续约线索

当前 extract 有 12,033 行、1 个 sheet：

| 字段线索 | 非空 |
|---|---:|
| work ID | 10,757 |
| contract number | 11,158；7,154 个 distinct value |
| 续约前到期日期 | 3,240 |
| 已停止更新的续约标志 | 5,985 |
| 续签时间 | 263 |
| 电子书续签情况 | 506 |

这些字段证明 current ledger 保存了部分续约痕迹，但：

- `续约前到期日期` 最多保留一个 prior value，不是完整 amendment chain；
- 续约字段已明确停止更新；
- 当前 extract 可能已包含纠错或覆盖后的值；
- 没有 source revision ID、`availableAt` 或变更顺序；
- work-level contract rights 不等于 channel-level saleability。

结论：可做隔离的 current/effective-date 数据质量诊断，不能恢复历史 as-of。

### 2.5 平台运营、CRM/ERP、audit/CDC/binlog

| 线索 | 结果 | 分类 |
|---|---|---|
| 平台 publish/unpublish/relist 历史文件 | 未发现 | 未接入外部可能性 |
| 平台运营历史 connector | 未发现 | 未接入外部可能性 |
| CRM/ERP 明确配置或 connector | 未发现 | 未验证外部可能性 |
| 版权/合同系统 audit/change-log importer | 未发现 | 未验证外部可能性 |
| 业务 CDC/binlog export | 未发现 | 未验证外部可能性 |
| 本地技术 WAL | smoke/rehearsal 目录共 12 个 segment；archive-status 0、base-backup marker 0 | 技术状态，不是业务事件源 |

仓库无明确 CRM/ERP 引用并不能证明公司没有这些系统，只能说明当前 repository
没有可执行的接入证据。

## 3. Archive snapshot 调查

### 3.1 2026-07-13 foundation transfer

发现：

`data/private-output/project-transfer/KAtOReNA7-system-foundation-data-transfer-2026-07-13-v1.zip`

ZIP 有 52 个 entry、49 个文件，包含：

- 5 份 current master-data workbook；
- current 运营确认包和 staging 产物；
- 1 份 current formal DB dump；
- 当时的 current 账单文件和映射产物。

对 ZIP 内 5 份 master workbook 和 current DB dump 逐字节计算 SHA-256：

- workbook：5/5 与当前本机文件完全相同；
- DB dump：1/1 与当前本机文件完全相同。

ZIP 中没有下架反馈表、平台运营事件、合同变更日志或更早 workbook 版本。

分类：`PORTABILITY_COPY_OF_CURRENT_STATE`。

### 3.2 2026-07-16 C3 continuation transfer

第二份 ZIP 有 18 个 entry：

- 嵌套上述 foundation transfer；
- 其余为 formal cash comparator、C2/C2R1 等 derived development case 和 manifest。

没有新增 upstream commercial source。

分类：`DERIVED_DEVELOPMENT_TRANSFER_NOT_SOURCE_HISTORY`。

### 3.3 Git 与其他 recovery

- source-data tracked file：0；
- 相关 source 路径的 Git 历史 commit：0；
- current 5 份 master workbook 和 3 份账单各只发现一份实际副本；
- forensic/private-state recovery 目录没有这些 source workbook 的早期副本；
- `docs/archive/**` 是文档归档，不是业务数据归档。

因此 Git 和现有 recovery 不能恢复早期商业状态。

## 4. 代码入口审计

| 入口 | 实际能力 | 是否读取商业历史 |
|---|---|---:|
| `src/domain/m2Current/loader.js` | 读取公开 aggregate evidence | 否 |
| `src/domain/m2Current/availabilitySnapshot.js` | 验证现金 fact 在 origin 时是否可得，禁止 current backfill | 否 |
| `run_m2_five_source_staging_recovery.py` | 合并 5 份 current 主数据并输出 current status | 否 |
| `run_copyright_ledger_masterdata_audit.py` | 读取 current 数字版权台账并做结构/缺口审计 | 否 |
| `run_m2_formal_local_execution.mjs` | 把一次 current payload 和现金事实写入本地 formal DB | 否 |
| `requestEventLedger.js` | provider 请求 planned/reserved/dispatched/completed 等事件 | 否 |
| `migrationArchiveV0_3.js` | private-state migration ZIP 结构校验；状态为 `PARTIAL_NOT_INTEGRATED_STRUCTURE_ONLY` | 否 |
| `privateStateRecovery.js` | 离线 evidence/private-state 原子恢复 | 否 |

仓库没有：

- commercial historical event importer；
- work-channel relation historical loader；
- platform operations connector；
- contract/rights audit-log reader；
- CDC/binlog reader；
- commercial relation snapshot builder。

## 5. Migration 与实际 dump

本轮没有连接数据库。使用 `pg_restore -l` 和 data-only aggregate counting 对现有
custom dump 做了只读目录审计，没有输出任何业务行。

### 5.1 三张重点表

| 表 | dump 实际状态 | 判断 |
|---|---|---|
| `m1.standard_work_status_history` | 3,053 行；2,298 listed、755 delisted；只有 1 个 `valid_from`；`valid_to` 非空 0；3,053 行 basis 全为 `post_foundation_user_confirmed` | **B：current projection 写进 history-shaped table** |
| `m1.basic_info_version` | 2 个 metadata version：retired seed 的 work count=0；active formal 的 work count=3,053 | **B：只有一个 populated current snapshot** |
| `m1.basic_info_version_work` | 3,053 行；只属于 1 个 version；source ref 只有 1 个；created-at 只有 1 个 | **B：current projection** |
| `m1.mapping_change_record` | 0 行；允许的 entity type 只含 alias/raw mapping/historical volume/projection | **不是 commercial history source** |

`standard_work_status_history` 的 writer 明确使用：

```text
status = current row.workStatus
valid_from = current payload.generatedAt
```

它没有读取任何 upstream transition。

### 5.2 其他 history/event/audit/restore 表

| 表 | 实际行数/事件 | 语义 |
|---|---:|---|
| `background_task_event` | 3 | formal execution/import 技术任务生命周期 |
| `m2_formal_audit_events` | 7 | input、mapping、evaluation、export 技术审计 |
| `batch_impact_record` | 1 × `batch_activated` | import batch 技术影响 |
| `restore_point` | 1 × `batch_activate` | 指向 private-local dump 的技术恢复点 |
| `import_file` | 1 | current source bill 登记 |
| `m2_evaluation_input_snapshots` | 3,053 | 模型 aggregate input snapshot，不是 relation history |

dump 的 60 个 table-data entry 中不存在：

- `work_channel_relation_history`；
- `channel_status_history`；
- `contract_history`；
- `rights_relation_history`；
- `platform_publish_history`；
- `commercial_relation_event`。

相关名称只命中 `channel`、`channel_alias` 和
`standard_work_status_history`。前两者是 current identity/mapping；后者已证明是
一次 current projection。

### 5.3 Pre-apply dump

`m2-pre-formal-apply-local.dump` 是 formal apply 前的技术安全备份。本机
PostgreSQL 16 `pg_restore` 不支持其 archive header，因此未枚举其内容。

这不改变本轮判断：

- post-apply dump 保留了 prior seed version metadata；
- formal apply 相关路径没有 `DELETE` 或 `TRUNCATE`；
- post-apply dump 没有 prior closed status interval；
- populated `basic_info_version_work` 只有一个版本；
- migration schema 本身没有 contract/right/platform/work-channel history table。

因此它最多是此前 local technical state 的备份，不是已证明的外部商业历史。

## 6. A/B/C 分类

### A：真正历史源

**已获得：0。**

### A-pending：值得向业务系统取得的外部候选

1. 用户确认存在但不可导出的作品渠道历史；
2. 数字版权台账引用的下架反馈表；
3. 平台 publish/unpublish/relist 操作日志；
4. 版权/合同系统 amendment/renewal/termination audit log；
5. 如果无 audit table，则 CRM/ERP/版权系统 CDC/binlog；
6. 如果无事件日志，则不可变周期性 archive snapshot。

### B：current projection 或 effective-date-only

- 当前数字版权台账；
- 当前原创台账；
- 当前授权关系仪表板；
- 当前授权汇总台账；
- 当前 formal work master；
- 当前填充的 `standard_work_status_history`；
- 当前填充的 `basic_info_version*`；
- 两份 transfer ZIP 中的 current 副本。

### C：无法从当前材料恢复

- work-channel entry/exit/restore/reactivation 序列；
- platform publish/unpublish/relist 序列；
- 完整合同续约、修订、终止链；
- 每条记录 first-provable `availableAt`；
- update/delete 的事务顺序和 tombstone；
- 每个历史 origin 的 complete snapshot。

## 7. 覆盖与 event ledger

### 7.1 合规 historical coverage

| 粒度 | 合规覆盖 |
|---|---:|
| work | 0/3,053 |
| canonical channel | 0/74 |
| 实际分成 canonical channel | 0/39 |
| historical contract/right relation | 0 |
| commercial snapshot month | 0 |

外部候选的真实覆盖必须等导出后重新计算；不能把用户声明的 3,053 work 或 current
18,959 relation row 直接记为历史 coverage。

### 7.2 是否可生成 event ledger

当前：

- `canonicalEventLedgerCanBeGeneratedNow=false`；
- `provisionalEffectiveDateOnlyDiagnosticCanBeGenerated=true`。

provisional diagnostic 只能包含当前台账显式提供的授权起止、当前下架和部分续约
痕迹，并且必须：

- 不得命名为 canonical event ledger；
- `availableAt` 和 historical completeness 保持 unknown；
- 不得进入 feature、label、training 或 evaluation；
- 不得把 first cash 当 entry；
- 不得把 last/zero cash 当 exit；
- 不得把 current 下架时间回填到过去。

## 8. 业务系统最小提供清单

这不是要求用户整理或猜测模型字段，只需要业务系统负责人提供原始导出和最少说明。
已确认的 B1–B4 不重复询问；以下只针对仍未取得的材料。

| 事项编号 | 需要的材料 | 最少原始依据 | 允许填写 | 你的填写 |
|---|---|---|---|---|
| H1 | 下架反馈表或版权系统续约/下架导出 | 一份不可变全量导出、字段说明、导出时间 | 有 / 没有 / 不清楚；能导出 / 不能导出 |  |
| H2 | 平台上架、下架、恢复历史 | event export 或完整月度 snapshot | 有 / 没有 / 不清楚 |  |
| H3 | 合同/权利续约、修订、终止历史 | 带合同/作品/权利关系和版本的导出 | 有 / 没有 / 不清楚 |  |
| H4 | CRM/ERP/版权系统 audit 或 CDC/binlog | before/after、commit time、事务位置、schema version | 有 / 没有 / 不清楚 |  |
| H5 | 历史 archive snapshot | 每期完整文件、cutoff、摘要 manifest、缺失期说明 | 有 / 没有 / 不清楚 |  |

最少字段不要求使用仓库内部英文名，但业务含义必须覆盖：

- 哪部作品；
- 哪个平台/渠道；
- 哪份合同或哪项权利；
- 发生了什么变化；
- 业务何时生效；
- 系统何时首次记录或可查询；
- 记录版本/事务顺序；
- 是否删除、撤销或恢复；
- 本次导出覆盖是否完整。

可直接复制的简短回复示例：

```text
H1=有，可以导出，材料由版权系统提供
H2=不清楚
H3=有，但只有当前合同，没有变更日志
H4=没有
H5=有月度备份，最早月份不清楚
```

敏感文件只放入 Git ignored 的 capability-scoped 目录或作为当前任务附件，不上传
GitHub，不放入报告。

## 9. 取得材料后的验收条件

只有同时满足以下条件，才能判定 event ledger 可物化：

1. work identity 可 exact join 到 3,053-work authority；
2. platform/channel 可 exact join 到 canonical channel master；
3. contract/right relation ID 跨版本稳定；
4. `effectiveAt` 与 first-provable `availableAt` 分离；
5. insert/update/delete/restore 语义完整；
6. source version、事务顺序、record hash、extract manifest 可核验；
7. 完整覆盖或缺失期间可明确证明；
8. 不使用 current-state backfill。

## 10. 最终结论

本轮没有取得可恢复的历史商业状态源。

新确认的 authorization-summary 起止/下架字段，以及 transfer ZIP 和 DB
history-shaped 表，都没有改变 prior decision。它们增加了 current/effective-date
诊断价值，但没有提供 origin-time authority。

下一步：

`REQUEST_CAPABILITY_SCOPED_IMMUTABLE_EXPORT_FROM_BUSINESS_SYSTEM_OWNER_THEN_REAUDIT_BEFORE_ANY_MODEL_WORK`

本轮未修改 production 代码、模型、schema、训练或预测 pipeline；未连接数据库，
未创建 commit 或 PR。
