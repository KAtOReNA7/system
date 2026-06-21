# M1 Flyway 候选验证报告 v0.1

## 结论

候选迁移在两个全新本地隔离 PostgreSQL 16 数据库中通过验证。

- Flyway：10.21.0 OSS
- PostgreSQL：16.14
- 候选 SQL：80 个
- 原型76项回归：76/76 通过
- 候选扩展验证：157/157 通过
- A/B schema hash 一致：True
- A/B 权限 hash 一致：True
- `db/migrations/`：未创建

## Flyway 行为

- `migrate`：A/B 空库均成功。
- `info`：成功，当前版本 `0060.290`。
- `validate`：成功。
- 第二次 `migrate`：无重复执行。
- 临时篡改已执行迁移副本后 `validate`：按预期失败。
- 恢复原始候选位置后 `validate`：成功。
- 未使用 baseline 绕过首版迁移，未使用 repair 掩盖 checksum 错误。
- 配置默认 `cleanDisabled=true`。
- 运行时显式传入 `flyway.locations`；配置模板不固定本地绝对路径。

## 测试分类

| 分类 | 通过 | 失败 | 合计 |
|---|---:|---:|---:|
| ab_compare | 3 | 0 | 3 |
| boundary | 2 | 0 | 2 |
| concurrency | 6 | 0 | 6 |
| ddl | 8 | 0 | 8 |
| flyway | 6 | 0 | 6 |
| invariants | 42 | 0 | 42 |
| lifecycle | 44 | 0 | 44 |
| performance | 14 | 0 | 14 |
| permissions | 20 | 0 | 20 |
| permissions_true_connection | 9 | 0 | 9 |
| timezone | 3 | 0 | 3 |

## 对象数量

| 对象 | 数量 |
|---|---:|
| M1 tables | 48 |
| Flyway history tables | 1 |
| Views | 5 |
| Functions | 21 |
| User triggers | 32 |
| Foreign keys | 84 |
| Indexes | 117 |

## 性能回归对比

| 指标 | 原型 | 候选 | 变化率 |
|---|---:|---:|---:|
| synthetic master identities | 0.163143 | 0.155503 | -4.68% |
| staging write 192899 rows | 2.298194 | 2.224417 | -3.21% |
| fact write 192899 rows | 5.847957 | 5.257038 | -10.1% |
| candidate mapping identities | 0.402031 | 0.406685 | 1.16% |
| full projection build 192899 rows | 17.418693 | 17.890022 | 2.71% |
| first positive metrics build | 0.513426 | 0.545139 | 6.18% |
| strict reconciliation preparation | 0.298632 | 0.312732 | 4.72% |
| mapping and batch atomic switch | 0.478247 | 0.516534 | 8.01% |
| aggregate by month work channel form | 0.544637 | 0.574722 | 5.52% |
| database_size_bytes | 192879639 | 193010711 | 0.07% |
| index_size_bytes | 80084992 | 80117760 | 0.04% |
| row_count | 192899 | 192899 | 0.0% |

性能未设置硬阈值。本轮未观察到由迁移拆分导致的明显退化；候选与原型在同一数量级。

## 日志与机器结果

- `experiments/m1-flyway-candidate/reports/validation-results.json`
- `experiments/m1-flyway-candidate/reports/flyway-a-migrate.log`
- `experiments/m1-flyway-candidate/reports/flyway-a-info.log`
- `experiments/m1-flyway-candidate/reports/flyway-a-validate.log`
- `experiments/m1-flyway-candidate/reports/flyway-a-validate-tamper-expected-failure.log`
- `experiments/m1-flyway-candidate/reports/flyway-b-info.log`
