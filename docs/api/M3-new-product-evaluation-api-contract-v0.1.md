# M3 新品评估 API contract v0.1

状态：fixture/prototype contract

所有接口当前只返回 synthetic fixture。正式模式 `mode=formal` 或 `x-m3-mode: formal` 必须返回 `formal_data_blocked`。

## Dataset Boundary

所有成功响应包含：

```json
{
  "dataset": {
    "mode": "fixture",
    "source": "m3-new-product-static-synthetic-fixture",
    "formalDataAuthorized": false,
    "formalEvaluationAllowed": false,
    "m3FormalExecutionAllowed": false,
    "syntheticOnly": true,
    "notForFormalDecision": true
  }
}
```

## Endpoints

| Method | Path | 说明 |
|---|---|---|
| GET | `/api/m3/new-products/topics/overview` | 新品评估总览 |
| GET | `/api/m3/new-products/topics` | 选题列表，支持分页、筛选、排序 |
| GET | `/api/m3/new-products/topics/:topicId` | 选题详情 |
| GET | `/api/m3/new-products/readiness-gaps` | 输入 readiness 缺口 |
| GET | `/api/m3/new-products/comparator-candidates` | 对标候选 |
| GET | `/api/m3/new-products/algorithm-versions` | fixture 算法版本 |
| GET | `/api/m3/new-products/backtests` | 回测批次 |
| GET | `/api/m3/new-products/backtests/:batchId` | 回测详情 |

## Filters

`/topics` 支持：

- `query`
- `source`
- `readiness`
- `status`
- `rating`
- `sort`
- `page`
- `pageSize`

`/readiness-gaps` 支持：

- `gapCode`
- `severity`
- `readiness`
- `page`
- `pageSize`

`/comparator-candidates` 支持：

- `topicId`
- `selectedAsFinal`
- `page`
- `pageSize`

## Write Routes

当前不提供：

- 创建选题。
- 材料上传。
- 结构化输入确认。
- 正式评估任务创建。
- 结果发布或导出。

这些路径保持不可用，直到 M3 formal 获得用户单独授权。
