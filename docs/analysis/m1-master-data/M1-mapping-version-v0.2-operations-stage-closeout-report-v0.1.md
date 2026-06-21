# M1 mapping_version v0.2 运营线阶段收口报告 v0.1

生成时间：2026-06-21T18:48:00+08:00

## 1. 阶段状态

M1 mapping_version v0.2 运营线公开产物已通过干净隔离 worktree 提交并推送到 `origin/main`。

公开产物提交：

- commit hash：`36e92f37547c627623dfe7cbd7a10774572e0ad9`
- commit message：`docs: add M1 mapping version v0.2 dry-run artifacts`
- push 目标：`origin/main`
- push 状态：成功

隔离 worktree：

- 路径：`D:\porject\system-worktrees\m1-ops-v02-public-submit-20260621-183204`
- 分支：`codex/m1-ops-v02-public-artifacts-20260621-183204`
- 基线：`origin/main`

主工作区未直接提交。主工作区中的非本轮文件保留未处理。

## 2. 已提交公开运营线报告

以下公开报告和 summary 已进入公开产物提交：

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

本阶段收口报告和 summary 用于记录提交完成后的最终状态。

## 3. 已提交公开实验脚本 / README / overlay

以下公开实验文件已进入公开产物提交：

- `experiments/m1-mapping-version-import-candidate/README.md`
- `experiments/m1-mapping-version-import-candidate/README-v0.2-controlled-import-preparation.md`
- `experiments/m1-mapping-version-import-candidate/00_preflight_gate.sql`
- `experiments/m1-mapping-version-import-candidate/01_controlled_import_candidate.sql`
- `experiments/m1-mapping-version-import-candidate/03_rehearsal_assertions.sql`
- `experiments/m1-mapping-version-import-candidate/03_rehearsal_assertions_v0.2.sql`
- `experiments/m1-mapping-version-import-candidate/G07-mapping-strategy-overlay-v0.2.json`

## 4. 未提交内容

以下内容未提交：

- 完整候选 stage 明细 v0.1；
- 完整候选 stage 明细 v0.2；
- 私有数据目录；
- 真实账单目录；
- `.codex-work/`；
- 环境变量文件；
- pgpass 文件；
- 连接串、密码、临时数据库文件、数据库数据目录；
- 私有 Excel 明细、候选包本体、真实账单、台账；
- 非本轮技术线文件：`docs/technical-design/M1-管理端CI远端运行结果核对报告-v0.1.md`；
- 未纳入本轮允许提交清单的其他运营线 / mapping_version 未跟踪产物。

## 5. 验证结果

隔离 worktree 中已执行：

- `npm ci`：PASS；
- `npm run check:no-real-data`：PASS；
- `npm run lint`：PASS；
- `npm run build`：PASS；
- `npm test`：PASS，35 tests passed。

未执行 `npm run smoke`。原因：本轮未修改应用代码、package 文件或测试文件。

## 6. v0.2 关键结论

- v0.2 状态：PASS；
- G06：通过；
- G07：通过；
- raw_work_id_mapping：300；
- historical_volume_mapping：52；
- audit source record count：353；
- 161280 / 161284 / 161290 均进入 historical_volume_mapping；
- 未激活 mapping_version；
- 未调用 switch_mapping_version；
- 未连接正式库；
- 未连接 staging 或 production；
- 未连接共享开发库或共享测试库；
- 未导入真实数据；
- 未执行正式数据迁移。

## 7. 安全边界

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

## 8. 下一步授权口径

下一步可以进入“开发 / 测试库受控准备”的用户授权环节。

进入下一步前，用户需要明确：

1. 目标环境名称；
2. 凭据来源；
3. 允许动作范围；
4. 是否允许在非正式库执行受控写入准备；
5. 回滚、审计和失败退出要求。

仍禁止正式写库、激活 mapping_version、调用 switch_mapping_version、导入真实账单或执行正式数据迁移。
