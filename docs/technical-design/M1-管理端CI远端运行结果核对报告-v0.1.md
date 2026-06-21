# M1 管理端 CI 远端运行结果核对报告 v0.1

状态：CONFIRMED SUCCESS

日期：2026-06-21

## 1. 核对对象

本轮核对指定 GitHub Actions run：

```text
27901183952
```

目标提交 SHA：

```text
35e49c67a205d26fd3cf589d7c349e2c6626ebfc
```

该提交对应技术线变更：

```text
ci: add M1 admin E2E gate
```

## 2. 本地与远端 Git 状态

本轮在主工作区执行：

```text
git status --branch --short --untracked-files=all
git rev-parse HEAD
git ls-remote origin refs/heads/main
git merge-base --is-ancestor 35e49c67a205d26fd3cf589d7c349e2c6626ebfc origin/main
```

核对结果：

- 主工作区本地 `HEAD`：`35e49c67a205d26fd3cf589d7c349e2c6626ebfc`
- `origin/main`：`886b7c4d223db4b643cee97a5ebfed47c4d365f6`
- 本地 `main` 落后 `origin/main` 2 个提交
- 目标提交 `35e49c67a205d26fd3cf589d7c349e2c6626ebfc` 仍包含在 `origin/main` 历史中

由于主工作区存在非本轮运营线 / mapping_version 未跟踪产物，且远端新增文件与部分未跟踪产物同路径，本轮未在主工作区执行 `pull`，也未删除、stash 或提交这些非本轮文件。

为避免覆盖主工作区未跟踪产物，本轮使用临时 worktree 基于最新 `origin/main` 生成并提交报告。

## 3. GitHub Actions run 核对

本轮 `gh` CLI 在当前环境不可用，因此使用 GitHub API 读取 run 信息。API 调用使用本机 GitHub 凭据，但未打印、写入或提交任何 token。

远端 run 信息：

| 字段 | 值 |
| --- | --- |
| run id | `27901183952` |
| workflow name | `CI` |
| display title | `ci: add M1 admin E2E gate` |
| branch | `main` |
| headSha | `35e49c67a205d26fd3cf589d7c349e2c6626ebfc` |
| event | `push` |
| status | `completed` |
| conclusion | `success` |
| createdAt | `2026-06-21T10:16:23Z` |
| updatedAt | `2026-06-21T10:16:57Z` |
| URL | `https://github.com/KAtOReNA7/system/actions/runs/27901183952` |

关键核对：

```text
run.headSha == 35e49c67a205d26fd3cf589d7c349e2c6626ebfc
```

结果：匹配。

## 4. Job 与 step 核对

Job：

| job id | name | status | conclusion | startedAt | completedAt |
| --- | --- | --- | --- | --- | --- |
| `82561660990` | `verify` | `completed` | `success` | `2026-06-21T10:16:25Z` | `2026-06-21T10:16:56Z` |

Job URL：

```text
https://github.com/KAtOReNA7/system/actions/runs/27901183952/job/82561660990
```

Steps：

| # | step | status | conclusion |
| --- | --- | --- | --- |
| 1 | Set up job | completed | success |
| 2 | Checkout | completed | success |
| 3 | Setup Node.js | completed | success |
| 4 | Install dependencies | completed | success |
| 5 | Install Playwright Chromium | completed | success |
| 6 | Check for real data and secrets | completed | success |
| 7 | Lint | completed | success |
| 8 | Build | completed | success |
| 9 | Test | completed | success |
| 10 | Smoke | completed | success |
| 11 | Admin E2E | completed | success |
| 21 | Post Setup Node.js | completed | success |
| 22 | Post Checkout | completed | success |
| 23 | Complete job | completed | success |

失败 job：无。

失败 step：无。

## 5. 是否需要修复

远端 CI run 已完成且结论为 `success`。

因此本轮不需要修复：

- 未修改 CI；
- 未使用 `npx playwright install --with-deps chromium`；
- 未修改 E2E 测试逻辑；
- 未修改 `package.json`；
- 未修改 `package-lock.json`；
- 未修改应用代码；
- 未修改 `db/migrations/`。

## 6. 本地验证

本轮仅更新报告，未修改代码或 CI。按要求至少执行：

```text
npm run check:no-real-data
```

结果：通过。

此前完整本地验证已通过：

```text
npm run lint
npm run build
npm test
npm run smoke
npm run check:no-real-data
npm run test:e2e
```

## 7. 结论

GitHub Actions run `27901183952` 是目标提交 `35e49c67a205d26fd3cf589d7c349e2c6626ebfc` 对应的远端 CI run。

该 run：

- headSha 匹配目标提交；
- workflow 为 `CI`；
- branch 为 `main`；
- 状态为 `completed`；
- 结论为 `success`；
- `verify` job 通过；
- `check:no-real-data`、`lint`、`build`、`test`、`smoke`、`test:e2e` 全部通过；
- 无失败 job 或失败 step。

因此，M1 管理端 CI 门禁的远端证据已核对通过。

## 8. 安全边界

本轮未执行：

- 正式数据库连接；
- 正式数据库写入；
- 正式库凭据提交；
- 真实账单读取或导入；
- 数字版权台账导入；
- 运营确认 Excel 或运营确认结果导入；
- 新增写接口；
- 新增导入、激活、撤销、重试、取消 UI；
- `mapping_version` 激活；
- `switch_mapping_version` 调用；
- 正式数据迁移；
- `db/migrations/` 修改；
- Flyway 历史迁移修改；
- `data/` 作为应用启动输入；
- stash 清理、应用或删除；
- `git add .`。
