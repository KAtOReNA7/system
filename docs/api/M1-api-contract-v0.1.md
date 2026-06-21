# M1 API 契约 v0.1

状态：CURRENT READ-ONLY CONTRACT

本文档整理当前 M1 已实现的最小只读 API。当前契约只允许用于空库、合成数据、脱敏 fixture、本地/测试/CI 环境。

仍禁止：

- 连接正式数据库；
- 导入真实账单；
- 导入数字版权台账；
- 导入运营确认 Excel 或运营确认结果；
- 导入候选或正式 `mapping_version`；
- 自动应用候选映射；
- 执行正式数据迁移；
- 修改 `db/migrations/`；
- 读取 `data/` 目录作为应用输入。

OpenAPI 文件：

- [M1-openapi-v0.1.yaml](./M1-openapi-v0.1.yaml)

## 1. 通用约定

### 1.1 内容类型

所有 API 返回：

```text
content-type: application/json; charset=utf-8
cache-control: no-store
x-request-id: <uuid>
```

### 1.2 环境边界

当前允许：

- `local`
- `test`
- `ci`

当前不允许：

- `staging`
- `production`

应用运行不得使用 `migration_owner`。数据库角色边界如下：

| 用途 | 角色 |
| --- | --- |
| 普通作品只读查询 | `application_ro` |
| 系统状态、映射版本、后台任务控制态只读查询 | `background_worker` |
| 普通业务读写账号，当前 API 未使用 | `application_rw` |
| Flyway 迁移与本地受控 smoke seed/clear | `migration_owner` |

## 2. 分页规范

适用于：

- `GET /api/works`
- `GET /api/mapping-versions`
- `GET /api/jobs`

请求参数：

| 参数 | 默认值 | 约束 |
| --- | ---: | --- |
| `page` | 1 | 必须为正整数 |
| `pageSize` | 20 | 必须为正整数，最大 100 |

响应结构固定为：

```json
{
  "items": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 0
  }
}
```

非法分页参数返回统一 400：

```json
{
  "error": {
    "code": "bad_request",
    "message": "page must be a positive integer",
    "requestId": "..."
  }
}
```

## 3. 错误响应规范

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

错误码表：

| code | HTTP | 场景 |
| --- | ---: | --- |
| `bad_request` | 400 | 参数错误，例如非法分页或非法 ID |
| `not_found` | 404 | 路由或资源不存在 |
| `database_not_configured` | 503 | 所需数据库 URL 未配置 |
| `database_unavailable` | 503 | 数据库 URL 已配置，但连接、查询或数据库依赖不可用 |
| `internal_error` | 500 | 未预期错误 |

错误响应不得暴露：

- 数据库连接串；
- 密码；
- SQL 全文；
- 堆栈；
- 主机端口；
- 真实业务数据。

说明：

- `/health/db` 是健康检查接口，数据库异常以 `status: "degraded"` 和 `database.reason` 表达，不使用统一 `error` 包装。
- `/health/db` 在数据库 URL 未配置时返回 `database.reason=database_not_configured`。
- `/health/db` 在数据库 URL 已配置但不可连接、不可查询或依赖检查失败时返回 `database.reason=database_unavailable`。
- 业务 API 的公开错误响应使用统一 `error` 包装。
- 业务 API 在数据库 URL 未配置时返回统一 `error.code=database_not_configured`。
- 业务 API 在数据库 URL 已配置但不可用时返回统一 `error.code=database_unavailable`。

## 4. API 明细

### 4.1 `GET /health`

用途：服务进程健康检查，不依赖数据库。

使用角色：无数据库角色。

查询参数：无。

路径参数：无。

响应示例：

```json
{
  "status": "ok",
  "service": "m1-audiobook-evaluation",
  "environment": "local"
}
```

空库行为：正常返回 `ok`。

合成数据行为：不受合成数据影响。

当前禁止事项：不得在此接口中增加数据库依赖。

### 4.2 `GET /health/db`

用途：数据库连通性和结构状态检查。

使用角色：

- `application_ro`
- `background_worker`

查询参数：无。

路径参数：无。

成功响应示例：

```json
{
  "service": "m1-audiobook-evaluation",
  "status": "ok",
  "database": {
    "connected": true,
    "schemaVersion": "0060.290",
    "systemState": "schema_initialized",
    "checks": {
      "timezoneUtc": true,
      "expectedSchemaVersion": true,
      "systemStateReadable": true,
      "formalViewsQueryable": true,
      "runtimeRoleAllowed": true
    }
  }
}
```

降级响应示例：

```json
{
  "service": "m1-audiobook-evaluation",
  "status": "degraded",
  "database": {
    "connected": false,
    "reason": "database_not_configured"
  }
}
```

空库行为：迁移完成后的空库应返回 `schemaVersion="0060.290"` 和 `systemState="schema_initialized"`。

合成数据行为：不返回业务行明细。

当前禁止事项：不得读取真实业务明细。

### 4.3 `GET /api/system/status`

用途：读取 M1 系统生命周期和最小就绪状态。

使用角色：`background_worker`。

查询参数：无。

路径参数：无。

响应示例：

```json
{
  "status": "ok",
  "system": {
    "state": "schema_initialized",
    "mappingVersionReady": false,
    "billImportReady": false
  }
}
```

空库行为：

- `state=schema_initialized`
- `mappingVersionReady=false`
- `billImportReady=false`

合成数据行为：若仅插入未激活的合成 mapping version，`mappingVersionReady` 仍为 `false`。

当前禁止事项：

- 不得激活 mapping version；
- 不得启动导入；
- 不得写入系统状态。

### 4.4 `GET /api/works`

用途：分页读取标准作品基础信息缺口视图。

使用角色：`application_ro`。

查询参数：

- `page`
- `pageSize`

路径参数：无。

响应示例：

```json
{
  "items": [
    {
      "id": "900001",
      "standardWorkId": "900001",
      "completeness": {
        "missingBasicInfoRecord": true,
        "missingCoreFields": true,
        "missingClassification": true
      }
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 1
  }
}
```

空库行为：

```json
{
  "items": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 0
  }
}
```

合成数据行为：返回虚构标准作品 ID 和缺口状态。

当前禁止事项：

- 不得展示真实收入数据；
- 不得读取真实账单；
- 不得读取私有运营确认包。

### 4.5 `GET /api/works/:id`

用途：读取单个标准作品基础信息缺口状态。

使用角色：`application_ro`。

路径参数：

| 参数 | 说明 |
| --- | --- |
| `id` | 标准作品 ID |

查询参数：无。

成功响应示例：

```json
{
  "item": {
    "id": "900001",
    "standardWorkId": "900001",
    "completeness": {
      "missingBasicInfoRecord": true,
      "missingCoreFields": true,
      "missingClassification": true
    }
  }
}
```

404 响应示例：

```json
{
  "error": {
    "code": "not_found",
    "message": "Work not found",
    "requestId": "..."
  }
}
```

空库行为：任何 ID 均返回 404。

合成数据行为：合成 ID 可返回详情。

当前禁止事项：不得返回作品收入、真实作者、真实版权日期或真实运营确认内容。

### 4.6 `GET /api/mapping-versions`

用途：分页读取映射版本元数据。

使用角色：`background_worker`。

查询参数：

- `page`
- `pageSize`

路径参数：无。

响应示例：

```json
{
  "items": [
    {
      "id": "1",
      "versionNo": 1,
      "status": "building",
      "triggerType": "synthetic_fixture",
      "projectionRowCount": 0,
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 1
  }
}
```

空库行为：返回空列表。

合成数据行为：可展示合成 mapping version 元数据。

当前禁止事项：

- 不得导入 mapping version；
- 不得激活 mapping version；
- 不得自动应用候选映射；
- 不得提供激活按钮。

### 4.7 `GET /api/mapping-versions/:id`

用途：读取单个映射版本元数据。

使用角色：`background_worker`。

路径参数：

| 参数 | 说明 |
| --- | --- |
| `id` | 映射版本数字 ID，必须为正整数 |

查询参数：无。

成功响应结构：

```json
{
  "item": {
    "id": "1",
    "versionNo": 1,
    "status": "building",
    "triggerType": "synthetic_fixture",
    "projectionRowCount": 0,
    "createdAt": "2026-01-01T00:00:00.000Z"
  }
}
```

空库行为：任何 ID 均返回 404。

合成数据行为：合成 ID 可返回详情。

当前禁止事项：不得执行版本切换或激活。

### 4.8 `GET /api/jobs`

用途：分页读取后台任务元数据。

使用角色：`background_worker`。

查询参数：

- `page`
- `pageSize`

路径参数：无。

响应示例：

```json
{
  "items": [
    {
      "id": "1",
      "type": "synthetic_fixture_job",
      "logicalOperationKey": "synthetic-fixture-job",
      "status": "pending",
      "createdAt": "2026-01-01T00:00:00.000Z",
      "startedAt": null,
      "finishedAt": null
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 1
  }
}
```

公开状态枚举：

| 公开状态 | 当前来源状态 |
| --- | --- |
| `pending` | `queued` |
| `running` | `running` |
| `blocked` | `waiting` |
| `succeeded` | `succeeded` |
| `failed` | `failed` 或未知状态 |
| `cancelled` | `cancelled` |

空库行为：返回空列表。

合成数据行为：返回虚构任务元数据。

当前禁止事项：

- 不得启动真实任务；
- 不得重试任务；
- 不得取消任务；
- 不得导入真实数据。

### 4.9 `GET /api/jobs/:id`

用途：读取单个后台任务元数据。

使用角色：`background_worker`。

路径参数：

| 参数 | 说明 |
| --- | --- |
| `id` | 任务数字 ID，必须为正整数 |

查询参数：无。

成功响应示例：

```json
{
  "item": {
    "id": "1",
    "type": "synthetic_fixture_job",
    "logicalOperationKey": "synthetic-fixture-job",
    "status": "pending",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "startedAt": null,
    "finishedAt": null
  }
}
```

空库行为：任何 ID 均返回 404。

合成数据行为：合成 ID 可返回详情。

当前禁止事项：不得从详情页触发真实任务动作。

## 5. 当前未纳入契约的能力

以下能力不属于 M1 当前 API 契约：

- 登录认证；
- 真实账单上传；
- 数字版权台账导入；
- 运营确认结果导入；
- mapping version 创建、激活、撤销；
- 批次激活、撤销、重算；
- 收入明细、收入聚合或评估结果查询；
- 管理端写操作。
