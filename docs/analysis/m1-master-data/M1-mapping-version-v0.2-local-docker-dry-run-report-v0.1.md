# M1 mapping_version Docker 隔离本地写入演练报告 v0.2-local-docker-dry-run

生成时间：2026-06-21T18:15:28.913+08:00

## 结论

- 状态：PASS
- Docker 容器是否启动成功：是
- PostgreSQL 版本：16.14 (Debian 16.14-1.pgdg13+1)
- Flyway migrate/info/validate/second migrate：通过
- `00_preflight_gate.sql`：通过
- 受控导入脚本是否进入事务执行：是
- 是否执行 ROLLBACK：是；断言事务已显式 ROLLBACK
- G06 是否通过：是
- G07 是否通过：是
- G07 分类：revised_historical_mapping_strategy_passed
- Docker 容器是否已停止并删除：是
- 当前是否允许进入下一步受控导入准备：是

## 执行摘要

| item | value |
| --- | --- |
| Docker container started | true |
| PostgreSQL version | 16.14 (Debian 16.14-1.pgdg13+1) |
| Flyway migrate | true |
| Flyway info | true |
| Flyway validate | true |
| Flyway second migrate | true |
| 00 preflight executed | true |
| 00 preflight no FAIL | true |
| 00 preflight has NEEDS_LOCAL_REHEARSAL | false |
| 01 import script executed | true |
| 01 entered transaction | true |
| 01 expected hard gate failure | false |
| 03 assertion ROLLBACK executed | true |
| G06 passed | true |
| G07 passed | true |
| G07 classification | revised_historical_mapping_strategy_passed |
| Docker container stopped and removed | true |
| Allow next controlled import preparation | true |

## Schema 对象数量

| object | actual | expected |
| --- | --- | --- |
| tables | 48 | 48 |
| views | 5 | 5 |
| functions | 21 | 21 |
| user triggers | 32 | 32 |
| foreign keys | 84 | 84 |
| indexes | 117 | 117 |

## 候选映射计数

| item | value |
| --- | --- |
| effective mapping snapshot rows | 353 |
| physical plan rows | 352 |
| raw_work_id_mapping plan rows | 300 |
| historical_volume_mapping plan rows | 52 |
| audit source record count | 353 |
| priority-covered preview rows | 41 |

## G06 验证

| item | value |
| --- | --- |
| Y167972 effective source records | 2 |
| Y167972 physical rows after fold | 1 |
| Y167972 audit source records | 2 |
| G06 passed | true |

G06 结论：Y167972 在有效来源中为 2 条，物理映射计划折叠为 1 条数据库映射行，审计来源计数为 2；个案例外未被提升为通用规则。

## G07 验证

| item | value |
| --- | --- |
| target_standard_work_id | 161260 |
| business_form | audio_copyright |
| raw_work_ids | 161280, 161284, 161290 |
| direct unique conflict verified | false |
| identity rule conflict verified | false |
| unique plan conflict verified | false |
| revised strategy verified | true |
| requires user main ID confirmation | false |
| requires import strategy change | false |
| requires forward-only migration | false |
| G07 passed | true |

G07 结论：v0.2 修订策略已通过。161280、161284、161290 均未进入 raw_work_id_mapping，三条均按用户确认口径进入 historical_volume_mapping，目标为 161260/audio_copyright；RAW_TABLE_IDENTITY_COMPATIBILITY 与 RAW_TABLE_UNIQUE_COMPATIBILITY 均未再因 G07 失败，不需要 forward-only 物理模型迁移，也不需要由规则自动选择主常规 raw ID。

## 关键命令结果摘要

| command | exit_code | stdout_tail | stderr_tail |
| --- | --- | --- | --- |
| docker_existing | 0 |  |  |
| docker_run | 0 | 265bbcb0cdbb7ee107fae66613feffb1c0fb65cecde3e557bf78d4929843492d<br> |  |
| version | 0 | 16.14 (Debian 16.14-1.pgdg13+1)<br> |  |
| create_roles | 0 | DO<br> |  |
| create_db | 0 | CREATE DATABASE<br> |  |
| flyway_migrate | 0 | Migrating schema "flyway_history" to version "0060.120 - function guard version status"<br>Migrating schema "flyway_history" to version "0060.130 - function guard batch status"<br>Migrating schema "flyway_history" to version "0060.140 - function assert active versions"<br>Migrating schema "flyway_history" to version "0060.150 - function validate work mapping identity"<br>Migrating schema "flyway_history" to version "0060.160 - function enforce mapping table mutex"<br>Migrating schema "flyway_history" to version "0060.170 - function reject income fact mutation"<br>Migrating schema "flyway_history" to version "0060.180 - function validate income fact insert"<br>Migrating schema "flyway_history" to version "0060.190 - function guard snapshot child"<br>Migrating schema "flyway_history" to version "0060.200 - function validate classification parent"<br>Migrating schema "flyway_history" to version "0060.210 - function validate basic assignment release"<br>Migrating schema "flyway_history" to version "0060.220 - function validate projection sources"<br>Migrating schema "flyway_history" to version "0060.230 - view v current income"<br>Migrating schema "flyway_history" to version "0060.240 - view v basic info gap"<br>Migrating schema "flyway_history" to version "0060.250 - view v basic info m2 completeness"<br>Migrating schema "flyway_history" to version "0060.260 - view v bill cutoff months"<br>Migrating schema "flyway_history" to version "0060.270 - view v income projection monthly"<br>Migrating schema "flyway_history" to version "0060.280 - permission grant minimum permissions"<br>Migrating schema "flyway_history" to version "0060.290 - harden default privileges"<br>Successfully applied 80 migrations to schema "flyway_history", now at version v0060.290 (execution time 00:01.248s)<br> |  |
| flyway_info | 0 | \| Versioned \| 0060.130 \| function guard batch status                \| SQL    \| 2026-06-21 18:15:42 \| Success \| No       \|<br>\| Versioned \| 0060.140 \| function assert active versions            \| SQL    \| 2026-06-21 18:15:42 \| Success \| No       \|<br>\| Versioned \| 0060.150 \| function validate work mapping identity    \| SQL    \| 2026-06-21 18:15:43 \| Success \| No       \|<br>\| Versioned \| 0060.160 \| function enforce mapping table mutex       \| SQL    \| 2026-06-21 18:15:43 \| Success \| No       \|<br>\| Versioned \| 0060.170 \| function reject income fact mutation       \| SQL    \| 2026-06-21 18:15:43 \| Success \| No       \|<br>\| Versioned \| 0060.180 \| function validate income fact insert       \| SQL    \| 2026-06-21 18:15:43 \| Success \| No       \|<br>\| Versioned \| 0060.190 \| function guard snapshot child              \| SQL    \| 2026-06-21 18:15:43 \| Success \| No       \|<br>\| Versioned \| 0060.200 \| function validate classification parent    \| SQL    \| 2026-06-21 18:15:43 \| Success \| No       \|<br>\| Versioned \| 0060.210 \| function validate basic assignment release \| SQL    \| 2026-06-21 18:15:43 \| Success \| No       \|<br>\| Versioned \| 0060.220 \| function validate projection sources       \| SQL    \| 2026-06-21 18:15:43 \| Success \| No       \|<br>\| Versioned \| 0060.230 \| view v current income                      \| SQL    \| 2026-06-21 18:15:43 \| Success \| No       \|<br>\| Versioned \| 0060.240 \| view v basic info gap                      \| SQL    \| 2026-06-21 18:15:43 \| Success \| No       \|<br>\| Versioned \| 0060.250 \| view v basic info m2 completeness          \| SQL    \| 2026-06-21 18:15:43 \| Success \| No       \|<br>\| Versioned \| 0060.260 \| view v bill cutoff months                  \| SQL    \| 2026-06-21 18:15:43 \| Success \| No       \|<br>\| Versioned \| 0060.270 \| view v income projection monthly           \| SQL    \| 2026-06-21 18:15:43 \| Success \| No       \|<br>\| Versioned \| 0060.280 \| permission grant minimum permissions       \| SQL    \| 2026-06-21 18:15:43 \| Success \| No       \|<br>\| Versioned \| 0060.290 \| harden default privileges                  \| SQL    \| 2026-06-21 18:15:43 \| Success \| No       \|<br>+-----------+----------+--------------------------------------------+--------+---------------------+---------+----------+<br><br> |  |
| flyway_validate | 0 | A more recent version of Flyway is available. Find out more about Flyway 12.9.0 at https://rd.gt/3rXiSlV<br><br>Flyway OSS Edition 10.21.0 by Redgate<br><br>See release notes here: https://rd.gt/416ObMi<br>Database: [local Docker ephemeral JDBC URL redacted] (PostgreSQL 16.14)<br>Successfully validated 81 migrations (execution time 00:00.043s)<br> |  |
| flyway_second_migrate | 0 | A more recent version of Flyway is available. Find out more about Flyway 12.9.0 at https://rd.gt/3rXiSlV<br><br>Flyway OSS Edition 10.21.0 by Redgate<br><br>See release notes here: https://rd.gt/416ObMi<br>Database: [local Docker ephemeral JDBC URL redacted] (PostgreSQL 16.14)<br>Successfully validated 81 migrations (execution time 00:00.046s)<br>Current version of schema "flyway_history": 0060.290<br>Schema "flyway_history" is up to date. No migration necessary.<br> |  |
| object_counts | 0 | {"views": 5, "tables": 48, "indexes": 117, "functions": 21, "foreign_keys": 84, "user_triggers": 32}<br> |  |
| preflight | 0 | CREATE TABLE<br>INSERT 0 1<br>INSERT 0 1<br>INSERT 0 1<br>INSERT 0 1<br>INSERT 0 1<br>INSERT 0 1<br>INSERT 0 1<br>                 gate_id                 \| status \|                                             detail                                              <br>-----------------------------------------+--------+-------------------------------------------------------------------------------------------------<br> COUNT_PHYSICAL_ROWS                     \| PASS   \| expected 352, actual 352<br> HISTORICAL_TABLE_IDENTITY_COMPATIBILITY \| PASS   \| historical_volume_mapping rows incompatible with derive_standard_work_id/derive_business_form=0<br> HISTORICAL_TABLE_UNIQUE_COMPATIBILITY   \| PASS   \| historical_raw_work_id duplicate groups=0<br> NO_RAW_TARGET_CONFLICT                  \| PASS   \| same raw_work_id mapped to multiple target_standard_work_id count=0<br> RAW_TABLE_IDENTITY_COMPATIBILITY        \| PASS   \| raw_work_id_mapping rows incompatible with derive_standard_work_id/derive_business_form=0<br> RAW_TABLE_UNIQUE_COMPATIBILITY          \| PASS   \| raw_work_id_mapping target/form duplicate groups=0<br> VALID_BUSINESS_FORM                     \| PASS   \| invalid business_form rows=0<br>(7 �м�¼)<br><br> |  |
| import_run | 0 | SET<br>SET<br>BEGIN<br>SELECT 352<br>DO<br> raw_work_id_mapping_inserted \| historical_volume_mapping_inserted \| rehearsal_mapping_version_id <br>------------------------------+------------------------------------+------------------------------<br>                          300 \|                                 52 \|                            1<br>(1 �м�¼)<br><br>ROLLBACK<br> |  |
| assertions | 0 | SET<br>SET<br>BEGIN<br>SELECT 352<br>SELECT 353<br>CREATE TABLE<br>INSERT 0 1<br>INSERT 0 1<br>INSERT 0 1<br>INSERT 0 1<br>            gate_id             \| status \|                                                                            detail                                                                            <br>--------------------------------+--------+--------------------------------------------------------------------------------------------------------------------------------------------------------------<br> G06_Y167972_FOLD               \| PASS   \| effective_source_records=2, physical_rows=1, audit_source_records=2, has_exception=t, source_task_ids=MERGE::167972\n169792; MERGE::167972\n167996<br> G07_RAW_IDENTITY_COMPATIBILITY \| PASS   \| raw_work_id_mapping identity incompatible rows=0<br> G07_RAW_UNIQUE_COMPATIBILITY   \| PASS   \| raw_work_id_mapping duplicate target/form groups=0<br> G07_REVISED_STRATEGY           \| PASS   \| raw_rows=0, historical_rows=3, audit_source_records=3, general_rule_rows=0, source_task_ids=IMPORT-BLOCK::161280; IMPORT-BLOCK::161284; IMPORT-BLOCK::161290<br>(4 �м�¼)<br><br>ROLLBACK<br> |  |
| docker_stop | 0 | m1-mapping-v02-dry-run-pg16<br> |  |
| docker_ps_after | 0 |  |  |

## 安全边界

| item | value |
| --- | --- |
| formal_database_connected | false |
| formal_database_written | false |
| real_bill_imported | false |
| copyright_ledger_imported | false |
| ops_confirmation_excel_imported | false |
| mapping_version_activated | false |
| switch_mapping_version_called | false |
| formal_data_migration_executed | false |
| db_migrations_modified | false |
| candidate_package_modified | false |
| git_add_dot_used | false |
| stash_touched | false |
