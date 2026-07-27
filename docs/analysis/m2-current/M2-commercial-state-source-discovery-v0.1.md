# M2 commercial-state historical source discovery v0.1

日期：2026-07-26

状态：`ANALYSIS ONLY — NO MODEL DEVELOPMENT`

## Decision

`NO_COMPLIANT_HISTORICAL_COMMERCIAL_STATE_SOURCE_FOUND_IN_INSPECTED_SCOPE`

在本仓库、已存在的 capability-scoped source 目录、公开执行摘要、数据库迁移和
现有 import/loader 代码中，**没有找到可以证明历史 origin 当时
work × channel × contract/right commercial state 的合规历史源**。

最接近的材料是：

1. 带签订、到期、续约和首发字段的当前合同台账；
2. 带授权起止日期的当前作品台账；
3. 当前 work–platform 授权关系表；
4. 2026-07-13 的当前作品状态/权利主表；
5. 有历史形状的数据库目标表。

这些材料有历史业务日期，但没有逐记录 `availableAt`、不可变 source version、
变更事件链和 complete-as-of 证明。因此它们属于 **B：current snapshot 或
effective-date-only extract**，不是 **A：可回放历史事件源**。

## 必须回答的五个问题

| 问题 | 答案 |
|---|---|
| 是否存在历史商业状态数据源？ | 在已检查范围内，**不存在已物化、可访问、可证明 as-of 的合规源**。有未导出的外部历史声明，但不是当前可审计 source。 |
| work/channel/contract/month 覆盖是多少？ | 合规历史覆盖：work `0/3,053`；master channel `0/74`、实际分成 channel `0/39`；historical as-of contract relation `0`；commercial snapshot month `0`。 |
| 能否生成 `commercial_relation_snapshot_v0.1`？ | **不能**。只能生成泄漏风险很高的 current/effective-date-only 投影，不得使用 canonical snapshot 名称，也不得进入模型。 |
| 预计 primary/strict training rows？ | 当前合规可用：primary `0/12,039`；strict inventory `0/97,490`。另有 strict evaluated comparator `0/74,320`。 |
| 如果不存在，最小未来采集方案？ | 取得不可变上游 audit/export，或从现在开始按 work × channel × contract 建 append-only event ledger 和每月 complete snapshot；必须分别记录 `effectiveAt` 与首次可证明的 `availableAt`。 |

## 1. 检查边界与方法

本轮只做 source discovery：

- 检查数据库迁移和表结构；
- 检查被 Git ignored 的 source/private 目录；
- 只读取工作表名、表头、行数和聚合字段覆盖；
- 检查 current import adapter、upstream connector、historical loader、
  archive reader 和 snapshot builder；
- 检查公开 source inventory、当前 formal execution 摘要和既有 data-readiness audit；
- 检查 private source 路径是否能从 Git 历史恢复；
- 不连接数据库，不读取远端/共享/staging-like 数据库；
- 不输出作品、作者、渠道、合同编号或原始行；
- 不开发模型、不训练、不修改预测 pipeline。

判断标准不是“有没有日期列”，而是是否同时具备：

1. exact work × channel × contract/right relation identity；
2. relation state/event；
3. `effectiveAt`；
4. 该记录最早可证明的 `availableAt`；
5. source system/dataset/version/recordId/hash；
6. transform lineage；
7. evaluation origin 时的 `complete_as_of_snapshot`。

## 2. A/B/C 来源分类

### 2.1 A：历史事件源

**未发现。**

没有一个已检查源同时满足 relation identity、事件序列、`effectiveAt`、
`availableAt`、版本、lineage 和 complete-as-of。

### 2.2 B：current snapshot 或只有历史业务日期

| 来源角色 | 当前规模 | 有用字段 | 决定性缺口 | 分类 |
|---|---:|---|---|---|
| 2026-07-13 current work master | 3,053 works | 权利起止、作品状态、音频权利状态 | 每条记录没有 effective/available time、版本和 lineage | B |
| 数字版权合同台账 current extract | 12,033 rows | 合同号、签订、到期、续约、权利、首发 | 无 channel relation、availableAt、版本、事件链 | B |
| 原创作品台账 current extract | 13,848 rows | work ID、授权开始、授权结束 | 无 channel、合同状态、availableAt、版本 | B |
| 授权关系 current dashboard | 13,085 rows | work、平台、授权分类 | 无关系起止、状态事件、availableAt、版本 | B |
| 授权汇总 current extract | 18,959 rows | work、平台、授权形式、到期 | 无开始、状态事件、availableAt、版本 | B |
| canonical channel master | 133 raw pairs → 74 canonical | identity、role、revenue mode | `effectiveMonth=0/133`；历史状态 0 | B |
| 本地 formal DB 目标表 | 3,053 current works | version/status-shaped destination | writer 只把一次 current payload 写成一条 current 状态 | B |
| 现金事实与现金派生 channel history | 192,370 facts；108 bill months | cash month、work、channel、amount | cash first/last month 不是 relation entry/exit | B |

### 2.3 C：当前材料无法恢复

以下历史无法从 current 值、现金序列或现有 DB 目标表反推：

- work-channel entry、exit、restore、reactivation；
- channel saleable_on、saleable_off；
- channel-level rights start、rights expiry；
- contract amendment、termination 和历史版本；
- platform publish/launch/first available；
- 每条记录的 `availableAt`、source version 和 lineage；
- 每个 origin 的 complete commercial-state snapshot。

数字版权台账的续约字段明确提示应查阅另一份“下架反馈表”。本轮在 source 目录、
仓库代码和公开审计材料中均未发现该 source，也没有对应 importer 或 archive reader。
因此它只能记为“可能存在的外部依赖”，不能记为已发现历史源。

## 3. 最接近历史源的台账证据

### 3.1 数字版权合同台账

该 current extract 有 12,033 行、65 个字段，是本轮最有价值的近源材料：

| 字段 | 非空 | 现有 parser 有效 | 有效月份范围 |
|---|---:|---:|---|
| work ID | 10,757 | — | — |
| contract number | 11,158；7,154 个 distinct value | — | — |
| signed date | 11,964 | 11,905 | 2002-04 至 2027-08 |
| expiry | 12,033 | 9,931 | 2006-08 至 2089-04 |
| pre-renewal expiry | 3,240 | 1,486 | 2012-10 至 2034-11 |
| renewal flag | 5,985 | — | — |
| renewal time | 263 | 0 | parser 未形成有效日期 |
| first publication | 9,609 | 8,917 | 2000-01 至 2026-03 |

这证明仓库有合同有效期和部分续约线索，但仍不能生成历史 commercial state：

- signed/expiry time 是业务有效时间，不是记录可得时间；
- 当前 extract 可能已经包含续约、纠错或覆盖后的值；
- 没有历史 row version 或 immutable change sequence；
- 没有 canonical channel relation；
- `排查时间` 是人工检查辅助时间，不能替代某个字段首次进入系统的 `availableAt`；
- `作品ID创建时间` 也不是商业关系可得时间；
- first publication 不是有声平台上线、首次可售或 channel entry。

### 3.2 原创作品台账

公开结构审计确认：

- 13,848 行；
- work ID 13,848/13,848；
- 授权开始 13,839/13,848；
- 授权结束 13,839/13,848；
- work status field 0；
- contract status field 0；
- channel identity 0；
- record-level `availableAt`、version、lineage 0。

它可作为 current work-level rights window 候选，但不能恢复 channel-level historical
saleability，也不能证明过去某个 origin 时该值是否已知。

### 3.3 当前 work–platform 授权关系

两份 current 表分别提供：

- 13,085 条 work–platform 关系，字段为客户、授权分类、平台、work、作品、作者；
- 18,959 条授权汇总，字段为平台作品、work、授权形式、作者、出版/原创、版权到期。

它们补足了 current work–platform membership，却没有关系开始、结束、变更状态、
record version 或 `availableAt`。因此不能把当前 membership 回填到历史 origin。

## 4. 数据库与 schema 发现

### 4.1 有历史形状的目标表，不等于有历史源

`m1.standard_work_status_history` 包含：

- `standard_work_id`；
- `status`；
- `status_basis`；
- `valid_from` / `valid_to`；
- `created_at` / `created_by`。

但该 migration 仍标记为 formal migration candidate。更重要的是，当前 formal
writer 的实际逻辑为：

```text
for each current payload record:
  status = current row.workStatus
  valid_from = current payload.generatedAt
```

2026-07-13 public execution summary证明写入规模为 3,053 works，且只有一个 active
basic-info version。该逻辑没有读取任何上游 status transition，所以生成的是
3,053 条 single-current-snapshot rows，不是历史 listed/delisted/relisted 事件。

### 4.2 其他版本与审计表

| schema/table | 能记录什么 | 为什么不能用作 commercial history |
|---|---|---|
| `basic_info_version` / `basic_info_version_work` | current master version 和 payload source ref | 每条 work 没有 availableAt/effectiveAt；当前 writer 来自同一次 payload |
| `channel` | current active/inactive | 没有 valid interval/history |
| `channel_alias` | mapping-version-scoped identity | 是 identity mapping，不是 work-channel saleability |
| `mapping_change_record` | alias/mapping/projection before/after | entity scope 不含 contract/right/commercial relation |
| `m2_formal_audit_events` | formal input、evaluation、export lifecycle | 是执行审计，不是业务状态事件 |
| `m2_evaluation_input_snapshots` | 当前评估 aggregate input | 一次 evaluation snapshot，不是 channel/contract history |

仓库没有：

- channel status history table；
- work-channel relation history table；
- contract history table；
- rights relation history table；
- platform publish history table。

本轮没有连接本地或远端数据库；上述结论来自迁移、writer 和公开 reconciliation，
不会把“表可能存在”误报为“历史数据已存在”。

## 5. 代码发现

| 能力 | 是否存在 | 发现 |
|---|---:|---|
| current workbook/current payload import adapter | 是 | 可导入 current master、现金和聚合评估输入 |
| commercial historical event import adapter | 否 | 没有 work-channel-contract event contract/importer |
| upstream commercial-state connector | 否 | 没有连接 contract、rights、platform availability source 的 connector |
| cash historical loader | 是 | 读取账单和 post-hoc cash history |
| commercial relation historical loader | 否 | 没有 relation event/snapshot reader |
| business archive reader | 否 | archive-only model evidence replay 不是 source archive recovery |
| cash availability snapshot builder | 是 | `m2.current.availability_snapshot.v0.1` |
| commercial relation snapshot builder | 否 | `commercial_relation_snapshot_v0.1` schema/implementation 均不存在 |
| `standard_work_status_history` M2 reader | 否 | migration 外只有 current payload writer 引用 |

现有 `availability_snapshot` 是“分成现金事实在 origin 时是否可得”的合同，不包含：

- channel entry/exit；
- contract validity revision；
- platform publish/launch；
- saleable state。

它能安全拒绝 current backfill，但不能凭空制造 commercial relation history。

## 6. Git、archive 与恢复能力

private source 路径被 `.gitignore` 覆盖：

- Git tracked source-data file count：0；
- Git history 中这些 source 路径的 commit count：0；
- 不能从 repository Git 恢复早期 workbook/version。

本机存在技术性 recovery、PostgreSQL rehearsal/smoke 和 forensic storage，但其元数据
不是已验证的业务历史导出。本轮未连接或打开数据库内容，也未把这些技术恢复目录
计为 commercial source。

## 7. 合规历史覆盖

### 7.1 Work / channel / contract / month

| 粒度 | denominator / current footprint | 合规 historical as-of 覆盖 |
|---|---:|---:|
| work | 3,053 authority works | 0 |
| canonical channel master | 74 | 0 |
| sales-share used canonical channel | 39 | 0 |
| current distinct contract number values | 7,154 | 0 historical as-of relations |
| primary origin months | 13 | 0 |
| strict inventory origin months | 16 | 0 |
| strict evaluated outer origins | 11 | 0 |
| commercial snapshot months | — | 0 |

现金有 2017-06 至 2026-05 共 108 个连续 bill month，其中 107 个完整月；这不改变
commercial-state snapshot month 仍为 0。bill month 只能证明结算月份，不能证明
商业关系或当时的 source availability。

### 7.2 Training rows

| 人口 | candidate rows | valid rows now | unknown |
|---|---:|---:|---:|
| primary | 12,039 | 0 | 12,039 |
| strict candidate inventory | 97,490 | 0 | 97,490 |
| strict evaluated comparator | 74,320 | 0 | 74,320 |

如果未来每个 origin 都完成 exact join 和 complete snapshot，12,039、97,490 和
74,320 分别是当前人口上限，不是承诺的可用行数。实际可用行还取决于：

- exact work/channel/contract identity；
- as-of source completeness；
- 目标标签是否成熟；
- 是否存在未知或冲突记录。

## 8. `commercial_relation_snapshot_v0.1` 可生成性

当前：`canGenerateNow=false`。

可以把 current 台账按业务起止日期展开成一个 effective-date-only diagnostic，但：

- 所有 `availableAt` 都未知；
- renewal/correction history 不完整；
- channel relation 不完整；
- complete-as-of 无法证明；
- 会把 current knowledge 回填到历史。

因此这种 diagnostic：

- 不得命名为 `commercial_relation_snapshot_v0.1`；
- 不得进入 feature、label、training 或 evaluation；
- 不得把缺失写成 inactive/dead；
- 只能保留为 `unknown_at_origin`。

真正的 snapshot 至少需要：

```text
snapshotId
standardWorkId
canonicalChannelUid
contractOrRightsRelationId
origin
originCutoffAt
commercialState
eventType
effectiveAt
availableAt
source.system / dataset / version / recordId / contentHash
lineage.transformId / transformVersion / parentRecordIds
completeness = complete_as_of_snapshot
```

## 9. 最小未来采集方案

### 9.1 优先：retrospective immutable export

如果真实 contract/rights/platform 系统仍保存历史：

1. 导出 append-only change log 或按版本的完整 snapshot；
2. 每条记录保留业务 `effectiveAt` 和最早可证明 `availableAt`；
3. 保留 source system、dataset、version、record ID、hash、extract timestamp；
4. 取得当前合同台账引用的下架反馈历史；
5. 映射到 exact work × canonical channel × contract/right relation；
6. 按 evaluation origin 物化 complete snapshot；
7. 无证据的历史明确写成 `unknown_at_origin`。

### 9.2 如果没有历史：从现在开始 prospective collection

最小 event type：

- `entry`；
- `exit`；
- `restore` / `reactivation`；
- `saleable_on` / `saleable_off`；
- `rights_start` / `rights_expiry`；
- `contract_signed`；
- `contract_amended`；
- `contract_terminated`；
- `platform_published` / `platform_unpublished`。

最小采集规则：

1. append-only，不覆盖旧值；
2. `effectiveAt` 与 first-observed `availableAt` 分开；
3. `availableAt` 不得回填；
4. 每月关闭时为所有 authority work 和实际使用 canonical channel 生成 complete snapshot；
5. 没有事件也要记录 snapshot completeness；
6. snapshot 绑定 source manifest 和逐记录 hash；
7. 历史缺失保持 unknown；
8. 只有目标窗口标签成熟后才进入训练。

最小自动校验：

- event ID 唯一；
- active interval 不重叠；
- model use 时 `availableAt <= originCutoffAt`；
- complete snapshot work/channel 覆盖守恒；
- source version/record/hash 非空；
- lineage parent 可解析；
- `unknown_at_origin` 不得转成 inactive。

## 10. 最终结论

本轮没有找到可直接物化 historical commercial state 的合规源。

当前材料足以：

- 建立 exact work 和 canonical channel identity；
- 描述 current rights/status；
- 提供 current contract effective-date 候选；
- 维持现金权威与既有 cash history；
- 定义严格的 future intake contract。

当前材料不足以：

- 证明历史 origin 的商业状态；
- 生成 `commercial_relation_snapshot_v0.1`；
- 形成任何合规 primary/strict training row；
- 从 current 台账、first cash month 或 DB destination 反推历史。

因此下一步不是模型实现，而是：

`BEGIN_PROSPECTIVE_VERSIONED_COMMERCIAL_RELATION_COLLECTION_OR_OBTAIN_IMMUTABLE_SOURCE_AUDIT_EXPORT`

本轮未修改 production 代码、模型文件、预测 pipeline、exact v0.3 fallback、数据权威或
cash boundary；未训练、未连接数据库、未创建 PR。
