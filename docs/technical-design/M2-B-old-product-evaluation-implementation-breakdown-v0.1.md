# M2-B 老品评估 fixture-only 实现前置审计与最小闭环拆分 v0.1

## 1. 审计基准与执行边界

本报告基于 M2-A 设计产物和当前仓库代码结构，只做 M2-B 实现前置审计与拆分，不实现业务代码、不新增迁移、不连接数据库、不执行 Docker。

采用的 M2-A 设计输入：

- `docs/prd/20-evaluation/M2-old-product-evaluation-prd-v0.1.md`
- `docs/api/M2-old-product-evaluation-api-contract-v0.1.md`
- `docs/technical-design/M2-old-product-evaluation-data-model-v0.1.md`
- `docs/product/M2-old-product-evaluation-pages-v0.1.md`
- `docs/validation/M2-old-product-evaluation-test-plan-v0.1.md`
- `docs/analysis/m1-master-data/M2-A-old-product-evaluation-design-summary-v0.1.json`
- `docs/analysis/m1-master-data/M1-phase-closeout-and-M2-readiness-audit-report-v0.1.md`
- `docs/analysis/m1-master-data/M1-phase-closeout-and-M2-readiness-audit-summary-v0.1.json`

当前 Git 门禁：

- current HEAD: `5c6f6bfcdd3f70b55f5664fc4b7aade33f5c10dc`
- origin/main: `5c6f6bfcdd3f70b55f5664fc4b7aade33f5c10dc`
- 工作区在审计开始时 clean。

## 2. 当前代码结构审计

| 审计项 | 当前状态 | 证据路径 | M2-B 复用结论 |
| --- | --- | --- | --- |
| HTTP app 入口 | `src/server.js` 使用 Node HTTP server 挂载 `createApp(config)`；`createApp` 是当前唯一应用入口。 | `src/server.js`, `src/http/app.js` | M2-B-1 可继续复用 `createApp(config, options)` 注入模式，不需要引入新框架。 |
| API 路由组织 | 当前路由集中在 `src/http/app.js` 内按 method/path 判断分派，已有 `/health`、`/api/system/status`、`/api/works`、`/api/mapping-versions`、`/api/jobs` 等只读端点。 | `src/http/app.js` | M2-B-1 可先按既有风格增加 M2 只读路由；若路由膨胀，再在后续重构为子路由。 |
| 错误码组织 | 使用 `AppError`、`badRequest`、`notFound`、数据库配置与可用性错误；统一通过 `publicErrorBody` 返回安全错误体。 | `src/errors.js` | M2-B-1 应复用 `AppError` 模式，新增或复用 `formal_data_blocked`、`fixture_only` 等安全错误码。 |
| 分页解析 | 已有 `parsePagination`，默认 page=1、pageSize=20、最大 100。 | `src/http/pagination.js` | M2-B-1 列表 API 直接复用，避免重复分页逻辑。 |
| 测试组织 | 使用 Node `node:test`；API 测试通过本地 in-process HTTP server 和 repository overrides 验证。 | `test/api.test.js`, `test/config.test.js`, `test/health.test.js` | M2-B-1 API 测试应新增独立 test file，并继续使用本地 server 和注入式 fixture。 |
| 管理端页面 | 静态管理端由 `public/admin/index.html`、`public/admin/app.js`、`public/admin/app.css` 组成，经 `src/http/staticAdmin.js` 显式 asset map 提供。 | `public/admin/*`, `src/http/staticAdmin.js` | M2-B-2 可扩展当前静态页面；新增 asset 时必须同步更新 static asset map。 |
| 管理端 E2E | Playwright 覆盖无数据库降级状态、fixture 模式、多页面、移动端表格溢出和禁止写操作控件。 | `test/e2e/admin.e2e.test.js` | M2-B-2 页面测试应沿用这些禁写、安全输出、响应式检查。 |
| fixture / synthetic 模式 | 当前 API 测试已有 `test/fixtures/syntheticBusinessData.js`；管理端 JS 也内置前端 synthetic fixture 开关。 | `test/fixtures/syntheticBusinessData.js`, `public/admin/app.js` | M2-B-1 应把 M2 fixture 设计为仓库内安全 synthetic，不读取 `data/**` 或 stage JSON。 |
| CI 命令 | CI 执行 install、real-data guard、lint、build、test、smoke、E2E。 | `.github/workflows/ci.yml` | M2-B-1/B2 必须保持本地验证命令可通过，并让新增测试进入 `npm test` 或 E2E。 |
| real-data guard | guard 扫描 Git tracked/staged 文件的敏感路径和内容模式；未跟踪文件需显式 staging 后再运行 guard 才会覆盖。 | `scripts/check-no-real-data.mjs` | M2-B 实现提交前必须在显式 staging 后再次运行 guard，防止新文件绕过扫描。 |
| M1 response pattern | JSON 响应带 no-store、request id；错误响应清洗敏感信息；列表返回 `items` 和 `pagination`。 | `src/http/app.js`, `src/errors.js` | M2-B-1 应保持同样 response shape，并在每个响应顶层加入 `dataset.mode`。 |

结论：当前代码结构足够支撑 fixture-only 最小闭环。第一批不需要数据库、不需要 migration、不需要 Docker，也不需要读取任何真实数据目录。

## 3. M2-B 最小闭环三层拆分

### 3.1 第一层：M2-B-1 fixture-only API + tests

目标：实现 M2-A API 契约中的最小只读闭环，只使用仓库内安全 fixture / synthetic 数据。

必须满足：

- 不连接任何数据库。
- 不写 migration。
- 不读取真实数据。
- 不读取 `data/**`。
- 不读取 stage JSON。
- 不使用真实作品名、作者名、收入、渠道或客户信息。
- 所有 API 响应必须包含 `dataset.mode`，且第一批仅允许 `fixture` 或 `synthetic`。
- formal mode 必须被阻断，并返回可测试的安全错误码。
- 必须有 API contract tests 和 prohibited-action tests。

建议第一批至少包含以下只读端点：

| API | 第一批建议 | 说明 |
| --- | --- | --- |
| `GET /api/m2/old-products/evaluations/overview` | 包含 | 总览页和 API contract 的入口指标。 |
| `GET /api/m2/old-products/evaluations` | 包含 | 支持分页、筛选、排序的列表闭环。 |
| `GET /api/m2/old-products/evaluations/:standardWorkId` | 包含 | 支持详情页和单作品风险/预测/建议展示。 |
| `GET /api/m2/old-products/readiness-gaps` | 包含 | 显式呈现正式数据阻断与字段缺口。 |
| `GET /api/m2/old-products/algorithm-versions` | 包含 | 固定返回 fixture 算法版本，支撑版本展示。 |
| `GET /api/m2/old-products/backtests` | 包含 | 支撑回测列表最小闭环。 |
| `GET /api/m2/old-products/backtests/:backtestBatchId` | 包含 | 支撑回测详情最小闭环。 |

第一批暂缓：

| API / 能力 | 暂缓原因 |
| --- | --- |
| `POST /api/m2/old-products/evaluation-tasks` | 任务创建属于受控执行链路，不适合 fixture-only 第一批。 |
| `GET /api/m2/old-products/evaluation-tasks` | 依赖任务生命周期与状态持久化，暂缓。 |
| `GET /api/m2/old-products/evaluation-tasks/:taskId` | 依赖任务记录，暂缓。 |
| `POST /api/m2/old-products/evaluation-tasks/:taskId/cancel` | 写操作，第一批禁止。 |
| export API | 导出一致性可先在测试计划中覆盖，接口实现暂缓。 |
| formal mode | 正式数据授权与 readiness 不足，必须阻断。 |
| local dry-run mode | 属于本地非正式演练链路，放到 M2-B-3 或后续单独任务。 |
| 专用 history API | 可在第一批详情 fixture 中表达 current / historical / invalidated 状态；独立 history endpoint 可作为 B1 后续小步。 |

### 3.2 第二层：M2-B-2 fixture-only admin pages + tests

目标：在 M2-B-1 API 通过后，为管理端新增老品评估最小页面闭环。

必须满足：

- 页面只消费 M2-B-1 fixture API。
- 不连接数据库。
- 不写 migration。
- 不读取真实数据。
- 页面必须显示 fixture / synthetic 标识。
- 页面必须显示 formal blocked 状态。
- 页面必须显示不完整月份提醒。
- 覆盖 overview、list、detail、data gaps、backtests & algorithms 的最小版本。
- 必须有页面渲染测试和禁写控件测试。

建议顺序：

1. 在管理端导航中增加老品评估入口。
2. 增加 overview/list/detail/data gaps/backtests & algorithms 的静态布局。
3. 页面通过 fetch 读取 M2-B-1 API。
4. Playwright 验证 fixture 标识、阻断说明、不完整月份提醒、空/错/阻断状态。

### 3.3 第三层：M2-B-3 local non-formal persistence prototype

目标：只在 M2-B-1 和 M2-B-2 完成后，讨论是否需要本地非正式持久化原型。

当前判断：暂缓，不建议立即启动。

原因：

- 可能需要 forward-only migration，必须单独授权。
- 只能用于本地 Docker 或其他非正式环境。
- 不得连接正式、staging、production、共享开发库或共享测试库。
- 不得导入真实数据。
- 不得激活 `mapping_version`。
- 不得调用 `switch_mapping_version`。

## 4. M2-B-1 fixture 数据设计

### 4.1 fixture 文件放置路径

建议分层：

- 运行时安全 fixture：`src/fixtures/m2OldProductEvaluationFixture.js`
- API fixture repository：`src/repositories/oldProductEvaluationFixtureRepository.js`
- 测试断言用 fixture cases：`test/fixtures/m2OldProductEvaluationFixtureCases.js`

这些文件必须使用仓库内 synthetic 内容，不从 `data/**`、stage JSON、Excel 或私有文件读取。

### 4.2 命名和 ID 规则

建议规则：

- 标准作品 ID：`SYN-WORK-0001`、`SYN-WORK-0002`
- 批次 ID：`SYN-EVAL-BATCH-0001`
- 回测批次 ID：`SYN-BACKTEST-0001`
- 算法版本：`fixture-old-product-v1`
- 作者、渠道、分类、标签全部使用 synthetic 标签，如 `SYN-AUTHOR-0001`、`SYN-CHANNEL-0001`
- 金额使用明确 synthetic 数值，并在响应中标记 `dataset.syntheticValue: true`

禁止：

- 真实作品名。
- 真实作者名。
- 真实收入。
- 真实渠道。
- 真实账单或台账片段。
- 任何可反推真实业务的明细。

### 4.3 必须覆盖的 fixture cases

| case | 目的 |
| --- | --- |
| ready old product | 验证完整输入下可产出评级、预测、建议。 |
| blocked missing classification | 验证分类缺口阻断。 |
| blocked missing copyright end | 验证版权到期字段缺口阻断。 |
| both business forms | 覆盖多业务形态。 |
| single business form | 覆盖单业务形态。 |
| incomplete month excluded | 验证不完整月份不参与评估。 |
| current result | 验证当前结果展示。 |
| historical result | 验证历史结果存在但不作为当前。 |
| invalidated result | 验证输入版本变化后的失效标记。 |
| growth | 生命周期增长型。 |
| stable | 生命周期稳定型。 |
| declining | 生命周期下滑型。 |
| long_tail | 生命周期长尾型。 |
| inactive | 生命周期沉寂型。 |
| rebound | 生命周期回升型。 |
| insufficient_history | 历史不足。 |
| S+ / S / A / B / C / D / E | 覆盖评级边界。 |
| base / optimistic / pessimistic forecast | 覆盖三情景预测。 |
| backtest covered / missed / over / under | 覆盖回测命中、漏判、高估、低估。 |

### 4.4 dataset 标识要求

每个响应顶层必须包含：

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

如果请求试图使用 formal mode，必须返回阻断错误，不得降级读取任何真实链路。

## 5. M2-B-1 测试拆分

建议新增 `test/m2-old-product-api.test.js`，覆盖：

- API overview test。
- API list pagination/filter/sort test。
- API detail test。
- readiness gap test。
- algorithm version test。
- backtest list/detail test。
- `formal_data_blocked` test。
- `fixture_only` test。
- no real data leak test。
- no DB connection test。
- no mapping activation reachable test。
- no `switch_mapping_version` reachable test。
- no stage JSON read test。

测试策略：

- 继续用 `createApp(baseConfig, overrides)` 创建本地 in-process HTTP server。
- 所有 M2 repository 由 fixture repository 或 overrides 提供。
- 禁止 mock 出真实连接串、真实密码、真实文件路径或真实业务名。
- 通过 monkey patch 或 repository 注入验证不会触发 DB repository。
- 对返回 body 做敏感输出扫描，避免泄漏 SQL、路径、栈和凭据。

## 6. M2-B-2 页面测试拆分

建议在 M2-B-1 后新增或扩展管理端测试，覆盖：

- overview page render。
- list page render。
- detail page render。
- data gaps page render。
- backtests & algorithms page render。
- fixture badge visible。
- formal blocked notice visible。
- incomplete-month notice visible。
- error state visible。
- empty state visible。
- blocked state visible。
- no write-like controls visible。
- mobile table overflow remains contained。

## 7. 文件级实施计划

### 7.1 当前 M2-B-0 本轮允许改动

| 文件 | 类型 | 目的 | 本轮允许 | 后续授权 |
| --- | --- | --- | --- | --- |
| `docs/technical-design/M2-B-old-product-evaluation-implementation-breakdown-v0.1.md` | 新增 | 本实现拆分报告。 | 是 | 否 |
| `docs/analysis/m1-master-data/M2-B-old-product-evaluation-implementation-breakdown-summary-v0.1.json` | 新增 | 机器可读 summary。 | 是 | 否 |

### 7.2 M2-B-1 预计新增/修改文件

| 文件 | 新增/修改 | 目的 | 属于 B1 | 属于 B2 | 属于 B3 | 当前任务允许改动 | 是否需后续授权 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `src/fixtures/m2OldProductEvaluationFixture.js` | 新增 | 放置运行时安全 synthetic fixture。 | 是 | 否 | 否 | 否 | 是 |
| `src/repositories/oldProductEvaluationFixtureRepository.js` | 新增 | 提供 fixture-only repository 方法。 | 是 | 否 | 否 | 否 | 是 |
| `src/http/app.js` | 修改 | 增加 M2 old-products 只读路由分派。 | 是 | 否 | 否 | 否 | 是 |
| `src/errors.js` | 修改 | 增加 M2 阻断错误码或 helper。 | 是 | 否 | 否 | 否 | 是 |
| `test/m2-old-product-api.test.js` | 新增 | API contract、fixture-only、prohibited-action 测试。 | 是 | 否 | 否 | 否 | 是 |
| `test/fixtures/m2OldProductEvaluationFixtureCases.js` | 新增 | 测试断言用 synthetic cases。 | 是 | 否 | 否 | 否 | 是 |
| `package.json` | 修改 | 确保新增 API 测试进入 `npm test`。 | 是 | 否 | 否 | 否 | 是 |

### 7.3 M2-B-2 预计新增/修改文件

| 文件 | 新增/修改 | 目的 | 属于 B1 | 属于 B2 | 属于 B3 | 当前任务允许改动 | 是否需后续授权 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `public/admin/index.html` | 修改 | 增加老品评估入口和页面容器。 | 否 | 是 | 否 | 否 | 是 |
| `public/admin/app.js` | 修改 | 调用 M2 fixture API 并渲染页面状态。 | 否 | 是 | 否 | 否 | 是 |
| `public/admin/app.css` | 修改 | 补齐页面布局、badge、阻断状态样式。 | 否 | 是 | 否 | 否 | 是 |
| `test/admin.test.js` | 修改 | 验证静态资源和禁写控件。 | 否 | 是 | 否 | 否 | 是 |
| `test/e2e/admin.e2e.test.js` | 修改 | 覆盖老品评估页面渲染和响应式。 | 否 | 是 | 否 | 否 | 是 |

### 7.4 M2-B-3 预计文件方向

| 文件方向 | 新增/修改 | 目的 | 属于 B1 | 属于 B2 | 属于 B3 | 当前任务允许改动 | 是否需后续授权 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `db/migrations/*` | 可能新增 | 若需要本地持久化表，必须 forward-only migration。 | 否 | 否 | 是 | 否 | 是，且需单独授权 |
| `src/repositories/*` | 可能新增/修改 | 本地非正式 persistence repository。 | 否 | 否 | 是 | 否 | 是 |
| `test/*` | 可能新增/修改 | 本地非正式持久化 contract tests。 | 否 | 否 | 是 | 否 | 是 |
| `docs/dev/*` | 可能新增/修改 | 本地演练说明。 | 否 | 否 | 是 | 否 | 是 |

## 8. migration 判断

| 阶段 | 是否需要 migration | 判断 |
| --- | --- | --- |
| M2-B-1 fixture-only API + tests | 否 | 使用 static / in-memory / fixture repository，可完成 API contract、分页、筛选、排序、阻断与安全测试。 |
| M2-B-2 fixture-only admin pages + tests | 否 | 页面只消费 M2-B-1 API，不需要持久化。 |
| M2-B-3 local non-formal persistence prototype | 可能需要 | 若要保存评估批次、结果、回测批次或输入快照，可能需要 forward-only migration；必须单独授权。 |

当前任务不得新增、修改、重排 `db/migrations/`。

## 9. 推荐的下一步 Codex 任务

推荐下一条任务标题：

`M2-B-1：老品评估 fixture-only API 与测试最小闭环实现`

建议范围：

- 新增 safe synthetic fixture。
- 新增 fixture repository。
- 增加 M2 old-products 只读 API。
- 新增 API contract tests。
- 新增 prohibited-action tests。
- 不写 migration。
- 不连接数据库。
- 不读取 `data/**`。
- 不读取 stage JSON。
- 不实现页面。

## 10. 安全边界确认

本轮已确认：

- 未连接任何数据库。
- 未执行 Docker。
- 未读取 `data/**`。
- 未读取真实账单。
- 未读取数字版权台账。
- 未读取运营确认 Excel。
- 未读取运营确认结果。
- 未读取 `mapping_import_stage-v0.1.json`。
- 未读取 `mapping_import_stage-v0.2.json`。
- 未导入真实数据。
- 未激活 `mapping_version`。
- 未调用 `switch_mapping_version`。
- 未执行正式数据迁移。
- 未修改 `db/migrations/`。
- 未修改业务代码。
- 未修改 API 实现。
- 未修改页面实现。
- 未提交真实数据。
- 未提交伪装成 fixture 的真实数据。
- 未使用 `git add .`。
- 未触碰 stash。

## 11. M2-B 启动建议

- M2-B-1：建议立即启动，限 fixture-only API + tests。
- M2-B-2：建议在 M2-B-1 通过后启动，限 fixture-only admin pages + tests。
- M2-B-3：暂缓；只有在 B1/B2 完成且用户单独授权 persistence prototype 与 migration 判断后再启动。
- M2-C / M2-D：继续阻断，等待正式数据授权、真实数据 readiness、mapping 激活授权和严格对账链路。
