# M1 最小管理端页面设计 v0.1

状态：DESIGN ONLY

本文档定义 M1 当前只读 API 对应的最小管理端页面结构。本轮不实现 UI 代码、不引入前端框架、不连接正式数据库、不导入真实数据。

Product Design brief：

- 产品目标：为 M1 数据基础阶段提供最小只读管理视图。
- 视觉来源：当前仓库暂无已保存设计系统、Figma、截图或品牌 token。
- 交互级别：文档级页面设计；当前不实现 UI，后续原型可从静态/最小交互开始。

## 1. 页面总览

| 页面 | 主要用途 | 对应 API | 当前交互边界 |
| --- | --- | --- | --- |
| 系统状态页 | 查看服务、数据库和 M1 生命周期状态 | `/health`, `/health/db`, `/api/system/status` | 只读 |
| 作品列表页 | 查看标准作品基础信息缺口 | `/api/works`, `/api/works/:id` | 只读、分页 |
| 映射版本页 | 查看 mapping version 元数据 | `/api/mapping-versions`, `/api/mapping-versions/:id` | 只读、无激活按钮 |
| 后台任务页 | 查看后台任务元数据 | `/api/jobs`, `/api/jobs/:id` | 只读、无启动按钮 |

## 2. 通用页面状态

每个页面必须定义以下状态：

| 状态 | 含义 | UI 处理 |
| --- | --- | --- |
| `loading` | 请求进行中 | 显示轻量加载状态 |
| `empty` | 请求成功但无数据 | 正常状态，不作为异常 |
| `success` | 请求成功且有数据 | 展示列表或详情 |
| `degraded` | 健康检查或部分依赖降级 | 展示可读原因，不阻断其他只读页面 |
| `error` | 请求失败 | 使用统一错误组件展示 `code/message/requestId` |
| `not found` | 详情资源不存在 | 显示 404 状态和返回入口 |

空库状态必须被视为正常状态。

## 3. 系统状态页

### 3.1 对应 API

- `GET /health`
- `GET /health/db`
- `GET /api/system/status`

### 3.2 展示内容

服务卡片：

- 服务名称；
- 应用环境；
- 服务状态。

数据库卡片：

- 数据库连接状态；
- schema version；
- system_state；
- UTC 时区检查；
- formal views 可查询检查；
- runtime role 检查。

M1 生命周期卡片：

- `state`；
- `mappingVersionReady`；
- `billImportReady`。

### 3.3 页面状态

- `loading`：三个 API 任一仍在请求中；
- `empty`：不适用；
- `success`：服务和系统状态正常返回；
- `degraded`：`/health/db` 返回 `status=degraded`；
- `error`：系统状态 API 返回错误；
- `not found`：不适用。

### 3.4 禁止交互

- 不提供初始化按钮；
- 不提供版本激活按钮；
- 不提供账单导入按钮；
- 不展示正式库连接信息。

## 4. 作品列表页

### 4.1 对应 API

- `GET /api/works`
- `GET /api/works/:id`

### 4.2 展示内容

列表字段：

- 标准作品 ID；
- 作品名称占位列：当前 API 尚未返回正式作品名称，页面显示 `未提供` 或隐藏该列；
- 基础信息记录缺失状态；
- 核心字段缺失状态；
- 分类缺失状态。

详情区域：

- 标准作品 ID；
- `missingBasicInfoRecord`；
- `missingCoreFields`；
- `missingClassification`。

### 4.3 分页

使用统一分页：

- 默认 `page=1`；
- 默认 `pageSize=20`；
- 最大 `pageSize=100`。

### 4.4 页面状态

- `loading`：列表或详情请求中；
- `empty`：空库或无作品，显示“暂无标准作品，空库状态正常”；
- `success`：展示列表和可选详情；
- `degraded`：数据库健康降级但列表 API 仍可返回时可显示顶部提示；
- `error`：展示统一错误；
- `not found`：详情 ID 不存在。

### 4.5 禁止交互

- 不展示真实收入数据；
- 不提供基础信息补全写入；
- 不读取运营确认包；
- 不展示真实作者、真实版权日期或真实收入明细。

## 5. 映射版本页

### 5.1 对应 API

- `GET /api/mapping-versions`
- `GET /api/mapping-versions/:id`

### 5.2 展示内容

列表字段：

- version id；
- versionNo；
- status；
- triggerType；
- projectionRowCount；
- createdAt；
- 是否 active：由 `status === "active"` 推导。

详情区域：

- 映射版本 ID；
- 版本号；
- 状态；
- 触发类型；
- 投影行数；
- 创建时间。

### 5.3 页面状态

- `loading`：列表或详情请求中；
- `empty`：空库无 mapping version，正常展示；
- `success`：展示列表和详情；
- `degraded`：控制态查询不可用但服务仍可访问；
- `error`：展示统一错误；
- `not found`：详情 ID 不存在。

### 5.4 禁止交互

- 不提供激活按钮；
- 不提供撤销按钮；
- 不提供导入按钮；
- 不应用任何候选映射；
- 不展示私有 mapping_version 明细。

## 6. 后台任务页

### 6.1 对应 API

- `GET /api/jobs`
- `GET /api/jobs/:id`

### 6.2 展示内容

列表字段：

- job id；
- job type；
- logicalOperationKey；
- status；
- createdAt；
- startedAt；
- finishedAt。

详情区域：

- 任务 ID；
- 任务类型；
- 逻辑操作键；
- 状态；
- 创建时间；
- 开始时间；
- 完成时间；
- error summary 占位：当前 API 尚未返回错误摘要，页面不得从数据库额外读取。

### 6.3 页面状态

- `loading`：列表或详情请求中；
- `empty`：无任务，正常展示；
- `success`：展示任务列表；
- `degraded`：控制态查询不可用；
- `error`：展示统一错误；
- `not found`：详情 ID 不存在。

### 6.4 禁止交互

- 不提供启动真实导入任务按钮；
- 不提供重试按钮；
- 不提供取消按钮；
- 不提供 mapping version 应用入口；
- 不写入后台任务表。

## 7. 页面与 API 对应关系

| 页面元素 | API 字段 |
| --- | --- |
| 服务状态 | `/health.status` |
| 服务名称 | `/health.service` |
| 环境 | `/health.environment` |
| schema version | `/health/db.database.schemaVersion` |
| system_state | `/health/db.database.systemState` 和 `/api/system/status.system.state` |
| mapping readiness | `/api/system/status.system.mappingVersionReady` |
| bill import readiness | `/api/system/status.system.billImportReady` |
| 作品 ID | `/api/works.items[].standardWorkId` |
| 基础信息缺失 | `/api/works.items[].completeness.missingBasicInfoRecord` |
| 核心字段缺失 | `/api/works.items[].completeness.missingCoreFields` |
| 分类缺失 | `/api/works.items[].completeness.missingClassification` |
| mapping version status | `/api/mapping-versions.items[].status` |
| job status | `/api/jobs.items[].status` |

## 8. 最小信息架构建议

建议最小导航：

```text
M1 管理端
├─ 系统状态
├─ 作品
├─ 映射版本
└─ 后台任务
```

当前不建议增加：

- 收入分析页；
- 评估页；
- 导入页；
- 运营确认页；
- 映射应用页；
- 正式数据迁移页。

## 9. 后续扩展建议

允许的下一步：

- 基于本文档实现最小静态/只读管理端原型；
- 或先执行 API 契约评审，确认字段命名和错误码归一化。

继续禁止：

- 正式数据导入；
- 真实账单导入；
- 数字版权台账导入；
- 运营确认结果自动应用；
- 正式数据库连接；
- 修改已冻结迁移 SQL。
