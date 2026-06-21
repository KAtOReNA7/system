# M1 Flyway 正式迁移目录冻结回归报告 v0.1

生成时间：2026-06-21

结论：正式迁移目录 `db/migrations/` 通过冻结后回归门禁。允许后续应用开发使用该目录建立开发/测试数据库结构；仍禁止正式数据迁移、真实数据导入和运营确认结果自动应用。

## 1. Git 状态

| 项目 | 结果 |
| --- | --- |
| 当前 HEAD | `a3a089947495fe24205fb0f52f034feb35238f5f` |
| 当前分支 | `main` |
| 远端追踪 | `origin/main` |
| 回归前工作区 | 干净 |
| 本地 stash | 9 条，未应用、未删除 |

说明：回归前先提交了 3 个运营侧公开前置报告；非本轮范围的自动刷新分析产物被单独保存到本地 stash，未纳入本轮提交。

## 2. 正式迁移目录完整性

| 检查项 | 结果 |
| --- | --- |
| `db/migrations/` SQL 数量 | 80 |
| 文件命名 | 符合 `V{layer4}_{seq3}__description.sql` |
| 迁移声明 banner | 全部存在 |
| 与候选目录 SHA-256 | 完全一致 |
| 非 SQL 文件 | 无 |
| manifest、日志、配置混入 | 无 |
| 真实数据、密码、密钥、私有路径扫描 | 未发现阻断项 |

`db/migrations/` 与 `experiments/m1-flyway-candidate/migrations/` 对应文件内容一致；正式迁移目录未发生非预期变更。

## 3. Flyway 回归验证

验证来源：`db/migrations/`

验证环境：

| 项目 | 结果 |
| --- | --- |
| Flyway | OSS 10.21.0 |
| PostgreSQL | 16.14 |
| 测试库 | `m1_flyway_formal_freeze_check` |
| 数据库时区 | UTC |
| schema history | `flyway_history.flyway_schema_history` |
| 当前版本 | `0060.290` |
| SQL 文件数 | 80 |
| successful history rows | 81 |

执行结果：

| 命令 | 结果 |
| --- | --- |
| `flyway migrate` | 通过，成功应用 80 个迁移 |
| `flyway info` | 通过 |
| `flyway validate` | 通过 |
| 第二次 `flyway migrate` | 通过，无重复执行 |

本轮验证使用本地隔离 PostgreSQL 16 实例。未连接正式数据库，未使用正式凭据，未导入真实账单、台账或运营确认结果。验证完成后临时实例已停止。

## 4. 对象数量

| 对象 | 实际数量 | 目标数量 | 结果 |
| --- | ---: | ---: | --- |
| M1 tables | 48 | 48 | 通过 |
| Views | 5 | 5 | 通过 |
| Functions | 21 | 21 | 通过 |
| User triggers | 32 | 32 | 通过 |
| Foreign keys | 84 | 84 | 通过 |
| Indexes | 117 | 117 | 通过 |

## 5. 权限验证

| 检查项 | 结果 |
| --- | --- |
| `migration_owner` 非超级用户 | 通过 |
| `application_rw` 不能直接修改 `income_fact` | 通过 |
| `application_rw` 不能直接执行版本激活函数 | 通过 |
| `application_ro` 可查询正式视图 | 通过 |
| `application_ro` 不能写业务表 | 通过 |
| `background_worker` 可构建候选版本相关数据 | 通过 |
| `background_worker` 不能越权执行激活函数 | 通过 |
| `backup_operator` 无业务写权限 | 通过 |
| `SECURITY DEFINER` 函数 owner 非超级用户 | 通过 |
| `SECURITY DEFINER` 函数固定 `search_path` | 通过 |

`SECURITY DEFINER` 函数数量为 7，owner 均为 `migration_owner`，且均设置 `search_path=pg_catalog, m1`。

## 6. 门禁结论

允许：

- 应用开发使用 `db/migrations/` 建立开发/测试数据库结构；
- 在空库或纯合成数据环境中进行后续应用开发；
- 以 `db/migrations/` 作为唯一正式迁移来源继续做开发/测试库初始化。

仍禁止：

- 正式数据迁移；
- 连接或写入正式数据库；
- 导入真实账单、数字版权台账或运营确认结果；
- 自动应用运营确认结果；
- 生成或应用正式 `mapping_version`；
- 修改源账单、台账或私有确认包；
- 修改已提交的正式迁移 SQL。

## 7. 后续风险项

- 本地仍存在 stash，包含此前自动刷新或非本轮范围的分析产物；本报告不处理这些 stash。
- 后续若要变更数据库结构，应新增 forward-only 迁移并重新执行隔离库回归。
- 应用开发只能基于空库或合成数据；真实数据导入需要单独的正式数据迁移门禁。
