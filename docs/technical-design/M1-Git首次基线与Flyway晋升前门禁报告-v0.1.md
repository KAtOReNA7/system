# M1 Git首次基线与Flyway晋升前门禁报告 v0.1

生成时间：2026-06-21 13:52:00 +08:00

## 1. 首次基线建立前的Git状态

- 仓库根目录：`D:/porject/system`
- 远端仓库：`https://github.com/KAtOReNA7/system`
- 当前分支：`main`
- 基线建立前状态：远端仓库为空或无有效 `main` 提交，本地项目文件均为未跟踪文件。
- 本轮未执行 `git reset --hard`、`git clean -fd`、强推、拉取覆盖、变基或合并。

## 2. `.gitignore`修订摘要

本轮重写并扩展根目录 `.gitignore`，确保以下内容不进入Git：

- `data/` 及所有真实账单、数字版权台账、私有确认包目录；
- `*.xlsx`、`*.xls`、`*.csv`；
- `.codex-work/`、`.agents/`、`.analysis-python/`、`.analysis-node-workspace/`；
- `_recovery/`、`.git.broken-*`、`system_git_recovery_tmp/`；
- `node_modules/`、`__pycache__/`、`*.pyc`；
- 本地数据库、密钥、证书、环境变量文件；
- 实验报告中的本地执行日志 `experiments/**/reports/*.log`。

同时通过反忽略规则保留可审查项目资产：

- `docs/`
- `tools/`
- `experiments/m1-flyway-candidate/`
- `experiments/m1-postgresql16-prototype/`
- `README.md`
- `CHANGELOG.md`
- `NEXT-CODEX-INSTRUCTION.md`

## 3. 被排除的私有与临时目录

已确认不进入提交范围：

- `data/`
- `_recovery/`
- `.codex-work/`
- `.analysis-python/`
- `.analysis-node-workspace/`
- `.agents/`
- `tools/**/node_modules/`
- `tools/**/__pycache__/`
- `experiments/**/__pycache__/`
- `experiments/**/reports/*.log`

## 4. 实际提交文件范围

首次基线提交范围为：

- `.gitignore`
- `README.md`
- `CHANGELOG.md`
- `NEXT-CODEX-INSTRUCTION.md`
- `docs/`
- `tools/`
- `experiments/`

首次提交共纳入 273 个文件，主要包括 PRD、技术设计、公开聚合分析报告、分析脚本、非正式原型、Flyway候选SQL和验证摘要。

未纳入：

- 原始真实账单；
- 数字版权台账原始文件；
- Excel运营确认包；
- 私有作品级样本；
- 本地恢复目录；
- 本地依赖目录和执行日志。

## 5. 敏感信息扫描结果

提交前后执行了 staged/HEAD 范围扫描，重点检查：

- 真实账单明细；
- 真实作品级收入明细；
- 运营确认Excel；
- 数字版权台账原始文件；
- 数据库密码；
- API key；
- 本地绝对数据库连接串；
- `.git.broken` 备份；
- Codex临时目录；
- 个人本地路径。

处理结果：

- 未发现真实账单明细、Excel确认包、台账原始文件、数据库密码、API key、私钥或正式数据库连接串进入当前HEAD。
- 已脱敏公开报告中的本地私有文件路径。
- 首次基线提交 `bcdb4af` 曾包含 1 个本地真实账单路径字符串；未包含账单明细、金额明细或凭据。由于本轮禁止改历史和强推，已通过前向提交 `dd23819` 将当前HEAD脱敏。若必须从远端历史中彻底移除该路径字符串，需要用户另行授权历史重写和强推。

## 6. Commit与推送结果

- 首次基线提交：`bcdb4af chore: establish M1 project baseline`
- 前向脱敏修正提交：`dd23819 chore: redact local private data path`
- 推送结果：已推送到 `origin/main`
- 当前本地分支：`main`
- 当前远端追踪：`main...origin/main`
- 当前HEAD：`dd23819`

本轮未创建PR、未打tag、未生成正式迁移历史。

## 7. 本地stash说明

为避免把未审查的自动刷新分析报告差异混入Git，本轮保存了以下本地stash：

1. `preserve local master-data report refresh before promotion gate`
2. `preserve local real-bills report changes before promotion gate`
3. `preserve untracked analysis note before baseline redaction`
4. `preserve local generated analysis changes before baseline redaction`

这些stash未推送、未应用，保留在本地供后续用户决定是否恢复审查。

## 8. Flyway晋升前门禁结果

门禁结论：通过。

检查结果：

- Git仓库根目录正常：`D:/porject/system`
- 当前工作区干净：是
- 候选SQL数量：80
- 文件名格式：全部符合 `V{layer4}_{seq3}__description.sql`
- 候选声明banner：全部存在
- manifest SHA-256：全部匹配
- 候选目录额外SQL/临时文件：无
- 候选SQL中真实业务数据、密码、私钥、本地实际JDBC URL：未发现
- 正式目录 `db/migrations/`：不存在
- 文档一致性：通过；验证报告记录 Flyway 10.21.0 OSS、PostgreSQL 16.14、80个候选SQL；A/B schema hash与permission hash一致；独立审查未发现未解决HIGH风险；正式数据迁移仍被禁止。

## 9. 是否允许下一轮复制候选SQL

允许下一轮执行“复制完全相同候选SQL到正式 `db/migrations/`”。

前提：

- 必须复制当前HEAD `dd23819` 中 `experiments/m1-flyway-candidate/migrations/` 下的完全相同80个SQL文件；
- 不得修改候选SQL内容；
- 复制后必须重新执行文件数量、SHA-256、Flyway validate和门禁检查；
- 复制动作仍不代表允许正式数据迁移。

## 10. 仍禁止的事项

- 禁止导入真实账单、数字版权台账或运营确认结果；
- 禁止连接正式数据库；
- 禁止生成或应用正式数据迁移；
- 禁止自动应用运营确认结果；
- 禁止修改源账单；
- 禁止在未经用户授权的情况下重写Git历史或强推。
