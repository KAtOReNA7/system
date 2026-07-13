# M1/M2 基础字段收口后项目状态 v1

## 结论

- 用户最终分类与标签基础大表、核心字段、状态字段以及 146/92 两类业务复核均已收口，人工数据决定待办为 0。
- 逐作品正式基础信息输入覆盖 3053 部作品并通过内容契约；旧 3054 部身份范围已归并为 3053 部标准作品，192872 行收入事实与金额守恒。
- 2026-07-13 已在隔离本地 PostgreSQL 16 完成 Flyway `0071.020`、正式基础信息版本、不可变输入快照、收入事实/projection、mapping activation、DB-backed evaluation、task/audit 和 prepared export。
- 严格对账 22 项全部通过：基础信息、mapping、收入事实、评估结果和导出范围一致，自动运营建议为 0，开放 blocking review 为 0。
- 当前算法仍为 `m2-realdata-dev-disentangled-forecast-v1.1-conditional`，算法未标记为 formal，3053 条结果均保持 `not_for_formal_decision=true`；export 仅为 `prepared`。
- 用户已于 2026-07-13 明确拒绝该 conditional 算法与 prepared export，禁止 release。下一工程任务是以当前 3053 部最终权威基础数据和 192872 条收入事实校准最终上线预测算法；M3 formal execution 未获授权且继续暂缓。

## 当前状态

| 数据项 | 当前状态 | 人工待办 | 隔离本地正式状态 |
|---|---|---:|---|
| 作者、版权开始、版权到期 | 3053 部输入契约通过 | 0 | 已写 active 基础信息版本和 input snapshot |
| 作品状态 | 已上架 2298、已下架 755 | 0 | 已持久化 |
| 音频版权状态 | 版权有效 2250、无限期 473、版权已到期 330 | 0 | 已持久化；期限/状态冲突 0 |
| 一级/二级/三级分类 | 出版物 1195、网文 1858，路径全部有效 | 0 | 3053 条分类关联已持久化 |
| 辅助标签 | 387 部、532 个标签赋值已固定 | 0 | 已写入基础信息关联 |
| 到期但仍有收入 | 146 条已确认并应用 | 0 | 保留审计/事实型提示 |
| 版权有效但收入稀疏 | 92 条已确认并应用 | 0 | 决定已写入正式输入 |
| 历史收入 | 192872 条事实/projection | 0 | 金额与范围严格对账通过 |
| mapping | 1 个 active version | 0 | 隔离本地已激活并校验 |

## PRD 对齐状态

| PRD 能力 | 当前状态 | 结论 |
|---|---|---|
| 标准作品与基础信息 | active 版本和不可变输入快照已创建 | 隔离本地执行完成，不等于生产发布 |
| 历史收入与收入模式 | 3053 部、192872 条事实重算通过 | DB-backed 严格对账通过 |
| 生命周期与评级 | rating-standard-v3 已进入正式输入快照 | 仍受 conditional 算法发布门禁约束 |
| 剩余版权期预测 | v1.1 `CONDITIONAL PASS` | WAPE 0.6409，baseline 0.7043，coverage 0.5769，P0/P1/P2 为 0/0/473 |
| 风险与运营处理 | 只保留风险和事实型复核提示 | 自动运营建议已从正式结果和导出移除 |
| 回测 | 固化到当前算法和输入版本 | 可复现证据已记录，尚未最终 release |
| task/export/audit | 1 个 task 成功、7 个 audit event、3053 个 export item | package=`prepared`，released package=0 |

## 当前需要人工介入

1. 当前不需要继续补基础数据；用户已声明当前版本是上线时继续使用的最准确基础数据。
2. 系统先完成最终上线预测算法校准、回测和中文业务验证包；形成新候选后再由用户抽检。
3. 新候选获得明确批准前，不得把算法改为 formal，不得把结果改为可正式决策，不得发布 export，也不得进入 M3 formal execution。

## 系统已经完成的动作

1. 通过 forward migrations 保真承载精确日期、无限期、相对期限、仅年份和到期日未知等受控期限类型。
2. 在隔离本地 PostgreSQL 上完成 migration、正式基础信息、收入事实、mapping、评估、task、audit 和 prepared export。
3. 完成 22 项严格对账，确认 3053 部范围、192872 条事实、金额、版本、快照和导出均一致。
4. 保持 conditional 安全边界：算法未 formal、结果不可用于正式决策、package 未 release。

## 边界

- 本报告只包含脱敏聚合，不包含作品名、作者名、渠道名或行级收入。
- private Excel/JSON、payload、缓存和数据库备份不进入版本控制。
- 当前是“隔离本地 formal execution 已完成、旧 v1.1 release 已被拒绝、等待新算法校准”，不是生产发布审批完成。
- 最新执行证据见 `docs/analysis/m2-real-data/M2-formal-local-execution-summary-v1.md`。
