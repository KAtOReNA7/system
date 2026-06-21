# M1 Git仓库修复与Flyway晋升前门禁报告 v0.1

## 1. 结论

- Git 元数据修复：成功。
- 当前仓库根目录：`D:/porject/system`。
- 当前远端：

```text
origin	https://github.com/KAtOReNA7/system (fetch)
origin	https://github.com/KAtOReNA7/system (push)
```

- 当前分支：`main`。
- 工作区是否干净：False。
- Flyway 晋升前门禁是否通过：False。
- 是否允许下一轮复制完全相同候选 SQL 到 `db/migrations/`：False。
- 是否仍禁止正式数据迁移：True。

## 2. 损坏 `.git` 的原始状态

- 原始路径：`D:\porject\system\.git`
- 原始类型：directory
- 原始内容：空目录
- 缺失关键条目：`HEAD`、`objects`、`refs`、`config`
- 修复前现象：`git rev-parse --show-toplevel` 与 `git status` 均失败，报错 `not a git repository`。

## 3. 损坏 `.git` 备份路径

`D:\porject\system\_recovery\git\.git.broken-20260621-132006`

说明：损坏 `.git` 未删除，仅移动备份。

## 4. 临时克隆

- 临时克隆路径：`D:\porject\system_git_recovery_tmp`
- 远端仓库 URL：`https://github.com/KAtOReNA7/system`
- 临时克隆验证：成功。
- 临时克隆状态：已删除。
- 重要发现：远端仓库返回空仓库警告，当前本地项目文件在恢复后全部表现为未跟踪文件。

## 5. 恢复后的 Git 命令输出

### `git rev-parse --show-toplevel`

```text
D:/porject/system
```

### `git branch --show-current`

```text
main
```

### `git status --branch --short`

```text
## No commits yet on main...origin/main [gone]
?? .codex-work/
?? .gitignore
?? CHANGELOG.md
?? NEXT-CODEX-INSTRUCTION.md
?? README.md
?? docs/
?? experiments/
?? tools/
```

### `git status --short` 摘要

```text
?? .codex-work/
?? .gitignore
?? CHANGELOG.md
?? NEXT-CODEX-INSTRUCTION.md
?? README.md
?? docs/
?? experiments/
?? tools/
```

工作区条目数：8。

- `?? .codex-work/`
- `?? .gitignore`
- `?? CHANGELOG.md`
- `?? NEXT-CODEX-INSTRUCTION.md`
- `?? README.md`
- `?? docs/`
- `?? experiments/`
- `?? tools/`

## 6. Flyway 候选晋升前门禁检查

| 检查项 | 结果 |
|---|---:|
| 候选 SQL 恰好 80 个 | True |
| 文件名格式全部有效 | True |
| 候选声明 banner 全部存在 | True |
| manifest 存在且记录 80 个文件 | True |
| SHA-256 与 manifest 完全一致 | True |
| 无额外非 SQL/临时/bak/patch 文件 | True |
| 候选目录无真实数据/密码/URL/主机端口/本地绝对路径 | True |
| 正式 `db/migrations/` 不存在或为空 | True |
| 文档一致性通过 | True |
| Git 工作区干净 | False |

## 7. 阻断原因

- Git worktree is not clean; repository recovered from empty remote, current project files are untracked

本轮阻断不是候选 SQL 或 Flyway 验证失败，而是 Git 工作区状态不可作为晋升前干净基线：远端仓库为空，恢复 `.git` 后当前项目文件全部未跟踪。

## 8. 是否需要重跑 Flyway 验证

- 当前是否需要重跑：False。
- 原因：候选 SQL 与 manifest hash 一致，未发现候选 SQL 变化。
- 但若后续任何候选 SQL 内容发生变化，必须重新执行完整 Flyway 验证和 157 项回归。

## 9. 复制操作步骤

当前不允许执行复制，因为 Git 工作区不干净。阻断解除后，下一轮复制仍应仅复制已验证候选 SQL，建议步骤为：

1. 再次执行 Git 和候选完整性门禁。
2. 确认 `db/migrations/` 不存在或为空。
3. 创建 `db/migrations/`。
4. 将 `experiments/m1-flyway-candidate/migrations/*.sql` 原样复制到 `db/migrations/`。
5. 复制后逐个计算 SHA-256，必须与 `candidate-generation-manifest.json` 完全一致。
6. 在全新隔离 PostgreSQL 16 库中执行 `flyway migrate`、`flyway info`、`flyway validate`。
7. 不得导入真实数据，不得生成正式 migration history 以外的任何生产状态。

## 10. 仍禁止事项

- 禁止复制候选 SQL 到正式 `db/migrations/`，直到 Git 工作区门禁通过。
- 禁止连接正式数据库。
- 禁止导入真实账单、数字版权台账或运营确认结果。
- 禁止生成正式 migration history。
- 禁止执行正式数据迁移。
- 禁止提交、推送、reset、clean 或覆盖当前工作区文件。
