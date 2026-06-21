# M1 应用最小业务模块联调与合成数据 Smoke 报告 v0.1

状态：PASSED
日期：2026-06-21
范围：M1 最小只读业务 API、空库行为、纯合成数据 smoke、错误响应、角色边界。

## 1. 本轮联调范围

本轮基于现有后端骨架执行联调：

- Node.js 24；
- 原生 HTTP 服务；
- ESM JavaScript；
- `pg` PostgreSQL 驱动；
- Node 内置 `node:test`；
- 正式迁移目录：`db/migrations/`。

验证 API：

- `GET /health`
- `GET /health/db`
- `GET /api/system/status`
- `GET /api/works`
- `GET /api/works/:id`
- `GET /api/mapping-versions`
- `GET /api/mapping-versions/:id`
- `GET /api/jobs`
- `GET /api/jobs/:id`

## 2. 空库测试结果

在全新本地隔离 PostgreSQL 16.14 库中，使用 `db/migrations/` 初始化空库后执行：

```text
node tools/dev-smoke/run-api-smoke.mjs --database-empty
```

结果：PASSED。

已验证：

- `GET /api/system/status` 返回 `schema_initialized`；
- `mappingVersionReady=false`；
- `billImportReady=false`；
- `GET /api/works` 返回空列表；
- `GET /api/mapping-versions` 返回空列表；
- `GET /api/jobs` 返回空列表；
- 不存在作品、映射版本和任务均返回统一 404；
- 非法分页参数返回统一 400。

清理合成数据后再次执行空库 smoke，结果仍为 PASSED。

## 3. 合成数据测试结果

新增 smoke 脚本：

- `tools/dev-smoke/seed-synthetic-data.mjs`
- `tools/dev-smoke/run-api-smoke.mjs`
- `tools/dev-smoke/clear-synthetic-data.mjs`
- `tools/dev-smoke/smoke-safety.mjs`

合成数据只包含虚构 ID 和虚构任务标识：

- `990001`
- `990002`
- `SYN-JOB-001`
- `SYN-JOB-002`
- `SYN-MAPPING-VERSION-001`

执行顺序：

```text
node tools/dev-smoke/run-api-smoke.mjs --database-empty
node tools/dev-smoke/seed-synthetic-data.mjs
node tools/dev-smoke/run-api-smoke.mjs --database-synthetic
node tools/dev-smoke/clear-synthetic-data.mjs
node tools/dev-smoke/run-api-smoke.mjs --database-empty
```

结果：PASSED。

已验证：

- `GET /api/works` 返回合成作品列表；
- `GET /api/works/:id` 返回合成作品详情；
- `GET /api/mapping-versions` 返回合成映射版本列表；
- `GET /api/mapping-versions/:id` 返回合成映射版本详情；
- `GET /api/jobs` 返回合成任务列表；
- `GET /api/jobs/:id` 返回合成任务详情；
- 分页参数 `page/pageSize` 正常；
- 非法分页参数返回统一 400；
- 不存在资源返回统一 404。

## 4. 分页与错误响应验证

分页验证：

- 默认分页：`page=1&pageSize=20`；
- 支持显式 `page/pageSize`；
- `page=0` 返回 400；
- `pageSize=101` 返回 400。

统一错误格式：

```json
{
  "error": {
    "code": "not_found",
    "message": "Resource not found",
    "requestId": "..."
  }
}
```

错误响应已验证不输出：

- 数据库连接串；
- 密码；
- SQL 全文；
- 堆栈；
- 主机端口；
- 真实业务数据。

## 5. 角色边界验证

本轮 API 仍保持只读边界：

- 普通作品查询使用 `application_ro`；
- 系统状态、映射版本和任务查询使用 `background_worker`；
- 应用运行不使用 `migration_owner`；
- `migration_owner` 仅用于本地 smoke seed/clear 的受控合成数据准备；
- 未新增业务写接口；
- 未新增真实导入接口；
- 未执行 mapping version 激活。

smoke 脚本安全边界：

- 拒绝非 `localhost` / `127.0.0.1` / `::1` 数据库；
- 拒绝 `staging` / `production` 环境；
- 拒绝 `M1_` 环境变量指向 `data/` 目录；
- 拒绝角色不匹配的数据库 URL。

## 6. 合成数据来源说明

本轮合成数据由 `test/fixtures/` 与 `tools/dev-smoke/` 中的虚构样本构造：

- 未从真实账单复制；
- 未从数字版权台账复制；
- 未从运营确认包复制；
- 未使用真实作品名；
- 未使用真实渠道名；
- 未使用真实作者；
- 未使用真实金额明细；
- 未使用真实版权日期。

## 7. 执行命令与结果

基础验证：

```text
npm run lint
npm run build
npm test
npm run smoke
```

结果：

- `npm run lint`：PASSED；
- `npm run build`：PASSED；
- `npm test`：29 passed / 0 failed；
- `npm run smoke`：fixture 模式 PASSED；
- 本地隔离 PostgreSQL 空库 smoke：PASSED；
- 本地隔离 PostgreSQL 合成数据 smoke：PASSED；
- 合成数据清理后空库复核：PASSED。

本地隔离库：

- PostgreSQL：16.14；
- Flyway：10.21.0 OSS；
- 数据库：本地临时库；
- 来源迁移目录：`db/migrations/`；
- 未连接正式数据库。

## 8. 禁止事项核对

- 是否读取真实数据：否；
- 是否导入真实数据：否；
- 是否连接正式库：否；
- 是否执行正式数据迁移：否；
- 是否修改 `db/migrations/`：否；
- 是否应用运营确认结果：否；
- 是否导入候选或正式 `mapping_version`：否。

## 9. 结论

M1 最小业务 API 已完成空库与纯合成数据 smoke 验证，可以进入下一步：

```text
应用 API 契约整理与最小前端/管理端页面设计
```

下一步仍需继续禁止：

- 正式数据迁移；
- 真实账单导入；
- 数字版权台账导入；
- 运营确认结果自动应用；
- 正式数据库连接。
