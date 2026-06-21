# M1 mapping_version v0.2 受控导入准备方案 v0.1

生成时间：2026-06-21T18:12:00+08:00

## 结论

v0.2 已满足进入“受控导入准备流程”的前置条件。该流程只允许做导入前门禁、dry-run 计划、候选导入脚本准备，以及在用户后续明确授权的本地/开发/测试库中做受控准备；不授权正式写库、激活 `mapping_version`、调用 `switch_mapping_version`、导入真实账单或执行正式数据迁移。

本轮未执行 Docker、未执行数据库演练、未连接正式库、未导入真实数据、未修改 `db/migrations/`、未修改原候选包本体、未提交文件。

## 工作区核对摘要

当前工作区存在一批运营线 / mapping_version 未跟踪产物，主要为 `docs/analysis/m1-master-data/` 下的报告与 `experiments/m1-mapping-version-import-candidate/` 下的实验脚本/overlay/stage。未发现 `package.json`、`package-lock.json`、`test/e2e/admin.e2e.test.js` 在当前 `git status` 中有改动。

本轮不删除、不 stash、不提交任何非本轮文件。

## 输入文件

受控导入准备以以下公开/实验产物为输入：

- `docs/analysis/m1-master-data/M1-mapping-version-v0.2-controlled-import-readiness-report-v0.1.md`
- `docs/analysis/m1-master-data/M1-mapping-version-v0.2-controlled-import-readiness-summary-v0.1.json`
- `docs/analysis/m1-master-data/M1-mapping-version-docker-rehearsal-report-v0.2.md`
- `docs/analysis/m1-master-data/M1-mapping-version-docker-rehearsal-summary-v0.2.json`
- `docs/analysis/m1-master-data/M1-G07-mapping-strategy-adjustment-report-v0.1.md`
- `docs/analysis/m1-master-data/M1-G07-mapping-strategy-adjustment-summary-v0.1.json`
- `experiments/m1-mapping-version-import-candidate/G07-mapping-strategy-overlay-v0.2.json`
- `experiments/m1-mapping-version-import-candidate/00_preflight_gate.sql`
- `experiments/m1-mapping-version-import-candidate/01_controlled_import_candidate.sql`
- `experiments/m1-mapping-version-import-candidate/03_rehearsal_assertions_v0.2.sql`

完整 stage 明细 `mapping_import_stage-v0.1.json` 和 `mapping_import_stage-v0.2.json` 本轮仅作为本地核对对象，不建议提交，除非用户后续明确授权。

## v0.2 一致性核对

| 项目 | 结果 |
| --- | --- |
| v0.2 readiness 状态 | `PASS` |
| Docker 复演状态 | `PASS` |
| v0.2 preflight | 通过，无 FAIL |
| G06 | 通过 |
| G07 | 通过 |
| raw_work_id_mapping plan rows | 300 |
| historical_volume_mapping plan rows | 52 |
| audit source record count | 353 |
| G07 三条 ID | 均为 `historical_volume_mapping` |
| G07 raw table identity conflict | 0 |
| G07 raw table unique conflict group | 0 |
| forward-only 物理模型迁移 | 不需要 |
| 自动选择主常规 raw ID | 不需要，且禁止 |

G07 当前归属：

| raw_work_id | 物理计划表 | target_standard_work_id | business_form | 来源任务 | 是否通用规则 |
| --- | --- | --- | --- | --- | --- |
| `161280` | `historical_volume_mapping` | `161260` | `audio_copyright` | `IMPORT-BLOCK::161280` | 否 |
| `161284` | `historical_volume_mapping` | `161260` | `audio_copyright` | `IMPORT-BLOCK::161284` | 否 |
| `161290` | `historical_volume_mapping` | `161260` | `audio_copyright` | `IMPORT-BLOCK::161290` | 否 |

## 前置门禁

进入任何受控导入准备前，必须逐项确认：

1. 目标环境不是正式库，也不是 staging/production 等共享或准生产环境；
2. 用户明确授权目标环境，仅限本地/开发/测试库；
3. 不使用正式库凭据；
4. 不导入真实账单、数字版权台账、运营确认 Excel；
5. 不激活 `mapping_version`，不调用 `switch_mapping_version`；
6. 不执行正式数据迁移；
7. `db/migrations/` 保持只读，不复制、不修改 Flyway 历史迁移；
8. preflight 必须无 FAIL；
9. G06/G07 必须仍通过；
10. 所有写入必须处于可回滚事务或可销毁环境中；
11. 任何失败必须按分类停止并输出报告。

## 环境要求

- PostgreSQL 16.x，本地/开发/测试环境；
- Flyway 可读取 `db/migrations/` 并初始化空库；
- 连接目标必须由用户明确授权；
- 连接串、密码、`.env`、`.pgpass` 不得写入仓库；
- 不得读取 `data/` 作为应用启动输入；
- 临时数据库、临时容器、stdout/stderr 和中间 SQL 必须留在被忽略的本地目录或可销毁环境中。

## 角色要求

- 迁移/初始化角色：仅用于本地/开发/测试库初始化；
- 导入 dry-run 角色：可在事务中写入 mapping 相关表，但必须能回滚；
- 审计角色：记录来源任务、确认依据、执行人和 dry-run 结果；
- 禁止使用正式库管理员或正式应用账号。

## dry-run 执行计划

dry-run 计划只适用于本地/开发/测试库：

1. 确认目标库标识和授权记录；
2. 初始化空库并执行 Flyway `migrate/info/validate/migrate`；
3. 加载 v0.2 overlay/stage 的候选物理计划；
4. 执行 `00_preflight_gate.sql`，要求无 FAIL；
5. 开启单个事务；
6. 执行 `01_controlled_import_candidate.sql`；
7. 验证导入行数：
   - `raw_work_id_mapping = 300`
   - `historical_volume_mapping = 52`
   - audit source record count = 353
8. 执行 `03_rehearsal_assertions_v0.2.sql`，要求：
   - G06 通过；
   - G07 通过；
   - `161280/161284/161290` 不进入 `raw_work_id_mapping`；
   - 三条均进入 `historical_volume_mapping`；
   - 不需要 forward-only 迁移；
9. 最终显式 `ROLLBACK`；
10. 输出门禁报告和 summary；
11. 销毁临时库或临时容器。

## rollback 要求

- 所有 dry-run 写入必须在事务中执行；
- 脚本必须显式 `ROLLBACK`；
- 若脚本异常退出，目标环境必须是可销毁环境，或由外层事务/容器销毁保证无残留；
- 不允许以 dry-run 结果作为已应用版本；
- 不允许将任何候选映射标为 active 或 applied。

## 审计记录要求

每条映射必须保留：

- 来源任务 ID；
- 来源依据；
- 人工确认摘要；
- 是否例外；
- 是否通用规则，G07 本例必须为否；
- 是否可自动应用，必须为否；
- 是否需要最终人工确认。

G06 必须保留 `Y167972` 的 2 条来源审计；G07 必须保留 `IMPORT-BLOCK::161280`、`IMPORT-BLOCK::161284`、`IMPORT-BLOCK::161290`。

## 不允许执行的动作

- 连接正式数据库；
- 写正式数据库；
- 使用正式库凭据；
- 导入真实账单、台账、运营确认 Excel 或运营确认结果；
- 激活 `mapping_version`；
- 调用 `switch_mapping_version`；
- 执行正式数据迁移；
- 修改 `db/migrations/` 或 Flyway 历史迁移；
- 修改原候选 mapping_version 包本体；
- 读取 `data/` 作为应用启动输入；
- 使用 `git add .`；
- 清理、应用或删除 stash；
- 提交私有明细、候选包、Excel、临时数据库文件、连接串或密码。

## 失败分类

| 分类 | 处理 |
| --- | --- |
| 环境问题 | 停止，输出环境阻断码，不继续写入 |
| Flyway 问题 | 停止，输出迁移/校验失败摘要 |
| preflight 问题 | 停止，列出 FAIL 门禁 |
| 导入脚本问题 | 停止，修订实验脚本或 dry-run 计划，不改历史迁移 |
| 数据/模型问题 | 停止，生成用户确认包或策略调整报告 |
| 断言脚本问题 | 停止，仅修订实验断言脚本 |
| 安全边界问题 | 立即停止，不得继续 |

## 成功退出条件

- 目标环境被确认非正式；
- Flyway 全部通过；
- preflight 无 FAIL；
- 受控导入脚本进入事务并显式 ROLLBACK；
- G06/G07 断言通过；
- row counts 与 v0.2 一致；
- 审计来源完整；
- 未激活 mapping_version；
- 未调用 `switch_mapping_version`；
- 未导入真实数据；
- 临时容器/临时库已清理或明确可销毁。

## 可提交文件清单（需用户后续明确授权）

公开报告：

- `docs/analysis/m1-master-data/M1-G07-mapping-strategy-confirmation-pack-v0.1.md`
- `docs/analysis/m1-master-data/M1-G07-mapping-strategy-confirmation-summary-v0.1.json`
- `docs/analysis/m1-master-data/M1-G07-mapping-strategy-adjustment-report-v0.1.md`
- `docs/analysis/m1-master-data/M1-G07-mapping-strategy-adjustment-summary-v0.1.json`
- `docs/analysis/m1-master-data/M1-mapping-version-docker-rehearsal-report-v0.1.md`
- `docs/analysis/m1-master-data/M1-mapping-version-docker-rehearsal-summary-v0.1.json`
- `docs/analysis/m1-master-data/M1-mapping-version-docker-rehearsal-report-v0.2.md`
- `docs/analysis/m1-master-data/M1-mapping-version-docker-rehearsal-summary-v0.2.json`
- `docs/analysis/m1-master-data/M1-mapping-version-v0.2-controlled-import-readiness-report-v0.1.md`
- `docs/analysis/m1-master-data/M1-mapping-version-v0.2-controlled-import-readiness-summary-v0.1.json`
- `docs/analysis/m1-master-data/M1-mapping-version-v0.2-controlled-import-preparation-plan-v0.1.md`
- `docs/analysis/m1-master-data/M1-mapping-version-v0.2-controlled-import-preparation-summary-v0.1.json`

实验脚本/说明：

- `experiments/m1-mapping-version-import-candidate/README.md`
- `experiments/m1-mapping-version-import-candidate/README-v0.2-controlled-import-preparation.md`
- `experiments/m1-mapping-version-import-candidate/00_preflight_gate.sql`
- `experiments/m1-mapping-version-import-candidate/01_controlled_import_candidate.sql`
- `experiments/m1-mapping-version-import-candidate/03_rehearsal_assertions.sql`
- `experiments/m1-mapping-version-import-candidate/03_rehearsal_assertions_v0.2.sql`
- `experiments/m1-mapping-version-import-candidate/G07-mapping-strategy-overlay-v0.2.json`

## 不得提交文件清单

- `experiments/m1-mapping-version-import-candidate/mapping_import_stage-v0.1.json`
- `experiments/m1-mapping-version-import-candidate/mapping_import_stage-v0.2.json`
- `data/m1-master-data-private/**`
- `data/real-bills/**`
- `.codex-work/**`
- `.env`, `.env.local`, `.pgpass`
- 连接串、密码、数据库数据目录；
- 私有 Excel 明细、候选包本体、真实账单、台账；
- 与本轮无关的技术线改动。

## 下一步需要用户授权

下一步若继续，需要用户明确授权：

```text
授权执行“M1 mapping_version v0.2 本地/开发/测试库受控导入 dry-run”
```

授权必须包含目标环境名称、目标库边界、允许的凭据来源和是否允许事务内写入。该授权仍不得覆盖正式库写入、版本激活、`switch_mapping_version`、真实账单导入或正式数据迁移。
