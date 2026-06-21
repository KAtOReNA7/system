# Codex 工作规则

项目路径：`D:\porject\system`

## 禁止事项

- 禁止连接正式库。
- 禁止导入真实数据。
- 禁止修改 `db/migrations/`。
- 禁止 `git add .`。
- 禁止触碰 stash，包含清理、应用、删除或改写 stash。
- 禁止提交 `.env`、`.pgpass`、真实账单、台账、私有 Excel、候选包、临时数据库文件。

## 提交规则

- 所有提交必须显式路径，禁止使用隐式批量添加。
- 技术线与运营线产物不得混提交。
- 工作区有非本轮文件时，必须报告并停止提交。

## 验证规则

修改代码后必须运行：

```bash
npm run lint
npm run build
npm test
npm run smoke
```

如只改文档，也至少运行：

```bash
npm run lint
npm run build
npm test
```

任何失败不得伪造通过，必须如实报告失败命令、失败原因和未验证项。
