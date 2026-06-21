# M1 mapping_version v0.2 运营线公开产物隔离提交门禁报告 v0.1

生成时间：2026-06-21T18:34:00+08:00

## 1. 本轮结论

本轮采用基于 `origin/main` 的干净隔离 worktree 提交运营线 v0.2 公开产物，避免主工作区中的非本轮技术线文件进入提交范围。

隔离 worktree：

- 路径：`D:\porject\system-worktrees\m1-ops-v02-public-submit-20260621-183204`
- 分支：`codex/m1-ops-v02-public-artifacts-20260621-183204`
- 基线：`origin/main`

当前门禁结论：

- v0.2 状态：PASS；
- G06：通过；
- G07：通过；
- raw_work_id_mapping：300；
- historical_volume_mapping：52；
- audit source record count：353；
- 161280 / 161284 / 161290 均为 historical_volume_mapping；
- 未激活 mapping_version；
- 未调用 switch_mapping_version；
- 未连接正式库、staging、production、共享开发库或共享测试库；
- 未导入真实账单、数字版权台账、运营确认 Excel 或运营确认结果；
- 未执行正式数据迁移；
- 未修改 db/migrations/；
- 未修改原候选包本体。

## 2. 主工作区隔离情况

主工作区已执行 `git status --branch --short --untracked-files=all`。

主工作区存在非本轮文件，因此本轮不在主工作区 staging、commit 或 push。非本轮技术线文件保留未处理：

- `docs/technical-design/M1-管理端CI远端运行结果核对报告-v0.1.md`

未纳入本轮提交清单的运营线 / mapping_version 未跟踪产物也保留未处理：

- `docs/analysis/m1-master-data/M1-formal-mapping-version-candidate-report-v0.1.md`
- `docs/analysis/m1-master-data/M1-formal-mapping-version-candidate-summary-v0.1.json`
- `docs/analysis/m1-master-data/M1-mapping-version-controlled-import-preparation-v0.1.md`
- `docs/analysis/m1-master-data/M1-mapping-version-controlled-import-preparation-summary-v0.1.json`
- `docs/analysis/m1-master-data/M1-mapping-version-final-confirmation-pack-v0.1.md`
- `docs/analysis/m1-master-data/M1-mapping-version-final-confirmation-summary-v0.1.json`
- `docs/analysis/m1-master-data/M1-mapping-version-local-rehearsal-report-v0.1.md`
- `docs/analysis/m1-master-data/M1-mapping-version-local-rehearsal-summary-v0.1.json`

## 3. 本轮允许提交的公开运营线报告

本轮仅复制并准备提交以下公开报告和 summary：

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
- `docs/analysis/m1-master-data/M1-mapping-version-v0.2-local-docker-dry-run-report-v0.1.md`
- `docs/analysis/m1-master-data/M1-mapping-version-v0.2-local-docker-dry-run-summary-v0.1.json`
- `docs/analysis/m1-master-data/M1-mapping-version-v0.2-operations-artifact-commit-report-v0.1.md`
- `docs/analysis/m1-master-data/M1-mapping-version-v0.2-operations-artifact-commit-summary-v0.1.json`

## 4. 本轮允许提交的公开实验脚本 / README / overlay

本轮仅复制并准备提交以下公开实验文件：

- `experiments/m1-mapping-version-import-candidate/README.md`
- `experiments/m1-mapping-version-import-candidate/README-v0.2-controlled-import-preparation.md`
- `experiments/m1-mapping-version-import-candidate/00_preflight_gate.sql`
- `experiments/m1-mapping-version-import-candidate/01_controlled_import_candidate.sql`
- `experiments/m1-mapping-version-import-candidate/03_rehearsal_assertions.sql`
- `experiments/m1-mapping-version-import-candidate/03_rehearsal_assertions_v0.2.sql`
- `experiments/m1-mapping-version-import-candidate/G07-mapping-strategy-overlay-v0.2.json`

## 5. 仍不得提交的内容

以下内容仍不得提交：

- 完整候选 stage 明细 v0.1；
- 完整候选 stage 明细 v0.2；
- 私有数据目录；
- 真实账单目录；
- `.codex-work/`；
- 环境变量文件；
- pgpass 文件；
- 连接串、密码、临时数据库文件、数据库数据目录；
- 私有 Excel 明细、候选包本体、真实账单、台账；
- 与本轮无关的技术线文件。

## 6. 安全检查

已对拟提交文件执行敏感扫描。

结果：

- 未发现真实凭据；
- 未发现连接串；
- 未发现私有数据文件；
- 未发现完整 stage 明细文件进入提交清单；
- 未发现数据目录、环境变量文件、pgpass 文件或临时数据库文件进入提交清单；
- 若扫描命中“不得提交清单”中的文字说明，仅作为安全边界说明，不视为敏感泄漏。

本地临时库相关输出中的数据库连接信息已脱敏，仅保留 PostgreSQL 版本、执行结果和断言结论。

## 7. JSON 与结论一致性检查

summary JSON 均可解析。

关键结论一致：

- v0.2 状态：PASS；
- G06：通过；
- G07：通过；
- raw_work_id_mapping：300；
- historical_volume_mapping：52；
- audit source record count：353；
- 161280 / 161284 / 161290 均为 historical_volume_mapping；
- 未激活 mapping_version；
- 未调用 switch_mapping_version；
- 未连接正式库；
- 未执行正式数据迁移。

## 8. 验证结果

隔离 worktree 初始不存在 `node_modules`，已执行 `npm ci`，未修改 `package-lock.json`。

已在隔离 worktree 中执行：

- `npm run check:no-real-data`：PASS；
- `npm run lint`：PASS；
- `npm run build`：PASS；
- `npm test`：PASS，35 tests passed。

本轮不强制执行 `npm run smoke`，因为未修改应用代码、package 文件或测试文件。

## 9. 禁止事项执行情况

本轮未执行：

- Docker；
- 数据库演练；
- 正式库连接；
- staging / production 连接；
- 共享开发库 / 共享测试库连接；
- 真实数据导入；
- mapping_version 激活；
- switch_mapping_version；
- 正式数据迁移；
- db/migrations 修改；
- Flyway 历史迁移修改；
- 原候选包本体修改；
- `git add .`；
- stash 清理、应用、删除或改写。

## 10. 提交前状态

本报告生成时，隔离 worktree 已完成验证，准备进入显式路径 staging、提交和 push 流程。

提交后的 commit hash 和 push 状态将在最终阶段收口报告与执行完成回复中记录。

## 11. 下一步授权口径

v0.2 当前可以进入“开发 / 测试库受控准备”的授权环节，但仍需要用户明确：

1. 目标环境；
2. 凭据来源；
3. 允许动作范围；
4. 是否允许在非正式库执行受控写入准备。

仍不得正式写库、激活 mapping_version 或执行正式数据迁移。
