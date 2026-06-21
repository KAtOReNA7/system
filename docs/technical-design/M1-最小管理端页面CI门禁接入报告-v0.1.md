# M1 最小管理端页面 CI 门禁接入报告 v0.1

状态：IMPLEMENTED AND VERIFIED

日期：2026-06-21

## 1. 接入目标

本轮将 M1 最小只读管理端页面的本地验证命令接入 GitHub Actions CI 门禁。

CI 覆盖：

- `npm run lint`
- `npm run build`
- `npm test`
- `npm run smoke`
- `npm run check:no-real-data`
- `npm run test:e2e`

## 2. 现有 CI 基线

本轮检查到现有工作流：

```text
.github/workflows/ci.yml
```

已有能力：

- 使用 `actions/checkout@v4`；
- 使用 `actions/setup-node@v4`；
- Node.js 版本为 24；
- 使用 `npm ci`；
- 已执行 `check:no-real-data`、`lint`、`build`、`test`、`smoke`。

## 3. 本轮增量修订

本轮只做最小增量：

- 明确 CI 环境：
  - `M1_APP_ENV=ci`
  - `M1_DATABASE_URL=""`
  - `M1_DATABASE_READONLY_URL=""`
  - `M1_DATABASE_BACKGROUND_URL=""`
- 增加 Playwright Chromium 安装步骤：

```text
npx playwright install chromium
```

- 增加管理端浏览器 E2E 步骤：

```text
npm run test:e2e
```

## 4. 安全边界

CI 不配置正式数据库 URL。

CI 不应执行：

- 正式数据库连接；
- 正式数据库写入；
- 真实账单读取或导入；
- 数字版权台账导入；
- 运营确认 Excel 或运营确认结果导入；
- `mapping_version` 激活；
- `switch_mapping_version` 调用；
- 正式数据迁移；
- `db/migrations/` 修改。

本轮未增加缓存真实数据、数据库文件、`.env`、`.pgpass`、`.codex-work` 或 `data/` 的逻辑。当前仅复用 `actions/setup-node` 的 npm 缓存。

## 5. E2E 在 CI 中的行为

`npm run test:e2e` 使用：

- Node 内置 `node:test`；
- Playwright Chromium；
- 测试进程内临时 HTTP 服务；
- 无数据库配置 degraded 态；
- 前端内存合成 fixture。

测试不读取 `data/`，不导入真实数据，不连接正式库。

## 6. 本地验证

本轮本地执行：

```text
npm run lint
npm run build
npm test
npm run smoke
npm run check:no-real-data
npm run test:e2e
```

最终结果以本轮完成报告为准。

## 7. 仍禁止事项

即使 CI 接入完成，仍继续禁止：

- 正式数据迁移；
- 真实数据导入；
- 运营确认结果自动应用；
- mapping 激活；
- 正式库连接；
- 新增写接口或写操作 UI。
