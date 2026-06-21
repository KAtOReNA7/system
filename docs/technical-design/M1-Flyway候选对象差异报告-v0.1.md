# M1 Flyway 候选对象差异报告 v0.1

## 对比范围

- 基线：`docs/technical-design/M1-物理数据模型-v0.4.md` 与上一轮非正式 PostgreSQL 16 原型。
- 候选：`experiments/m1-flyway-candidate/migrations/` 中 80 个 Flyway SQL-only 文件。

## 数量差异

| 对象 | 原型/基线口径 | 候选 A | 候选 B | 结论 |
|---|---:|---:|---:|---|
| M1 业务表 + system_state | 48 | 48 | 48 | 一致 |
| Flyway history table | 0（原型无 Flyway history） | 1 | 1 | 预期新增，位于 `flyway_history` schema，不计入 M1 48 张表 |
| Views | 5 | 5 | 5 | 一致 |
| Functions | 21 | 21 | 21 | 一致 |
| User triggers | 32 | 32 | 32 | 一致 |
| Foreign keys | 84 | 84 | 84 | 一致 |
| Indexes | 117 | 117 | 117 | 一致 |

## 语义差异

1. 原型 SQL 中的 psql 元命令、`SET ROLE` 和非正式 banner 已移除，候选改为 Flyway 可执行 SQL。
2. 候选新增 Flyway preflight，要求执行角色为 `migration_owner`、会话 TimeZone 为 `UTC`、五类角色已预配置。
3. Flyway history 独立放入 `flyway_history` schema。
4. `backup_operator` 不再由候选迁移授予 PostgreSQL 预定义角色 `pg_read_all_data`；物理备份/PITR 权限保留为数据库环境外部配置，M1 schema 内仅保证无业务写权限。
5. 不写入分类树具体值、标签具体值、必需标签集合、退回阈值或真实业务数据。

## A/B hash

- A schema hash：`4a2598d623ef696dccde654315dc67d229485f894f17cdd2be6e4e8818d14e1b`
- B schema hash：`4a2598d623ef696dccde654315dc67d229485f894f17cdd2be6e4e8818d14e1b`
- A permission hash：`89c6994360376dfa09e9eee38bfc5738a9d106df89c96be428ec8ca203ef72b2`
- B permission hash：`89c6994360376dfa09e9eee38bfc5738a9d106df89c96be428ec8ca203ef72b2`

A/B hash 一致。
