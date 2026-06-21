# M1 Flyway 正式迁移晋升报告 v0.1

生成时间：2026-06-21 14:18 Asia/Shanghai

本报告记录本轮“Git 历史路径脱敏确认与 M1 Flyway 正式迁移晋升”的执行结果。结论：Git 历史中的本地真实数据路径字符串已清除；80 个已验证候选 SQL 已按原样复制到正式 `db/migrations/`；正式目录已在本地隔离 PostgreSQL 16 环境通过 Flyway 执行验证。仍禁止正式数据迁移。

## 1. Git 历史路径脱敏

| 项目 | 结果 |
| --- | --- |
| 是否执行历史重写 | 是 |
| 脱敏前 HEAD | `86aaf177c7b5998fe0242fcac62ea6c038ebded3` |
| 脱敏后 HEAD | `180c166be1538a6c42a10fc1d3712862af731720` |
| 是否强推 | 是，使用 `--force-with-lease` 推送 `main` |
| 远端 `origin/main` 确认 | `180c166be1538a6c42a10fc1d3712862af731720` |
| 备份 bundle | `<repo>/_recovery/git/pre-history-path-redaction-20260621-140412.bundle` |

历史扫描结果：

- `main`、`origin/main` 与本地 refs 中未再发现 `[local-private-data-path-redacted]`。
- 当前工作树中未发现未脱敏的本地真实数据路径字符串。
- 本轮未发现真实账单明细、金额明细、数据库凭据或 API key 被提交。

## 2. 候选 SQL 晋升复制

| 项目 | 结果 |
| --- | --- |
| 候选目录 | `experiments/m1-flyway-candidate/migrations/` |
| 正式目录 | `db/migrations/` |
| 候选 SQL 数量 | 80 |
| 正式 SQL 数量 | 80 |
| 文件名是否完全一致 | 是 |
| SHA-256 是否完全一致 | 是 |
| 候选声明 banner 是否保留 | 是 |
| 是否复制 manifest、日志或配置到正式目录 | 否 |
| 是否修改候选 SQL 内容 | 否 |

正式目录只包含 80 个 SQL 文件；未复制候选目录中的 manifest、验证报告、日志或 Flyway 配置。

## 3. Flyway 正式目录隔离验证

本轮使用正式目录 `db/migrations/` 作为 Flyway locations，在本地隔离 PostgreSQL 16 实例中执行验证。未连接正式数据库，未使用正式凭据，未导入真实账单、数字版权台账或运营确认结果。

| 项目 | 结果 |
| --- | --- |
| Flyway 版本 | Flyway OSS 10.21.0 |
| PostgreSQL 版本 | 16.14 |
| 验证库 | 本地临时隔离库 `m1_flyway_formal_promotion` |
| 时区 | UTC |
| `flyway migrate` | 通过 |
| `flyway info` | 通过 |
| `flyway validate` | 通过 |
| 第二次 `flyway migrate` | 无重复执行 |
| 临时 PostgreSQL 实例 | 验证后已停止 |

对象数量验证：

| 对象 | 数量 |
| --- | ---: |
| M1 tables | 48 |
| Views | 5 |
| Functions | 21 |
| User triggers | 32 |
| Foreign keys | 84 |
| Indexes | 117 |

对象数量与候选验证目标一致。

## 4. Git diff 摘要

本轮预期进入提交范围：

- `db/migrations/`：新增 80 个正式 Flyway SQL 文件；
- `docs/technical-design/M1-Flyway正式迁移晋升报告-v0.1.md`：本报告；
- `experiments/m1-flyway-candidate/reports/formal-promotion-summary.json`：机器可读摘要。

自动刷新产生的分析报告变更未纳入本轮提交，已保存在本地 stash 中，未应用、未删除。

## 5. 结论

允许保留 `db/migrations/` 作为 M1 正式 Flyway 迁移目录。

仍禁止：

- 正式数据迁移；
- 连接正式数据库；
- 导入真实账单、数字版权台账或运营确认结果；
- 生成正式 `mapping_version`；
- 自动应用运营确认结果；
- 修改源账单或台账。

下一步如需继续，应只在正式迁移目录已提交并推送后，执行独立的正式迁移目录回归门禁；不得直接进入真实数据迁移。
