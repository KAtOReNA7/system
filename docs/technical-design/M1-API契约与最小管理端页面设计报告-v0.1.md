# M1 API 契约与最小管理端页面设计报告 v0.1

状态：COMPLETED

日期：2026-06-21

## 1. 本轮目标

本轮完成：

- 整理 M1 当前只读 API 契约；
- 输出 OpenAPI YAML；
- 固化分页规范；
- 固化统一错误响应规范；
- 设计最小管理端页面结构；
- 明确页面与 API 对应关系；
- 保持空库、合成数据、脱敏 fixture 边界。

本轮未做：

- UI 代码实现；
- 前端框架引入；
- 正式数据库连接；
- 真实数据导入；
- mapping version 导入、激活或应用；
- `db/migrations/` 修改。

## 2. 输出文件

- [M1-api-contract-v0.1.md](../api/M1-api-contract-v0.1.md)
- [M1-openapi-v0.1.yaml](../api/M1-openapi-v0.1.yaml)
- [M1-minimal-admin-pages-v0.1.md](../product/M1-minimal-admin-pages-v0.1.md)

## 3. API 契约范围

已覆盖接口：

- `GET /health`
- `GET /health/db`
- `GET /api/system/status`
- `GET /api/works`
- `GET /api/works/:id`
- `GET /api/mapping-versions`
- `GET /api/mapping-versions/:id`
- `GET /api/jobs`
- `GET /api/jobs/:id`

契约内容包括：

- 方法；
- 路径；
- 查询参数；
- 路径参数；
- 响应示例；
- 错误响应；
- 使用角色；
- 空库行为；
- 合成数据行为；
- 当前禁止事项。

## 4. 分页与错误规范

分页已固定为：

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

分页规则：

- 默认 `page=1`；
- 默认 `pageSize=20`；
- `page` 必须为正整数；
- `pageSize` 必须为正整数；
- `pageSize` 最大为 100；
- 非法分页返回统一 400。

统一错误响应：

```json
{
  "error": {
    "code": "not_found",
    "message": "Resource not found",
    "requestId": "..."
  }
}
```

错误码：

- `bad_request`
- `not_found`
- `database_not_configured`
- `database_unavailable`
- `internal_error`

说明：后续小修订已将 `database_unavailable` 明确为数据库 URL 已配置但连接、查询或数据库依赖不可用时的统一 503 错误码。

## 5. 最小管理端页面设计

已设计四个只读页面：

| 页面 | API |
| --- | --- |
| 系统状态页 | `/health`, `/health/db`, `/api/system/status` |
| 作品列表页 | `/api/works`, `/api/works/:id` |
| 映射版本页 | `/api/mapping-versions`, `/api/mapping-versions/:id` |
| 后台任务页 | `/api/jobs`, `/api/jobs/:id` |

每个页面均定义：

- `loading`
- `empty`
- `success`
- `degraded`
- `error`
- `not found`

空库状态被定义为正常状态，不作为异常。

## 6. Product Design brief 处理

本轮使用 Product Design get-context 的 playback 模式：

- 目标明确：M1 最小只读管理端页面结构；
- 视觉来源：当前没有保存的 Figma、截图、品牌 token 或设计系统；
- 交互级别：文档级页面设计，不实现 UI；
- 因此未进入视觉 ideation、prototype 或 image-to-code。

## 7. 验证

执行命令：

```text
npm run lint
npm run build
npm test
npm run smoke
```

验证范围：

- 仅执行现有后端语法检查、测试和 fixture smoke；
- 不连接正式数据库；
- 不读取真实数据；
- 不修改 `db/migrations/`；
- 不依赖运营线 mapping_version 演练成功。

## 8. 工作区非本轮产物

本轮开始前发现非本轮未跟踪文件：

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

## 9. 结论

本轮文档层 API 契约和最小管理端页面设计已完成。

允许进入下一步二选一：

1. `最小管理端页面原型实现`；
2. `API 契约评审`。

无论选择哪一步，仍禁止：

- 正式数据迁移；
- 真实账单导入；
- 数字版权台账导入；
- 运营确认结果自动应用；
- 正式数据库连接；
- 修改 `db/migrations/`。
