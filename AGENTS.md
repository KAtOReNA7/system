# Codex 工作规则

项目路径：`D:\porject\system`

## 当前模式

项目从 2026-06-22 起进入 **authorized local real-data development mode**。

本地开发允许：

- 读取用户提供的本地真实数据，包括 `data/**`。
- 使用本地开发数据库和本地 Docker/PostgreSQL。
- 为本地开发新增或修改 `db/migrations/`。
- 在本地执行 migration、导入、严格对账、回测和算法校准。

本地真实数据开发结果不自动等于正式发布审批结果。

## 禁止事项

- 禁止连接远端生产、共享、staging-like 或未明确授权的数据库。
- 禁止提交原始账单、台账、私有 Excel/CSV、候选包、临时数据库文件、数据库 dump 或敏感明细。
- 禁止打印或提交 `.env`、`.pgpass`、密钥、连接串密码。
- 禁止 `git add .`。
- 禁止触碰 stash，包含清理、应用、删除或改写 stash。

## 提交规则

- 所有提交必须显式路径，禁止使用隐式批量添加。
- 技术线与运营线产物不得混提交。
- 工作区有非本轮文件时，必须报告；提交前必须确认范围，不能混入无关文件。

## 验证规则

修改代码后必须运行：

```bash
npm run check:no-real-data
npm run lint
npm run build
npm test
npm run smoke
```

如只改文档，也至少运行：

```bash
npm run check:no-real-data
npm run lint
npm run build
npm test
```

任何失败不得伪造通过，必须如实报告失败命令、失败原因和未验证项。
