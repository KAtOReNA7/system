# M2-B-1 老品评估 fixture-only API 与测试最小闭环实现报告 v0.1

状态：IMPLEMENTED

日期：2026-06-21

## 1. 实现范围

本轮实现 M2-B-1 老品评估 fixture-only API 与测试最小闭环。

实现端点：

- `GET /api/m2/old-products/evaluations/overview`
- `GET /api/m2/old-products/evaluations`
- `GET /api/m2/old-products/evaluations/:standardWorkId`
- `GET /api/m2/old-products/readiness-gaps`
- `GET /api/m2/old-products/algorithm-versions`
- `GET /api/m2/old-products/backtests`
- `GET /api/m2/old-products/backtests/:backtestBatchId`

本轮未实现：

- 页面；
- migration；
- DB repository；
- formal mode；
- local_dry_run mode；
- evaluation task 创建、列表、详情、取消；
- export API；
- 独立 history API。

## 2. fixture 数据边界

新增 runtime fixture：

- `src/fixtures/m2OldProductEvaluationFixture.js`

新增测试 fixture cases：

- `test/fixtures/m2OldProductEvaluationFixtureCases.js`

fixture 数据规则：

- 仅使用 synthetic 数据；
- 标准作品 ID 使用 `SYN-WORK-*`；
- 作者、作品名、渠道、分类、标签均使用 `SYN-*` 命名；
- 金额为明确 synthetic 十进制字符串；
- 每个成功响应均包含顶层 `dataset`；
- 不读取 `data/**`；
- 不读取 `mapping_import_stage-v0.1.json`；
- 不读取 `mapping_import_stage-v0.2.json`；
- 不读取 Excel、台账、确认包或私有文件。

成功响应固定包含：

```json
{
  "dataset": {
    "mode": "fixture",
    "source": "m2-b-static-synthetic-fixture",
    "formalDataAuthorized": false,
    "formalEvaluationAllowed": false,
    "syntheticValue": true,
    "cutoffMonth": "2026-04",
    "incompleteMonths": ["2026-05"]
  }
}
```

## 3. 覆盖的 fixture cases

本轮 fixture 覆盖：

- ready old product；
- blocked missing classification；
- blocked missing copyright end；
- both business forms；
- single business form；
- incomplete month excluded；
- current result；
- historical result；
- invalidated result；
- growth；
- stable；
- declining；
- long_tail；
- inactive；
- rebound；
- insufficient_history；
- `S+` / `S` / `A` / `B` / `C` / `D` / `E`；
- base / optimistic / pessimistic forecast；
- backtest covered / missed / over / under。

## 4. fixture repository

新增：

- `src/repositories/oldProductEvaluationFixtureRepository.js`

职责：

- 提供 overview、list、detail、readiness gaps、algorithm versions、backtests、backtest detail；
- 支持分页；
- 支持 query、rating、lifecycle、risk、classification1/2/3、businessForm、readiness、resultStatus、algorithmVersion、cutoffMonth 筛选；
- 支持 forecastTotal.desc、forecastTotal.asc、last12MonthSales.desc、rating.asc、riskSeverity.desc、updatedAt.desc 排序；
- unknown work / backtest 返回 `not_found`；
- 不连接数据库；
- 不读取文件系统中的真实数据；
- 不读取 stage JSON。

## 5. formal 阻断行为

M2 old-products 所有路径统一检查 formal mode：

- query：`mode=formal`
- header：`x-m2-mode: formal`
- header：`x-evaluation-mode: formal`
- header：`x-mode: formal`

如明确请求 formal mode，返回：

```json
{
  "error": {
    "code": "formal_data_blocked",
    "message": "Formal M2 old-product evaluation is blocked until M1 formal data readiness is complete.",
    "requestId": "..."
  }
}
```

阻断期间：

- 不连接数据库；
- 不读取真实数据；
- 不降级到 formal 或 local_dry_run；
- 不暴露连接串、SQL、堆栈、主机、路径或真实业务信息。

## 6. 错误码

本轮复用或新增以下安全错误 helper：

- `bad_request`
- `not_found`
- `formal_data_blocked`
- `m1_readiness_blocked`
- `evaluation_not_available`
- `fixture_only`
- `internal_error`

错误响应继续使用统一 JSON 包装，并包含 `x-request-id`。

## 7. 测试覆盖

新增：

- `test/m2-old-product-api.test.js`

并已接入 `npm test`。

覆盖：

- overview API 返回 `dataset.mode=fixture`；
- list API 分页；
- list API 筛选；
- list API 排序；
- invalid pagination 返回 `bad_request`；
- invalid filter 返回 `bad_request`；
- invalid sort 返回 `bad_request`；
- detail API 返回 work、readiness、incomeSummary、lifecycle、forecast、rating、risks、suggestions、backtestSummary、inputSnapshot、algorithmVersion；
- unknown detail 返回 `not_found`；
- readiness gaps API；
- algorithm versions API；
- backtests list API；
- backtest detail API；
- `mode=formal` 返回 `formal_data_blocked`；
- controlled task endpoints 不可用；
- 响应不包含敏感技术细节；
- 无数据库配置下 fixture API 可用；
- mapping activation API 不存在；
- `switch_mapping_version` 不存在；
- JSON 响应包含 `x-request-id`；
- JSON 响应 `cache-control: no-store`。

## 8. 验证结果

本轮执行并通过：

```text
npm run check:no-real-data
npm run lint
npm run build
npm test
npm run smoke
```

测试结果：

- `npm run lint`：通过，31 个 JavaScript 文件语法检查通过；
- `npm run build`：通过，31 个 JavaScript 文件语法检查通过；
- `npm test`：通过，56 pass / 0 fail；
- `npm run smoke`：通过，fixture mode，未连接正式库，未导入真实数据；
- `npm run check:no-real-data`：通过，471 个 Git tracked/staged 文件未发现真实数据防护违规。

## 9. migration 与 DB

本轮不需要 migration。

本轮未连接数据库。

本轮未修改：

- `db/migrations/`
- Flyway 历史迁移
- 页面实现

## 10. 安全边界

本轮未执行：

- 连接任何数据库；
- Docker；
- 读取 `data/**`；
- 读取真实账单；
- 读取数字版权台账；
- 读取运营确认 Excel；
- 读取运营确认结果；
- 读取 `mapping_import_stage-v0.1.json`；
- 读取 `mapping_import_stage-v0.2.json`；
- 导入真实数据；
- 激活 `mapping_version`；
- 调用 `switch_mapping_version`；
- 正式数据迁移；
- 修改 `db/migrations/`；
- 修改页面实现；
- 新增页面；
- 新增 write API；
- 新增 evaluation task 创建能力；
- 新增 export API；
- `git add .`；
- stash 操作。

## 11. 后续建议

M2-B-1 完成后，建议启动：

```text
M2-B-2 fixture-only admin pages + tests
```

M2-B-3 继续暂缓。M2-B-3 可能涉及 local non-formal persistence prototype 和 migration 判断，必须单独授权。
