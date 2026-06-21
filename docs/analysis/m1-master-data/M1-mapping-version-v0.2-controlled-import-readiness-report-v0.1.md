# M1 mapping_version v0.2 受控导入准备门禁收口报告 v0.1

生成时间：2026-06-21T18:05:19+08:00

## 结论

v0.2 当前状态为 `PASS`。G06/G07 均已通过，`BLOCKED_DATA_OR_MODEL` 可解除，允许进入下一步“受控导入准备”授权环节。

该允许范围仅限准备流程：导入方案、门禁清单、非正式环境受控写入准备、脚本候选和 dry-run 计划。不授权写正式库、不授权激活 `mapping_version`、不授权调用 `switch_mapping_version`、不授权导入真实账单、不授权正式数据迁移。

## v0.2 门禁核对

| 门禁项 | 结果 |
| --- | --- |
| Docker PostgreSQL 16.14 隔离复演 | 通过 |
| Flyway migrate/info/validate/second migrate | 通过 |
| Schema 对象数量 | 符合预期 |
| v0.2 preflight | 通过，无 FAIL |
| 受控导入脚本 | 已进入事务，脚本自身 ROLLBACK |
| 断言脚本 | 通过，显式 ROLLBACK |
| G06 | 通过 |
| G07 | 通过 |
| Docker 临时容器 | 已停止并删除 |
| 正式库连接/写入 | 未发生 |
| mapping_version 激活 | 未发生 |
| 正式数据迁移 | 未发生 |

## G06/G07 通过结论

G06：

- `Y167972` 仍为 2 条有效来源记录；
- 物理映射仍折叠为 1 条数据库映射行；
- 2 条来源记录仍保留为审计来源；
- 个案例外仍未变成通用规则。

G07：

- `161280`、`161284`、`161290` 不再进入 `raw_work_id_mapping`；
- 三条均进入 `historical_volume_mapping`，目标为 `161260/audio_copyright`；
- `RAW_TABLE_IDENTITY_COMPATIBILITY` 通过；
- `RAW_TABLE_UNIQUE_COMPATIBILITY` 通过；
- 不需要 forward-only 物理模型迁移；
- 不需要由规则自动选择主常规 raw ID。

## v0.2 关键计数

| 项目 | 数量 |
| --- | ---: |
| effective mapping snapshot rows | 353 |
| physical plan rows | 352 |
| raw_work_id_mapping plan rows | 300 |
| historical_volume_mapping plan rows | 52 |
| audit source record count | 353 |
| priority-covered preview rows | 41 |

## 文件存在与一致性

| 文件 | 状态 |
| --- | --- |
| `docs/analysis/m1-master-data/M1-G07-mapping-strategy-adjustment-report-v0.1.md` | 存在 |
| `docs/analysis/m1-master-data/M1-G07-mapping-strategy-adjustment-summary-v0.1.json` | 存在，计数与 v0.2 stage 一致 |
| `docs/analysis/m1-master-data/M1-mapping-version-docker-rehearsal-report-v0.2.md` | 存在，已清除 v0.1 G07 残留描述 |
| `docs/analysis/m1-master-data/M1-mapping-version-docker-rehearsal-summary-v0.2.json` | 存在，状态 `PASS` |
| `experiments/m1-mapping-version-import-candidate/mapping_import_stage-v0.2.json` | 存在，派生 stage |
| `experiments/m1-mapping-version-import-candidate/G07-mapping-strategy-overlay-v0.2.json` | 存在，overlay |
| `experiments/m1-mapping-version-import-candidate/03_rehearsal_assertions_v0.2.sql` | 存在，v0.2 断言脚本 |

## 当前工作区分类

### 可公开提交的运营线报告（需用户后续明确授权）

- `docs/analysis/m1-master-data/M1-G07-mapping-strategy-confirmation-pack-v0.1.md`
- `docs/analysis/m1-master-data/M1-G07-mapping-strategy-confirmation-summary-v0.1.json`
- `docs/analysis/m1-master-data/M1-G07-mapping-strategy-adjustment-report-v0.1.md`
- `docs/analysis/m1-master-data/M1-G07-mapping-strategy-adjustment-summary-v0.1.json`
- `docs/analysis/m1-master-data/M1-mapping-version-docker-rehearsal-report-v0.1.md`
- `docs/analysis/m1-master-data/M1-mapping-version-docker-rehearsal-summary-v0.1.json`
- `docs/analysis/m1-master-data/M1-mapping-version-docker-rehearsal-report-v0.2.md`
- `docs/analysis/m1-master-data/M1-mapping-version-docker-rehearsal-summary-v0.2.json`
- `docs/analysis/m1-master-data/M1-formal-mapping-version-candidate-report-v0.1.md`
- `docs/analysis/m1-master-data/M1-formal-mapping-version-candidate-summary-v0.1.json`
- `docs/analysis/m1-master-data/M1-mapping-version-final-confirmation-pack-v0.1.md`
- `docs/analysis/m1-master-data/M1-mapping-version-final-confirmation-summary-v0.1.json`
- `docs/analysis/m1-master-data/M1-mapping-version-controlled-import-preparation-v0.1.md`
- `docs/analysis/m1-master-data/M1-mapping-version-controlled-import-preparation-summary-v0.1.json`
- `docs/analysis/m1-master-data/M1-mapping-version-local-rehearsal-report-v0.1.md`
- `docs/analysis/m1-master-data/M1-mapping-version-local-rehearsal-summary-v0.1.json`
- `docs/analysis/m1-master-data/M1-mapping-version-v0.2-controlled-import-readiness-report-v0.1.md`
- `docs/analysis/m1-master-data/M1-mapping-version-v0.2-controlled-import-readiness-summary-v0.1.json`

### experiments 下可作为公开复现实验脚本/overlay 的文件（需用户后续明确授权）

- `experiments/m1-mapping-version-import-candidate/README.md`
- `experiments/m1-mapping-version-import-candidate/00_preflight_gate.sql`
- `experiments/m1-mapping-version-import-candidate/01_controlled_import_candidate.sql`
- `experiments/m1-mapping-version-import-candidate/03_rehearsal_assertions.sql`
- `experiments/m1-mapping-version-import-candidate/03_rehearsal_assertions_v0.2.sql`
- `experiments/m1-mapping-version-import-candidate/G07-mapping-strategy-overlay-v0.2.json`

### experiments 下建议继续保留但暂不提交的临时/明细产物

- `experiments/m1-mapping-version-import-candidate/mapping_import_stage-v0.1.json`
- `experiments/m1-mapping-version-import-candidate/mapping_import_stage-v0.2.json`

原因：这两个 stage 文件包含完整候选导入明细，体量较大，属于候选包派生明细；除非用户明确授权作为可复现实验输入提交，否则应继续留在本地工作区。

### 不得提交的文件类别

- `data/m1-master-data-private/**` 下的私有候选包、私有明细、XLSX、运营确认包；
- `data/real-bills/**` 下的真实账单；
- 数字版权台账原始文件；
- `.codex-work/**` 下的临时脚本、Docker 输出、临时 env-file、stdout/stderr、临时 SQL；
- `.env`、`.env.local`、`.pgpass`、连接串、密码、数据库数据目录；
- 私有 Excel 明细、候选包本体、临时数据库文件；
- 与本轮 mapping_version 门禁无关的工作区改动，例如当前存在的 `package.json`、`package-lock.json`、`test/e2e/admin.e2e.test.js` 等。

## 仍禁止事项

- 连接正式数据库；
- 写正式数据库；
- 使用正式库凭据；
- 导入真实账单、数字版权台账、运营确认 Excel；
- 导入运营确认结果到正式或非授权库；
- 激活 `mapping_version`；
- 调用 `switch_mapping_version`；
- 执行正式数据迁移；
- 修改 `db/migrations/` 下已提交 SQL 或 Flyway 历史迁移；
- 修改原候选 mapping_version 包本体；
- 修改源账单、台账、私有确认包；
- 使用 `git add .`；
- 清理、应用或删除 stash；
- 提交私有明细、候选包、Excel、临时数据库文件、连接串或密码。

## 下一步授权建议

下一步可以请求用户授权进入“v0.2 受控导入准备流程”。授权范围应限定为：

1. 使用 v0.2 overlay/stage 作为候选导入准备输入；
2. 生成受控导入脚本候选或 dry-run 计划；
3. 只连接用户明确授权的本地/开发/测试数据库；
4. 执行导入前门禁：目标库确认、非正式环境确认、迁移版本确认、preflight 无 FAIL、G06/G07 仍通过、脚本最终 ROLLBACK 或写入范围受控；
5. 仍不得激活版本、不得调用切换函数、不得导入真实账单、不得正式迁移。

## 本轮未执行事项

本轮未执行 Docker 复演，未执行数据库演练，未连接正式库，未导入真实数据，未激活 `mapping_version`，未调用 `switch_mapping_version`，未执行正式数据迁移，未修改 `db/migrations/`，未修改候选包本体，未使用 `git add .`，未触碰 stash。
