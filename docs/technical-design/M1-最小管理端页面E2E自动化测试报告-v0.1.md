# M1 最小管理端页面 E2E 自动化测试报告 v0.1

状态：IMPLEMENTED AND VERIFIED

日期：2026-06-21

## 1. 测试目标

本轮为 M1 最小只读管理端页面增加最小浏览器 E2E 自动化测试。

覆盖页面：

- `/admin` 默认无数据库配置 degraded 态；
- `/admin?fixture=1#system`；
- `/admin?fixture=1#works`；
- `/admin?fixture=1#mapping`；
- `/admin?fixture=1#jobs`；
- 390px 移动端视口下的表格横向滚动行为。

## 2. 测试方案

采用 Node 内置 `node:test` + Playwright。

选择理由：

- 当前项目已经使用 Node 内置测试，不需要引入第二套测试框架；
- Playwright 提供真实 Chromium 浏览器能力，适合验证实际 DOM、视口、布局和前端路由；
- 可直接在 CI 中运行，维护成本低；
- 测试服务由 `createApp()` 在测试进程内启动，避免依赖外部手动服务。

新增 npm script：

```text
npm run test:e2e
```

首次在新机器运行时，如果 Playwright 浏览器未安装，需要执行：

```text
npx playwright install chromium
```

## 3. 数据和环境边界

E2E 测试使用：

- 本地临时 HTTP 服务；
- 无数据库配置 degraded 态；
- 前端内存合成 fixture；
- Chromium headless 浏览器。

E2E 测试不使用：

- 正式数据库；
- 真实账单；
- 数字版权台账；
- 运营确认 Excel 或运营确认结果；
- 真实 mapping version；
- 正式数据迁移。

## 4. 覆盖项

### 4.1 默认 degraded 态

断言：

- `/admin` 可打开；
- 显示 `降级 / degraded`；
- 显示“数据库未配置”；
- 生命周期状态显示“暂不可读取”；
- 保留技术码 `database_not_configured`；
- 明确提示未配置数据库不等同于空库；
- 不暴露连接串、密码、SQL、堆栈、主机端口或真实业务数据；
- 不存在写操作入口。

### 4.2 fixture 四页 success 态

断言：

- system 页显示“结构已初始化”和 `schema_initialized`；
- works 页显示 `SYN-WORK-001`；
- mapping 页显示“构建中”和 `building`；
- jobs 页显示“等待中”和 `pending`；
- 页面状态为 `正常 / success`；
- 不存在写操作入口。

### 4.3 390px 移动端

断言：

- 页面本体无页面级横向溢出；
- 表格容器允许横向滚动；
- 作品、映射版本和后台任务页面均显示“小屏幕下可横向滚动查看完整列”提示。

### 4.4 写操作入口缺失

断言主要操作入口不包含：

- 导入；
- 激活；
- 撤销；
- 重试；
- 取消；
- 上传；
- 应用；
- 迁移；
- 写入；
- 提交。

“刷新当前页”属于只读刷新操作，允许保留。

## 5. 输出文件

新增：

- `test/e2e/admin.e2e.test.js`

更新：

- `package.json`
- `package-lock.json`
- `README.md`

## 6. 验证命令

本轮要求执行：

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

即使 E2E 通过，仍禁止：

- 连接正式数据库；
- 读取或导入真实数据；
- 新增写接口；
- 新增导入、激活、撤销、重试、取消 UI；
- 修改 `db/migrations/`；
- 执行正式数据迁移；
- 自动应用运营确认结果。
