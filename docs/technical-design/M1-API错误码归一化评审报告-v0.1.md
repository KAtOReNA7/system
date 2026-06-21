# M1 API 错误码归一化评审报告 v0.1

状态：COMPLETED

日期：2026-06-21

## 1. 本轮范围

本轮执行 API 契约评审与错误码归一化小修订，范围限定为：

- `/health/db` degraded 响应；
- 业务 API 统一 `error` 包装；
- `database_not_configured` 与 `database_unavailable` 边界；
- `bad_request` / `not_found` / `internal_error` 实际返回；
- `x-request-id` 与 `cache-control` 响应头；
- 分页参数错误；
- 详情 ID 非法或不存在。

本轮未做：

- UI 实现；
- 新增写接口；
- 正式数据库连接；
- 真实数据读取或导入；
- `db/migrations/` 修改；
- Flyway 历史迁移修改；
- stash 清理、应用或删除。

## 2. 工作区状态

本轮开始执行：

```text
git status --branch --short
```

结果显示当前分支为 `main...origin/main`，并存在非本轮未跟踪运营线 / mapping_version 产物：

- `docs/analysis/m1-master-data/M1-formal-mapping-version-candidate-report-v0.1.md`
- `docs/analysis/m1-master-data/M1-formal-mapping-version-candidate-summary-v0.1.json`
- `docs/analysis/m1-master-data/M1-mapping-version-controlled-import-preparation-summary-v0.1.json`
- `docs/analysis/m1-master-data/M1-mapping-version-controlled-import-preparation-v0.1.md`
- `docs/analysis/m1-master-data/M1-mapping-version-final-confirmation-pack-v0.1.md`
- `docs/analysis/m1-master-data/M1-mapping-version-final-confirmation-summary-v0.1.json`
- `docs/analysis/m1-master-data/M1-mapping-version-local-rehearsal-report-v0.1.md`
- `docs/analysis/m1-master-data/M1-mapping-version-local-rehearsal-summary-v0.1.json`
- `experiments/m1-mapping-version-import-candidate/`

处理结果：

- 未删除；
- 未 stash；
- 未提交；
- 仅在报告中记录。

## 3. 评审发现

### 3.1 `/health/db` degraded 响应

评审前：

- 数据库 URL 未配置时返回 `database_not_configured`；
- 数据库连接或查询异常时，会将底层错误码作为 `database.reason` 返回，边界不够稳定。

修订后：

- 数据库 URL 未配置：`database.reason=database_not_configured`；
- 数据库 URL 已配置但连接、查询或依赖检查不可用：`database.reason=database_unavailable`；
- `/health/db` 继续使用 degraded 响应体，不使用业务 API 的统一 `error` 包装。

### 3.2 业务 API 统一错误包装

评审前：

- `database_not_configured` 已使用统一 `error` 包装；
- 数据库已配置但不可用时可能落入 `internal_error`。

修订后：

- 数据库未配置：HTTP 503 + `error.code=database_not_configured`；
- 数据库已配置但不可用：HTTP 503 + `error.code=database_unavailable`；
- 未预期非数据库错误仍为 HTTP 500 + `error.code=internal_error`；
- 错误响应不暴露连接串、密码、SQL 全文、堆栈、主机端口或真实业务数据。

### 3.3 `bad_request` / `not_found` / `internal_error`

现有实现与契约一致：

- 非法分页返回 HTTP 400 + `bad_request`；
- 不存在资源返回 HTTP 404 + `not_found`；
- 未预期非数据库异常返回 HTTP 500 + `internal_error`。

### 3.4 响应头

现有实现与契约一致：

- 所有 JSON 响应包含 `x-request-id`；
- 所有 JSON 响应包含 `cache-control: no-store`；
- 统一错误体中的 `requestId` 与响应头一致。

### 3.5 分页与详情 ID

现有实现与契约一致：

- `page` 默认 1；
- `pageSize` 默认 20；
- `page` 必须为正整数；
- `pageSize` 必须为正整数且最大 100；
- 映射版本和任务详情 ID 必须为正整数；
- 作品详情 ID 为文本语义，不存在时返回 404。

## 4. 本轮修订

代码修订：

- `src/errors.js`
  - 新增 `databaseUnavailable(role)`。
- `src/db/query.js`
  - 将数据库连接/查询不可用归一化为 `database_unavailable`。
  - 保留 `AppError` 原样抛出，避免覆盖 `bad_request` / `not_found` 等公开错误。
- `src/db/health.js`
  - 将健康检查中的数据库连接/查询异常统一映射为 `database_unavailable`。

测试修订：

- `test/health.test.js`
  - 补充 `/health/db` 数据库不可用 degraded 场景。
  - 补充 `x-request-id` 与 `cache-control` 检查。
- `test/api.test.js`
  - 补充业务 API `database_unavailable` 统一错误包装测试。
- `test/db-query.test.js`
  - 补充 DB query 层不可用错误归一化测试。

文档修订：

- `docs/api/M1-api-contract-v0.1.md`
  - 明确 `database_unavailable` 不再是保留码，而是实际归一化错误。
- `docs/api/M1-openapi-v0.1.yaml`
  - 增加数据库依赖错误 503 响应示例。
  - `/api/*` 503 响应统一覆盖 `database_not_configured` 与 `database_unavailable`。
- `docs/technical-design/M1-API契约与最小管理端页面设计报告-v0.1.md`
  - 更新 `database_unavailable` 状态说明。

## 5. 验证

要求执行：

```text
npm run lint
npm run build
npm test
npm run smoke
npm run check:no-real-data
```

验证结果记录在本轮完成报告中。

## 6. 边界确认

本轮确认：

- `/health/db` 使用 degraded 响应，不使用统一 `error` 包装；
- 业务 API 使用统一 `error` 包装；
- `database_not_configured` 表示所需数据库 URL 未配置；
- `database_unavailable` 表示数据库 URL 已配置，但连接、查询或数据库依赖不可用；
- `internal_error` 保留给非数据库的未预期错误；
- 当前 API 仍只读；
- 当前仍禁止正式数据迁移和真实数据导入。
